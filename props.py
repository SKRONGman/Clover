"""
props.py - NFL player props for Clover: the one prop pricer.

Step one of the props phase (ruling 1 of 2026-09-27): no new model. A prop is
priced from DraftKings' own over/under with the vig taken out, moved to the
number Danny's app offers using a per-market shape, then corrected by what
2025 actually did (DECISIONS.md 8). The edge is the stale number, nothing else.

Like sim.py, this runs on Actions only and ships LOOKUPS. For every prop it
writes a ladder - one chance per number the app might offer - so the page does
no math at all, it reads p[(N - lo) / step]. No JavaScript copy of this, ever.

    python props.py --pull          # pull due games, rewrite props.js
    python props.py --plan          # what would be pulled, spend nothing
    python props.py --selftest      # shapes and ladders, no network

Credits: live event odds cost markets x regions; bookmakers do not multiply
(odds.py). Six markets from DraftKings alone = 6 credits a game a pull.
"""

import json
import math
import os
import sys
from datetime import datetime, timedelta, timezone
from statistics import NormalDist

import common
from common import atomic_write
from odds import ODDS_MIN_REMAINING, odds_get

HERE = os.path.dirname(os.path.abspath(__file__))
OUT_JS = os.path.join(HERE, "props.js")
STORE = os.path.join(HERE, "props_live.json")
SPORT = "americanfootball_nfl"
BOOK = "draftkings"
N = NormalDist()

# the-odds-api market -> Clover's short code (same codes as props_hist_2025.json)
MARKETS = {
    "player_pass_yds": "pass_yds",
    "player_pass_tds": "pass_tds",
    "player_rush_yds": "rush_yds",
    "player_reception_yds": "rec_yds",
    "player_receptions": "rec",
    "player_anytime_td": "any_td",
}

# --- the shapes, re-fitted on all of 2025 (2026-10-17; DECISIONS.md 8 and 9) ---
# Each was picked by pricing every 2025 prop through the ladder below and
# grading it on nflverse, at the line and at +/- offsets. Worst miss in ().
SD = {"pass_yds": 63.0, "rec": 2.0}             # normal: pass yds (2.8), receptions (3.7)
LOGN = {"rush_yds": 0.80, "rec_yds": 1.00}      # lognormal: rush (2.2), rec yds (4.5)
COUNT = {"pass_tds"}                            # Poisson (2.3)
# Yards are right-skewed, so a normal's right tail is too thin: at 20 yards
# above the line it said 14.5% where 19.8% really happened. Lognormal fixes
# that. Receptions kept the normal - the best negative binomial bought 0.1 pts.

# --- the corrections (ruling 4 of 2026-09-27), in chance points off the OVER ---
# Applied to the chance BEFORE the mean is backed out, so the whole ladder
# shifts with it. Flat-subtracting at every rung stacked onto the shape error.
OVER_SHAVE = {"rush_yds": 0.03, "rec_yds": 0.03, "rec": 0.04}
TD_POWER = 1.1          # anytime TD: (DK's Yes chance) ** 1.1

# --- the ladder: how far off DK's number we price, and in what steps ---
BAND = {"pass_yds": 40.0, "rush_yds": 20.0, "rec_yds": 20.0, "rec": 4.0, "pass_tds": 2.0}
STEP = 0.5

PULL_MARKS = (120, 15)          # minutes before kickoff that a game is pulled
# Every mark fires at most once per game (props_live.json remembers which).
# GitHub drops and delays scheduled runs badly (half of them, by hours, on this
# repo), so the marks are deliberately forgiving: a game nobody has priced yet
# is pulled the first time any run sees it, and a mark that was missed is still
# taken late rather than skipped. Better a number 40 minutes before kickoff
# than no number at all. LATE is how far past a mark a run may still claim it.
LATE = 45

# A mark is claimed only by a pull that actually brought numbers back (2026-10-24).
# The first-sight pull used to fire the moment a game appeared in /events - up to
# eight days out, where DraftKings has posted no player props at all. It came back
# empty, stored nothing, and still ticked the mark off, so the one rule meant to
# guarantee every game at least one number was spent a week before it could work.
# Now: a game with no props is "unpriced" however many times it has been tried,
# and an empty answer never claims a mark or overwrites numbers already stored.
# FIRST_WINDOW keeps that retry off the eight-days-out games (where the answer is
# always empty) and FIRST_RETRY stops a run-every-hour from re-asking every hour.
FIRST_WINDOW = 48 * 60          # minutes before kickoff that a first pull is worth trying
FIRST_RETRY = 8 * 60            # minutes between first pulls while a game has no props


# ---------------------------------------------------------------- odds math
def implied(american):
    """American price -> implied chance (vig still in)."""
    a = float(american)
    return 100.0 / (a + 100.0) if a > 0 else -a / (-a + 100.0)


def devig(over, under):
    """Two-way no-vig chance for the OVER."""
    a, b = implied(over), implied(under)
    return a / (a + b) if (a + b) > 0 else None


# ------------------------------------------------------------- distributions
def pois_sf(k, mu):
    """P(X > k + 0.5) = P(X >= k+1) for a Poisson with mean mu."""
    if k < 0:
        return 1.0
    c, term = 0.0, math.exp(-mu)
    for i in range(k + 1):
        c += term
        term *= mu / (i + 1)
    return max(0.0, min(1.0, 1.0 - c))


def fit(code, line, p_over_dk):
    """Back out the player's distribution from DK's line and no-vig over chance,
    with the 2025 correction already taken off the chance so the WHOLE ladder
    moves with it. Returns the one parameter the shape needs."""
    p = min(max(p_over_dk - OVER_SHAVE.get(code, 0.0), 1e-4), 1 - 1e-4)
    if code in COUNT:
        k, lo, hi = int(math.floor(line)), 1e-4, 12.0
        for _ in range(60):                      # P(X>line) rises with mu
            mid = (lo + hi) / 2
            lo, hi = (mid, hi) if pois_sf(k, mid) < p else (lo, mid)
        return (lo + hi) / 2
    if code in LOGN:
        return math.log(max(line, 0.5)) + LOGN[code] * N.inv_cdf(p)
    return line + SD[code] * N.inv_cdf(p)


def over_at(code, par, number):
    """Chance the stat clears `number`. The correction is already in `par`."""
    if code in COUNT:
        return pois_sf(int(math.floor(number)), par)
    if code in LOGN:
        if number <= 0:
            return 1.0
        return 1.0 - N.cdf((math.log(number) - par) / LOGN[code])
    return 1.0 - N.cdf((number - par) / SD[code])


# ------------------------------------------------------------------ ladders
def ladder(code, line, p_over_dk):
    """{lo, step, p[]} - the over chance at every number the app might offer.
    p are whole tenths of a percent (0-1000) so the file stays small."""
    par = fit(code, line, p_over_dk)
    band = BAND[code]
    lo = max(0.5, round((line - band) * 2) / 2)
    hi = round((line + band) * 2) / 2
    out, x, guard = [], lo, 0
    while x <= hi + 1e-9 and guard < 4000:
        p = over_at(code, par, x)
        out.append(int(round(1000 * max(0.005, min(0.995, p)))))
        x += STEP
        guard += 1
    return {"lo": lo, "step": STEP, "p": out, "mu": round(par, 3)}


def price_event(ev):
    """One odds-api event -> the props Clover will show for it."""
    rows = []
    for bk in ev.get("bookmakers", []):
        if bk.get("key") != BOOK:
            continue
        for mk in bk.get("markets", []):
            code = MARKETS.get(mk.get("key"))
            if not code:
                continue
            sides = {}
            for oc in mk.get("outcomes", []):
                who = oc.get("description") or oc.get("name")
                if not who or str(who).endswith("D/ST"):
                    continue
                sides.setdefault((code, who), {})[str(oc.get("name", "")).lower()] = oc
            for (c, who), s in sides.items():
                if c == "any_td":
                    yes = s.get("yes") or s.get("over")
                    if not yes or yes.get("price") is None:
                        continue
                    p = implied(yes["price"]) ** TD_POWER
                    rows.append({"m": c, "who": who, "line": None,
                                 "yes": int(round(1000 * max(0.005, min(0.995, p))))})
                    continue
                o, u = s.get("over"), s.get("under")
                if not o or not u or o.get("point") is None:
                    continue
                p0 = devig(o["price"], u["price"])
                if p0 is None:
                    continue
                line = float(o["point"])
                rows.append({"m": c, "who": who, "line": line,
                             "dk": int(round(1000 * p0)), **ladder(c, line, p0)})
    rows.sort(key=lambda r: (r["m"], r["who"]))
    return rows


# --------------------------------------------------------------- scheduling
def due(kick, now, g):
    """Which mark this game is owed right now, or None. `g` is its store entry.

    A kicked-off game is never pulled. A game that has no numbers yet is pulled
    on sight ("first") once it is inside FIRST_WINDOW of kickoff - that is what
    guarantees every game gets at least one number even when most runs are
    dropped - and it STAYS owed a first pull until one actually brings numbers
    back, so an empty answer costs nothing but the call. Once it has numbers the
    marks are claimed nearest-kickoff-first, each at most once, and a mark whose
    moment has passed is still taken (up to LATE minutes late)."""
    g = g or {}
    mins = (kick - now).total_seconds() / 60.0
    if mins < -5:
        return None
    if not g.get("props"):
        if mins > FIRST_WINDOW:                     # no book has posted props yet
            return None
        return "first" if _rested(g.get("tried"), now) else None
    for mark in sorted(PULL_MARKS):                 # 15 before 120: freshest wins
        if str(mark) not in g.get("marks", []) and mins <= mark + LATE:
            return str(mark)
    return None


def _rested(tried, now):
    """True when the last empty first pull is far enough back to try again."""
    if not tried:
        return True
    try:
        ago = (now - datetime.fromisoformat(tried)).total_seconds() / 60.0
    except (TypeError, ValueError):
        return True
    return ago >= FIRST_RETRY


def load_store():
    if os.path.exists(STORE):
        try:
            return json.load(open(STORE))
        except (ValueError, OSError):
            pass
    return {"games": {}}


def events(now):
    """NFL events inside the next week. /events is free."""
    data, _ = odds_get(f"/sports/{SPORT}/events")
    out = []
    for e in data or []:
        try:
            k = datetime.fromisoformat(e["commence_time"].replace("Z", "+00:00"))
        except (KeyError, ValueError):
            continue
        if now - timedelta(hours=6) <= k <= now + timedelta(days=8):
            out.append((e, k))
    return out


def run(plan_only=False):
    now = datetime.now(timezone.utc)
    S = load_store()
    todo = []
    for e, k in events(now):
        mark = due(k, now, S["games"].get(e["id"]))
        if mark:
            todo.append((e, k, mark))
    print(f"  props: {len(todo)} game(s) due "
          f"({', '.join(e['away_team'][:3] + '@' + e['home_team'][:3] + ':' + m for e, _, m in todo) or 'none'})")
    if plan_only:
        print(f"  would cost ~{len(todo) * len(MARKETS)} credits")
        return S

    for e, k, mark in todo:
        left = common.RUN.get("odds_left")
        if left is not None and left < ODDS_MIN_REMAINING + len(MARKETS):
            print(f"  props: stopping, {left} credits left")
            break
        body, _ = odds_get(f"/sports/{SPORT}/events/{e['id']}/odds",
                           bookmakers=BOOK, markets=",".join(MARKETS), oddsFormat="american")
        if not body:
            continue
        g = S["games"].setdefault(e["id"], {"marks": []})
        g.update(kick=e["commence_time"], home=e["home_team"], away=e["away_team"],
                 tried=now.isoformat(timespec="seconds"))
        g.setdefault("props", [])
        rows = price_event(body)
        if not rows:
            # The book has nothing yet (or dropped the market). Keep whatever is
            # already stored and leave the mark unclaimed so a later run retries.
            print(f"  props: no numbers yet for {e['away_team']} @ {e['home_team']}")
            continue
        g["props"] = rows
        g["pulled"] = now.isoformat(timespec="seconds")
        g["marks"] = sorted(set(g["marks"] + [mark]))

    # A finished game leaves the store. The page hides a card 4 hours after
    # kickoff (PROP_OVER_H in props_tab.js); the store is kept a little looser
    # so the page, not this file, is what decides what Danny sees.
    cutoff = now - timedelta(hours=5)
    S["games"] = {i: g for i, g in S["games"].items()
                  if datetime.fromisoformat(g["kick"].replace("Z", "+00:00")) > cutoff}
    S["updated"] = now.isoformat(timespec="seconds")
    atomic_write(STORE, json.dumps(S, separators=(",", ":")))
    write_js(S)
    return S


def write_js(S):
    """props.js - what the page reads. Ladders only, no mu, no store bookkeeping."""
    games = []
    for gid, g in sorted(S["games"].items(), key=lambda kv: kv[1]["kick"]):
        if not g.get("props"):
            continue
        rows = [{k: v for k, v in r.items() if k != "mu"} for r in g["props"]]
        games.append({"id": gid, "kick": g["kick"], "home": g["home"],
                      "away": g["away"], "pulled": g.get("pulled"), "props": rows})
    page = {"updated": S.get("updated"), "games": games,
            "markets": ["pass_yds", "pass_tds", "rush_yds", "rec_yds", "rec", "any_td"]}
    atomic_write(OUT_JS, "window.PROPS = " + json.dumps(page, separators=(",", ":")) + ";\n")
    n = sum(len(g["props"]) for g in games)
    print(f"  props.js: {len(games)} game(s), {n} prop(s), {os.path.getsize(OUT_JS) // 1024} KB")


# ----------------------------------------------------------------- selftest
def selftest():
    bad = 0

    def ok(cond, msg):
        nonlocal bad
        if not cond:
            bad += 1
            print("  FAIL", msg)

    ok(abs(devig(-110, -110) - 0.5) < 1e-9, "devig of a flat two-way is 50%")
    ok(implied(100) == 0.5, "+100 is 50%")

    # a normal market (pass yds): a flat price puts the mean on the line
    Pw = ladder("pass_yds", 248.5, 0.5)
    ok(abs(Pw["mu"] - 248.5) < 0.01, "flat price puts the mean on the line")
    ok(abs(Pw["p"][int(round((248.5 - Pw["lo"]) / STEP))] - 500) <= 1, "pass yds is not shaved")

    # a shaved market: the correction lands at the line, not at every rung
    L = ladder("rec_yds", 69.5, 0.5)
    mid = L["p"][int(round((69.5 - L["lo"]) / STEP))]
    ok(abs(mid - (500 - 1000 * OVER_SHAVE["rec_yds"])) <= 2,
       f"rec_yds at the line is shaved 3 pts, got {mid}")
    ok(all(a >= b for a, b in zip(L["p"], L["p"][1:])), "ladder never rises")

    # lognormal keeps a fatter right tail than the old normal did
    far = L["p"][int(round((89.5 - L["lo"]) / STEP))]
    ok(far > 1000 * (1 - N.cdf((89.5 - 69.5) / 22.0)) - 30, "lognormal right tail is fatter")

    # a count market: Poisson, and a half-point line means P(X >= k+1)
    C = ladder("pass_tds", 1.5, 0.5)
    ok(abs(pois_sf(1, C["mu"]) - 0.5) < 0.005, "mu solves P(X>1.5)=50%")
    ok(all(a >= b for a, b in zip(C["p"], C["p"][1:])), "count ladder never rises")
    ok(C["lo"] >= 0.5, "ladder never goes below 0.5")

    # lookups land where the page will look
    ok(L["p"][int(round((69.5 - L["lo"]) / L["step"]))] == mid, "index math matches the page")

    # anytime TD: the power shave only ever lowers a Yes chance
    for price in (-200, -110, 100, 400, 1200):
        p = implied(price)
        ok(p ** TD_POWER <= p + 1e-12, f"TD shave never raises ({price})")

    # scheduling marks. P() is a game that HAS numbers; the bare dicts have none.
    now = datetime(2026, 10, 18, 16, 0, tzinfo=timezone.utc)
    at = lambda m, g: due(now + timedelta(minutes=m), now, g)
    P = lambda *marks: {"marks": list(marks), "props": [{"m": "rec"}]}
    ago = lambda mins: (now - timedelta(minutes=mins)).isoformat(timespec="seconds")

    ok(at(500, {}) == "first", "a game nobody has priced is pulled on sight")
    ok(at(500, P("first")) is None, "a far-off game is not pulled again straight away")
    ok(at(120, P("first")) == "120", "the 2-hour mark fires")
    ok(at(15, P("first", "120")) == "15", "the 15-minute mark fires")
    ok(at(15, P("first", "120", "15")) is None, "a mark never fires twice")
    ok(at(-120, {}) is None, "a kicked-off game is never pulled")
    # the delay tolerance that the dropped-schedule problem needs
    ok(at(40, P("first", "120")) == "15", "a late run still claims the 15-minute mark")
    ok(at(95, P("first")) == "120", "a run inside the window claims the 2-hour mark")
    ok(at(300, P("first")) is None, "the 2-hour mark is not claimed hours early")
    ok(at(10, P("first")) == "15", "a game whose 2-hour run was dropped still gets a late price")

    # the 2026-10-24 bug: an empty answer must not spend the first mark
    far = FIRST_WINDOW + 60
    ok(at(far, {}) is None, "a game outside the window is not pulled at all")
    ok(at(far, {"marks": ["first"], "props": [], "tried": ago(5)}) is None,
       "an eight-days-out game is left alone")
    ok(at(500, {"marks": ["first"], "props": [], "tried": ago(FIRST_RETRY + 1)}) == "first",
       "a game still holding no numbers is owed another first pull")
    ok(at(500, {"marks": ["first"], "props": [], "tried": ago(5)}) is None,
       "...but not again straight away")
    ok(at(500, {"marks": ["first"], "props": [], "tried": "not a date"}) == "first",
       "an unreadable timestamp retries rather than sticking")
    ok(at(100, {"marks": ["first", "120", "15"], "props": []}) == "first",
       "every mark spent but no numbers: still owed a first pull")
    ok(at(-120, {"marks": [], "props": [], "tried": ago(999)}) is None,
       "a kicked-off game with no numbers is still never pulled")

    print("  props selftest:", "OK" if not bad else f"{bad} FAILED")
    return bad


if __name__ == "__main__":
    if "--selftest" in sys.argv:
        sys.exit(1 if selftest() else 0)
    elif "--plan" in sys.argv:
        run(plan_only=True)
    elif "--pull" in sys.argv:
        run()
    else:
        print(__doc__)
