"""
cfbd.py - everything Clover asks CollegeFootballData for: the college slate,
lines, scores, drives, team logos and the AP poll.

The one rule that matters here: a CFBD failure raises CFBDDown instead of
stopping the program. refresh.py catches it, carries the last good college
lines forward, and still refreshes the NFL. (On 2026-09-20 a used-up monthly
allowance stopped BOTH leagues for four hours. Never again.)
"""

import os
import json
import time
from collections import defaultdict

import requests

import common
from common import pick, parse_dt, status_for, now_utc, DAYS_AHEAD, RECENT_HOURS

BASE = "https://api.collegefootballdata.com"
_now = now_utc()
SEASON = _now.year if _now.month >= 7 else _now.year - 1     # a season is named for its fall
PRIOR_SEASON = SEASON - 1
WEEKS = range(1, 16)

# Which book's line to auto-fill, in order of preference. Underdog isn't in the
# feed; DraftKings tracks it closest.
BOOKS = ["DraftKings", "ESPN Bet", "Bovada"]

RETRIES = 3                    # tries per call, for timeouts and 5xx only
RETRY_WAIT = 4                 # seconds, doubled each try
INFO_EVERY_HOURS = 6           # how often to ask CFBD how many calls are left


class CFBDDown(Exception):
    """CFBD can't be used right now: no key, key rejected, monthly calls used up,
    or it kept timing out. NOT raised for an ordinary 4xx on one endpoint - that
    stays a requests.HTTPError so one missing week doesn't sink the run."""


def key():
    k = os.environ.get("CFBD_KEY", "").strip()
    if not k:
        raise _down("CFBD_KEY is not set")
    return k


DOWN = None                    # set by the first fatal failure; later calls in the same run don't even try


def get(path, **params):
    """One CFBD call, counted, with a retry for the failures that a retry can fix."""
    if DOWN:
        raise CFBDDown(DOWN)
    k = key()
    last = "no response"
    for attempt in range(RETRIES):
        if attempt:
            time.sleep(RETRY_WAIT * 2 ** (attempt - 1))
        try:
            r = requests.get(f"{BASE}{path}",
                             headers={"Authorization": f"Bearer {k}",
                                      "Accept": "application/json"},
                             params=params, timeout=30)
        except requests.RequestException as e:
            last = type(e).__name__
            continue
        common.RUN["cfbd_calls"] += 1
        if r.status_code == 401:
            raise _down("CFBD rejected the key (401)")
        if r.status_code == 429:
            raise _down("CFBD monthly calls are used up (429)")
        if r.status_code >= 500:
            last = f"CFBD {r.status_code}"
            continue
        r.raise_for_status()
        return r.json()
    raise _down(f"CFBD {path} failed {RETRIES} times ({last})")


def _down(msg):
    global DOWN
    DOWN = msg
    common.RUN["cfbd_error"] = msg
    return CFBDDown(msg)


def calls_left():
    """Ask CFBD how many calls are left this month (GET /info -> remainingCalls).
    Asked at most every INFO_EVERY_HOURS because it may itself count as a call.
    Any failure here is ignored - Clover's own count is the fallback."""
    prev = (common.load_health().get("cfbd") or {})
    asof = parse_dt(prev.get("left_asof") or "")
    if (prev.get("left_source") == "reported by CFBD" and asof is not None
            and prev.get("month") == now_utc().strftime("%Y-%m")
            and (now_utc() - asof).total_seconds() < INFO_EVERY_HOURS * 3600):
        return None
    try:
        info = get("/info") or {}
        left = pick(info, "remainingCalls", "remaining_calls")
        if left is not None:
            common.RUN["cfbd_left_reported"] = int(left)
            return int(left)
    except (CFBDDown, requests.HTTPError, ValueError, TypeError):
        pass
    return None


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
    """Prior seasons never change, so keep them on disk and skip the API.
    An EMPTY answer is never saved - a CFBD hiccup on the first call of a season
    would otherwise leave the page without logos until someone deleted the file."""
    path = f"cache_{name}.json"
    if os.path.exists(path):
        with open(path) as f:
            data = json.load(f)
        if data:
            return data
    data = builder()
    if data:
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


def pull_upcoming(season):
    """Games with an FBS team kicking off within DAYS_AHEAD days, plus the ones
    that kicked off in the last RECENT_HOURS so the page can show live scores and
    finals. Scores ride along on this same /games call - CFBD fills in points as
    the game goes, so a finished slate costs no extra API calls."""
    now = now_utc()
    horizon = now.timestamp() + DAYS_AHEAD * 86400
    floor = now.timestamp() - RECENT_HOURS * 3600
    games = []
    for g in get("/games", year=season, seasonType="regular", classification="fbs"):
        hc = pick(g, "home_classification", "homeClassification")
        ac = pick(g, "away_classification", "awayClassification")
        if hc != "fbs" and ac != "fbs":
            continue
        start = parse_dt(pick(g, "start_date", "startDate", default="") or "")
        if start is None or start.timestamp() > horizon or start.timestamp() < floor:
            continue
        hp = pick(g, "home_points", "homePoints")
        ap = pick(g, "away_points", "awayPoints")
        done = bool(pick(g, "completed", default=False))
        games.append({
            "id": pick(g, "id"),
            "league": "ncaaf",
            "week": pick(g, "week", default=0),
            "start": start.isoformat(timespec="minutes"),
            "home": pick(g, "home_team", "homeTeam"),
            "away": pick(g, "away_team", "awayTeam"),
            "fcs": hc != "fbs" or ac != "fbs",   # FBS-vs-FCS (pure FCS-vs-FCS was never pulled)
            "neutral": bool(pick(g, "neutral_site", "neutralSite", default=False)),
            "status": status_for(start, now, done),
            "hp": float(hp) if hp is not None else None,
            "ap": float(ap) if ap is not None else None,
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


def pull_team_art(season):
    """Logo + primary color + conference per school, from CFBD /teams (one call,
    then cached on disk). Logos are ESPN CDN URLs; the page shows initials if
    one is missing. Conference feeds the page's Conference filter."""
    out = {}
    try:
        teams = get("/teams", year=season)
    except (requests.HTTPError, CFBDDown) as e:
        print(f"  team info unavailable ({e}) — page will show initials, no conference filter")
        return out
    for t in teams:
        name = pick(t, "school")
        logos = pick(t, "logos", default=[]) or []
        if not name:
            continue
        out[name] = {"logo": logos[0] if logos else None,
                     "color": pick(t, "color"),
                     "alt": pick(t, "alt_color", "alternateColor"),
                     "conference": pick(t, "conference")}
    return out


def pull_rankings(season, weeks):
    """AP Top 25 rank per team, by week: {week: {school: rank}}. One call per
    week asked for. A published poll never changes, so refresh.py only asks for
    weeks it doesn't already have (and re-asks everything on the weekly full run)."""
    out = {}
    for wk in weeks:
        try:
            rows = get("/rankings", year=season, week=wk, seasonType="regular")
        except requests.HTTPError as e:
            print(f"  rankings for week {wk} unavailable ({e.response.status_code})")
            continue
        except CFBDDown as e:
            print(f"  rankings unavailable ({e}) - keeping the ranks already on file")
            break
        ranks = {}
        for entry in rows:
            polls = pick(entry, "polls", default=[]) or []
            ap = next((p for p in polls if "ap" in (p.get("poll") or "").lower()), None)
            if not ap:
                continue
            for r in pick(ap, "ranks", default=[]) or []:
                school, rk = pick(r, "school"), pick(r, "rank")
                if school and rk:
                    ranks[school] = int(rk)
        if ranks:
            out[wk] = ranks
    return out


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
