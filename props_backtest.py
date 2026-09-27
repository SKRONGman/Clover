"""
props_backtest.py - one-time pull of last season's NFL player-prop lines
(DraftKings, just before kickoff) from the-odds-api's historical feed. Research
only: the page never reads this file. It is the test data for the props phase
(Danny, 2026-09-27: option 3 = market-only prices first, a player sim later;
NFL first; test on one season).

    python props_backtest.py            # pull what's missing, stop at the floor
    python props_backtest.py --plan     # print the plan and cost ceiling, spend nothing

Runs on GitHub Actions only (props-backtest.yml). Safe to re-run: games already
in the file are skipped, so a second run only fills gaps.

Credit math (the-odds-api v4 guide): historical event odds cost
10 x markets returned x regions; one bookmaker = one region. Historical events
cost 1 per snapshot (0 if empty). 6 markets -> at most 60 credits a game,
~285 games -> ~17,100 at most.
Stops for good once credits left fall under FLOOR, so the live refresh never
starves (and stays above ODDS_WARN_LEFT in common.py, so no red run).
"""

import os
import sys
import json
import time
from datetime import datetime, timedelta, timezone

import requests

BASE = "https://api.the-odds-api.com/v4"
HIST = "/historical/sports/americanfootball_nfl"
OUT = "props_hist_2025.json"
BOOK = "draftkings"
MARKETS = ["player_pass_yds", "player_pass_tds", "player_rush_yds",
           "player_reception_yds", "player_receptions", "player_anytime_td"]
SHORT = {"player_pass_yds": "pass_yds", "player_pass_tds": "pass_tds", "player_rush_yds": "rush_yds",
         "player_reception_yds": "rec_yds", "player_receptions": "rec", "player_anytime_td": "any_td"}
SEASON_FROM = datetime(2025, 9, 4, tzinfo=timezone.utc)      # 2025 opener (Thu Sep 4)
SEASON_TO = datetime(2026, 2, 10, tzinfo=timezone.utc)       # past Super Bowl LX (Feb 8)
SNAP_BEFORE = timedelta(minutes=10)     # "closing" props = the snapshot 10 minutes before kickoff
FLOOR = 1500                            # never spend below this many credits left
PER_GAME_MAX = 10 * len(MARKETS)        # worst case for one game


def iso(dt):
    return dt.strftime("%Y-%m-%dT%H:%M:%SZ")


def parse(s):
    return datetime.fromisoformat(s.replace("Z", "+00:00"))


def load():
    try:
        with open(OUT) as f:
            return json.load(f)
    except (OSError, ValueError):
        return {"meta": {}, "events": {}, "games": {}}


def save(D):
    D["meta"]["updated"] = iso(datetime.now(timezone.utc))
    D["meta"]["games_done"] = len(D["games"])
    tmp = OUT + ".tmp"
    with open(tmp, "w") as f:
        json.dump(D, f, separators=(",", ":"))
    os.replace(tmp, OUT)


def get(path, params, key):
    """One call. Returns (status, json_or_None, credits_left_or_None)."""
    params = dict(params, apiKey=key)
    for attempt in range(3):
        if attempt:
            time.sleep(5)
        try:
            r = requests.get(BASE + path, params=params, timeout=40)
        except requests.RequestException:
            continue
        left = r.headers.get("x-requests-remaining")
        left = int(float(left)) if left not in (None, "") else None
        if r.status_code >= 500:
            continue
        try:
            body = r.json()
        except ValueError:
            body = None
        return r.status_code, body, left
    return 0, None, None


def flatten(event_odds):
    """DK's markets -> [[market, player, line, over_price, under_price]].
    Anytime TD has no line: Yes goes in the over slot, No (if offered) in the under slot."""
    rows = {}
    for bk in (event_odds or {}).get("bookmakers", []):
        if bk.get("key") != BOOK:
            continue
        for m in bk.get("markets", []):
            short = SHORT.get(m.get("key"))
            if not short:
                continue
            for o in m.get("outcomes", []):
                player = o.get("description") or ""
                point = o.get("point")
                k = (short, player, point)
                row = rows.setdefault(k, [short, player, point, None, None])
                side = (o.get("name") or "").lower()
                if side in ("over", "yes"):
                    row[3] = o.get("price")
                elif side in ("under", "no"):
                    row[4] = o.get("price")
    return sorted(rows.values(), key=lambda r: (r[0], r[1], r[2] if r[2] is not None else -1))


def find_events(D, key, fetch=get):
    """Weekly Tuesday snapshots of the schedule, each covering the next 8 days.
    Cached in the file, so a re-run spends nothing here."""
    if D["meta"].get("events_complete"):
        return None
    t = SEASON_FROM - timedelta(days=2)
    left = None
    while t < SEASON_TO:
        st, body, lf = fetch(HIST + "/events", {"date": iso(t), "commenceTimeFrom": iso(t),
                                         "commenceTimeTo": iso(t + timedelta(days=8))}, key)
        left = lf if lf is not None else left
        if st != 200:
            return f"events snapshot {iso(t)} -> HTTP {st}: {str(body)[:200]}"
        for e in (body or {}).get("data", []):
            k = parse(e["commence_time"])
            if SEASON_FROM <= k < SEASON_TO:
                D["events"][e["id"]] = {"kick": e["commence_time"], "home": e.get("home_team"),
                                        "away": e.get("away_team")}
        t += timedelta(days=7)
    D["meta"]["events_complete"] = True
    D["meta"]["credits_left"] = left
    return None


def run(key, fetch=get, pause=0.3):
    D = load()
    D["meta"].update(season=2025, book=BOOK, markets=MARKETS, snap_before_min=int(SNAP_BEFORE.total_seconds() // 60),
                     floor=FLOOR, status="running", error=None)
    err = find_events(D, key, fetch)
    if err:
        D["meta"].update(status="stopped", error=err)
        save(D)
        print("  " + err)
        return D
    todo = sorted((e for e in D["events"] if e not in D["games"]), key=lambda e: D["events"][e]["kick"])
    print(f"  {len(D['events'])} games in the 2025 season, {len(todo)} still to pull")
    left = D["meta"].get("credits_left")
    st, _, lf = fetch("/sports", {}, key)      # free call; its header says what's left right now
    if st == 200 and lf is not None:
        left = lf
    spent = D["meta"].get("credits_spent", 0)
    for n, eid in enumerate(todo, 1):
        if left is not None and left - PER_GAME_MAX < FLOOR:
            D["meta"].update(status="stopped", error=f"floor: {left} credits left, floor {FLOOR}")
            break
        ev = D["events"][eid]
        snap = parse(ev["kick"]) - SNAP_BEFORE
        st, body, lf = fetch(f"{HIST}/events/{eid}/odds", {"date": iso(snap), "bookmakers": BOOK,
                                                     "markets": ",".join(MARKETS), "oddsFormat": "american"}, key)
        if lf is not None:
            if left is not None:
                spent += max(0, left - lf)
            left = lf
        if st in (401, 403, 429):
            D["meta"].update(status="stopped", error=f"HTTP {st}: {str(body)[:200]}")
            break
        if st == 200:
            props = flatten((body or {}).get("data"))
            D["games"][eid] = dict(ev, snap=(body or {}).get("timestamp"), props=props)
        else:                               # 404/422 = no snapshot for this game; record it so we don't pay twice
            D["games"][eid] = dict(ev, snap=None, props=[], note=f"HTTP {st}")
        D["meta"].update(credits_left=left, credits_spent=spent)
        if n % 10 == 0:
            save(D)
            print(f"  {n}/{len(todo)} pulled, {left} credits left, {spent} spent")
        time.sleep(pause)
    else:
        D["meta"]["status"] = "done"
    save(D)
    got = sum(1 for g in D["games"].values() if g["props"])
    print(f"  {D['meta']['status']}: {got} of {len(D['events'])} games have props, "
          f"{sum(len(g['props']) for g in D['games'].values())} prop lines, {left} credits left, {spent} spent"
          + (f" - {D['meta']['error']}" if D["meta"]["error"] else ""))
    return D


def plan():
    weeks = (SEASON_TO - SEASON_FROM).days // 7 + 1
    print(f"  ~{weeks} schedule snapshots at 1 credit; ~285 games x at most {PER_GAME_MAX} = "
          f"~{285 * PER_GAME_MAX:,} credits ceiling; stops at {FLOOR} left")


if __name__ == "__main__":
    if "--plan" in sys.argv:
        plan()
        sys.exit(0)
    k = os.environ.get("ODDS_KEY", "").strip()
    if not k:
        print("  ODDS_KEY is not set (repository secret)")
        sys.exit(1)
    D = run(k)
    bad = D["meta"]["status"] != "done" and not str(D["meta"]["error"]).startswith("floor")
    sys.exit(1 if bad else 0)       # a red run = GitHub emails Danny; the file is committed either way
