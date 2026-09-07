#!/usr/bin/env python3
"""
refresh.py - builds ratings.json for The Card.

Runs on your machine or on GitHub's servers (see .github/workflows/refresh.yml).
The API key is never in this file - it comes from the CFBD_KEY environment
variable (a GitHub "secret" when run there).

SETUP (once):
    pip install requests
    export CFBD_KEY="your-key-here"        # macOS/Linux
    setx CFBD_KEY "your-key-here"          # Windows, then reopen the terminal

WEEKLY:
    python refresh.py                      # full: ratings + upcoming games + lines
    python refresh.py --lines-only         # fast (~3 API calls): just the slate and lines
    (on GitHub this runs itself on a schedule; see .github/workflows/refresh.yml)

FIRST RUN - do this one first:
    python refresh.py --check
    Prints the raw field names the API actually returns. CFBD has used both
    snake_case and camelCase over time and I could not test this against the
    live API, so if something breaks, --check is what tells us why.
"""

import os
import sys
import json
import math
import argparse
from collections import defaultdict
from datetime import datetime, timezone

import requests

# ----------------------------------------------------------------------
# CONFIG
# ----------------------------------------------------------------------
BASE = "https://api.collegefootballdata.com"
_now = datetime.now(timezone.utc)
SEASON = _now.year if _now.month >= 7 else _now.year - 1     # a season is named for its fall
PRIOR_SEASON = SEASON - 1
WEEKS = range(1, 16)

# How fast this season's results take over from last season's.
# games_played / (games_played + K). At K=5, one game = 17% current-season weight.
# Early September that's the honest setting. Lower it once you're 6 weeks in.
K_BLEND = 5.0

# How hard a team's own rating shrinks toward league average on thin data.
K_SHRINK = 4.0

# Home field, in points of margin. Split evenly across the two teams.
HFA_POINTS = 2.4

OUT = "ratings.json"
OUT_JS = "ratings.js"      # same numbers, loadable by index.html when opened locally

# Upcoming games: how many days ahead to list, and which book's line to
# auto-fill. Underdog isn't in the feed; DraftKings tracks it closest.
DAYS_AHEAD = 8
BOOKS = ["DraftKings", "ESPN Bet", "Bovada"]     # in order of preference


# ----------------------------------------------------------------------
# API
# ----------------------------------------------------------------------
def key():
    k = os.environ.get("CFBD_KEY", "").strip()
    if not k:
        sys.exit("CFBD_KEY is not set. See the setup notes at the top of this file.")
    return k


def get(path, **params):
    r = requests.get(f"{BASE}{path}",
                     headers={"Authorization": f"Bearer {key()}",
                              "Accept": "application/json"},
                     params=params, timeout=30)
    if r.status_code == 401:
        sys.exit("CFBD rejected the key (401). Check CFBD_KEY.")
    if r.status_code == 429:
        sys.exit("Out of API calls for the month (429).")
    r.raise_for_status()
    return r.json()


def pick(d, *names, default=None):
    """CFBD field names have moved between snake_case and camelCase.
    Take whichever one is actually present."""
    for n in names:
        if n in d and d[n] is not None:
            return d[n]
    return default


# ----------------------------------------------------------------------
# PULL
# ----------------------------------------------------------------------
def pull_games(season):
    """FBS games only. Asking the API for classification=fbs returns every
    game with at least one FBS team; we keep those (an FCS opponent still
    gets rated from that game) and drop anything with no FBS side, which
    otherwise floods the ratings with D2/D3 schools."""
    rows = []
    for g in get("/games", year=season, seasonType="regular", classification="fbs"):
        hc = pick(g, "home_classification", "homeClassification")
        ac = pick(g, "away_classification", "awayClassification")
        if hc != "fbs" and ac != "fbs":
            continue
        hp = pick(g, "home_points", "homePoints")
        ap = pick(g, "away_points", "awayPoints")
        if hp is None or ap is None:
            continue                                    # not played yet
        rows.append({
            "id": pick(g, "id"),
            "week": pick(g, "week", default=0),
            "home": pick(g, "home_team", "homeTeam"),
            "away": pick(g, "away_team", "awayTeam"),
            "hp": float(hp),
            "ap": float(ap),
        })
    return rows


def cached(name, builder):
    """Prior seasons never change, so keep them on disk and skip the API."""
    path = f"cache_{name}.json"
    if os.path.exists(path):
        with open(path) as f:
            return json.load(f)
    data = builder()
    with open(path, "w") as f:
        json.dump(data, f)
    return data


def pull_drive_counts(season, max_week=None):
    """Drives per team per game -> pace. One call per week to stay light."""
    counts = defaultdict(int)
    for wk in WEEKS:
        if max_week is not None and wk > max_week:
            break
        try:
            drives = get("/drives", year=season, seasonType="regular", week=wk,
                         classification="fbs")
        except requests.HTTPError:
            continue
        if not drives:
            continue
        for d in drives:
            gid = pick(d, "game_id", "gameId")
            off = pick(d, "offense")
            if gid is None or off is None:
                continue
            counts[(gid, off)] += 1
    return counts


def drives_to_json(counts):
    return [[gid, off, n] for (gid, off), n in counts.items()]


def drives_from_json(rows):
    return defaultdict(int, {(gid, off): n for gid, off, n in rows})


def parse_dt(s):
    """CFBD dates look like 2025-08-23T16:00:00.000Z."""
    try:
        return datetime.fromisoformat(s.replace("Z", "+00:00"))
    except Exception:
        return None


def pull_upcoming(season):
    """Games with an FBS team that haven't been played yet, kicking off
    within DAYS_AHEAD days, plus the book's spread and total for each."""
    now = datetime.now(timezone.utc)
    horizon = now.timestamp() + DAYS_AHEAD * 86400
    games = []
    for g in get("/games", year=season, seasonType="regular", classification="fbs"):
        if pick(g, "home_points", "homePoints") is not None:
            continue                                    # already played
        hc = pick(g, "home_classification", "homeClassification")
        ac = pick(g, "away_classification", "awayClassification")
        if hc != "fbs" and ac != "fbs":
            continue
        start = parse_dt(pick(g, "start_date", "startDate", default="") or "")
        if start is None or start.timestamp() > horizon or start.timestamp() < now.timestamp() - 6 * 3600:
            continue
        games.append({
            "id": pick(g, "id"),
            "week": pick(g, "week", default=0),
            "start": start.isoformat(timespec="minutes"),
            "home": pick(g, "home_team", "homeTeam"),
            "away": pick(g, "away_team", "awayTeam"),
            "neutral": bool(pick(g, "neutral_site", "neutralSite", default=False)),
            "spread": None,        # home-team spread, negative = home favored
            "total": None,
            "book": None,
        })
    if not games:
        return games

    # Lines come per week; fetch each week we have games in.
    weeks = sorted({g["week"] for g in games})
    by_id = {g["id"]: g for g in games}
    for wk in weeks:
        try:
            rows = get("/lines", year=season, seasonType="regular", week=wk)
        except requests.HTTPError as e:
            print(f"  lines for week {wk} unavailable ({e.response.status_code})")
            continue
        for row in rows:
            g = by_id.get(pick(row, "id"))
            if g is None:
                continue
            lines = pick(row, "lines", default=[]) or []
            chosen = None
            for book in BOOKS:
                chosen = next((l for l in lines if pick(l, "provider") == book), None)
                if chosen and pick(chosen, "spread") is not None:
                    break
                chosen = None
            if chosen is None:
                chosen = next((l for l in lines if pick(l, "spread") is not None), None)
            if chosen is None:
                continue
            sp = pick(chosen, "spread")
            ou = pick(chosen, "over_under", "overUnder")
            g["spread"] = float(sp) if sp is not None else None
            g["total"] = float(ou) if ou is not None else None
            g["book"] = pick(chosen, "provider")
    games.sort(key=lambda g: g["start"])
    return games


# ----------------------------------------------------------------------
# FIT
# ----------------------------------------------------------------------
def fit(games, drive_counts, iters=25):
    """
    Points per drive, adjusted for who you played.

        predicted_ppd = league_avg * offense_rating * defense_rating_of_opponent

    Solved by alternating: hold defenses fixed and solve offenses, then flip.
    Ratings are multipliers around 1.0 - 1.20 offense means 20% more points
    per drive than average against an average defense.
    """
    obs = []       # (team, opponent, points, drives)
    for g in games:
        hd = drive_counts.get((g["id"], g["home"]), 0)
        ad = drive_counts.get((g["id"], g["away"]), 0)
        if hd == 0 or ad == 0:
            hd = ad = 12                                # fall back if drives are missing
        obs.append((g["home"], g["away"], g["hp"], hd))
        obs.append((g["away"], g["home"], g["ap"], ad))

    if not obs:
        return {}, {}, 0.0, 12.0

    league_ppd = sum(p for _, _, p, _ in obs) / sum(d for _, _, _, d in obs)
    league_drives = sum(d for _, _, _, d in obs) / len(obs)

    teams = sorted({t for t, _, _, _ in obs})
    off = {t: 1.0 for t in teams}
    dfn = {t: 1.0 for t in teams}

    for _ in range(iters):
        for side, solving in (("off", off), ("def", dfn)):
            num = defaultdict(float)
            den = defaultdict(float)
            for team, opp, pts, drv in obs:
                if side == "off":
                    who, other = team, dfn.get(opp, 1.0)
                else:
                    who, other = opp, off.get(team, 1.0)
                num[who] += pts
                den[who] += league_ppd * other * drv
            for t in teams:
                if den[t] > 0:
                    raw = num[t] / den[t]
                    n = sum(1 for a, b, _, _ in obs if (a == t if side == "off" else b == t))
                    w = n / (n + K_SHRINK)              # thin data pulls toward average
                    solving[t] = w * raw + (1 - w) * 1.0

    return off, dfn, league_ppd, league_drives


def fit_pace(games, drive_counts):
    per = defaultdict(list)
    for g in games:
        for team in (g["home"], g["away"]):
            d = drive_counts.get((g["id"], team), 0)
            if d:
                per[team].append(d)
    if not per:
        return {}, 12.0
    league = sum(sum(v) for v in per.values()) / sum(len(v) for v in per.values())
    pace = {}
    for t, v in per.items():
        n = len(v)
        w = n / (n + K_SHRINK)
        pace[t] = w * ((sum(v) / n) / league) + (1 - w) * 1.0
    return pace, league


def games_played(games):
    n = defaultdict(int)
    for g in games:
        n[g["home"]] += 1
        n[g["away"]] += 1
    return n


def blend(cur, prior, n_games):
    """This season takes over from last season as games accumulate."""
    out = {}
    for t in set(cur) | set(prior):
        n = n_games.get(t, 0)
        w = n / (n + K_BLEND)
        out[t] = round(w * cur.get(t, 1.0) + (1 - w) * prior.get(t, 1.0), 4)
    return out


# ----------------------------------------------------------------------
# PROJECT + BACKTEST
# ----------------------------------------------------------------------
def project(home, away, R):
    """Returns (home_points, away_points). Same math the tool will use."""
    t = R["teams"]
    lp, ld = R["league"]["ppd"], R["league"]["drives"]
    h = t.get(home, {"off": 1.0, "def": 1.0, "pace": 1.0})
    a = t.get(away, {"off": 1.0, "def": 1.0, "pace": 1.0})
    drives = ld * math.sqrt(h["pace"] * a["pace"])
    hp = lp * h["off"] * a["def"] * drives + HFA_POINTS / 2
    ap = lp * a["off"] * h["def"] * drives - HFA_POINTS / 2
    return max(hp, 0.0), max(ap, 0.0)


def backtest(games, R):
    """
    Project every finished game with these ratings, compare to what happened.
    The spread of those errors IS the volatility number the tool asks for -
    it is not a guess, it is measured.
    """
    te, me = [], []
    for g in games:
        hp, ap = project(g["home"], g["away"], R)
        te.append((g["hp"] + g["ap"]) - (hp + ap))
        me.append((g["hp"] - g["ap"]) - (hp - ap))

    def sd(x):
        m = sum(x) / len(x)
        return math.sqrt(sum((v - m) ** 2 for v in x) / len(x))

    def mae(x):
        return sum(abs(v) for v in x) / len(x)

    return {
        "games": len(games),
        "total_bias": round(sum(te) / len(te), 2),
        "total_sd": round(sd(te), 1),
        "total_mae": round(mae(te), 1),
        "margin_sd": round(sd(me), 1),
        "margin_mae": round(mae(me), 1),
    }


def pull_team_art(season):
    """Logo + primary color per school, from CFBD /teams (one call, then cached
    on disk). Logos are ESPN CDN URLs; the page shows initials if one is missing."""
    out = {}
    try:
        teams = get("/teams", year=season)
    except requests.HTTPError as e:
        print(f"  team logos unavailable ({e.response.status_code}) — page will show initials")
        return out
    for t in teams:
        name = pick(t, "school")
        logos = pick(t, "logos", default=[]) or []
        if not name:
            continue
        out[name] = {"logo": logos[0] if logos else None,
                     "color": pick(t, "color"),
                     "alt": pick(t, "alt_color", "alternateColor")}
    return out


def write_upcoming(R):
    """Refresh the slate + lines, project each game, write both output files."""
    print("Pulling upcoming games and lines…")
    up = pull_upcoming(SEASON)
    art = cached(f"teams_{SEASON}", lambda: pull_team_art(SEASON))
    R["logos"] = {}
    R["colors"] = {}
    for g in up:
        for team in (g["home"], g["away"]):
            a = art.get(team)
            if not a:
                continue
            if a.get("logo"):
                R["logos"][team] = a["logo"]
            if a.get("color"):
                R["colors"][team] = a["color"]
    for g in up:
        hp, ap = project(g["home"], g["away"], R)
        if g["neutral"]:                                # take the home edge back out
            hp -= HFA_POINTS / 2
            ap += HFA_POINTS / 2
        g["proj_home"] = round(hp, 1)
        g["proj_away"] = round(ap, 1)
    R["upcoming"] = up
    R["lines_generated"] = datetime.now(timezone.utc).isoformat(timespec="seconds")
    lined = sum(1 for g in up if g["spread"] is not None)
    print(f"  {len(up)} games in the next {DAYS_AHEAD} days, {lined} with a line")

    with open(OUT, "w") as f:
        json.dump(R, f, indent=1)
    # Same data as a script file. A browser will not let a page opened by
    # double-clicking read ratings.json, but it will happily load ratings.js,
    # so the tool works both from the desktop and from the website.
    with open(OUT_JS, "w") as f:
        f.write("window.RATINGS = " + json.dumps(R, separators=(",", ":")) + ";\n")
    print(f"Wrote {OUT} and {OUT_JS} — lines as of {R['lines_generated']}")


# ----------------------------------------------------------------------
# MAIN
# ----------------------------------------------------------------------
def check():
    print("Sample /games record:")
    g = get("/games", year=PRIOR_SEASON, seasonType="regular", week=1)
    print(json.dumps(g[0], indent=2)[:1200] if g else "  (empty)")
    print("\nSample /drives record:")
    d = get("/drives", year=PRIOR_SEASON, seasonType="regular", week=1)
    print(json.dumps(d[0], indent=2)[:1200] if d else "  (empty)")
    print("\nSample /lines record (this season, week 2):")
    L = get("/lines", year=SEASON, seasonType="regular", week=2)
    print(json.dumps(L[0], indent=2)[:1500] if L else "  (empty)")
    if L:
        provs = sorted({pick(l, "provider") for row in L for l in (pick(row, "lines", default=[]) or [])
                        if pick(l, "provider")})
        print("\nBooks in the feed:", ", ".join(map(str, provs)))


def main():
    ap_ = argparse.ArgumentParser()
    ap_.add_argument("--check", action="store_true",
                     help="print raw API field names and exit")
    ap_.add_argument("--lines-only", action="store_true",
                     help="keep existing ratings, refresh only upcoming games + lines (~3 API calls)")
    args = ap_.parse_args()
    if args.check:
        check()
        return

    if args.lines_only:
        if not os.path.exists(OUT):
            sys.exit(f"{OUT} not found - run a full refresh first.")
        with open(OUT) as f:
            R = json.load(f)
        write_upcoming(R)
        return

    print(f"Pulling {PRIOR_SEASON}… (cached after the first run)")
    pg = cached(f"games_{PRIOR_SEASON}", lambda: pull_games(PRIOR_SEASON))
    pd_ = drives_from_json(cached(f"drives_{PRIOR_SEASON}",
                                  lambda: drives_to_json(pull_drive_counts(PRIOR_SEASON))))
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
        "generated": datetime.now(timezone.utc).isoformat(timespec="seconds"),
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
    write_upcoming(R)

    a = R["accuracy"]
    print(f"\nWrote {OUT} and {OUT_JS} — {len(R['teams'])} teams")
    print(f"League: {ppd:.3f} pts/drive, {drv:.1f} drives per team")
    print(f"\nBacktest on {PRIOR_SEASON} ({a['games']} games):")
    print(f"  totals  off by {a['total_mae']} pts on average, spread {a['total_sd']}")
    print(f"  margins off by {a['margin_mae']} pts on average, spread {a['margin_sd']}")
    print(f"  bias    {a['total_bias']:+.2f} pts (should sit near zero)")
    print(f"\nUse {a['total_sd']} as the volatility number in the tool.")
    print("Note: this is fit and tested on the same season, so it flatters "
          "itself. Treat it as a floor on the real error, not the real error.")


if __name__ == "__main__":
    main()
