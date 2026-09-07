#!/usr/bin/env python3
"""
probe_odds.py - one-time look at what The Odds API actually gives us for
college football. Runs on GitHub Actions (the "Probe Odds API" workflow) with
the ODDS_KEY secret. Writes probe_odds.json to the repo so the answers can be
read without opening the job log. Costs ~4 credits of the 500/month free tier.

Questions it answers:
  1. Which bookmakers carry NCAAF game lines, and is Underdog one of them?
  2. Does NCAAF have alternate spreads / totals (real pricing for moved lines)?
  3. Does Underdog carry NCAAF player props with multipliers?
"""
import os
import sys
import json
from datetime import datetime, timezone

import requests

K = os.environ.get("ODDS_KEY", "").strip()
if not K:
    sys.exit("ODDS_KEY is not set (add it as a repository secret).")
BASE = "https://api.the-odds-api.com/v4"
SPORT = "americanfootball_ncaaf"
out = {"ran": datetime.now(timezone.utc).isoformat(timespec="seconds"), "calls": []}


def get(path, **params):
    params["apiKey"] = K
    r = requests.get(BASE + path, params=params, timeout=30)
    rec = {"path": path, "status": r.status_code,
           "cost": r.headers.get("x-requests-last"),
           "used": r.headers.get("x-requests-used"),
           "remaining": r.headers.get("x-requests-remaining")}
    out["calls"].append(rec)
    print(f"GET {path} -> {r.status_code} | cost {rec['cost']} | used {rec['used']} | remaining {rec['remaining']}")
    if r.status_code != 200:
        rec["error"] = r.text[:300]
        print("   ", r.text[:300])
        return None
    return r.json()


# 1. game lines, US books + US DFS sites
games = get(f"/sports/{SPORT}/odds", regions="us,us_dfs",
            markets="h2h,spreads,totals", oddsFormat="american") or []
books = sorted({bk["key"] for g in games for bk in g["bookmakers"]})
ud_games = [g for g in games if any(bk["key"] == "underdog" for bk in g["bookmakers"])]
out["game_lines"] = {
    "games": len(games),
    "bookmakers": books,
    "underdog_games_with_game_lines": len(ud_games),
    "underdog_markets": sorted({m["key"] for g in ud_games for bk in g["bookmakers"]
                                if bk["key"] == "underdog" for m in bk["markets"]}),
}
print("bookmakers:", books)
print("underdog game-level lines on", len(ud_games), "of", len(games), "games")

# pick a sample game: one with the most bookmakers
sample = max(games, key=lambda g: len(g["bookmakers"]), default=None)
if sample:
    out["sample_game"] = {"id": sample["id"], "away": sample["away_team"], "home": sample["home_team"],
                          "kick": sample["commence_time"]}
    out["sample_lines"] = {}
    for bk in sample["bookmakers"]:
        if bk["key"] in ("draftkings", "fanduel", "underdog", "prizepicks"):
            out["sample_lines"][bk["key"]] = {m["key"]: [(o["name"], o.get("point"), o["price"]) for o in m["outcomes"]]
                                              for m in bk["markets"]}
    print("sample game:", sample["away_team"], "@", sample["home_team"])

    # 2. alternate lines for that game
    alt = get(f"/sports/{SPORT}/events/{sample['id']}/odds", regions="us,us_dfs",
              markets="alternate_spreads,alternate_totals", oddsFormat="american")
    out["alternate_lines"] = {}
    if alt:
        for bk in alt["bookmakers"]:
            for m in bk["markets"]:
                out["alternate_lines"].setdefault(bk["key"], {})[m["key"]] = {
                    "rungs": len(m["outcomes"]),
                    "sample": [(o["name"], o.get("point"), o["price"]) for o in m["outcomes"][:6]],
                }
        print("alternate lines from:", sorted(out["alternate_lines"]))

    # 3. player props, DFS sites only
    props = get(f"/sports/{SPORT}/events/{sample['id']}/odds", regions="us_dfs",
                markets="player_pass_yds,player_rush_yds,player_reception_yds,player_anytime_td",
                oddsFormat="american")
    out["player_props"] = {}
    if props:
        for bk in props["bookmakers"]:
            for m in bk["markets"]:
                out["player_props"].setdefault(bk["key"], {})[m["key"]] = {
                    "picks": len(m["outcomes"]),
                    "sample": [(o.get("description"), o["name"], o.get("point"), o["price"]) for o in m["outcomes"][:6]],
                }
        print("player props from:", sorted(out["player_props"]))

with open("probe_odds.json", "w") as f:
    json.dump(out, f, indent=1)
print("wrote probe_odds.json")
