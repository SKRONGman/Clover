"""
odds.py - everything Clover asks the-odds-api.com for that isn't NFL-specific:
the one HTTP helper (it records credits left for health.json), team-name
matching between CFBD and the odds feed, and the weekly DraftKings alternate
lines. nfl.py uses odds_get for the NFL slate and scores.

Credit math: cost = markets x regions. Bookmakers do NOT multiply cost.
Danny is on the 20K tier (since 2026-09-19); credits reset on the 1st.
"""

import os
import time
from datetime import datetime, timezone

import requests

import common
from common import parse_dt

ODDS_BASE = "https://api.the-odds-api.com/v4"
ODDS_SPORTS = {"ncaaf": "americanfootball_ncaaf", "nfl": "americanfootball_nfl"}
ODDS_BOOK = "draftkings"
ODDS_MIN_REMAINING = 40        # hard stop: no alt-line pulls with this few credits left
NFL_ALT_EVERY_OTHER_WEEK = True


def odds_get(path, **params):
    """One odds-api call. Returns (data, credits_left), or (None, None) on any
    failure - callers already treat None as "keep what we had". One retry for
    timeouts and 5xx."""
    k = os.environ.get("ODDS_KEY", "").strip()
    if not k:
        common.RUN["odds_error"] = "ODDS_KEY is not set"
        print("  odds api: ODDS_KEY is not set (repository secret)")
        return None, None
    params["apiKey"] = k
    err = None
    for attempt in range(2):
        if attempt:
            time.sleep(3)
        try:
            r = requests.get(ODDS_BASE + path, params=params, timeout=30)
        except requests.RequestException as e:
            err = f"odds api {path}: {type(e).__name__}"
            continue
        left = r.headers.get("x-requests-remaining")
        if left not in (None, ""):
            common.RUN["odds_left"] = int(float(left))
        if r.status_code == 200:
            return r.json(), common.RUN["odds_left"] or 0
        err = f"odds api {path} -> {r.status_code}"
        if r.status_code < 500:
            break
    common.RUN["odds_error"] = err
    print(f"  {err}")
    return None, None


# CFBD name -> how the odds feed spells it (only where the prefix rule fails)
ODDS_ALIASES = {
    "App State": "Appalachian State",
    "Hawai'i": "Hawaii",
    "UL Monroe": "Louisiana Monroe",
    "UMass": "Massachusetts",
    "USF": "South Florida",
    "UTSA": "UTSA",
    "San José State": "San Jose State",
}


def team_match(cfbd_name, odds_name):
    """CFBD says 'Florida State'; the odds feed says 'Florida State Seminoles'.
    NFL names are already full ('Kansas City Chiefs' both sides) - exact match."""
    if not cfbd_name or not odds_name:
        return False
    cfbd_name = ODDS_ALIASES.get(cfbd_name, cfbd_name)
    a, b = cfbd_name.lower(), odds_name.lower()
    if b == a:
        return True
    if not b.startswith(a + " "):
        return False
    rest = b[len(a) + 1:]
    # 'Miami' must not match 'Miami (OH) RedHawks'
    return not (rest.startswith("(") and "(" not in a)


def pull_alt_lines(up, league="ncaaf"):
    """Attach DraftKings alternate spreads/totals to each upcoming game of one
    league that has a line. Games keep whatever they already had if a pull fails.
    Returns credits remaining (None if the feed failed)."""
    sport = ODDS_SPORTS[league]
    events, remaining = odds_get(f"/sports/{sport}/events")     # this call is free
    if events is None:
        return None
    print(f"  odds api [{league}]: {len(events)} events listed, {remaining} credits left")
    # Match each odds-feed event to ONE of our games: same kickoff (±6h) and
    # both team names match. 'Texas' also prefix-matches 'Texas A&M Aggies',
    # so when several games fit, the longest name wins.
    lined = [g for g in up if g.get("league", "ncaaf") == league
             and g["spread"] is not None and g["total"] is not None]
    event_for = {}
    for e in events:
        et = parse_dt(e.get("commence_time", "") or "")
        if et is None:
            continue
        best, best_len = None, -1
        for g in lined:
            kick = parse_dt(g["start"])
            if kick is None or abs((et - kick).total_seconds()) > 6 * 3600:
                continue
            if team_match(g["home"], e.get("home_team")) and team_match(g["away"], e.get("away_team")):
                L = len(g["home"]) + len(g["away"])
                if L > best_len:
                    best, best_len = g, L
        if best is not None and best_len > event_for.get(best["id"], (None, -1))[1]:
            event_for[best["id"]] = (e, best_len)
    # DK's MAIN spread and total (with prices) for every game, in one call for the
    # whole slate (2 credits). The alternate_* markets below leave the main line
    # out, and the main line is the rung people care about most.
    main = {}
    data, remaining = odds_get(f"/sports/{sport}/odds", bookmakers=ODDS_BOOK,
                               markets="spreads,totals", oddsFormat="american")
    for e in data or []:
        main[e.get("id")] = e
    pulled = skipped = 0
    for g in lined:
        ev = event_for.get(g["id"], (None, 0))[0]
        if ev is None:
            skipped += 1
            continue
        if remaining is not None and remaining < ODDS_MIN_REMAINING:
            print(f"  stopping: only {remaining} credits left")
            break
        data, remaining = odds_get(f"/sports/{sport}/events/{ev['id']}/odds",
                                   bookmakers=ODDS_BOOK,
                                   markets="alternate_spreads,alternate_totals",
                                   oddsFormat="american")
        if not data:
            continue
        alt = {"book": ODDS_BOOK, "asof": datetime.now(timezone.utc).isoformat(timespec="minutes"),
               "spreads": {"home": [], "away": []}, "totals": {"over": [], "under": []}}
        seen = set()
        for src in (data, main.get(ev["id"]) or {}):
            for bk in src.get("bookmakers", []):
                for m in bk.get("markets", []):
                    for o in m.get("outcomes", []):
                        pt, price = o.get("point"), o.get("price")
                        if pt is None or price is None:
                            continue
                        if m["key"] in ("alternate_spreads", "spreads"):
                            kind = "spreads"
                            side = "home" if team_match(g["home"], o.get("name")) else "away" if team_match(g["away"], o.get("name")) else None
                        elif m["key"] in ("alternate_totals", "totals"):
                            kind = "totals"
                            side = "over" if o.get("name") == "Over" else "under" if o.get("name") == "Under" else None
                        else:
                            continue
                        if side and (kind, side, float(pt)) not in seen:
                            seen.add((kind, side, float(pt)))
                            alt[kind][side].append([float(pt), int(price)])
        for d in (alt["spreads"], alt["totals"]):
            for k in d:
                d[k].sort()
        if any(alt["spreads"].values()) or any(alt["totals"].values()):
            g["alt"] = alt
            pulled += 1
    print(f"  alt lines [{league}]: {pulled} games pulled, {skipped} not matched in the odds feed, {remaining} credits left")
    return remaining


def nfl_alt_week():
    """NFL alt lines run on even ISO weeks (see the credit math in CONFIG)."""
    return (not NFL_ALT_EVERY_OTHER_WEEK) or datetime.now(timezone.utc).isocalendar()[1] % 2 == 0
