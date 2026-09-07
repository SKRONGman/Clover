#!/usr/bin/env python3
"""
calibrate.py - honest backtest + calibration for The Card.

For each test season, fits ratings on the season before, then walks the test
season week by week (ratings only ever see games already played - exactly what
the live tool does), projects every game that had a betting line, simulates it
the same way index.html does, and records "we said X% -> did it hit?".

Then it reports:
  1. true out-of-sample volatility (replaces the self-flattering number)
  2. calibration: picks we called 60-65% - how often did they really hit?
  3. the same at several model/market blend weights, so the weights in
     index.html are chosen from data instead of guessed

ONE-TIME RUN (a few minutes, ~30 API calls per season):
    python calibrate.py
    python calibrate.py --seasons 2024 2025     # fewer seasons, faster
    python calibrate.py --check                 # just confirm the lines feed

Writes calibration.json next to this file. Needs refresh.py in the same folder
and CFBD_KEY set, same as refresh.py.
"""

import sys
import json
import math
import argparse
from collections import defaultdict

import numpy as np

import refresh as R   # reuse the API + rating code so this tests the real thing
import bayes          # hierarchical Bayesian ratings (Gibbs / MCMC)

TEST_SEASONS = [2019, 2021, 2022, 2023, 2024, 2025]     # 2020 = COVID, skipped
BOOKS = R.BOOKS
SIMS = 10000
DRIVES = 12
WEIGHTS = [0.0, 0.25, 0.5, 0.75, 1.0]     # model-vs-market blends to test
BINS = [0.0, 0.50, 0.55, 0.60, 0.65, 0.70, 1.01]
TAIL_BINS = [0.0, 0.10, 0.20, 0.30, 0.40, 0.50, 0.60, 0.70, 0.80, 0.90, 1.01]
TAIL_MOVES = [-14, -10, -7, -3, 0, 3, 7, 10, 14]     # points to move a line, both directions


# ----------------------------------------------------------------------
# the football, ported from index.html so the numbers match the page
# ----------------------------------------------------------------------
_rng = np.random.default_rng(7)


def team_points(mean, disp, n):
    """n simulated scores for a team expected to score `mean`."""
    m = _rng.gamma(disp, 1.0 / disp, size=n)               # hot/cold multiplier
    p_td = np.minimum(mean * 0.70 / 7 / DRIVES * m, 0.90)
    p_fg = np.minimum(mean * 0.30 / 3 / DRIVES * m, 0.90)
    r = _rng.random((n, DRIVES))
    td = r < p_td[:, None]
    fg = (~td) & (r < (p_td + p_fg)[:, None])
    q = _rng.random((n, DRIVES))
    td_pts = np.where(q < 0.90, 7, np.where(q < 0.95, 8, 6))
    return (td * td_pts).sum(1) + fg.sum(1) * 3


_DISPS = [400, 80, 40, 20, 12, 8, 5, 3.5, 2.5, 1.8]
_disp_cache = {}


def pick_disp(home_mean, away_mean, target_sd):
    """Same dispersion search as the page, cached on rounded inputs."""
    key = (round(home_mean), round(away_mean), round(target_sd, 1))
    if key in _disp_cache:
        return _disp_cache[key]
    best, gap = _DISPS[0], 1e9
    for d in _DISPS:
        t = team_points(home_mean, d, 1500) + team_points(away_mean, d, 1500)
        g = abs(t.std() - target_sd)
        if g < gap:
            gap, best = g, d
    _disp_cache[key] = best
    return best


def sim_game(home_mean, away_mean, target_sd, n=SIMS):
    d = pick_disp(home_mean, away_mean, target_sd)
    h = team_points(home_mean, d, n).astype(float)
    a = team_points(away_mean, d, n).astype(float)
    h = np.maximum(0, np.round(h + (home_mean - h.mean())))
    a = np.maximum(0, np.round(a + (away_mean - a.mean())))
    return h, a


def bet_probs(h, a, spread, total):
    """Chance each of the four bets cashes, pushes removed."""
    t, m = h + a, h - a
    out = {}
    if total is not None:
        over, under = (t > total).sum(), (t < total).sum()
        out["over"] = over / max(over + under, 1)
        out["under"] = under / max(over + under, 1)
    if spread is not None:
        hs, as_ = (m + spread > 0).sum(), (m + spread < 0).sum()
        out["homeSp"] = hs / max(hs + as_, 1)
        out["awaySp"] = as_ / max(hs + as_, 1)
    return out


def blended(ph, pa, spread, total, w_total, w_spread):
    tot, mar = ph + pa, ph - pa
    if total is not None:
        tot = tot * (1 - w_total) + total * w_total
    if spread is not None:
        mar = mar * (1 - w_spread) + (-spread) * w_spread
    return max((tot + mar) / 2, 0.0), max((tot - mar) / 2, 0.0)


# ----------------------------------------------------------------------
# data
# ----------------------------------------------------------------------
def pull_lines(season):
    """game id -> (spread, total, book) using the same book preference."""
    out = {}
    rows = R.get("/lines", year=season, seasonType="regular")
    for row in rows:
        lines = R.pick(row, "lines", default=[]) or []
        chosen = None
        for book in BOOKS:
            chosen = next((l for l in lines if R.pick(l, "provider") == book), None)
            if chosen and R.pick(chosen, "spread") is not None:
                break
            chosen = None
        if chosen is None:
            chosen = next((l for l in lines if R.pick(l, "spread") is not None), None)
        if chosen is None:
            continue
        sp = R.pick(chosen, "spread")
        ou = R.pick(chosen, "over_under", "overUnder")
        out[R.pick(row, "id")] = (float(sp) if sp is not None else None,
                                  float(ou) if ou is not None else None,
                                  R.pick(chosen, "provider"))
    return out


def ratings_through(prior_games, prior_drives, cur_games, cur_drives, upto_week):
    """Ratings the live tool would have had going into `upto_week`."""
    played = [g for g in cur_games if g["week"] < upto_week]
    p_off, p_def, p_ppd, p_drv = R.fit(prior_games, prior_drives)
    p_pace, _ = R.fit_pace(prior_games, prior_drives)
    if played:
        c_off, c_def, c_ppd, c_drv = R.fit(played, cur_drives)
        c_pace, _ = R.fit_pace(played, cur_drives)
        n = R.games_played(played)
    else:
        c_off, c_def, c_pace, n = {}, {}, {}, {}
        c_ppd, c_drv = p_ppd, p_drv
    off = R.blend(c_off, p_off, n)
    dfn = R.blend(c_def, p_def, n)
    pace = R.blend(c_pace, p_pace, n)
    w = len(played) / (len(played) + 200.0)
    return {
        "league": {"ppd": w * c_ppd + (1 - w) * p_ppd, "drives": w * c_drv + (1 - w) * p_drv},
        "teams": {t: {"off": off.get(t, 1.0), "def": dfn.get(t, 1.0), "pace": pace.get(t, 1.0)}
                  for t in set(off) | set(dfn) | set(pace)},
    }


# ----------------------------------------------------------------------
# run
# ----------------------------------------------------------------------
def pull_talent(season):
    """CFBD team talent composite (recruiting-based). Optional; {} if unavailable."""
    try:
        rows = R.get("/talent", year=season)
    except Exception:
        return {}
    out = {}
    for r in rows:
        t = R.pick(r, "school", "team")
        v = R.pick(r, "talent")
        if t is not None and v is not None:
            out[t] = float(v)
    return out


def pull_neutral(season):
    neutral = {}
    for g in R.get("/games", year=season, seasonType="regular", classification="fbs"):
        neutral[R.pick(g, "id")] = bool(R.pick(g, "neutral_site", "neutralSite", default=False))
    return neutral


def with_neutral(games, neutral):
    return [dict(g, neutral=neutral.get(g["id"], False)) for g in games]


# cache of full-season Bayesian posteriors, used to build next season's prior
_POST = {}
_TALENT = {}


def bayes_season_posterior(season):
    """Full-season posterior summary for `season`, fit with its own carried prior."""
    if season in _POST:
        return _POST[season]
    games = with_neutral(R.pull_games(season), pull_neutral(season))
    prior = bayes_prior_for(season)
    Rb = bayes.fit(games, prior=prior)
    _POST[season] = Rb.summary()
    return _POST[season]


def talent_z(season):
    if season not in _TALENT:
        _TALENT[season] = bayes.zscore(pull_talent(season))
    return _TALENT[season]


def bayes_prior_for(season, depth=0):
    """Prior for `season` = last season's posterior, regressed by a carry
    learned from the two seasons before that. Recurses one level at most."""
    if depth > 1 or season - 1 < 2017:
        return None
    prev = bayes_season_posterior_flat(season - 1)
    if season - 2 >= 2017 and season - 1 != 2020 and season - 2 != 2020:
        pp = bayes_season_posterior_flat(season - 2)
        carry = bayes.learn_carry(pp, prev, cur_talent=talent_z(season - 1))
    else:
        carry = bayes.DEFAULT_CARRY
    return bayes.carry_prior(prev, carry, talent=talent_z(season))


_FLAT = {}
_HYPER = {}


def bayes_season_posterior_flat(season):
    """Full-season posterior with a flat prior (cheap, no recursion)."""
    if season not in _FLAT:
        games = with_neutral(R.pull_games(season), pull_neutral(season))
        Rf = bayes.fit(games)
        _FLAT[season] = Rf.summary()
        _HYPER[season] = {"mu": float(Rf.mu.mean()), "hfa": float(Rf.hfa.mean()), "sigma": float(Rf.sigma.mean())}
    return _FLAT[season]


def run_season(season, vol_guess, model="ppd"):
    print(f"\n=== {season} (fit on {season - 1}) [{model}] ===")
    prior_g = R.pull_games(season - 1)
    prior_d = R.pull_drive_counts(season - 1) if model == "ppd" else {}
    cur_g = R.pull_games(season)
    cur_d = R.pull_drive_counts(season) if model == "ppd" else {}
    lines = pull_lines(season)
    print(f"  {len(prior_g)} prior games, {len(cur_g)} test games, {len(lines)} with lines")

    neutral = pull_neutral(season)
    if model == "bayes":
        b_prior = bayes_prior_for(season)
        b_hyper = _HYPER.get(season - 1)
        cur_gn = with_neutral(cur_g, neutral)
        print(f"  Bayesian prior built from {season - 1} ({len(b_prior or {})} teams)")

    weeks = sorted({g["week"] for g in cur_g})
    records = []            # one per (game, bet, weight)
    errs_t, errs_m = [], []  # pure-model errors, out of sample
    for wk in weeks:
        if model == "bayes":
            played = [x for x in cur_gn if x["week"] < wk]
            Rb = bayes.fit(played, prior=b_prior, hyper=b_hyper)
        else:
            Rw = ratings_through(prior_g, prior_d, cur_g, cur_d, wk)
        for g in [x for x in cur_g if x["week"] == wk]:
            ln = lines.get(g["id"])
            if not ln or ln[0] is None or ln[1] is None:
                continue
            spread, total, _ = ln
            if model == "bayes":
                pr = Rb.project(g["home"], g["away"], neutral=neutral.get(g["id"], False))
                ph, pa = pr["hp"], pr["ap"]
                # volatility for this game = game noise + how unsure we are about the teams
                vol = math.sqrt(2 * pr["sigma"] ** 2 + pr["total_sd_mean"] ** 2)
                unsure = pr["margin_sd_mean"]
            else:
                ph, pa = R.project(g["home"], g["away"], Rw)
                if neutral.get(g["id"]):
                    ph -= R.HFA_POINTS / 2
                    pa += R.HFA_POINTS / 2
                vol, unsure = vol_guess, float("nan")
            errs_t.append((g["hp"] + g["ap"]) - (ph + pa))
            errs_m.append((g["hp"] - g["ap"]) - (ph - pa))
            actual = {"over": g["hp"] + g["ap"] > total, "under": g["hp"] + g["ap"] < total,
                      "homeSp": g["hp"] - g["ap"] + spread > 0, "awaySp": g["hp"] - g["ap"] + spread < 0}
            push = {"over": g["hp"] + g["ap"] == total, "under": g["hp"] + g["ap"] == total,
                    "homeSp": g["hp"] - g["ap"] + spread == 0, "awaySp": g["hp"] - g["ap"] + spread == 0}
            for w in WEIGHTS:
                bh, ba = blended(ph, pa, spread, total, w, w)
                h, a = sim_game(bh, ba, vol)
                for bet, p in bet_probs(h, a, spread, total).items():
                    if push[bet]:
                        continue
                    records.append((w, bet, p, bool(actual[bet]), unsure))
        print(f"  week {wk}: {len(records)} pick-records so far", end="\r")
    print()
    sd = lambda x: float(np.std(x)) if x else float("nan")
    return records, {"games": len(errs_t), "total_sd": round(sd(errs_t), 1),
                     "margin_sd": round(sd(errs_m), 1),
                     "total_mae": round(float(np.mean(np.abs(errs_t))), 1) if errs_t else None,
                     "margin_mae": round(float(np.mean(np.abs(errs_m))), 1) if errs_m else None}


def run_tails(season, vol):
    """Pure-market center, sim shape. Move every line by TAIL_MOVES and record
    said-vs-hit. This is what the alt-line tool depends on."""
    print(f"\n=== {season} tails ===")
    cur_g = R.pull_games(season)
    lines = pull_lines(season)
    print(f"  {len(cur_g)} games, {len(lines)} with lines")
    recs = []            # (kind, move, p, hit)
    for g in cur_g:
        ln = lines.get(g["id"])
        if not ln or ln[0] is None or ln[1] is None:
            continue
        spread, total, _ = ln
        ph, pa = blended(0, 0, spread, total, 1.0, 1.0)     # market-implied score
        h, a = sim_game(ph, pa, vol)
        t, m = h + a, h - a
        at, am = g["hp"] + g["ap"], g["hp"] - g["ap"]
        for k in TAIL_MOVES:
            # over a moved total
            L = total + k
            if at != L:
                over, under = (t > L).sum(), (t < L).sum()
                recs.append(("ou", k, over / max(over + under, 1), at > L))
            # home covers a moved spread (spread is home-team line; +k makes it easier for home)
            S = spread + k
            if am + S != 0:
                hs, as_ = (m + S > 0).sum(), (m + S < 0).sum()
                recs.append(("sp", k, hs / max(hs + as_, 1), am + S > 0))
    return recs


def tail_table(records, kind=None, bins=TAIL_BINS):
    rows = []
    for lo, hi in zip(bins[:-1], bins[1:]):
        sel = [(r[2], r[3]) for r in records if lo <= r[2] < hi and (kind is None or r[0] == kind)]
        if len(sel) < 30:
            continue
        rows.append({"bin": f"{int(lo*100)}-{int(min(hi,1)*100)}%", "n": len(sel),
                     "said": round(100 * sum(p for p, _ in sel) / len(sel), 1),
                     "hit": round(100 * sum(1 for _, h in sel if h) / len(sel), 1)})
    return rows


def calibration_table(records, kind_filter=None):
    """kind_filter: None, 'ou', or 'sp'."""
    rows = []
    for lo, hi in zip(BINS[:-1], BINS[1:]):
        sel = [(r[2], r[3]) for r in records
               if lo <= r[2] < hi and (kind_filter is None or
                                       (kind_filter == "ou") == (r[1] in ("over", "under")))]
        if not sel:
            continue
        rows.append({"bin": f"{int(lo*100)}-{int(min(hi,1)*100)}%", "n": len(sel),
                     "said": round(100 * sum(p for p, _ in sel) / len(sel), 1),
                     "hit": round(100 * sum(1 for _, h in sel if h) / len(sel), 1)})
    return rows


def log_loss(records):
    eps = 1e-6
    return -float(np.mean([math.log(max(r[2], eps)) if r[3] else math.log(max(1 - r[2], eps))
                           for r in records])) if records else float("nan")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true")
    ap.add_argument("--seasons", nargs="*", type=int, default=TEST_SEASONS)
    ap.add_argument("--model", choices=["ppd", "bayes"], default="bayes",
                    help="ppd = original points-per-drive ratings; bayes = hierarchical MCMC ratings")
    ap.add_argument("--tails", action="store_true",
                    help="test the sim's SHAPE: move every market line +/-3..14 pts and check said-vs-hit")
    ap.add_argument("--vol", type=float, default=16.4, help="total volatility for --tails (default 16.4)")
    args = ap.parse_args()

    if args.tails:
        allr = []
        for y in args.seasons:
            allr.extend(run_tails(y, args.vol))
        print("\n================ TAIL CALIBRATION ================")
        print(f"Market center, sim shape, volatility {args.vol}. 'said' = what the alt-line tool would claim.")
        out = {"vol": args.vol, "seasons": args.seasons, "n": len(allr)}
        for label, kind in (("Totals (over a moved total)", "ou"), ("Spreads (home covers a moved spread)", "sp")):
            print(f"\n  {label}:")
            out[kind] = tail_table(allr, kind)
            for row in out[kind]:
                gap = row["hit"] - row["said"]
                flag = "" if abs(gap) < 2.5 else ("  <-- sim too confident" if (row["said"] > 50) == (gap < 0) else "  <-- sim too timid")
                print(f"    said {row['bin']:>7}  (avg {row['said']:5.1f}%)  hit {row['hit']:5.1f}%  n={row['n']}{flag}")
        # by move size, so we see where it breaks
        out["by_move"] = {}
        for label, kind in (("Totals: over, with the total moved by", "ou"), ("Spreads: home covers, with the spread moved by", "sp")):
            print(f"\n  {label}:")
            for k in TAIL_MOVES:
                sel = [r for r in allr if r[1] == k and r[0] == kind]
                if not sel:
                    continue
                said = 100 * np.mean([r[2] for r in sel]); hit = 100 * np.mean([r[3] for r in sel])
                out["by_move"][f"{kind}{k:+d}"] = {"said": round(said, 1), "hit": round(hit, 1), "n": len(sel)}
                gap = hit - said
                flag = "" if abs(gap) < 2.5 else "  <-- off"
                print(f"    {k:+3d} pts: said {said:5.1f}%  hit {hit:5.1f}%  n={len(sel)}{flag}")
        with open("calibration_tails.json", "w") as f:
            json.dump(out, f, indent=1)
        print("\nWrote calibration_tails.json")
        print("If 'hit' tracks 'said' within ~2 points at every rung, the alt-line tool can be trusted.")
        print("If the sim is too confident at the ends, we widen it (try --vol 17.5); too timid, narrow it.")
        return

    if args.check:
        for y in args.seasons:
            try:
                n = len(pull_lines(y))
                print(f"{y}: {n} games with a spread")
            except SystemExit as e:
                print(f"{y}: {e}")
        return

    # First pass volatility: use the in-sample number as the guess, then report
    # the out-of-sample one. (The sim's spread barely changes the ranking.)
    vol_guess = 13.6
    all_records, per_season = [], {}
    for y in args.seasons:
        recs, acc = run_season(y, vol_guess, model=args.model)
        per_season[y] = acc
        all_records.extend(recs)
        print(f"  out-of-sample: totals SD {acc['total_sd']}, margins SD {acc['margin_sd']}, "
              f"MAE {acc['total_mae']} / {acc['margin_mae']}")

    print("\n================ RESULTS ================")
    tsd = [a["total_sd"] for a in per_season.values() if a["games"]]
    msd = [a["margin_sd"] for a in per_season.values() if a["games"]]
    true_vol = round(float(np.mean(tsd)), 1) if tsd else None
    print(f"True volatility (use this in the tool): totals {true_vol}, margins {round(float(np.mean(msd)),1) if msd else None}")

    out = {"model": args.model, "seasons": per_season, "true_total_sd": true_vol, "weights": {}}
    best_w, best_ll = None, 1e9
    for w in WEIGHTS:
        recs = [r for r in all_records if r[0] == w]
        ll = log_loss(recs)
        out["weights"][str(w)] = {"log_loss": round(ll, 4),
                                  "all": calibration_table(recs),
                                  "ou": calibration_table(recs, "ou"),
                                  "sp": calibration_table(recs, "sp")}
        if ll < best_ll:
            best_ll, best_w = ll, w
        print(f"\n--- market weight {w:.2f}   (log loss {ll:.4f}, lower is better; 0.6931 = coin flip) ---")
        for label, key in (("Over/Under", "ou"), ("Spreads", "sp")):
            print(f"  {label}:")
            for row in out["weights"][str(w)][key]:
                flag = "" if abs(row["said"] - row["hit"]) < 3 else "  <-- off"
                print(f"    said {row['bin']:>7}  (avg {row['said']:5.1f}%)  hit {row['hit']:5.1f}%  n={row['n']}{flag}")

    out["recommended_weight"] = best_w

    if args.model == "bayes":
        # Does confidence matter? Split the pure-model picks by how unsure the
        # ratings were about the matchup (posterior sd of the projected margin).
        recs = [r for r in all_records if r[0] == 0.0 and not math.isnan(r[4])]
        if recs:
            cut = float(np.median([r[4] for r in recs]))
            sure = [r for r in recs if r[4] <= cut]
            unsure = [r for r in recs if r[4] > cut]
            out["confidence_split"] = {"cut_margin_sd": round(cut, 2),
                                       "sure": calibration_table(sure), "unsure": calibration_table(unsure)}
            print(f"\n--- pure model, split by confidence (margin uncertainty <= {cut:.1f} pts = 'sure') ---")
            for label, rs in (("Sure picks", sure), ("Unsure picks", unsure)):
                print(f"  {label} (log loss {log_loss(rs):.4f}):")
                for row in calibration_table(rs):
                    flag = "" if abs(row["said"] - row["hit"]) < 3 else "  <-- off"
                    print(f"    said {row['bin']:>7}  (avg {row['said']:5.1f}%)  hit {row['hit']:5.1f}%  n={row['n']}{flag}")

    fname = "calibration.json" if args.model == "bayes" else f"calibration_{args.model}.json"
    with open(fname, "w") as f:
        json.dump(out, f, indent=1)
    print(f"\nBest single blend weight by log loss: {best_w}")
    print(f"Wrote {fname}")
    print("\nHow to read it: in each row, 'said' is what the tool would have claimed and 'hit' is what happened.")
    print("If 'hit' is consistently below 'said', the tool is overconfident at that weight.")


if __name__ == "__main__":
    main()
