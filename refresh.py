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
    python refresh.py --lines-only --alt-lines   # + DraftKings alternate lines (weekly; spends ODDS_KEY credits)
    (on GitHub this runs itself on a schedule; see .github/workflows/refresh.yml)

LEAGUES:
    College (FBS) comes from CollegeFootballData. The NFL slate + lines come
    from ESPN's public scoreboard feed (no key). Both land in the same
    `upcoming` list, tagged league = "ncaaf" | "nfl"; the page has a switch.

FIRST RUN - do this one first:
    python refresh.py --check
    Prints the raw field names the API actually returns. CFBD has used both
    snake_case and camelCase over time and I could not test this against the
    live API, so if something breaks, --check is what tells us why.
    python refresh.py --check-nfl          # same idea for the ESPN NFL feed
"""

import os
import re
import sys
import json
import math
import argparse
from collections import defaultdict
from datetime import datetime, timezone

import requests

import sim            # the one game simulator - tables for the page are built here

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

OUT = "ratings.json"       # everything, incl. team ratings and accuracy (research)
OUT_JS = "ratings.js"      # only what the page needs: slate, lines, sim tables, hot slips

# Upcoming games: how many days ahead to list, and which book's line to
# auto-fill. Underdog isn't in the feed; DraftKings tracks it closest.
DAYS_AHEAD = 8
BOOKS = ["DraftKings", "ESPN Bet", "Bovada"]     # in order of preference

# NFL slate + lines: ESPN's public scoreboard (the same CDN the logos come from).
# No key, no credits. Lines are ESPN BET's, which track DraftKings within a
# half point. Unofficial endpoint - if it ever changes, `--check-nfl` shows why.
ESPN_NFL = "https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard"

# Alternate lines (every spread/total rung DraftKings offers) come from
# the-odds-api.com. Free tier = 500 credits/month; each game costs 2 credits
# (2 markets x 1 bookmaker), so a weekly pull of ~50 college games is ~100
# credits and ~16 NFL games ~34. Both every week would top the free tier, so
# NFL alt lines are pulled every OTHER week (even ISO weeks) and go first on
# those weeks - the ODDS_MIN_REMAINING guard then trims the college tail, not
# the NFL. Key lives in the ODDS_KEY secret. --alt-lines is the only thing
# that spends it.
ODDS_BASE = "https://api.the-odds-api.com/v4"
ODDS_SPORTS = {"ncaaf": "americanfootball_ncaaf", "nfl": "americanfootball_nfl"}
ODDS_BOOK = "draftkings"
ODDS_MIN_REMAINING = 40        # stop pulling when this few credits are left
NFL_ALT_EVERY_OTHER_WEEK = True


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
    """CFBD dates look like 2025-08-23T16:00:00.000Z; ESPN's like 2025-09-14T17:00Z."""
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
        if start is None or start.timestamp() > horizon or start.timestamp() < now.timestamp():
            continue                                    # kicked off already - pregame picks are moot
        games.append({
            "id": pick(g, "id"),
            "league": "ncaaf",
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
# NFL (ESPN scoreboard)
# ----------------------------------------------------------------------
_DETAILS = re.compile(r"^\s*([A-Z]{2,4})\s+([-+]?\d+(?:\.\d+)?)\s*$")


ESPN_HEADERS = {"Accept": "application/json, text/plain, */*",
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36",
                "Referer": "https://www.espn.com/"}


def espn_get(**params):
    r = requests.get(ESPN_NFL, params=params, timeout=30, headers=ESPN_HEADERS)
    if r.status_code != 200:
        raise RuntimeError(f"ESPN {r.status_code}: {r.text[:200]}")
    return r.json()


def espn_spread(odds, home_abbr, away_abbr):
    """Home-team spread (negative = home favored) from one ESPN odds record.
    `details` ("KC -3.5") names the favorite, so it is the unambiguous source;
    the bare `spread` field is the fallback, sign-checked against `favorite`."""
    d = (odds.get("details") or "").strip().upper()
    if d in ("EVEN", "PK", "PICK", "PICK'EM"):
        return 0.0
    m = _DETAILS.match(d)
    if m:
        abbr, num = m.group(1), float(m.group(2))
        if abbr == (home_abbr or "").upper():
            return num
        if abbr == (away_abbr or "").upper():
            return -num
    sp = odds.get("spread")
    if sp is None:
        return None
    sp = float(sp)
    home_fav = (odds.get("homeTeamOdds") or {}).get("favorite")
    away_fav = (odds.get("awayTeamOdds") or {}).get("favorite")
    if home_fav is True and sp > 0:
        sp = -sp
    elif away_fav is True and sp < 0:
        sp = -sp
    return sp


def pull_nfl_upcoming():
    """NFL games kicking off within DAYS_AHEAD days, with ESPN BET's spread and
    total, plus logo + color for each team. Returns (games, art)."""
    now = datetime.now(timezone.utc)
    horizon = now.timestamp() + DAYS_AHEAD * 86400
    d0 = now.strftime("%Y%m%d")
    d1 = datetime.fromtimestamp(horizon, timezone.utc).strftime("%Y%m%d")
    events = []
    for attempt, params in enumerate(({"dates": f"{d0}-{d1}", "limit": 100}, {"limit": 100}, {})):
        try:
            events = espn_get(**params).get("events") or []
        except Exception as e:
            print(f"  NFL feed attempt {attempt + 1} failed ({params}): {e}")
            continue
        if events:
            break
        print(f"  NFL feed attempt {attempt + 1} returned no events ({params})")
    if not events:
        print("  NFL feed unavailable - keeping college only")
        return [], {}
    print(f"  NFL feed: {len(events)} events")
    games, art = [], {}
    for e in events:
        comp = (e.get("competitions") or [{}])[0]
        start = parse_dt(e.get("date") or comp.get("date") or "")
        if start is None or start.timestamp() > horizon or start.timestamp() < now.timestamp():
            continue
        state = ((comp.get("status") or {}).get("type") or {}).get("state")
        if state and state != "pre":
            continue
        home = away = None
        for c in comp.get("competitors") or []:
            t = c.get("team") or {}
            side = {"name": t.get("displayName") or t.get("name"), "abbr": t.get("abbreviation"),
                    "short": t.get("shortDisplayName") or t.get("name")}
            if c.get("homeAway") == "home":
                home = side
            elif c.get("homeAway") == "away":
                away = side
            if side["name"]:
                color = t.get("color")
                art[side["name"]] = {"logo": t.get("logo"),
                                     "color": ("#" + color) if color and not color.startswith("#") else color}
        if not home or not away or not home["name"] or not away["name"]:
            continue
        g = {
            "id": int(e.get("id")),                     # ESPN game id (CFBD uses the same id space)
            "league": "nfl",
            "week": ((e.get("week") or {}).get("number")) or 0,
            "start": start.isoformat(timespec="minutes"),
            "home": home["name"],
            "away": away["name"],
            "home_short": home["short"],            # "Chiefs" - the page uses it where space is tight
            "away_short": away["short"],
            "neutral": bool(comp.get("neutralSite", False)),
            "spread": None,
            "total": None,
            "book": None,
        }
        for o in comp.get("odds") or []:
            sp = espn_spread(o, home["abbr"], away["abbr"])
            ou = o.get("overUnder")
            if sp is None or ou is None:
                continue
            g["spread"], g["total"] = float(sp), float(ou)
            g["book"] = (o.get("provider") or {}).get("name") or "ESPN BET"
            break
        games.append(g)
    games.sort(key=lambda g: g["start"])
    return games, art


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


def odds_get(path, **params):
    k = os.environ.get("ODDS_KEY", "").strip()
    if not k:
        sys.exit("ODDS_KEY is not set (repository secret).")
    params["apiKey"] = k
    r = requests.get(ODDS_BASE + path, params=params, timeout=30)
    if r.status_code != 200:
        print(f"  odds api {path} -> {r.status_code}: {r.text[:200]}")
        return None, None
    return r.json(), int(r.headers.get("x-requests-remaining", "0") or 0)


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


def write_upcoming(R, alt_lines=False):
    """Refresh the slate + lines (both leagues), project each college game,
    play everything out, write both output files."""
    print("Pulling upcoming college games and lines…")
    up = pull_upcoming(SEASON)
    print("Pulling upcoming NFL games and lines…")
    nfl, nfl_art = pull_nfl_upcoming()
    for g in nfl:
        line = f"{g['away']} {-g['spread']:+g} / {g['total']} ({g['book']})" if g["spread"] is not None else "no line"
        print(f"    {g['start'][:16]}  {g['away']} @ {g['home']}  {line}")
    up = sorted(up + nfl, key=lambda g: g["start"])
    # alt lines are pulled weekly; every other refresh keeps the last copy
    old = {g["id"]: g.get("alt") for g in R.get("upcoming", []) if g.get("alt")}
    for g in up:
        if g["id"] in old:
            g["alt"] = old[g["id"]]
    if alt_lines:
        if nfl_alt_week():
            print("Pulling DraftKings alternate lines (NFL week: NFL first)…")
            pull_alt_lines(up, "nfl")
        else:
            print("Pulling DraftKings alternate lines (off week for NFL - college only)…")
        pull_alt_lines(up, "ncaaf")
    R["alt_generated"] = max([g["alt"]["asof"] for g in up if g.get("alt")], default=None)
    art = dict(cached(f"teams_{SEASON}", lambda: pull_team_art(SEASON)))
    art.update(nfl_art)
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
        if g["league"] != "ncaaf":
            continue                                    # NFL has no ratings; sims center on the market
        hp, ap = project(g["home"], g["away"], R)
        if g["neutral"]:                                # take the home edge back out
            hp -= HFA_POINTS / 2
            ap += HFA_POINTS / 2
        g["proj_home"] = round(hp, 1)
        g["proj_away"] = round(ap, 1)
    R["upcoming"] = up
    R["lines_generated"] = datetime.now(timezone.utc).isoformat(timespec="seconds")
    lined = {lg: sum(1 for g in up if g["league"] == lg and g["spread"] is not None and g["total"] is not None)
             for lg in sim.LEAGUES}
    print(f"  {len(up)} games in the next {DAYS_AHEAD} days: {lined['ncaaf']} college + {lined['nfl']} NFL with a line")

    # Play every lined game out once (sim.py) and store the result as a table
    # the page can look numbers up in. The page never simulates anything, so
    # every % it shows is the same on every device and matches calibrate.py.
    print(f"Playing out {sum(lined.values())} games {sim.SIMS:,} times each…")
    sim.attach_sims(up)
    R.pop("hot", None)                 # hot slips are built in the page now (so feedback can reshuffle them)
    R["sim"] = {"sd": sim.SD_BY_LEAGUE, "margin_sd": sim.MARGIN_SD_BY_LEAGUE, "n": sim.SIMS}

    atomic_write(OUT, json.dumps(R, indent=1))
    # Same data as a script file. A browser will not let a page opened by
    # double-clicking read ratings.json, but it will happily load ratings.js,
    # so the tool works both from the desktop and from the website.
    page = {k: v for k, v in R.items() if k not in ("teams", "accuracy", "league")}
    atomic_write(OUT_JS, "window.RATINGS = " + json.dumps(page, separators=(",", ":")) + ";\n")
    print(f"Wrote {OUT} and {OUT_JS} ({os.path.getsize(OUT_JS)//1024} KB) — lines as of {R['lines_generated']}")


def atomic_write(path, text):
    """Write to a temp file then rename, so a crash never leaves a half-written file."""
    tmp = path + ".tmp"
    with open(tmp, "w") as f:
        f.write(text)
    os.replace(tmp, path)


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


def check_nfl():
    """Raw look at the ESPN feed: first event's teams + odds record, then what we parse."""
    data = espn_get(limit=100)
    events = data.get("events") or []
    print(f"{len(events)} events in the current-week feed")
    if not events:
        return
    e = events[0]
    comp = (e.get("competitions") or [{}])[0]
    print("\nevent:", e.get("id"), e.get("name"), e.get("date"))
    for c in comp.get("competitors") or []:
        t = c.get("team") or {}
        print("  ", c.get("homeAway"), t.get("displayName"), t.get("abbreviation"), t.get("logo"), t.get("color"))
    print("\nodds records:")
    for o in comp.get("odds") or []:
        print(json.dumps({k: o.get(k) for k in ("provider", "details", "overUnder", "spread", "homeTeamOdds", "awayTeamOdds")},
                         indent=1, default=str)[:1500])
    games, art = pull_nfl_upcoming()
    print(f"\nparsed {len(games)} upcoming NFL games:")
    for g in games:
        print(f"  {g['start']}  {g['away']} @ {g['home']}  spread(home) {g['spread']}  total {g['total']}  {g['book']}")


def main():
    ap_ = argparse.ArgumentParser()
    ap_.add_argument("--check", action="store_true",
                     help="print raw API field names and exit")
    ap_.add_argument("--check-nfl", action="store_true",
                     help="print a raw ESPN NFL record and what we parse from it, then exit")
    ap_.add_argument("--lines-only", action="store_true",
                     help="keep existing ratings, refresh only upcoming games + lines (~3 API calls)")
    ap_.add_argument("--alt-lines", action="store_true",
                     help="also pull DraftKings alternate lines from the-odds-api.com (~2 credits per game)")
    args = ap_.parse_args()
    if args.check:
        check()
        return
    if args.check_nfl:
        check_nfl()
        return

    if args.lines_only:
        if not os.path.exists(OUT):
            sys.exit(f"{OUT} not found - run a full refresh first.")
        with open(OUT) as f:
            R = json.load(f)
        write_upcoming(R, alt_lines=args.alt_lines)
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
    write_upcoming(R, alt_lines=args.alt_lines)

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
