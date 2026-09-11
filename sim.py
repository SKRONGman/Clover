#!/usr/bin/env python3
"""
sim.py - "the football": the one and only game simulator for Clover.

refresh.py uses it to precompute, for every upcoming game, a table of how
often the game ends with total T and margin M (home minus away). index.html
does nothing but look numbers up in that table. calibrate.py uses the same
functions, so what is calibrated is exactly what ships.

Points arrive as touchdowns and field goals, not on a smooth curve. A per-game
hot/cold multiplier gives the fat right tail real football has. The center of
each game is the betting line (settled finding: nothing beats it); the shape
is calibrated (calibrate.py --tails) and set per league: DEFAULT_SD for
college, NFL_SD / NFL_MARGIN_SD for the NFL (calibrate.py --nfl --tails).
"""

import base64
import numpy as np

DEFAULT_SD = 15.2          # college total-points volatility; verified within ~2 pts at every rung 19-83%
NFL_SD = 13.1              # NFL total-points volatility, calibrated (2019, 2021-2025 vs the closing line)
NFL_MARGIN_SD = 11.7       # NFL margin volatility, calibrated (calibrate.py --nfl --tails): every rung 11-89% within ~3 pts
SD_BY_LEAGUE = {"ncaaf": DEFAULT_SD, "nfl": NFL_SD}
MARGIN_SD_BY_LEAGUE = {"ncaaf": None, "nfl": NFL_MARGIN_SD}     # None = margin width comes from the drive engine
LEAGUES = ("ncaaf", "nfl")
DRIVES = 12                # possessions per team in a normal game
SIMS = 20000               # games played out per matchup
HALF = 64                  # table covers center +/- HALF points on each axis (4 sigma)
_DISPS = [400, 80, 40, 20, 12, 8, 5, 3.5, 2.5, 1.8]
_disp_cache = {}


def sd_for(g):
    """(total_sd, margin_sd) for a game: by its league tag (college if untagged)."""
    lg = g.get("league", "ncaaf")
    return SD_BY_LEAGUE.get(lg, DEFAULT_SD), MARGIN_SD_BY_LEAGUE.get(lg)


def team_points(rng, mean, disp, n):
    """n simulated scores for a team expected to score `mean`."""
    m = rng.gamma(disp, 1.0 / disp, size=n)                  # hot/cold multiplier
    p_td = np.minimum(mean * 0.70 / 7 / DRIVES * m, 0.90)
    p_fg = np.minimum(mean * 0.30 / 3 / DRIVES * m, 0.90)
    r = rng.random((n, DRIVES))
    td = r < p_td[:, None]
    fg = (~td) & (r < (p_td + p_fg)[:, None])
    q = rng.random((n, DRIVES))
    td_pts = np.where(q < 0.90, 7, np.where(q < 0.95, 8, 6))
    return (td * td_pts).sum(1) + fg.sum(1) * 3


def pick_disp(home_mean, away_mean, target_sd):
    """Which hot/cold dispersion gets the total's spread closest to target_sd.
    Cached on rounded inputs - it only depends on the two means."""
    key = (round(home_mean), round(away_mean), round(target_sd, 1))
    if key in _disp_cache:
        return _disp_cache[key]
    rng = np.random.default_rng(7)
    best, gap = _DISPS[0], 1e9
    for d in _DISPS:
        t = team_points(rng, home_mean, d, 1500) + team_points(rng, away_mean, d, 1500)
        g = abs(t.std() - target_sd)
        if g < gap:
            gap, best = g, d
    _disp_cache[key] = best
    return best


def sim_game(home_mean, away_mean, target_sd=DEFAULT_SD, n=SIMS, seed=0, margin_sd=None):
    """Whole-number home and away scores, n of each, centered exactly on the means.

    margin_sd=None (college): shift only, the drive engine's own width stands.
    margin_sd set (NFL): the drive engine cannot get tighter than ~13.7 on its
    own and real NFL games are tighter, with margins tighter than totals. So
    the total and margin deviations are each scaled to their target before
    rounding - the fat right tail and the lumpy scores survive, the width
    matches what the closing line actually misses by."""
    rng = np.random.default_rng(seed)
    d = pick_disp(home_mean, away_mean, target_sd)
    h = team_points(rng, home_mean, d, n).astype(float)
    a = team_points(rng, away_mean, d, n).astype(float)
    if margin_sd is not None:
        t, m = h + a, h - a
        t = t.mean() + (t - t.mean()) * (target_sd / max(t.std(), 1e-9))
        m = m.mean() + (m - m.mean()) * (margin_sd / max(m.std(), 1e-9))
        h, a = (t + m) / 2, (t - m) / 2
    h = np.maximum(0, np.round(h + (home_mean - h.mean())))     # shift only - keeps the lumpiness
    a = np.maximum(0, np.round(a + (away_mean - a.mean())))
    return h, a


# ----------------------------------------------------------------------
# the table
# ----------------------------------------------------------------------
class Grid:
    """counts[ti, mi] = how many sims ended with total t0+ti and margin m0+mi."""
    def __init__(self, t0, m0, counts, n):
        self.t0, self.m0, self.counts, self.n = t0, m0, counts, n
        self.nt, self.nm = counts.shape
        self.T = t0 + np.arange(self.nt)[:, None]        # total at each cell
        self.M = m0 + np.arange(self.nm)[None, :]        # margin at each cell

    def prob(self, legs, dt=0, dm=0):
        """Chance every leg hits, pushes thrown out. legs = [(type, line)], line is
        the side's own number (away spread is the away team's spread).
        dt/dm shift the whole game by that many points (stress test)."""
        T, M = self.T + dt, self.M + dm
        ok = np.ones_like(self.counts, bool)
        push = np.zeros_like(self.counts, bool)
        for typ, line in legs:
            v = leg_value(typ, line, T, M)
            push |= v == 0
            ok &= v > 0
        c = self.counts
        pu = c[push].sum()
        win = c[ok & ~push].sum()
        denom = self.n - pu
        return float(win / denom) if denom > 0 else 0.0

    def encode(self):
        """JSON-able. Only ~2,000 of 16,000 cells are ever hit (scores land on
        3s and 7s), so store (gap-to-next-nonzero-cell, count) pairs as varints,
        row-major over [total][margin], then base64. About 5 KB a game."""
        flat = self.counts.ravel()
        out = bytearray()
        prev = -1
        for i in np.flatnonzero(flat):
            for v in (int(i - prev - 1), int(flat[i])):
                while True:
                    b = v & 0x7F
                    v >>= 7
                    out.append(b | (0x80 if v else 0))
                    if not v:
                        break
            prev = int(i)
        return {"t0": int(self.t0), "m0": int(self.m0), "nt": int(self.nt), "nm": int(self.nm),
                "n": int(self.n), "c": base64.b64encode(bytes(out)).decode("ascii")}

    @classmethod
    def decode(cls, d):
        """Inverse of encode (the page does the same thing in JS)."""
        raw = base64.b64decode(d["c"])
        vals, v, shift = [], 0, 0
        for b in raw:
            v |= (b & 0x7F) << shift
            if b & 0x80:
                shift += 7
            else:
                vals.append(v)
                v, shift = 0, 0
        flat = np.zeros(d["nt"] * d["nm"], np.int64)
        i = -1
        for gap, cnt in zip(vals[0::2], vals[1::2]):
            i += gap + 1
            flat[i] = cnt
        return cls(d["t0"], d["m0"], flat.reshape(d["nt"], d["nm"]), d["n"])


def leg_value(typ, line, T, M):
    """Positive = the pick hits, zero = push, negative = loses. Works on arrays."""
    if typ == "over":    return T - line
    if typ == "under":   return line - T
    if typ == "homeSp":  return M + line
    if typ == "awaySp":  return line - M          # line is the away team's own spread
    if typ == "homeML":  return M
    if typ == "awayML":  return -M
    raise ValueError(typ)


def game_grid(total_center, margin_center, sd=DEFAULT_SD, n=SIMS, seed=0, margin_sd=None):
    hp = max((total_center + margin_center) / 2, 0.0)
    ap = max((total_center - margin_center) / 2, 0.0)
    h, a = sim_game(hp, ap, sd, n, seed, margin_sd)
    t = (h + a).astype(int)
    m = (h - a).astype(int)
    t0 = max(0, int(round(total_center)) - HALF)
    m0 = int(round(margin_center)) - HALF
    nt, nm = int(round(total_center)) + HALF - t0 + 1, 2 * HALF + 1
    ti = np.clip(t - t0, 0, nt - 1)
    mi = np.clip(m - m0, 0, nm - 1)
    counts = np.zeros((nt, nm), np.int64)
    np.add.at(counts, (ti, mi), 1)
    return Grid(t0, m0, counts, n)


def center_for(g):
    """Where a game's sim is centered: the market line if there is one, else
    the ratings projection. Returns (total_center, margin_center, source)."""
    tot = (g.get("proj_home") or 0) + (g.get("proj_away") or 0)     # NFL games carry no projection
    mar = (g.get("proj_home") or 0) - (g.get("proj_away") or 0)
    src = "model"
    if g.get("total") is not None:
        tot, src = g["total"], "market"
    if g.get("spread") is not None:
        mar, src = -g["spread"], "market"
    return tot, mar, src


def attach_sims(up, n=SIMS):
    """Give every lined upcoming game a table, at its league's volatility.
    Mutates `up`; returns {gi: Grid}.
    (Hot slips are built in the page from these tables - see index.html.)"""
    grids = {}
    for gi, g in enumerate(up):
        g.pop("sim", None)
        g.setdefault("league", "ncaaf")
        if g.get("spread") is None or g.get("total") is None:
            continue                       # no line = nothing to center on; the page won't offer it
        tot, mar, src = center_for(g)
        sd, msd = sd_for(g)
        # seeded by game id: same lines -> byte-identical table -> no churn in the repo
        grid = game_grid(tot, mar, sd, n, seed=int(g.get("id") or gi) % (2 ** 31), margin_sd=msd)
        g["sim"] = dict(grid.encode(), sd=sd, msd=msd, center=src)
        grids[gi] = grid
    return grids


if __name__ == "__main__":
    # quick self-check on one game: FSU -3, total 54.5
    G = game_grid(54.5, 3.0)
    for legs in ([("homeML", 0)], [("awayML", 0)], [("homeSp", -3.0)], [("over", 54.5)],
                 [("homeML", 0), ("over", 54.5)], [("homeSp", -3.0), ("homeML", 0), ("over", 54.5)]):
        print(legs, round(G.prob(legs) * 100, 1))
    e = G.encode()
    print("encoded bytes", len(e["c"]))
    D = Grid.decode(e)
    assert (D.counts == G.counts).all() and (D.t0, D.m0, D.n) == (G.t0, G.m0, G.n), "round trip failed"
    print("round trip ok")
    # NFL-shaped game: Chiefs -3, total 45.5, at the NFL widths
    N = game_grid(45.5, 3.0, sd=NFL_SD, margin_sd=NFL_MARGIN_SD)
    print("nfl", [("homeSp", -3.0)], round(N.prob([("homeSp", -3.0)]) * 100, 1),
          "home ML", round(N.prob([("homeML", 0)]) * 100, 1))
