"""ci/test_props_price.py - the props pricer, and the parity the page depends on.

props.py ships a LADDER per prop; the page only indexes it. This proves the
ladder is right (it is the distribution props.py says it is), that the index
the page computes lands on the number it meant, and that the shapes signed off
on 2026-10-17 are still the shapes in the file.
"""
import json
import math
import os
import sys
from statistics import NormalDist

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import props as P                                            # noqa: E402

N = NormalDist()
bad = []


def ok(cond, msg):
    if not cond:
        bad.append(msg)


# --- the shapes are the ones that were signed off (DECISIONS.md 9) ---
ok(P.SD["pass_yds"] == 63.0, "pass yds width moved off 63")
ok(P.SD["rec"] == 2.0, "receptions width moved off 2.0")
ok(P.LOGN["rush_yds"] == 0.80, "rush yds is no longer lognormal 0.80")
ok(P.LOGN["rec_yds"] == 1.00, "rec yds is no longer lognormal 1.00")
ok("pass_tds" in P.COUNT, "pass TDs is no longer a count")
ok(P.TD_POWER == 1.1, "the anytime TD power moved off 1.1")
ok(P.OVER_SHAVE == {"rush_yds": 0.03, "rec_yds": 0.03, "rec": 0.04}, "the 2025 corrections changed")

# --- the correction lands on the line, and only once ---
for code, shave in (("rec_yds", 0.03), ("rush_yds", 0.03), ("rec", 0.04), ("pass_yds", 0.0)):
    line = {"rec_yds": 69.5, "rush_yds": 45.5, "rec": 4.5, "pass_yds": 248.5}[code]
    L = P.ladder(code, line, 0.5)
    at = L["p"][int(round((line - L["lo"]) / L["step"]))] / 1000.0
    ok(abs(at - (0.5 - shave)) < 0.003, f"{code}: a flat price should price {0.5-shave:.2f}, got {at:.3f}")

# --- a ladder is the distribution props.py says it is, rung by rung ---
for code, line in (("pass_yds", 248.5), ("rush_yds", 45.5), ("rec_yds", 69.5), ("rec", 4.5), ("pass_tds", 1.5)):
    for p_dk in (0.35, 0.5, 0.62):
        L = P.ladder(code, line, p_dk)
        par = P.fit(code, line, p_dk)
        for i, v in enumerate(L["p"]):
            x = L["lo"] + i * L["step"]
            want = int(round(1000 * max(0.005, min(0.995, P.over_at(code, par, x)))))
            ok(v == want, f"{code} @{x}: ladder says {v}, the shape says {want}")
            if bad:
                break
        # the page's index must land on the number it meant
        mid = line
        ok(abs((L["lo"] + int(round((mid - L["lo"]) / L["step"])) * L["step"]) - mid) < 1e-9,
           f"{code}: the page's index does not land on the book's own line")
        # the book's own line is always inside the ladder
        j = int(round((line - L["lo"]) / L["step"]))
        ok(0 <= j < len(L["p"]), f"{code}: the book's line is off its own ladder")
        # a ladder never rises
        ok(all(a >= b for a, b in zip(L["p"], L["p"][1:])), f"{code}: ladder rises")

# --- a higher no-vig over price means a bigger expected stat, everywhere ---
for code, line in (("rec_yds", 69.5), ("rush_yds", 45.5), ("pass_tds", 1.5)):
    lo = P.ladder(code, line, 0.40)
    hi = P.ladder(code, line, 0.60)
    at = lambda L: L["p"][int(round((line - L["lo"]) / L["step"]))]
    ok(at(hi) > at(lo), f"{code}: a better price did not raise the chance")

# --- anytime TD: Yes-only, and the shave never raises a chance ---
for price in (-300, -110, 100, 250, 900):
    p = P.implied(price)
    ok(p ** P.TD_POWER <= p + 1e-12, f"anytime TD shave raised the chance at {price}")

# --- devig ---
ok(abs(P.devig(-110, -110) - 0.5) < 1e-12, "a flat two-way is not 50%")
ok(P.devig(-200, 170) > 0.5, "the favourite side should be over 50%")

# --- price_event survives junk from the feed ---
ev = {"bookmakers": [{"key": "draftkings", "markets": [
    {"key": "player_reception_yds", "outcomes": [
        {"name": "Over", "description": "A Player", "point": 69.5, "price": -110},
        {"name": "Under", "description": "A Player", "point": 69.5, "price": -110}]},
    {"key": "player_reception_yds", "outcomes": [                      # half a market
        {"name": "Over", "description": "B Player", "point": 50.5, "price": -110}]},
    {"key": "player_anytime_td", "outcomes": [
        {"name": "Yes", "description": "C Player", "price": 160},
        {"name": "Yes", "description": "Chiefs D/ST", "price": 900}]},
    {"key": "player_unknown_market", "outcomes": [{"name": "Over", "description": "D", "point": 1, "price": 100}]},
]}, {"key": "someotherbook", "markets": [
    {"key": "player_reception_yds", "outcomes": [
        {"name": "Over", "description": "E Player", "point": 10.5, "price": -110},
        {"name": "Under", "description": "E Player", "point": 10.5, "price": -110}]}]}]}
rows = P.price_event(ev)
who = sorted(r["who"] for r in rows)
ok(who == ["A Player", "C Player"],
   f"price_event kept the wrong rows: {who} (want the complete two-way and the TD, no D/ST, no other book, no unknown market)")

# --- the file the page reads is shaped the way the page expects ---
S = {"updated": "2026-10-18T14:20:00+00:00", "games": {"g1": {
    "kick": "2026-10-18T17:00:00Z", "home": "H", "away": "A", "marks": ["am"],
    "pulled": "2026-10-18T14:20:00+00:00", "props": P.price_event(ev)}}}
out = os.path.join(os.path.dirname(os.path.abspath(__file__)), "_props_test.js")
real, P.OUT_JS = P.OUT_JS, out
try:
    P.write_js(S)
    text = open(out).read()
    ok(text.startswith("window.PROPS = "), "props.js does not define window.PROPS")
    page = json.loads(text[len("window.PROPS = "):].rstrip().rstrip(";"))
    ok(len(page["games"]) == 1, "the game did not survive write_js")
    for r in page["games"][0]["props"]:
        ok("mu" not in r, "write_js shipped the internal mean to the page")
finally:
    P.OUT_JS = real
    if os.path.exists(out):
        os.remove(out)

bad += [f"selftest: {n} failing" for n in ([P.selftest()] if P.selftest() else [])]

if bad:
    print("  FAIL  props pricer")
    for b in bad[:12]:
        print("        - " + b)
    sys.exit(1)
print("  ok    props pricer (shapes, ladder = the shape, page index, feed junk, props.js shape)")
