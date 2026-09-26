"""
bets.py - the bet record's GitHub half (row 7, 2026-09-25).

The page saves a bet to Supabase when Danny or Jaclyn taps "Save bet". This file
runs inside every refresh and fills in what only the refresh can know:

  1. Closing numbers. While a game is still upcoming, every run re-prices each
     saved pick on it at the pick's OWN line, from the same sim table the page
     uses, and writes close_market / close_chance. Once the game kicks off its
     table is thrown away, so the last run before kickoff is what stays -
     "closing" = the last line Clover saw (Danny, 2026-09-25: closing chance
     only for placed bets). No schedule guessing: every run simply overwrites.
  2. Grades. Once a game is final: the score, hit / miss / push per pick (the
     same grade_leg that grades results.json - one grader), and beat-the-close
     (the closing chance at your line is higher than when you saved it = the
     market moved your way). When every pick on a bet is graded, the slip gets
     won / lost / push.

Secrets (Actions only; the page never sees them): SUPABASE_URL and
SUPABASE_SECRET_KEY. Missing secrets = this step is skipped, never an error.
Every call also keeps the free Supabase project from pausing (it pauses after
7 days with no activity). Nothing here can stop a refresh: any failure is
printed and the run carries on.
"""
import os
import json

import requests

OUT_RESULTS = "results.json"
TIMEOUT = 20


def _cfg():
    url, key = os.environ.get("SUPABASE_URL", "").rstrip("/"), os.environ.get("SUPABASE_SECRET_KEY", "")
    return (url, key) if url and key else (None, None)


def _headers(key):
    h = {"apikey": key, "Content-Type": "application/json"}
    if key.startswith("eyJ"):                    # a legacy service_role key is a JWT and goes here too
        h["Authorization"] = "Bearer " + key
    return h


def _get(url, key, path):
    r = requests.get(url + path, headers=_headers(key), timeout=TIMEOUT)
    r.raise_for_status()
    return r.json()


def _patch(url, key, path, body):
    r = requests.patch(url + path, headers=dict(_headers(key), Prefer="return=minimal"),
                       data=json.dumps(body), timeout=TIMEOUT)
    r.raise_for_status()


def own_market(g, typ):
    """The pick's own market number: the side's spread for spread AND winner
    picks (a winner pick watches the spread, same as the line-moved flag), the
    total for over/under."""
    if typ in ("over", "under"):
        return g.get("total")
    if g.get("spread") is None:
        return None
    return g["spread"] if typ in ("homeSp", "homeML") else -g["spread"]


def closing_updates(picks, pre, grids):
    """{pick id: fields} for every open pick whose game still has a table."""
    by_id = {str(g.get("id")): (gi, g) for gi, g in enumerate(pre)}
    out = {}
    for p in picks:
        hit = by_id.get(str(p["game_id"]))
        if not hit or hit[0] not in grids:
            continue                              # kicked off (or no line): the last close stands
        gi, g = hit
        line = 0 if p["type"].endswith("ML") else p["line"]
        out[p["id"]] = {"close_market": own_market(g, p["type"]),
                        "close_chance": round(grids[gi].prob([(p["type"], line)]), 4)}
    return out


def finals(up, results):
    """{game id: (home pts, away pts)} from this run's finals and results.json
    (NFL games drop off the slate once final; results.json keeps them)."""
    out = {str(r.get("id")): (r["hp"], r["ap"]) for r in results
           if r.get("hp") is not None and r.get("ap") is not None}
    for g in up:
        if g.get("status") == "final" and g.get("hp") is not None and g.get("ap") is not None:
            out[str(g.get("id"))] = (g["hp"], g["ap"])
    return out


def grade_updates(picks, final, grade_leg):
    out = {}
    for p in picks:
        sc = final.get(str(p["game_id"]))
        if not sc or p.get("result"):
            continue
        line = 0 if p["type"].endswith("ML") else p["line"]
        cc = p.get("close_chance")
        out[p["id"]] = {"hp": sc[0], "ap": sc[1], "result": grade_leg(p["type"], line, sc[0], sc[1]),
                        "beat_close": None if cc is None else bool(cc > p["chance"])}
    return out


def slip_result(results):
    """won / lost / push once every pick is graded, else None.
    A slip with a push and no miss is "push" until Danny says how Underdog pays
    it (asked 2026-09-25) - the pick grades are exact either way."""
    if not results or any(r is None for r in results):
        return None
    if "miss" in results:
        return "lost"
    return "won" if all(r == "hit" for r in results) else "push"


def run(pre, grids, up, grade_leg, now_iso):
    url, key = _cfg()
    if not url:
        print("  bets: no Supabase secrets - skipped")
        return
    try:
        results = []
        if os.path.exists(OUT_RESULTS):
            with open(OUT_RESULTS) as f:
                results = json.load(f)
        picks = _get(url, key, "/rest/v1/picks?select=id,bet_id,game_id,type,line,chance,close_chance,result,"
                               "bets!inner(voided_at)&result=is.null&bets.voided_at=is.null")
        closes = closing_updates(picks, pre, grids)
        for pid, body in closes.items():
            _patch(url, key, f"/rest/v1/picks?id=eq.{pid}", dict(body, closed_at=now_iso))
        for p in picks:                           # grade against the close just written
            if p["id"] in closes:
                p["close_chance"] = closes[p["id"]]["close_chance"]
        grades = grade_updates(picks, finals(up, results), grade_leg)
        for pid, body in grades.items():
            _patch(url, key, f"/rest/v1/picks?id=eq.{pid}", body)
        done = 0
        if grades:
            bets = _get(url, key, "/rest/v1/bets?select=id,picks(result)&slip_result=is.null&voided_at=is.null")
            for b in bets:
                res = slip_result([p["result"] for p in b.get("picks", [])])
                if res:
                    _patch(url, key, f"/rest/v1/bets?id=eq.{b['id']}", {"slip_result": res, "graded_at": now_iso})
                    done += 1
        print(f"  bets: {len(picks)} open pick(s), {len(closes)} closing price(s), {len(grades)} graded, {done} slip(s) settled")
    except Exception as e:                        # never stop a refresh over the bet record
        print(f"  bets: skipped this run ({type(e).__name__}: {str(e)[:200]})")
