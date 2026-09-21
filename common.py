"""
common.py - the small things every Clover module shares: file names, time
windows, date parsing, the safe file write, and the health record.

health.json is the dashboard light. Every refresh writes how many CFBD calls
and odds-api credits are left and whether any feed is down. When something
needs Danny's attention the run turns red (GitHub emails him) - once a day,
and only AFTER the data has been saved, so a warning never blocks a refresh.
"""

import os
import json
from datetime import datetime, timezone

OUT = "ratings.json"           # everything, incl. team ratings and accuracy (research)
OUT_JS = "ratings.js"          # only what the page needs: slate, lines, sim tables
OUT_RESULTS = "results.json"   # every finished game graded against what Clover said (research)
OUT_HEALTH = "health.json"     # calls left, credits left, feeds down

# Upcoming games: how many days ahead to list.
DAYS_AHEAD = 8

# Finished games stay on the board for a day so you can see how the slate went.
# 24 hours from KICKOFF, not "today": the server runs on UTC, so a calendar-day
# rule would drop Saturday night's games while it is still Saturday evening in
# Texas. A finished game keeps the line it closed at, its final score, and the
# six percentages Clover gave it before kickoff - but NOT its 20,000-run table,
# which is 5 KB a game and answers questions the final score already answers.
RECENT_HOURS = 24

# Monthly allowances and the point where the run turns red.
CFBD_MONTHLY_CALLS = 5000      # Patreon Tier 1 (since 2026-09-20). Free tier is 1000.
CFBD_WARN_LEFT = 500
ODDS_WARN_LEFT = 1000          # 20K tier (since 2026-09-19)


def now_utc():
    return datetime.now(timezone.utc)


def pick(d, *names, default=None):
    """CFBD field names have moved between snake_case and camelCase.
    Take whichever one is actually present."""
    for n in names:
        if n in d and d[n] is not None:
            return d[n]
    return default


def parse_dt(s):
    """CFBD dates look like 2025-08-23T16:00:00.000Z; ESPN's like 2025-09-14T17:00Z."""
    try:
        return datetime.fromisoformat(s.replace("Z", "+00:00"))
    except Exception:
        return None


def status_for(start, now, completed):
    """upcoming (hasn't kicked off) / live (started, not finished) / final."""
    if start is None or start.timestamp() > now.timestamp():
        return "upcoming"
    return "final" if completed else "live"


def atomic_write(path, text):
    """Write to a temp file then rename, so a crash never leaves a half-written file."""
    tmp = path + ".tmp"
    with open(tmp, "w") as f:
        f.write(text)
    os.replace(tmp, path)


# ----------------------------------------------------------------------
# HEALTH
# ----------------------------------------------------------------------
# What happened during THIS run. cfbd.py and odds.py write into it as they go.
RUN = {"cfbd_calls": 0, "cfbd_left_reported": None, "cfbd_error": None,
       "odds_left": None, "odds_error": None}


def load_health():
    try:
        with open(OUT_HEALTH) as f:
            return json.load(f)
    except (OSError, ValueError):
        return {}


def write_health(stale, now=None):
    """Fold this run into health.json. `stale` is {league: {"since", "reason"}}
    for any league whose lines were carried forward instead of pulled fresh.
    Returns the record (tests read it)."""
    now = now or now_utc()
    H = load_health()
    month = now.strftime("%Y-%m")
    c = H.get("cfbd") or {}
    if c.get("month") != month:                 # CFBD's allowance resets on the 1st
        c = {"month": month, "calls_counted": 0, "counting_since": now.isoformat(timespec="minutes")}
    c["calls_counted"] = c.get("calls_counted", 0) + RUN["cfbd_calls"]
    c["calls_this_run"] = RUN["cfbd_calls"]
    if RUN["cfbd_left_reported"] is not None:   # CFBD told us itself - trust that over our count
        c["left"] = RUN["cfbd_left_reported"]
        c["left_source"] = "reported by CFBD"
        c["left_asof"] = now.isoformat(timespec="minutes")
    elif c.get("left_source") == "reported by CFBD" and c.get("left") is not None:
        c["left"] = max(0, c["left"] - RUN["cfbd_calls"])     # last report, minus what we've used since
    else:
        c["left"] = max(0, CFBD_MONTHLY_CALLS - c["calls_counted"])
        c["left_source"] = "counted by Clover since " + c.get("counting_since", "?")[:10]
    if "(429)" in (RUN["cfbd_error"] or ""):     # CFBD itself says the month is spent
        c["left"], c["left_source"] = 0, "CFBD answered 429"
    c["limit"] = CFBD_MONTHLY_CALLS
    c["last_error"] = RUN["cfbd_error"]
    o = H.get("odds") or {}
    if RUN["odds_left"] is not None:
        o["left"] = RUN["odds_left"]
        o["left_asof"] = now.isoformat(timespec="minutes")
    o["last_error"] = RUN["odds_error"]

    alerts = []
    for lg, s in sorted((stale or {}).items()):
        name = "College" if lg == "ncaaf" else "NFL"
        alerts.append(f"{name} lines are stale since {s.get('since')}: {s.get('reason')}")
    if c.get("left") is not None and c["left"] < CFBD_WARN_LEFT:
        alerts.append(f"CFBD is down to {c['left']} calls this month ({c['left_source']})")
    if o.get("left") is not None and o["left"] < ODDS_WARN_LEFT:
        alerts.append(f"the-odds-api is down to {o['left']} credits this month")

    today = now.strftime("%Y-%m-%d")
    alert_now = bool(alerts) and H.get("alerted_on") != today
    H = {"updated": now.isoformat(timespec="seconds"), "cfbd": c, "odds": o,
         "stale": stale or {}, "alerts": alerts, "alert_now": alert_now,
         "alerted_on": today if alert_now else H.get("alerted_on")}
    atomic_write(OUT_HEALTH, json.dumps(H, indent=1) + "\n")
    return H


def health_gate():
    """Last step of the workflow, after the data is committed. Exit code 1 turns
    the run red, and GitHub emails Danny. Returns the exit code."""
    H = load_health()
    if not H.get("alert_now"):
        print("health: ok" if not H.get("alerts") else "health: already alerted today - " + "; ".join(H["alerts"]))
        return 0
    print("CLOVER NEEDS ATTENTION:")
    for a in H.get("alerts", []):
        print("  - " + a)
    return 1
