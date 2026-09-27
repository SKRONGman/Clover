"""
grading.py - the one grader, and Clover's report card (split out of refresh.py in row 8, 2026-09-26).

    leg_line        the number a pick is taken at (always the side's OWN number)
    freeze_probs    the six percentages a game was priced at, kept after its table is gone
    grade_leg       hit / miss / push from the final score - the same rule everywhere
                    (results.json, bets.py, the page's legVal)
    record_results  results.json: every finished game Clover priced, all six picks graded
    scorecard       results.json boiled down for the History tab: "Clover said 55-69% ->
                    hit 57% (n)" per chance band, per league. History reviews every game
                    Clover scored (Danny, 2026-09-26). It is a report card only: the sim's
                    widths still change only on calibrate.py --tails evidence.
"""
import os
import json

from common import OUT_RESULTS, atomic_write

# The six picks the page offers on every game, in one place.
SIX = ("homeML", "awayML", "homeSp", "awaySp", "over", "under")

# Chance bands for the scorecard: [low, high) - the last one includes 100%.
BANDS = ((0.0, 0.30), (0.30, 0.45), (0.45, 0.55), (0.55, 0.70), (0.70, 0.90), (0.90, 1.01))


def leg_line(g, typ):
    """The number that pick is taken at. Always the side's OWN number."""
    if typ in ("over", "under"):
        return g.get("total")
    if typ == "homeSp":
        return g.get("spread")
    if typ == "awaySp":
        return -g["spread"] if g.get("spread") is not None else None
    return 0


def freeze_probs(games, grids):
    """Save each game's six percentages onto the game itself. While a game is
    upcoming the page reads these straight off its table; once it is over the
    table is thrown away and these are all that's left - which is exactly what
    you need to ask later whether Clover's 47% picks really land 47% of the time."""
    for gi, g in enumerate(games):
        grid = grids.get(gi)
        if grid is None:
            continue
        g["p"] = {t: round(grid.prob([(t, leg_line(g, t))]), 4) for t in SIX}


def grade_leg(typ, line, hp, ap):
    """hit / miss / push, from the final score. Same rule as the page's legVal."""
    t, m = hp + ap, hp - ap
    v = {"over": t - line, "under": line - t, "homeSp": m + line,
         "awaySp": line - m, "homeML": m, "awayML": -m}[typ]
    return "push" if v == 0 else ("hit" if v > 0 else "miss")


def load_results():
    if not os.path.exists(OUT_RESULTS):
        return []
    try:
        with open(OUT_RESULTS) as f:
            return json.load(f)
    except (ValueError, OSError):
        return []


def record_results(up):
    """Append every newly-finished game to results.json: what Clover said about
    each of the six picks, and what actually happened. Never shipped to the page
    whole (the scorecard is its summary) - this is the calibration record, and it
    has to outlive ratings.json, which is overwritten every refresh."""
    rows = load_results()
    seen = {str(r.get("id")) for r in rows}
    added = 0
    for g in up:
        if g.get("status") != "final" or str(g.get("id")) in seen:
            continue
        hp, ap = g.get("hp"), g.get("ap")
        if hp is None or ap is None or g.get("spread") is None or g.get("total") is None:
            continue
        p = g.get("p") or {}
        if not p:
            continue        # never priced before kickoff: nothing to calibrate (Danny dropped 67 such rows 2026-09-24)
        rows.append({
            "id": g.get("id"),
            "league": g.get("league", "ncaaf"),
            "start": g.get("start"),
            "home": g.get("home"), "away": g.get("away"),
            "hp": hp, "ap": ap,
            "spread": g.get("spread"), "total": g.get("total"), "book": g.get("book"),
            "picks": {t: {"line": leg_line(g, t), "p": p.get(t),
                          "result": grade_leg(t, leg_line(g, t), hp, ap)}
                      for t in SIX},
        })
        added += 1
    if added:
        rows.sort(key=lambda r: (r.get("start") or "", str(r.get("id"))))
        atomic_write(OUT_RESULTS, json.dumps(rows, indent=1))
    print(f"  results.json: {added} newly finished game(s) graded, {len(rows)} on file")
    return rows


def scorecard(rows):
    """{"games", "since", "bands": [...], "leagues": {league: [...]}} - each band
    {"lo", "hi", "n", "said", "hit"}: how many graded picks Clover priced in that
    range, the average chance it gave them, and how often they hit. Pushes are
    left out (neither hit nor miss). ~1 KB, shipped in ratings.js as R.scorecard."""
    def bands_for(picks):
        out = []
        for lo, hi in BANDS:
            ps = [(p, r) for p, r in picks if lo <= p < hi]
            n = len(ps)
            out.append({"lo": lo, "hi": min(hi, 1.0), "n": n,
                        "said": round(sum(p for p, _ in ps) / n, 3) if n else None,
                        "hit": round(sum(1 for _, r in ps if r == "hit") / n, 3) if n else None})
        return out
    picks = {}
    for r in rows:
        for pk in (r.get("picks") or {}).values():
            if pk.get("p") is None or pk.get("result") not in ("hit", "miss"):
                continue
            picks.setdefault(r.get("league", "ncaaf"), []).append((pk["p"], pk["result"]))
    every = [x for lg in picks.values() for x in lg]
    return {"games": len(rows),
            "since": min((r.get("start") or "" for r in rows), default=None) or None,
            "bands": bands_for(every),
            "leagues": {lg: bands_for(v) for lg, v in sorted(picks.items())}}
