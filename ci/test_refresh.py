"""
ci/test_refresh.py - Python tests. No network: requests.get is replaced with a
fake that plays CFBD, the-odds-api and ESPN. Run by ci/checks.py.
"""
import os
import sys
import json
import tempfile
from datetime import timedelta

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))
sys.path.insert(0, HERE)

import requests          # noqa: E402
import common            # noqa: E402
import cfbd              # noqa: E402
import nfl               # noqa: E402
import odds              # noqa: E402
import sim               # noqa: E402
import refresh           # noqa: E402
import fixture           # noqa: E402


class Resp:
    def __init__(self, code, data=None, headers=None):
        self.status_code, self._data, self.headers, self.text = code, data, headers or {}, "x" * 900

    def json(self):
        return self._data

    def raise_for_status(self):
        if self.status_code >= 400:
            e = requests.HTTPError(str(self.status_code))
            e.response = self
            raise e


class Feeds:
    """The fake internet. cfbd = 'ok' | 'quota' | 'flaky'; odds = 'ok' | 'down'."""
    def __init__(self, prev, cfbd_mode="ok", odds_mode="ok"):
        self.prev, self.cfbd_mode, self.odds_mode, self.calls, self.flaked = prev, cfbd_mode, odds_mode, [], 0

    def __call__(self, url, headers=None, params=None, timeout=None):
        params = params or {}
        self.calls.append(url)
        if "espn.com" in url:
            return Resp(403)
        if "collegefootballdata" in url:
            return self.cfbd(url.split(".com")[1], params)
        return self.odds(url, params)

    def cfbd(self, path, params):
        if self.cfbd_mode == "quota":
            return Resp(429)
        if self.cfbd_mode == "flaky" and self.flaked < 2:
            self.flaked += 1
            return Resp(503)
        col = [g for g in self.prev["upcoming"] if g["league"] == "ncaaf"]
        if path == "/games":
            return Resp(200, [{"id": g["id"], "week": g["week"], "startDate": g["start"], "homeTeam": g["home"],
                               "awayTeam": g["away"], "homeClassification": "fbs", "awayClassification": "fbs",
                               "completed": False, "neutralSite": False} for g in col])
        if path == "/lines":
            return Resp(200, [{"id": g["id"], "lines": [{"provider": "DraftKings", "spread": g["spread"] - 1,
                                                          "overUnder": g["total"]}]} for g in col])
        if path == "/rankings":
            return Resp(200, [{"polls": [{"poll": "AP Top 25", "ranks": [{"school": "Texas", "rank": 3}]}]}])
        if path == "/teams":
            return Resp(200, [{"school": "Texas", "logos": ["https://a.espncdn.com/t.png"], "color": "#BF5700",
                               "conference": "SEC"}])
        if path == "/info":
            return Resp(200, {"patronLevel": 1, "remainingCalls": 4321})
        return Resp(404)

    def odds(self, url, params):
        if self.odds_mode == "down":
            return Resp(500)
        left = {"x-requests-remaining": "19950"}
        games = [g for g in self.prev["upcoming"] if g["league"] == "nfl"]
        if url.endswith("/events"):
            return Resp(200, [{"id": g["id"], "commence_time": g["start"], "home_team": g["home"],
                               "away_team": g["away"]} for g in games], left)
        if url.endswith("/odds"):
            return Resp(200, [{"id": g["id"], "bookmakers": [{"markets": [
                {"key": "spreads", "outcomes": [{"name": g["home"], "point": g["spread"]}]},
                {"key": "totals", "outcomes": [{"name": "Over", "point": g["total"]}]}]}]} for g in games], left)
        return Resp(200, [], left)


def run(cfbd_mode="ok", odds_mode="ok", prev=None, full=False):
    """One write_upcoming() in an empty folder against the fake feeds."""
    for k in common.RUN:
        common.RUN[k] = 0 if k == "cfbd_calls" else None
    prev = prev or fixture.previous_file()
    feeds = Feeds(prev, cfbd_mode, odds_mode)
    requests.get = feeds
    cfbd.RETRY_WAIT, cfbd.DOWN = 0, None
    odds.time.sleep = lambda s: None
    os.environ["CFBD_KEY"], os.environ["ODDS_KEY"] = "test", "test"
    R = json.loads(json.dumps(prev))
    refresh.write_upcoming(R, full=full)
    return R, feeds, json.load(open(common.OUT_HEALTH))


def by_league(R, lg):
    return [g for g in R["upcoming"] if g["league"] == lg]


# ---------------------------------------------------------------- the tests
def test_healthy_run():
    R, feeds, H = run()
    assert "stale" not in R and not H["alerts"] and H["alert_now"] is False
    assert len(by_league(R, "ncaaf")) == 5 and len(by_league(R, "nfl")) == 2
    tx = next(g for g in R["upcoming"] if g["home"] == "Texas")
    assert tx["spread"] == -7.5, "fresh college line should replace the old one"
    assert tx["home_rank"] == 3 and tx["sim"] and set(tx["p"]) == set(refresh.SIX)
    assert H["cfbd"]["left"] == 4321 and H["cfbd"]["left_source"] == "reported by CFBD"
    assert H["odds"]["left"] == 19950
    page = open(common.OUT_JS).read()
    assert page.startswith("window.RATINGS = ") and '"rankings"' not in page and '"teams"' not in page


def test_cfbd_down_does_not_stop_nfl():
    """The 2026-09-20 outage, replayed: CFBD says 429."""
    R, feeds, H = run(cfbd_mode="quota")
    assert R["stale"].keys() == {"ncaaf"} and "429" in R["stale"]["ncaaf"]["reason"]
    assert R["nfl_diag"]["source"] == "odds-api", "NFL must still be pulled fresh"
    assert R["asof"]["nfl"] > R["asof"]["ncaaf"] and R["lines_generated"] == R["asof"]["nfl"]
    col = by_league(R, "ncaaf")
    assert len(col) == 5, "college games carried forward"
    assert next(g for g in col if g["home"] == "Texas")["spread"] == -6.5, "at their last good line"
    rice = next(g for g in col if g["home"] == "Rice")
    assert rice["status"] == "live" and "sim" not in rice, "a carried game that kicked off is not priceable"
    assert H["alert_now"] is True and any("College" in a for a in H["alerts"])
    assert common.health_gate() == 1
    assert sum("collegefootballdata" in u for u in feeds.calls) == 1, "a 429 must not be retried"


def test_alert_once_a_day():
    run(cfbd_mode="quota")
    R, feeds, H = run(cfbd_mode="quota")
    assert H["alerts"] and H["alert_now"] is False and common.health_gate() == 0


def test_everything_down_keeps_the_old_clock():
    prev = fixture.previous_file()
    R, feeds, H = run(cfbd_mode="quota", odds_mode="down", prev=prev)
    assert R["stale"].keys() == {"ncaaf", "nfl"}
    assert R["lines_generated"] == prev["lines_generated"], "the page's clock must not claim a fresh pull"
    assert len(by_league(R, "nfl")) == 2 and R["nfl_diag"]["source"].startswith("carried forward")
    assert all(len(e) < 40 for e in R["nfl_diag"]["errors"]), "no ESPN error page in the data file"


def test_retry_and_call_count():
    R, feeds, H = run(cfbd_mode="flaky")
    assert "stale" not in R, "two 503s then success is a healthy run"
    assert common.RUN["cfbd_calls"] == sum("collegefootballdata" in u for u in feeds.calls)


def test_rankings_are_not_refetched():
    R, feeds, H = run()
    again, feeds2, H2 = run(prev=R)
    assert not any("/rankings" in u for u in feeds2.calls), "the poll is on file - no call"
    assert next(g for g in again["upcoming"] if g["home"] == "Texas")["home_rank"] == 3
    full, feeds3, H3 = run(prev=R, full=True)
    assert any("/rankings" in u for u in feeds3.calls), "the weekly full run re-asks"
    assert sum("espn.com" in u for u in feeds2.calls) == 1, "ESPN is tried once, not three times"


def test_low_credits_alert():
    common.RUN.update(cfbd_calls=0, cfbd_left_reported=120, odds_left=800, cfbd_error=None, odds_error=None)
    H = common.write_health({})
    assert len(H["alerts"]) == 2 and H["alert_now"]


def test_empty_answer_is_never_cached():
    assert cfbd.cached("t_empty", lambda: {}) == {} and not os.path.exists("cache_t_empty.json")
    assert cfbd.cached("t_full", lambda: {"a": 1}) == {"a": 1} and os.path.exists("cache_t_full.json")


def test_results_are_append_only():
    now = common.now_utc()
    g = fixture.game(7, "ncaaf", "Texas", "Rice", -10.0, 50.0, now - timedelta(hours=5), "final")
    g.update(hp=31.0, ap=20.0, p={t: 0.5 for t in refresh.SIX})
    refresh.record_results([g])
    refresh.record_results([g])
    rows = [r for r in json.load(open(common.OUT_RESULTS)) if r["id"] == 7]
    assert len(rows) == 1
    picks = rows[0]["picks"]
    assert picks["homeSp"] == {"line": -10.0, "p": 0.5, "result": "hit"}
    assert picks["awaySp"]["line"] == 10.0 and picks["awaySp"]["result"] == "miss", "spread is the side's OWN number"
    assert picks["over"]["result"] == "hit" and picks["under"]["result"] == "miss"
    assert refresh.grade_leg("homeSp", -11.0, 31, 20) == "push"


def test_opening_line_is_saved_once():
    """Ruling 2 of 2026-09-21: the first DraftKings line is kept for good."""
    prev = fixture.previous_file()
    for g in prev["upcoming"]:
        g.pop("open", None)
    R, feeds, H = run(prev=prev)
    tx = next(g for g in R["upcoming"] if g["home"] == "Texas")
    assert tx["open"] == {"spread": -7.5, "total": 52.5}, "first DK line seen becomes the opening line"
    again, feeds2, H2 = run(prev=R)        # the fake feed moves every college spread by 1 each run
    tx2 = next(g for g in again["upcoming"] if g["home"] == "Texas")
    assert tx2["spread"] == -8.5 and tx2["open"] == {"spread": -7.5, "total": 52.5}, "never rewritten"
    assert '"open"' in open(common.OUT_JS).read(), "the page reads it"
    g = fixture.game(5, "ncaaf", "A", "B", -3.0, 40.0, common.now_utc())
    g["book"] = "Bovada"
    refresh.note_opening(g, None)
    assert "open" not in g, "only a DraftKings line counts"


def test_names_and_lines():
    assert odds.team_match("Florida State", "Florida State Seminoles")
    assert not odds.team_match("Miami", "Miami (OH) RedHawks")
    assert odds.team_match("Texas", "Texas A&M Aggies"), "prefix rule matches - pull_alt_lines picks the longest name"
    assert odds.team_match("Hawai'i", "Hawaii Rainbow Warriors")
    assert nfl.espn_spread({"details": "KC -3.5"}, "KC", "BUF") == -3.5
    assert nfl.espn_spread({"details": "BUF -3.5"}, "KC", "BUF") == 3.5
    assert nfl.espn_spread({"details": "EVEN"}, "KC", "BUF") == 0.0
    now = common.now_utc()
    assert common.status_for(now + timedelta(hours=1), now, False) == "upcoming"
    assert common.status_for(now - timedelta(hours=1), now, False) == "live"
    assert common.status_for(now - timedelta(hours=5), now, True) == "final"


def test_sim_tables_are_stable():
    g = [fixture.game(4242, "nfl", "A B", "C D", -3.0, 44.5, common.now_utc() + timedelta(days=1))]
    grid = sim.attach_sims(g)[0]
    first = g[0]["sim"]["c"]
    back = sim.Grid.decode(g[0]["sim"])
    for t in refresh.SIX:
        leg = [(t, refresh.leg_line(g[0], t))]
        assert abs(grid.prob(leg) - back.prob(leg)) < 1e-12, "encode/decode must not change a number"
    h = [dict(g[0])]
    h[0].pop("sim")
    sim.attach_sims(h)
    assert h[0]["sim"]["c"] == first, "same game id + same line = the same table, byte for byte"
    ml = grid.prob([("homeML", 0)]) + grid.prob([("awayML", 0)])
    assert abs(ml - 1) < 1e-9 and 0.55 < grid.prob([("homeML", 0)]) < 0.65
    assert sim.SD_BY_LEAGUE == {"ncaaf": 15.2, "nfl": 13.1} and sim.MARGIN_SD_BY_LEAGUE["nfl"] == 11.7, \
        "width constants are calibrated - change them only with calibrate.py --tails evidence"


def test_calibrate_can_still_find_its_tools():
    for name in ("BOOKS", "HFA_POINTS", "blend", "fit", "fit_pace", "games_played", "get", "pick",
                 "project", "pull_drive_counts", "pull_games"):
        assert hasattr(refresh, name), f"calibrate.py uses refresh.{name}"


def main():
    tests = [(n, f) for n, f in sorted(globals().items()) if n.startswith("test_") and callable(f)]
    failed = 0
    real_get, here = requests.get, os.getcwd()
    for name, fn in tests:
        with tempfile.TemporaryDirectory() as tmp:
            os.chdir(tmp)
            try:
                import io, contextlib
                buf = io.StringIO()
                with contextlib.redirect_stdout(buf):
                    fn()
                print(f"  ok    {name}")
            except Exception as e:
                failed += 1
                print(f"  FAIL  {name}: {type(e).__name__}: {e}")
            finally:
                os.chdir(here)
                requests.get = real_get
    return failed


if __name__ == "__main__":
    sys.exit(1 if main() else 0)
