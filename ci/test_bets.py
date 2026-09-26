"""
ci/test_bets.py - the bet record's GitHub half (bets.py), against a fake Supabase.
No network. Run by ci/checks.py.
"""
import os
import sys
import json
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))

import requests          # noqa: E402
import sim               # noqa: E402
import bets              # noqa: E402
from refresh import grade_leg   # noqa: E402

NOW = "2026-09-27T01:00:00+00:00"


class Resp:
    def __init__(self, code, data=None):
        self.status_code, self._data = code, data

    def json(self):
        return self._data

    def raise_for_status(self):
        if self.status_code >= 400:
            raise requests.HTTPError(str(self.status_code))


class FakeSupabase:
    def __init__(self, picks, bets_rows=None, fail=False):
        self.picks, self.bets, self.fail, self.patches, self.gets = picks, bets_rows or [], fail, [], []

    def get(self, url, headers=None, timeout=None):
        assert headers["apikey"] == "sb_secret_test" and "Authorization" not in headers
        self.gets.append(url)
        if self.fail:
            raise requests.ConnectionError("down")
        return Resp(200, self.picks if "/picks?" in url else self.bets)

    def patch(self, url, headers=None, data=None, timeout=None):
        self.patches.append((url.split("/rest/v1/")[1], json.loads(data)))
        return Resp(204)


def with_fake(fake, fn):
    real = requests.get, requests.patch
    requests.get, requests.patch = fake.get, fake.patch
    os.environ.update(SUPABASE_URL="https://x.supabase.co", SUPABASE_SECRET_KEY="sb_secret_test")
    try:
        fn()
    finally:
        requests.get, requests.patch = real
        os.environ.pop("SUPABASE_URL"); os.environ.pop("SUPABASE_SECRET_KEY")


def slate():
    """one upcoming game with a table, one final kept only in results.json (NFL style)"""
    up = [{"id": 11, "league": "ncaaf", "status": "upcoming", "spread": -7.0, "total": 52.5}]
    grids = {0: sim.game_grid(52.5, 7.0, seed=1)}
    with open("results.json", "w") as f:
        json.dump([{"id": "nfl9", "hp": 20, "ap": 17, "spread": -3.0, "total": 44.5}], f)
    return up, grids


def test_no_secrets_means_no_calls():
    called = []
    real = requests.get
    requests.get = lambda *a, **k: called.append(a) or Resp(500)
    try:
        bets.run([], {}, [], grade_leg, NOW)
    finally:
        requests.get = real
    assert not called


def test_closing_price_is_at_the_picks_own_line():
    up, grids = slate()
    picks = [{"id": 1, "bet_id": "b", "game_id": "11", "type": "awaySp", "line": 10.5, "chance": 0.6, "close_chance": None, "result": None},
             {"id": 2, "bet_id": "b", "game_id": "11", "type": "homeML", "line": None, "chance": 0.7, "close_chance": None, "result": None}]
    fake = FakeSupabase(picks)
    with_fake(fake, lambda: bets.run(up, grids, up, grade_leg, NOW))
    got = dict(fake.patches)
    a, h = got["picks?id=eq.1"], got["picks?id=eq.2"]
    assert a["close_market"] == 7.0 and a["close_chance"] == round(grids[0].prob([("awaySp", 10.5)]), 4) and a["closed_at"] == NOW
    assert h["close_market"] == -7.0 and h["close_chance"] == round(grids[0].prob([("homeML", 0)]), 4)
    assert a["close_chance"] != round(grids[0].prob([("awaySp", 7.0)]), 4), "an alt line must be priced at its own number"


def test_final_grades_picks_and_settles_the_slip():
    up, grids = slate()
    picks = [{"id": 3, "bet_id": "b", "game_id": "nfl9", "type": "homeSp", "line": -2.5, "chance": 0.5, "close_chance": 0.46, "result": None},
             {"id": 4, "bet_id": "b", "game_id": "nfl9", "type": "under", "line": 44.5, "chance": 0.5, "close_chance": 0.55, "result": None}]
    fake = FakeSupabase(picks, [{"id": "b", "picks": [{"result": "hit"}, {"result": "hit"}]}])
    with_fake(fake, lambda: bets.run(up, grids, up, grade_leg, NOW))
    got = dict(fake.patches)
    assert got["picks?id=eq.3"] == {"hp": 20, "ap": 17, "result": "hit", "beat_close": False}
    assert got["picks?id=eq.4"] == {"hp": 20, "ap": 17, "result": "hit", "beat_close": True}
    assert got["bets?id=eq.b"] == {"slip_result": "won", "graded_at": NOW}
    assert all("voided_at=is.null" in u for u in fake.gets), "voided bets are never closed or graded"


def test_slip_results():
    assert bets.slip_result(["hit", "miss"]) == "lost"
    assert bets.slip_result(["hit", "hit"]) == "won"
    assert bets.slip_result(["hit", "push"]) == "push"
    assert bets.slip_result(["hit", None]) is None and bets.slip_result([]) is None


def test_supabase_down_never_stops_a_refresh():
    up, grids = slate()
    fake = FakeSupabase([], fail=True)
    with_fake(fake, lambda: bets.run(up, grids, up, grade_leg, NOW))   # must not raise
    assert not fake.patches


def main():
    failed, here = 0, os.getcwd()
    for name, fn in sorted((n, f) for n, f in globals().items() if n.startswith("test_") and callable(f)):
        with tempfile.TemporaryDirectory() as tmp:
            os.chdir(tmp)
            try:
                import io, contextlib
                with contextlib.redirect_stdout(io.StringIO()):
                    fn()
                print(f"  ok    {name}")
            except Exception as e:
                failed += 1
                print(f"  FAIL  {name}: {type(e).__name__}: {e}")
            finally:
                os.chdir(here)
    return failed


if __name__ == "__main__":
    sys.exit(1 if main() else 0)
