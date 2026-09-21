"""
nfl.py - the NFL slate, lines and scores.

Where the data really comes from: ESPN's free scoreboard is tried once, but it
refuses GitHub's datacenter IPs (403 on every run since launch), so on Actions
the NFL runs on the-odds-api: /events is free, one slate-wide /odds call is 2
credits, /scores is 2 more when a game has kicked off. If both fail, the last
good pull is carried forward and the league is marked stale.
"""

import os
import re
import json
from datetime import datetime, timezone

import requests

from common import parse_dt, status_for, DAYS_AHEAD, RECENT_HOURS
from odds import odds_get, ODDS_SPORTS, ODDS_BOOK

ESPN_NFL = "https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard"
NFL_DIAG = {"status": "not attempted", "errors": []}     # written into ratings.json so failures are visible without the Actions log

NFL_TEAMS = {
    "Arizona Cardinals": ("ari", "Cardinals", "#97233F"),
    "Atlanta Falcons": ("atl", "Falcons", "#A71930"),
    "Baltimore Ravens": ("bal", "Ravens", "#241773"),
    "Buffalo Bills": ("buf", "Bills", "#00338D"),
    "Carolina Panthers": ("car", "Panthers", "#0085CA"),
    "Chicago Bears": ("chi", "Bears", "#0B162A"),
    "Cincinnati Bengals": ("cin", "Bengals", "#FB4F14"),
    "Cleveland Browns": ("cle", "Browns", "#311D00"),
    "Dallas Cowboys": ("dal", "Cowboys", "#003594"),
    "Denver Broncos": ("den", "Broncos", "#FB4F14"),
    "Detroit Lions": ("det", "Lions", "#0076B6"),
    "Green Bay Packers": ("gb", "Packers", "#203731"),
    "Houston Texans": ("hou", "Texans", "#03202F"),
    "Indianapolis Colts": ("ind", "Colts", "#002C5F"),
    "Jacksonville Jaguars": ("jax", "Jaguars", "#006778"),
    "Kansas City Chiefs": ("kc", "Chiefs", "#E31837"),
    "Las Vegas Raiders": ("lv", "Raiders", "#000000"),
    "Los Angeles Chargers": ("lac", "Chargers", "#0080C6"),
    "Los Angeles Rams": ("lar", "Rams", "#003594"),
    "Miami Dolphins": ("mia", "Dolphins", "#008E97"),
    "Minnesota Vikings": ("min", "Vikings", "#4F2683"),
    "New England Patriots": ("ne", "Patriots", "#002244"),
    "New Orleans Saints": ("no", "Saints", "#D3BC8D"),
    "New York Giants": ("nyg", "Giants", "#0B2265"),
    "New York Jets": ("nyj", "Jets", "#125740"),
    "Philadelphia Eagles": ("phi", "Eagles", "#004C54"),
    "Pittsburgh Steelers": ("pit", "Steelers", "#FFB612"),
    "San Francisco 49ers": ("sf", "49ers", "#AA0000"),
    "Seattle Seahawks": ("sea", "Seahawks", "#002244"),
    "Tampa Bay Buccaneers": ("tb", "Buccaneers", "#D50A0A"),
    "Tennessee Titans": ("ten", "Titans", "#0C2340"),
    "Washington Commanders": ("wsh", "Commanders", "#5A1414"),
}


NFL_LOGO = "https://a.espncdn.com/i/teamlogos/nfl/500/{abbr}.png"


# Conference/division - static, doesn't change mid-season. Used by the page's
# NFL Conference/Division filters. "AFC"/"NFC" is just the first word.
NFL_DIVISIONS = {
    "Buffalo Bills": "AFC East", "Miami Dolphins": "AFC East",
    "New England Patriots": "AFC East", "New York Jets": "AFC East",
    "Baltimore Ravens": "AFC North", "Cincinnati Bengals": "AFC North",
    "Cleveland Browns": "AFC North", "Pittsburgh Steelers": "AFC North",
    "Houston Texans": "AFC South", "Indianapolis Colts": "AFC South",
    "Jacksonville Jaguars": "AFC South", "Tennessee Titans": "AFC South",
    "Denver Broncos": "AFC West", "Kansas City Chiefs": "AFC West",
    "Las Vegas Raiders": "AFC West", "Los Angeles Chargers": "AFC West",
    "Dallas Cowboys": "NFC East", "New York Giants": "NFC East",
    "Philadelphia Eagles": "NFC East", "Washington Commanders": "NFC East",
    "Chicago Bears": "NFC North", "Detroit Lions": "NFC North",
    "Green Bay Packers": "NFC North", "Minnesota Vikings": "NFC North",
    "Atlanta Falcons": "NFC South", "Carolina Panthers": "NFC South",
    "New Orleans Saints": "NFC South", "Tampa Bay Buccaneers": "NFC South",
    "Arizona Cardinals": "NFC West", "Los Angeles Rams": "NFC West",
    "San Francisco 49ers": "NFC West", "Seattle Seahawks": "NFC West",
}


def nfl_team_art():
    """{full name: {logo, color}} for all 32 teams - no network."""
    return {name: {"logo": NFL_LOGO.format(abbr=a[0]), "color": a[2]}
            for name, a in NFL_TEAMS.items()}


def nfl_short(name):
    t = NFL_TEAMS.get(name)
    return t[1] if t else name


def nfl_div(name):
    return NFL_DIVISIONS.get(name)


def nfl_conf(name):
    d = NFL_DIVISIONS.get(name)
    return d.split()[0] if d else None


def pull_nfl_from_odds():
    """NFL slate + DraftKings main spread/total from the-odds-api. Reliable from
    GitHub Actions (ESPN's feed refuses datacenter IPs). /events is free; the one
    slate-wide /odds call is 2 credits. Returns (games, credits_remaining), or
    (None, None) when the feed itself is down."""
    sport = ODDS_SPORTS["nfl"]
    events, remaining = odds_get(f"/sports/{sport}/events")          # free
    if events is None:
        return None, None                  # feed down - NOT the same as an empty week
    now = datetime.now(timezone.utc)
    horizon = now.timestamp() + DAYS_AHEAD * 86400
    floor = now.timestamp() - RECENT_HOURS * 3600
    upcoming = {}
    for e in events:
        et = parse_dt(e.get("commence_time", "") or "")
        if et is None or et.timestamp() > horizon or et.timestamp() < floor:
            continue
        upcoming[e.get("id")] = e
    if not upcoming:
        NFL_DIAG["status"] = "odds-api: no NFL games in the window"
        return [], remaining
    data, remaining = odds_get(f"/sports/{sport}/odds", bookmakers=ODDS_BOOK,
                               markets="spreads,totals", oddsFormat="american")
    if data is None:
        return None, None                  # a slate with no lines is useless - carry forward instead
    lines = {e.get("id"): e for e in data}
    games = []
    for eid, e in upcoming.items():
        home, away = e.get("home_team"), e.get("away_team")
        if not home or not away:
            continue
        start = parse_dt(e.get("commence_time"))
        spread = total = None
        for bk in (lines.get(eid) or {}).get("bookmakers", []):
            for m in bk.get("markets", []):
                for o in m.get("outcomes", []):
                    pt = o.get("point")
                    if pt is None:
                        continue
                    if m["key"] == "spreads" and o.get("name") == home:
                        spread = float(pt)                      # home-team spread, neg = home favored
                    elif m["key"] == "totals" and o.get("name") == "Over":
                        total = float(pt)
        games.append({
            "id": int(eid) if str(eid).isdigit() else eid,
            "league": "nfl",
            "week": 0,
            "start": start.isoformat(timespec="minutes") if start else now.isoformat(timespec="minutes"),
            "home": home, "away": away,
            "home_short": nfl_short(home), "away_short": nfl_short(away),
            "home_conf": nfl_conf(home), "away_conf": nfl_conf(away),
            "home_div": nfl_div(home), "away_div": nfl_div(away),
            "neutral": False,
            "status": status_for(start, now, False),   # /scores fills in live and final below
            "hp": None, "ap": None,
            "spread": spread, "total": total,
            "book": "DraftKings",
        })
    lined = sum(1 for g in games if g["spread"] is not None and g["total"] is not None)
    NFL_DIAG["status"] = f"odds-api: {len(games)} games, {lined} with a line"
    games.sort(key=lambda g: g["start"])
    return games, remaining


def pull_nfl_scores(games):
    """Final and in-progress scores for NFL games that have kicked off. CFBD hands
    us college scores for free on the /games call; the NFL has no free feed that
    works from Actions, so this is the-odds-api /scores: 1 credit normally, 2 with
    daysFrom (which is what includes games that already ended). Only called when
    there is actually a kicked-off NFL game to score, so a quiet Tuesday spends
    nothing. Mutates `games`."""
    live = [g for g in games if g.get("league") == "nfl" and g.get("status") in ("live", "final")]
    if not live:
        return
    data, remaining = odds_get(f"/sports/{ODDS_SPORTS['nfl']}/scores", daysFrom=1)
    if not data:
        print("  NFL scores unavailable - leaving those games unscored")
        return
    by_id = {str(e.get("id")): e for e in data}
    scored = 0
    for g in live:
        e = by_id.get(str(g.get("id")))
        if not e:
            continue
        pts = {r.get("name"): r.get("score") for r in (e.get("scores") or []) if r.get("name")}
        hp, ap = pts.get(g["home"]), pts.get(g["away"])
        if hp is None or ap is None:
            continue
        try:
            g["hp"], g["ap"] = float(hp), float(ap)
        except (TypeError, ValueError):
            continue
        g["status"] = "final" if e.get("completed") else "live"
        scored += 1
    print(f"  NFL scores: {scored} of {len(live)} kicked-off games scored, {remaining} credits left")


_DETAILS = re.compile(r"^\s*([A-Z]{2,4})\s+([-+]?\d+(?:\.\d+)?)\s*$")


ESPN_HEADERS = {"Accept": "application/json, text/plain, */*",
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36",
                "Referer": "https://www.espn.com/"}


def espn_get(**params):
    r = requests.get(ESPN_NFL, params=params, timeout=30, headers=ESPN_HEADERS)
    if r.status_code != 200:
        raise RuntimeError(f"ESPN {r.status_code}")     # the code is the whole story; its error page is not shipped
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
    try:
        events = espn_get(dates=f"{d0}-{d1}", limit=100).get("events") or []
    except Exception as e:
        NFL_DIAG.setdefault("errors", []).append(str(e))
        events = []
    if not events:
        NFL_DIAG["status"] = "espn: nothing (it blocks GitHub's servers - expected)"
        return [], {}
    NFL_DIAG["status"] = f"feed ok: {len(events)} events"
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
            "home_conf": nfl_conf(home["name"]), "away_conf": nfl_conf(away["name"]),
            "home_div": nfl_div(home["name"]), "away_div": nfl_div(away["name"]),
            "neutral": bool(comp.get("neutralSite", False)),
            "status": "upcoming",          # this path only returns pre-game events
            "hp": None, "ap": None,
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


# Was 20 (free tier: 500 credits/month made a daily NFL pull the ceiling). On the
# 20K tier an hourly pull is ~2 credits x ~14 runs/day x 5 days = ~140 a week.
# 0 = no throttle, NFL refreshes on the same cadence as college.
NFL_ODDS_MIN_HOURS = 0


def pull_nfl(R):
    """NFL slate + lines. Returns (games, fresh). ESPN's free feed is tried once;
    then the-odds-api (2 credits), rate-limited to once per NFL_ODDS_MIN_HOURS.
    fresh=False means every source failed and these are the last good games."""
    NFL_DIAG.clear()
    NFL_DIAG.update({"status": "not attempted", "errors": []})
    now = datetime.now(timezone.utc)
    floor = now.timestamp() - RECENT_HOURS * 3600
    prev = [g for g in R.get("upcoming", []) if g.get("league") == "nfl"
            and (parse_dt(g.get("start") or "") or now).timestamp() > floor]   # keep yesterday's finals
    try:
        nfl, _ = pull_nfl_upcoming()               # ESPN, free
    except Exception as e:
        NFL_DIAG.setdefault("errors", []).append(f"espn: {e}")
        nfl = []
    if nfl:
        NFL_DIAG["source"] = "espn"
        R.setdefault("nfl", {})
        return nfl, True
    # ESPN gave nothing - decide whether to spend odds-api credits
    state = R.setdefault("nfl", {})
    last = parse_dt(state.get("odds_asof") or "")
    fresh_enough = last is not None and (now - last).total_seconds() < NFL_ODDS_MIN_HOURS * 3600
    if fresh_enough and prev:
        NFL_DIAG["source"] = "carried forward (odds pull rate-limited)"
        NFL_DIAG["status"] = f"kept {len(prev)} NFL games from {state.get('odds_asof')}"
        return prev, True                          # on purpose, so not stale
    if os.environ.get("ODDS_KEY", "").strip():
        nfl, remaining = pull_nfl_from_odds()
        if nfl is not None:                        # the feed answered (an empty week is a real answer)
            state["odds_asof"] = now.isoformat(timespec="minutes")
            state["odds_remaining"] = remaining
            NFL_DIAG["source"] = "odds-api"
            return nfl, True
    NFL_DIAG["source"] = "carried forward (no fresh feed)"
    NFL_DIAG["status"] = f"every NFL source failed - kept {len(prev)} games from the last good pull"
    return prev, False


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
