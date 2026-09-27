"""ci/test_props.py - props_backtest.py against a fake odds feed: parsing, resume, the credit floor."""
import os
import sys
import tempfile

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import props_backtest as P


def fake_feed(start_left, games=6, fail_on=None):
    state = {"left": start_left, "odds_calls": 0}

    def fetch(path, params, key):
        if path == "/sports":
            return 200, [], state["left"]
        if path.endswith("/events"):
            state["left"] -= 1
            t = P.parse(params["commenceTimeFrom"])
            data = []
            if t < P.SEASON_FROM + P.timedelta(days=14):
                for i in range(games // 2):
                    k = t + P.timedelta(days=3, hours=i)
                    data.append({"id": f"g{k:%m%d%H}", "commence_time": P.iso(k),
                                 "home_team": "H", "away_team": "A"})
            return 200, {"data": data}, state["left"]
        state["odds_calls"] += 1
        if fail_on and state["odds_calls"] == fail_on:
            return 422, {"message": "no snapshot"}, state["left"]
        state["left"] -= 60
        outs = [{"name": "Over", "description": "Joe QB", "point": 245.5, "price": -115},
                {"name": "Under", "description": "Joe QB", "point": 245.5, "price": -105},
                {"name": "Yes", "description": "Sam RB", "price": 120}]
        bk = [{"key": "draftkings", "markets": [{"key": "player_pass_yds", "outcomes": outs[:2]},
                                                 {"key": "player_anytime_td", "outcomes": outs[2:]}]},
              {"key": "fanduel", "markets": [{"key": "player_pass_yds", "outcomes": outs[:2]}]}]
        return 200, {"timestamp": params["date"], "data": {"bookmakers": bk}}, state["left"]
    return fetch, state


def main():
    os.chdir(tempfile.mkdtemp())
    fetch, st = fake_feed(10000, fail_on=2)
    D = P.run("k", fetch, pause=0)
    assert D["meta"]["status"] == "done", D["meta"]
    assert len(D["games"]) == len(D["events"]) == 9, len(D["games"])
    g = next(g for g in D["games"].values() if g["props"])
    assert ["any_td", "Sam RB", None, 120, None] in g["props"], g["props"]
    assert ["pass_yds", "Joe QB", 245.5, -115, -105] in g["props"], g["props"]
    assert sum(1 for g in D["games"].values() if g.get("note")) == 1
    calls = st["odds_calls"]
    P.run("k", fetch, pause=0)                       # re-run: nothing left, nothing spent
    assert st["odds_calls"] == calls
    os.remove(P.OUT)
    fetch, st = fake_feed(P.FLOOR + 150)             # floor: room for ~1 game, then stop
    D = P.run("k", fetch, pause=0)
    assert D["meta"]["status"] == "stopped" and D["meta"]["error"].startswith("floor"), D["meta"]
    assert st["left"] >= P.FLOOR, st
    fetch, st = fake_feed(10000)                     # resume after the floor fills the rest
    D = P.run("k", fetch, pause=0)
    assert D["meta"]["status"] == "done" and len(D["games"]) == 9
    print("  props_backtest: parse, resume, floor - ok")


if __name__ == "__main__":
    main()
