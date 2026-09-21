"""
ci/fixture.py - a small made-up slate, dated relative to right now, so the tests
work in July as well as in October and never touch a real feed.
"""
from datetime import timedelta

from common import now_utc

COLLEGE = [("Texas", "Oklahoma", -6.5, 52.5), ("Miami", "Florida State", 3.0, 47.0),
           ("Army", "Navy", -1.5, 36.5), ("Georgia", "UMass", -41.5, 55.5)]
NFL = [("Kansas City Chiefs", "Buffalo Bills", -2.5, 48.5), ("Dallas Cowboys", "Philadelphia Eagles", 3.5, 45.0)]


def iso(dt):
    return dt.isoformat(timespec="minutes")


def game(gid, league, home, away, spread, total, start, status="upcoming"):
    g = {"id": gid, "league": league, "week": 4 if league == "ncaaf" else 0, "start": iso(start),
         "home": home, "away": away, "neutral": False, "status": status, "hp": None, "ap": None,
         "spread": spread, "total": total, "book": "DraftKings"}
    if league == "nfl":
        g.update(home_short=home.split()[-1], away_short=away.split()[-1],
                 home_conf="AFC", away_conf="AFC", home_div="AFC West", away_div="AFC East")
    else:
        g["fcs"] = False
    return g


def previous_file(now=None):
    """What ratings.json looked like after the last good refresh."""
    now = now or now_utc()
    up = [game(1000 + i, "ncaaf", h, a, sp, ou, now + timedelta(days=2, hours=i))
          for i, (h, a, sp, ou) in enumerate(COLLEGE)]
    # this one was "upcoming" an hour ago and has kicked off since
    up.append(game(1099, "ncaaf", "Rice", "Houston", 7.0, 49.5, now - timedelta(minutes=40)))
    up += [game(f"nfl{i}", "nfl", h, a, sp, ou, now + timedelta(days=3, hours=i))
           for i, (h, a, sp, ou) in enumerate(NFL)]
    good = iso(now - timedelta(hours=1))
    return {"generated": good, "season": 2026, "hfa_points": 2.4, "league": {"ppd": 2.2, "drives": 12.0},
            "teams": {}, "accuracy": {}, "upcoming": up, "lines_generated": good,
            "asof": {"ncaaf": good, "nfl": good}, "nfl": {}}
