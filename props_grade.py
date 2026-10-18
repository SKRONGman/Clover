"""
props_grade.py - grading a saved player prop, on Actions.

Game picks grade off the score Clover already pulls. A prop needs one more
thing: what the player actually did. nflverse publishes free weekly player
stats as a GitHub release, and Actions can always reach github.com (ESPN is
403 there, which is why the NFL slate runs on the odds feed instead).

nflverse posts a day or two after the games, so a prop settles a little later
than a spread does. bets.py simply leaves it open until the stat shows up.

    SEASON_CSV    where the weekly stats live
    stat_for      the one row -> the one number, per market
    grade_prop    hit / miss / push, the same shape as grading.grade_leg
"""
import csv
import io
import os
import tempfile
import urllib.request

REL = "https://github.com/nflverse/nflverse-data/releases/download/"
SEASON_CSV = "stats_player/stats_player_week_%d.csv"

# market -> the nflverse column(s) that settle it
STAT = {
    "pass_yds": ("passing_yards",),
    "pass_tds": ("passing_tds",),
    "rush_yds": ("rushing_yards",),
    "rec_yds": ("receiving_yards",),
    "rec": ("receptions",),
    "any_td": ("rushing_tds", "receiving_tds", "special_teams_tds"),
}


def _num(r, k):
    try:
        return float(r.get(k) or 0)
    except (TypeError, ValueError):
        return 0.0


def stat_for(row, market):
    """What the player actually did, for that market."""
    cols = STAT.get(market)
    if not cols:
        return None
    return sum(_num(row, c) for c in cols)


def norm(name):
    """Loose name key: nflverse spells a few players differently from the book."""
    s = "".join(ch for ch in str(name).lower() if ch.isalpha() or ch == " ")
    return " ".join(s.split())


def load_week(season, cache=None):
    """{normalised name: row} for a season. Downloaded once per run."""
    path = os.path.join(cache or tempfile.gettempdir(), "nflverse_%d.csv" % season)
    if not os.path.exists(path):
        urllib.request.urlretrieve(REL + SEASON_CSV % season, path)
    out = {}
    with io.open(path, newline="", encoding="utf-8") as f:
        for r in csv.DictReader(f):
            key = (int(r.get("week") or 0), norm(r.get("player_display_name") or r.get("player_name")))
            out[key] = r
    return out


def grade_prop(market, number, actual):
    """hit / miss / push for an OVER at `number`. Same words as grade_leg.
    Anytime TD has no number: one touchdown or more is a hit, never a push."""
    if actual is None:
        return None
    if market == "any_td":
        return "hit" if actual > 0 else "miss"
    if number is None:
        return None
    if actual == number:
        return "push"
    return "hit" if actual > number else "miss"


def selftest():
    bad = 0

    def ok(c, m):
        nonlocal bad
        if not c:
            bad += 1
            print("  FAIL", m)

    ok(grade_prop("rec_yds", 69.5, 70.0) == "hit", "over the number hits")
    ok(grade_prop("rec_yds", 69.5, 69.0) == "miss", "under the number misses")
    ok(grade_prop("rec", 4.0, 4.0) == "push", "exactly the number pushes")
    ok(grade_prop("any_td", None, 1) == "hit", "a touchdown hits")
    ok(grade_prop("any_td", None, 0) == "miss", "no touchdown misses")
    ok(grade_prop("any_td", None, 2) == "hit", "two touchdowns still hit")
    ok(grade_prop("rec_yds", 69.5, None) is None, "no stat yet = still open")
    ok(stat_for({"receiving_yards": "88.0"}, "rec_yds") == 88.0, "reads a stat")
    ok(stat_for({"rushing_tds": "1", "receiving_tds": "1"}, "any_td") == 2.0, "anytime TD adds up")
    ok(stat_for({}, "rec") == 0.0, "a blank row is a zero, not a crash")
    ok(norm("Ken­neth Walker III") == norm("Kenneth Walker III"), "names normalise")
    print("  props_grade selftest:", "OK" if not bad else f"{bad} FAILED")
    return bad


if __name__ == "__main__":
    import sys
    sys.exit(1 if selftest() else 0)
