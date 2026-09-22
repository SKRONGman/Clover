#!/usr/bin/env python3
"""
refresh.py - builds ratings.js / ratings.json for Clover. Runs on GitHub Actions
(.github/workflows/refresh.yml); keys come from the CFBD_KEY and ODDS_KEY secrets.

    python refresh.py                            # full: research ratings + slate + lines (weekly)
    python refresh.py --lines-only               # slate + lines for both leagues (hourly)
    python refresh.py --lines-only --alt-lines   # + DraftKings alternate lines (weekly, spends credits)
    python refresh.py --health-gate              # exit 1 if health.json says Danny should look
    python refresh.py --check | --check-nfl      # print raw feed records

This file is the conductor. The players:
    cfbd.py          college slate, lines, scores, logos, AP poll (CollegeFootballData)
    nfl.py           NFL slate, lines, scores (the-odds-api; ESPN is blocked on Actions)
    odds.py          the-odds-api helper + DraftKings alternate lines
    ratings_math.py  research-only team ratings
    sim.py           the one football - builds the tables every % on the page is read from
    common.py        file names, dates, the safe write, health.json

If one feed is down, the other league still refreshes; the dead league keeps its
last good lines and is marked stale (the page says "API ISSUE", health.json says why).
"""

import os
import sys
import json
import argparse

import sim            # the one game simulator - tables for the page are built here
import common
import cfbd
import nfl
import odds
from common import OUT, OUT_JS, OUT_RESULTS, DAYS_AHEAD, RECENT_HOURS, atomic_write, parse_dt, now_utc
from ratings_math import HFA_POINTS, fit, fit_pace, games_played, blend, project, backtest

# calibrate.py does `import refresh as R` and uses these names. Keep them reachable.
from cfbd import BOOKS, SEASON, PRIOR_SEASON, get, pull_games, pull_drive_counts   # noqa: F401
from common import pick                                                           # noqa: F401


# The six picks the page offers on every game, in one place.
SIX = ("homeML", "awayML", "homeSp", "awaySp", "over", "under")


def leg_line(g, typ):
    """The number that pick is taken at. Always the side's OWN number."""
    if typ in ("over", "under"):
        return g.get("total")
    if typ == "homeSp":
        return g.get("spread")
    if typ == "awaySp":
        return -g["spread"] if g.get("spread") is not None else None
    return 0


def freeze_probs(games, grids):
    """Save each game's six percentages onto the game itself. While a game is
    upcoming the page reads these straight off its table; once it is over the
    table is thrown away and these are all that's left - which is exactly what
    you need to ask later whether Clover's 47% picks really land 47% of the time."""
    for gi, g in enumerate(games):
        grid = grids.get(gi)
        if grid is None:
            continue
        g["p"] = {t: round(grid.prob([(t, leg_line(g, t))]), 4) for t in SIX}


def grade_leg(typ, line, hp, ap):
    """hit / miss / push, from the final score. Same rule as the page's legVal."""
    t, m = hp + ap, hp - ap
    v = {"over": t - line, "under": line - t, "homeSp": m + line,
         "awaySp": line - m, "homeML": m, "awayML": -m}[typ]
    return "push" if v == 0 else ("hit" if v > 0 else "miss")


def record_results(up):
    """Append every newly-finished game to results.json: what Clover said about
    each of the six picks, and what actually happened. Never shipped to the page -
    this is the calibration record, and it has to outlive ratings.json, which is
    overwritten every refresh."""
    rows = []
    if os.path.exists(OUT_RESULTS):
        try:
            with open(OUT_RESULTS) as f:
                rows = json.load(f)
        except (ValueError, OSError):
            rows = []
    seen = {str(r.get("id")) for r in rows}
    added = 0
    for g in up:
        if g.get("status") != "final" or str(g.get("id")) in seen:
            continue
        hp, ap = g.get("hp"), g.get("ap")
        if hp is None or ap is None or g.get("spread") is None or g.get("total") is None:
            continue
        p = g.get("p") or {}
        rows.append({
            "id": g.get("id"),
            "league": g.get("league", "ncaaf"),
            "start": g.get("start"),
            "home": g.get("home"), "away": g.get("away"),
            "hp": hp, "ap": ap,
            "spread": g.get("spread"), "total": g.get("total"), "book": g.get("book"),
            "picks": {t: {"line": leg_line(g, t), "p": p.get(t),
                          "result": grade_leg(t, leg_line(g, t), hp, ap)}
                      for t in SIX},
        })
        added += 1
    if added:
        rows.sort(key=lambda r: (r.get("start") or "", str(r.get("id"))))
        atomic_write(OUT_RESULTS, json.dumps(rows, indent=1))
    print(f"  results.json: {added} newly finished game(s) graded, {len(rows)} on file")


def note_opening(g, old):
    """The first DraftKings line Clover ever saw for this game, kept for good
    (ruling 2 of 2026-09-21). The page compares the current line against it and
    says "Line moved" in the My Bet rail once a pick's own number is 3+ points off.
    Set once, never rewritten; only a DraftKings line counts."""
    if old and old.get("open"):
        g["open"] = old["open"]
    elif "open" not in g and g.get("book") == "DraftKings" \
            and g.get("spread") is not None and g.get("total") is not None:
        g["open"] = {"spread": g["spread"], "total": g["total"]}


def carry_history(R, up):
    """A game that has kicked off keeps the line it closed at and the percentages
    Clover gave it - the feed's line can still drift after kickoff, and that is not
    the number the picks were priced at. Also keeps a final from flipping back to
    live if a later feed is briefly wrong. Also carries the opening line."""
    prev = {str(g.get("id")): g for g in R.get("upcoming", [])}
    for g in up:
        old = prev.get(str(g.get("id")))
        note_opening(g, old)
        if not old:
            continue
        if old.get("p"):
            g.setdefault("p", old["p"])
        if g.get("status", "upcoming") == "upcoming":
            continue
        for fld in ("spread", "total", "book"):
            if g.get(fld) is None and old.get(fld) is not None:
                g[fld] = old[fld]
            elif fld != "book" and old.get(fld) is not None:
                g[fld] = old[fld]                      # freeze at the closing number
        if g.get("hp") is None and old.get("hp") is not None:
            g["hp"], g["ap"] = old.get("hp"), old.get("ap")
        if old.get("status") == "final":
            g["status"] = "final"


def carry_college(R, now):
    """CFBD is down: keep the college games from the last good pull. A game that
    has kicked off since then becomes "live" (no score - we can't see one), which
    also drops its sim table so nobody can build a slip on a game in progress."""
    floor = now.timestamp() - RECENT_HOURS * 3600
    kept = []
    for g in R.get("upcoming", []):
        if g.get("league", "ncaaf") != "ncaaf":
            continue
        start = parse_dt(g.get("start") or "")
        if start is None or start.timestamp() < floor:
            continue
        g = dict(g)
        if g.get("status", "upcoming") == "upcoming" and start.timestamp() <= now.timestamp():
            g["status"] = "live"
        kept.append(g)
    return kept


def note_freshness(R, fresh, reasons, now):
    """R["asof"][league] = when that league's lines were last pulled fresh.
    R["stale"][league] exists only while a league is running on old lines.
    lines_generated is the newest FRESH pull, so the page's clock never lies."""
    asof = R.setdefault("asof", {})
    stale = {}
    for lg in sim.LEAGUES:
        if fresh.get(lg):
            asof[lg] = now.isoformat(timespec="seconds")
        else:
            stale[lg] = {"since": asof.get(lg) or R.get("lines_generated"), "reason": reasons.get(lg, "feed unavailable")}
    if stale:
        R["stale"] = stale
    else:
        R.pop("stale", None)
    good = [v for v in asof.values() if v]
    if any(fresh.values()) or not R.get("lines_generated"):
        R["lines_generated"] = max(good) if good else now.isoformat(timespec="seconds")
    return stale


def rankings_for(R, weeks, college_ok, force):
    """AP ranks by week, kept in ratings.json. Only weeks we don't have yet cost a
    CFBD call (a published poll never changes); the weekly full run re-asks them all."""
    have = R.get("rankings") if R.get("rankings_season") == SEASON else None
    have = dict(have or {})
    need = [wk for wk in weeks if force or not have.get(str(wk))]
    if need and college_ok:
        for wk, ranks in cfbd.pull_rankings(SEASON, need).items():
            have[str(wk)] = ranks
    R["rankings"], R["rankings_season"] = have, SEASON
    return have


def write_upcoming(R, alt_lines=False, full=False):
    """Refresh the slate + lines (both leagues), play everything out, write the
    output files. Each league is pulled on its own: one dead feed never stops the other."""
    now = now_utc()
    fresh, reasons = {}, {}

    print("Pulling upcoming college games and lines…")
    try:
        up = cfbd.pull_upcoming(SEASON)
        fresh["ncaaf"] = True
    except cfbd.CFBDDown as e:
        up = carry_college(R, now)
        fresh["ncaaf"], reasons["ncaaf"] = False, str(e)
        print(f"  COLLEGE FEED DOWN: {e} - carrying {len(up)} games forward, NFL continues")

    print("Pulling upcoming NFL games and lines…")
    nfl_games, fresh["nfl"] = nfl.pull_nfl(R)
    if not fresh["nfl"]:
        reasons["nfl"] = nfl.NFL_DIAG.get("status", "feed unavailable")
        print(f"  NFL FEED DOWN: {reasons['nfl']}")
    for g in nfl_games:
        line = f"{g['away']} {-g['spread']:+g} / {g['total']} ({g['book']})" if g["spread"] is not None else "no line"
        print(f"    {g['start'][:16]}  {g['away']} @ {g['home']}  {line}")
    nfl_art = nfl.nfl_team_art()
    up = sorted(up + nfl_games, key=lambda g: g["start"])
    carry_history(R, up)
    nfl.pull_nfl_scores(up)      # college scores rode along on the /games call above
    shown = {k: sum(1 for g in up if g.get("status", "upcoming") == k) for k in ("upcoming", "live", "final")}
    print(f"  {shown['upcoming']} upcoming, {shown['live']} in progress, {shown['final']} final (kept {RECENT_HOURS}h)")
    # alt lines are pulled weekly; every other refresh keeps the last copy
    old = {g["id"]: g.get("alt") for g in R.get("upcoming", []) if g.get("alt")}
    for g in up:
        if g["id"] in old:
            g["alt"] = old[g["id"]]
    if alt_lines:
        if odds.nfl_alt_week():
            print("Pulling DraftKings alternate lines (NFL week: NFL first)…")
            odds.pull_alt_lines(up, "nfl")
        else:
            print("Pulling DraftKings alternate lines (off week for NFL - college only)…")
        odds.pull_alt_lines(up, "ncaaf")
    R["alt_generated"] = max([g["alt"]["asof"] for g in up if g.get("alt")], default=None)
    # Logos, colors, conferences: one CFBD call per SEASON, then read from disk.
    art = dict(cfbd.cached(f"teaminfo_{SEASON}", lambda: cfbd.pull_team_art(SEASON)))
    art.update(nfl_art)
    R["logos"] = {}
    R["colors"] = {}
    R["colors2"] = {}
    for g in up:
        for team in (g["home"], g["away"]):
            a = art.get(team)
            if not a:
                continue
            if a.get("logo"):
                R["logos"][team] = a["logo"]
            if a.get("color"):
                R["colors"][team] = a["color"]
            if a.get("alt"):
                R["colors2"][team] = a["alt"]     # second color: text on the score chip
    for g in up:
        if g["league"] != "ncaaf":
            continue                                    # NFL has no ratings; sims center on the market
        g["home_conf"] = (art.get(g["home"]) or {}).get("conference")
        g["away_conf"] = (art.get(g["away"]) or {}).get("conference")
        hp, ap = project(g["home"], g["away"], R)
        if g["neutral"]:                                # take the home edge back out
            hp -= HFA_POINTS / 2
            ap += HFA_POINTS / 2
        g["proj_home"] = round(hp, 1)
        g["proj_away"] = round(ap, 1)
    # AP Top 25 rank, per game's own week - feeds the Top 25 filter.
    ncaaf_weeks = sorted({g["week"] for g in up if g["league"] == "ncaaf"})
    rankings = rankings_for(R, ncaaf_weeks, fresh["ncaaf"], force=full)
    for g in up:
        if g["league"] != "ncaaf":
            continue
        wk_ranks = rankings.get(str(g["week"]), {})
        g["home_rank"] = wk_ranks.get(g["home"])
        g["away_rank"] = wk_ranks.get(g["away"])
    R["upcoming"] = up
    R["nfl_diag"] = dict(nfl.NFL_DIAG, parsed=sum(1 for g in up if g.get("league") == "nfl"))
    stale = note_freshness(R, fresh, reasons, now)
    lined = {lg: sum(1 for g in up if g["league"] == lg and g["spread"] is not None
                     and g["total"] is not None and g.get("status", "upcoming") == "upcoming")
             for lg in sim.LEAGUES}
    print(f"  {len(up)} games in the next {DAYS_AHEAD} days: {lined['ncaaf']} college + {lined['nfl']} NFL with a line")

    # Play every lined game out once (sim.py) and store the result as a table
    # the page can look numbers up in. The page never simulates anything, so
    # every % it shows is the same on every device and matches calibrate.py.
    pre = [g for g in up if g.get("status", "upcoming") == "upcoming"]
    print(f"Playing out {sum(1 for g in pre if g.get('spread') is not None and g.get('total') is not None)} "
          f"upcoming games {sim.SIMS:,} times each…")
    freeze_probs(pre, sim.attach_sims(pre))
    for g in up:
        if g.get("status", "upcoming") != "upcoming":
            g.pop("sim", None)       # ~5 KB a game, and the final score answers everything it could
    record_results(up)
    R.pop("hot", None)                 # hot slips are built in the page now (so feedback can reshuffle them)
    R["sim"] = {"sd": sim.SD_BY_LEAGUE, "margin_sd": sim.MARGIN_SD_BY_LEAGUE, "n": sim.SIMS}

    atomic_write(OUT, json.dumps(R, indent=1))
    # Same data as a script file. A browser will not let a page opened by
    # double-clicking read ratings.json, but it will happily load ratings.js,
    # so the tool works both from the desktop and from the website.
    page = {k: v for k, v in R.items() if k not in PAGE_SKIPS}
    atomic_write(OUT_JS, "window.RATINGS = " + json.dumps(page, separators=(",", ":")) + ";\n")
    print(f"Wrote {OUT} and {OUT_JS} ({os.path.getsize(OUT_JS)//1024} KB) — lines as of {R['lines_generated']}")

    if fresh["ncaaf"]:
        cfbd.calls_left()              # ask CFBD for its own count (at most every few hours)
    H = common.write_health(stale, now)
    print(f"health: CFBD {H['cfbd'].get('left')} calls left ({H['cfbd'].get('left_source')}), "
          f"odds {H['odds'].get('left')} credits left" + (" — ALERT: " + "; ".join(H["alerts"]) if H["alerts"] else ""))


# ratings.json keeps these for research; the page never reads them.
PAGE_SKIPS = ("teams", "accuracy", "league", "rankings", "rankings_season")

# What a full (weekly) run must carry over from the previous file. Before
# 2026-09-20 a full run started from a blank record, which threw away the alt
# lines and frozen percentages until the next Thursday pull.
CARRY_KEYS = ("upcoming", "nfl", "asof", "lines_generated", "rankings", "rankings_season")


def load_previous():
    try:
        with open(OUT) as f:
            return json.load(f)
    except (OSError, ValueError):
        return None


def build_ratings():
    """The weekly research ratings. ~20 CFBD calls. Raises cfbd.CFBDDown."""
    print(f"Pulling {PRIOR_SEASON}… (cached after the first run)")
    pg = cfbd.cached(f"games_{PRIOR_SEASON}", lambda: pull_games(PRIOR_SEASON))
    pd_ = cfbd.drives_from_json(cfbd.cached(f"drives_{PRIOR_SEASON}",
                                lambda: cfbd.drives_to_json(pull_drive_counts(PRIOR_SEASON))))
    print(f"  {len(pg)} games")

    print(f"Pulling {SEASON}…")
    cg = pull_games(SEASON)
    max_wk = max((g["week"] for g in cg), default=0)
    cd = pull_drive_counts(SEASON, max_week=max_wk)
    print(f"  {len(cg)} games played so far (through week {max_wk})")

    p_off, p_def, p_ppd, p_drv = fit(pg, pd_)
    p_pace, _ = fit_pace(pg, pd_)

    if cg:
        c_off, c_def, c_ppd, c_drv = fit(cg, cd)
        c_pace, _ = fit_pace(cg, cd)
        n = games_played(cg)
    else:
        c_off, c_def, c_pace, n = {}, {}, {}, {}
        c_ppd, c_drv = p_ppd, p_drv

    off = blend(c_off, p_off, n)
    dfn = blend(c_def, p_def, n)
    pace = blend(c_pace, p_pace, n)

    # league constants: lean on last season until this one has volume
    total_games = len(cg)
    w = total_games / (total_games + 200.0)
    ppd = round(w * c_ppd + (1 - w) * p_ppd, 4)
    drv = round(w * c_drv + (1 - w) * p_drv, 2)

    R = {
        "generated": now_utc().isoformat(timespec="seconds"),
        "season": SEASON,
        "games_this_season": total_games,
        "hfa_points": HFA_POINTS,
        "league": {"ppd": ppd, "drives": drv},
        "teams": {t: {"off": off.get(t, 1.0),
                      "def": dfn.get(t, 1.0),
                      "pace": pace.get(t, 1.0),
                      "games": n.get(t, 0)}
                  for t in sorted(set(off) | set(dfn) | set(pace))},
    }
    R["accuracy"] = backtest(pg, R)
    return R


def main():
    ap_ = argparse.ArgumentParser()
    ap_.add_argument("--check", action="store_true", help="print raw CFBD field names and exit")
    ap_.add_argument("--check-nfl", action="store_true", help="print a raw ESPN NFL record and what we parse from it, then exit")
    ap_.add_argument("--lines-only", action="store_true", help="keep existing ratings, refresh only upcoming games + lines")
    ap_.add_argument("--alt-lines", action="store_true", help="also pull DraftKings alternate lines (~2 credits per game)")
    ap_.add_argument("--health-gate", action="store_true", help="exit 1 if health.json says Danny should look")
    args = ap_.parse_args()
    if args.health_gate:
        sys.exit(common.health_gate())
    if args.check:
        return cfbd.check()
    if args.check_nfl:
        return nfl.check_nfl()

    prev = load_previous()
    if args.lines_only:
        if prev is None:
            sys.exit(f"{OUT} not found - run a full refresh first.")
        return write_upcoming(prev, alt_lines=args.alt_lines)

    try:
        R = build_ratings()
    except cfbd.CFBDDown as e:
        if prev is None:
            sys.exit(f"CFBD is down ({e}) and there is no {OUT} to fall back on.")
        print(f"COLLEGE FEED DOWN: {e} - keeping last week's research ratings, refreshing lines only")
        return write_upcoming(prev, alt_lines=args.alt_lines)
    for k in CARRY_KEYS:
        if prev and k in prev:
            R[k] = prev[k]
    write_upcoming(R, alt_lines=args.alt_lines, full=True)

    a = R["accuracy"]
    print(f"\n{len(R['teams'])} teams rated. Backtest on {PRIOR_SEASON} ({a['games']} games): "
          f"totals off by {a['total_mae']} pts (sd {a['total_sd']}), margins off by {a['margin_mae']} (sd {a['margin_sd']}), "
          f"bias {a['total_bias']:+.2f}. Fit and tested on the same season, so it flatters itself.")


if __name__ == "__main__":
    main()
