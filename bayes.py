#!/usr/bin/env python3
"""
bayes.py - hierarchical Bayesian team ratings for The Card, fit by Gibbs
sampling (Markov chain Monte Carlo).

Model, per game g between home h and away a:

    home_pts = mu + off[h] - def[a] + pace[h] + pace[a] + hfa + noise
    away_pts = mu + off[a] - def[h] + pace[h] + pace[a]       + noise
    noise ~ Normal(0, sigma)

    off[t]  ~ Normal(prior_off[t],  tau_off)
    def[t]  ~ Normal(prior_def[t],  tau_def)
    pace[t] ~ Normal(0,             tau_pace)

Every rating is a full posterior distribution, not a number. tau_* (how much
teams differ) and sigma (game-to-game noise) are learned from the data.

Priors carry over between seasons:  prior_off[t] = rho * last_off[t] + beta * talent_z[t]
where rho (roster turnover) and beta (how much recruiting talent predicts
rating) are learned from consecutive seasons.

Only numpy. Pure conjugate updates, so it's fast: ~1 ms per sweep.
"""

import numpy as np
from collections import defaultdict

SWEEPS = 1500
BURN = 500
THIN = 5


class Ratings:
    """Posterior samples for one fit. Everything is arrays of shape (S, T)."""
    def __init__(self, teams, off, dfn, pace, mu, hfa, sigma):
        self.teams = teams                       # list, index -> name
        self.idx = {t: i for i, t in enumerate(teams)}
        self.off, self.dfn, self.pace = off, dfn, pace
        self.mu, self.hfa, self.sigma = mu, hfa, sigma

    def _row(self, t):
        i = self.idx.get(t)
        return i

    def project(self, home, away, neutral=False):
        """Returns (home_mean, away_mean, sd_of_home_mean, sd_of_away_mean,
        sd_total_mean, sd_margin_mean, sigma). Unknown teams get league average."""
        S = self.off.shape[0]
        z = np.zeros(S)
        ih, ia = self._row(home), self._row(away)
        oh, dh, ph = (self.off[:, ih], self.dfn[:, ih], self.pace[:, ih]) if ih is not None else (z, z, z)
        oa, da, pa = (self.off[:, ia], self.dfn[:, ia], self.pace[:, ia]) if ia is not None else (z, z, z)
        hf = 0.0 if neutral else self.hfa
        h = self.mu + oh - da + ph + pa + hf
        a = self.mu + oa - dh + ph + pa
        return {
            "hp": float(h.mean()), "ap": float(a.mean()),
            "hp_sd": float(h.std()), "ap_sd": float(a.std()),
            "total_sd_mean": float((h + a).std()), "margin_sd_mean": float((h - a).std()),
            "sigma": float(self.sigma.mean()),
        }

    def summary(self):
        """Posterior mean and sd per team, for carrying into the next season."""
        return {t: {"off": float(self.off[:, i].mean()), "off_sd": float(self.off[:, i].std()),
                    "def": float(self.dfn[:, i].mean()), "def_sd": float(self.dfn[:, i].std()),
                    "pace": float(self.pace[:, i].mean())}
                for t, i in self.idx.items()}


def fit(games, prior=None, talent=None, hyper=None, sweeps=SWEEPS, burn=BURN, thin=THIN, seed=0):
    """
    games : list of dicts with home, away, hp, ap, neutral (bool, optional)
    prior : {team: {"off": m, "off_sd": s, "def": m, "def_sd": s}} from last season's
            summary(), already regressed (see carry_prior). None = flat start.
    talent: {team: z-scored talent}, optional; only used via carry_prior.
    hyper : dict of starting hyperparameters (learned anyway).
    """
    rng = np.random.default_rng(seed)
    teams = sorted({g["home"] for g in games} | {g["away"] for g in games} | set((prior or {}).keys()))
    T = len(teams)
    ix = {t: i for i, t in enumerate(teams)}
    G = len(games)
    H = np.array([ix[g["home"]] for g in games])
    A = np.array([ix[g["away"]] for g in games])
    HP = np.array([g["hp"] for g in games], float)
    AP = np.array([g["ap"] for g in games], float)
    NEU = np.array([1.0 - float(g.get("neutral", False)) for g in games])   # 1 = HFA applies

    # priors per team
    p_off_m = np.zeros(T); p_off_s = np.full(T, 10.0)
    p_def_m = np.zeros(T); p_def_s = np.full(T, 10.0)
    has_prior = np.zeros(T, bool)
    if prior:
        for t, p in prior.items():
            if t in ix:
                i = ix[t]
                p_off_m[i], p_off_s[i] = p["off"], p["off_sd"]
                p_def_m[i], p_def_s[i] = p["def"], p["def_sd"]
                has_prior[i] = True

    # starting values
    h = hyper or {}
    mu = h.get("mu", 28.0); hfa = h.get("hfa", 2.5)
    sigma2 = h.get("sigma", 11.7) ** 2
    tau_off2 = h.get("tau_off", 7.0) ** 2
    tau_def2 = h.get("tau_def", 7.0) ** 2
    tau_pace2 = h.get("tau_pace", 2.0) ** 2
    off = p_off_m.copy(); dfn = p_def_m.copy(); pace = np.zeros(T)

    if G == 0:
        # Nothing played yet: the posterior is the prior. Sample it directly.
        S = (sweeps - burn) // thin
        off_s = p_off_m + rng.standard_normal((S, T)) * np.where(has_prior, p_off_s, np.sqrt(tau_off2))
        dfn_s = p_def_m + rng.standard_normal((S, T)) * np.where(has_prior, p_def_s, np.sqrt(tau_def2))
        pace_s = rng.standard_normal((S, T)) * np.sqrt(tau_pace2)
        return Ratings(teams, off_s, dfn_s, pace_s, np.full(S, mu), np.full(S, hfa),
                       np.full(S, np.sqrt(sigma2)))

    n_home = np.bincount(H, minlength=T); n_away = np.bincount(A, minlength=T)
    n_games_t = n_home + n_away

    keep = []
    for s in range(sweeps):
        # --- offense: home score depends on off[H], away score on off[A]
        r_h = HP - (mu + pace[H] + pace[A] + hfa * NEU) + dfn[A]     # = off[H] + noise
        r_a = AP - (mu + pace[H] + pace[A]) + dfn[H]                  # = off[A] + noise
        ssum = np.bincount(H, weights=r_h, minlength=T) + np.bincount(A, weights=r_a, minlength=T)
        # teams with an informative prior use its sd; flat-start teams use the learned tau
        prior_prec = np.where(has_prior, 1.0 / p_off_s ** 2, 1.0 / tau_off2)
        prec = n_games_t / sigma2 + prior_prec
        mean = (ssum / sigma2 + p_off_m * prior_prec) / prec
        off = mean + rng.standard_normal(T) / np.sqrt(prec)
        off -= off.mean()                                              # identifiability

        # --- defense: home score depends on def[A], away on def[H]  (score = ... - def)
        r_h = -(HP - (mu + off[H] + pace[H] + pace[A] + hfa * NEU))    # = def[A] + noise
        r_a = -(AP - (mu + off[A] + pace[H] + pace[A]))                # = def[H] + noise
        ssum = np.bincount(A, weights=r_h, minlength=T) + np.bincount(H, weights=r_a, minlength=T)
        prior_prec = np.where(has_prior, 1.0 / p_def_s ** 2, 1.0 / tau_def2)
        prec = n_games_t / sigma2 + prior_prec
        mean = (ssum / sigma2 + p_def_m * prior_prec) / prec
        dfn = mean + rng.standard_normal(T) / np.sqrt(prec)
        dfn -= dfn.mean()

        # --- pace: appears in both scores of every game the team plays
        r_h = HP - (mu + off[H] - dfn[A] + hfa * NEU)                  # = pace[H] + pace[A] + noise
        r_a = AP - (mu + off[A] - dfn[H])
        # for team t: sum over its games of (r - pace[other]) for both scores
        other_h = pace[A]; other_a = pace[H]
        contrib_home_team = (r_h - other_h) + (r_a - other_h)          # team H's two scores
        contrib_away_team = (r_h - other_a) + (r_a - other_a)          # team A's two scores
        ssum = np.bincount(H, weights=contrib_home_team, minlength=T) + np.bincount(A, weights=contrib_away_team, minlength=T)
        prec = 2.0 * n_games_t / sigma2 + 1.0 / tau_pace2
        mean = (ssum / sigma2) / prec
        pace = mean + rng.standard_normal(T) / np.sqrt(prec)
        pace -= pace.mean()

        # --- mu and hfa
        base_h = off[H] - dfn[A] + pace[H] + pace[A]
        base_a = off[A] - dfn[H] + pace[H] + pace[A]
        res = np.concatenate([HP - base_h - hfa * NEU, AP - base_a])
        prec = 2 * G / sigma2 + 1.0 / 100.0
        mu = (res.sum() / sigma2 + 27.0 / 100.0) / prec + rng.standard_normal() / np.sqrt(prec)
        res_h = HP - base_h - mu
        prec = NEU.sum() / sigma2 + 1.0 / 9.0
        hfa = ((res_h * NEU).sum() / sigma2 + 2.5 / 9.0) / prec + rng.standard_normal() / np.sqrt(prec)

        # --- sigma^2 (game noise), inverse-gamma
        e = np.concatenate([HP - base_h - mu - hfa * NEU, AP - base_a - mu])
        sigma2 = 1.0 / rng.gamma(2 * G / 2 + 2, 1.0 / ((e ** 2).sum() / 2 + 2 * 12.0 ** 2))

        # --- tau^2 (spread of ratings), inverse-gamma with weak prior
        tau_off2 = 1.0 / rng.gamma(T / 2 + 2, 1.0 / ((off ** 2).sum() / 2 + 2 * 6.0 ** 2))
        tau_def2 = 1.0 / rng.gamma(T / 2 + 2, 1.0 / ((dfn ** 2).sum() / 2 + 2 * 6.0 ** 2))
        tau_pace2 = 1.0 / rng.gamma(T / 2 + 2, 1.0 / ((pace ** 2).sum() / 2 + 2 * 1.5 ** 2))

        if s >= burn and (s - burn) % thin == 0:
            keep.append((off.copy(), dfn.copy(), pace.copy(), mu, hfa, np.sqrt(sigma2)))

    off_s = np.array([k[0] for k in keep]); dfn_s = np.array([k[1] for k in keep])
    pace_s = np.array([k[2] for k in keep]); mu_s = np.array([k[3] for k in keep])
    hfa_s = np.array([k[4] for k in keep]); sig_s = np.array([k[5] for k in keep])
    return Ratings(teams, off_s, dfn_s, pace_s, mu_s, hfa_s, sig_s)


def learn_carry(prev_summary, cur_summary, prev_talent=None, cur_talent=None):
    """
    How much does last season predict this one?  Fits
        this_off = rho * last_off + beta * talent_z + noise
    on teams present in both. Returns dict(rho_off, beta_off, sd_off, rho_def, ...).
    """
    out = {}
    for key in ("off", "def"):
        x, y, z = [], [], []
        for t, p in prev_summary.items():
            if t in cur_summary:
                x.append(p[key]); y.append(cur_summary[t][key])
                z.append((cur_talent or {}).get(t, 0.0))
        x, y, z = np.array(x), np.array(y), np.array(z)
        if len(x) < 20:
            out[f"rho_{key}"], out[f"beta_{key}"], out[f"sd_{key}"] = 0.6, 0.0, 6.0
            continue
        X = np.column_stack([x, z]) if np.any(z) else x[:, None]
        coef, *_ = np.linalg.lstsq(X, y, rcond=None)
        resid = y - X @ coef
        out[f"rho_{key}"] = float(coef[0])
        out[f"beta_{key}"] = float(coef[1]) if len(coef) > 1 else 0.0
        out[f"sd_{key}"] = float(resid.std())
    return out


def carry_prior(prev_summary, carry, talent=None):
    """Turn last season's posterior into this season's prior."""
    prior = {}
    for t, p in prev_summary.items():
        tz = (talent or {}).get(t, 0.0)
        prior[t] = {
            "off": carry["rho_off"] * p["off"] + carry["beta_off"] * tz,
            "off_sd": float(np.sqrt(carry["sd_off"] ** 2 + (carry["rho_off"] * p["off_sd"]) ** 2)),
            "def": carry["rho_def"] * p["def"] + carry["beta_def"] * tz,
            "def_sd": float(np.sqrt(carry["sd_def"] ** 2 + (carry["rho_def"] * p["def_sd"]) ** 2)),
        }
    return prior


DEFAULT_CARRY = {"rho_off": 0.6, "beta_off": 0.0, "sd_off": 6.0,
                 "rho_def": 0.6, "beta_def": 0.0, "sd_def": 6.0}


def zscore(d):
    if not d:
        return {}
    v = np.array(list(d.values()), float)
    s = v.std() or 1.0
    return {k: (x - v.mean()) / s for k, x in d.items()}
