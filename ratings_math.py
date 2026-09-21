"""
ratings_math.py - the college team ratings (points per drive, adjusted for
opponent) and the backtest.

RESEARCH ONLY. Settled finding 1: no rating model beats the closing line, so
nothing on the page uses these numbers - every % the page shows comes from
sim.py centered on the market line. calibrate.py uses this code, and
ratings.json keeps the ratings for research. No feeds are called from here.
"""

import math
from collections import defaultdict

# How fast this season's results take over from last season's.
# games_played / (games_played + K). At K=5, one game = 17% current-season weight.
# Early September that's the honest setting. Lower it once you're 6 weeks in.
K_BLEND = 5.0


# How hard a team's own rating shrinks toward league average on thin data.
K_SHRINK = 4.0


# Home field, in points of margin. Split evenly across the two teams.
HFA_POINTS = 2.4


def fit(games, drive_counts, iters=25):
    """
    Points per drive, adjusted for who you played.

        predicted_ppd = league_avg * offense_rating * defense_rating_of_opponent

    Solved by alternating: hold defenses fixed and solve offenses, then flip.
    Ratings are multipliers around 1.0 - 1.20 offense means 20% more points
    per drive than average against an average defense.
    """
    obs = []       # (team, opponent, points, drives)
    for g in games:
        hd = drive_counts.get((g["id"], g["home"]), 0)
        ad = drive_counts.get((g["id"], g["away"]), 0)
        if hd == 0 or ad == 0:
            hd = ad = 12                                # fall back if drives are missing
        obs.append((g["home"], g["away"], g["hp"], hd))
        obs.append((g["away"], g["home"], g["ap"], ad))

    if not obs:
        return {}, {}, 0.0, 12.0

    league_ppd = sum(p for _, _, p, _ in obs) / sum(d for _, _, _, d in obs)
    league_drives = sum(d for _, _, _, d in obs) / len(obs)

    teams = sorted({t for t, _, _, _ in obs})
    off = {t: 1.0 for t in teams}
    dfn = {t: 1.0 for t in teams}

    for _ in range(iters):
        for side, solving in (("off", off), ("def", dfn)):
            num = defaultdict(float)
            den = defaultdict(float)
            for team, opp, pts, drv in obs:
                if side == "off":
                    who, other = team, dfn.get(opp, 1.0)
                else:
                    who, other = opp, off.get(team, 1.0)
                num[who] += pts
                den[who] += league_ppd * other * drv
            for t in teams:
                if den[t] > 0:
                    raw = num[t] / den[t]
                    n = sum(1 for a, b, _, _ in obs if (a == t if side == "off" else b == t))
                    w = n / (n + K_SHRINK)              # thin data pulls toward average
                    solving[t] = w * raw + (1 - w) * 1.0

    return off, dfn, league_ppd, league_drives


def fit_pace(games, drive_counts):
    per = defaultdict(list)
    for g in games:
        for team in (g["home"], g["away"]):
            d = drive_counts.get((g["id"], team), 0)
            if d:
                per[team].append(d)
    if not per:
        return {}, 12.0
    league = sum(sum(v) for v in per.values()) / sum(len(v) for v in per.values())
    pace = {}
    for t, v in per.items():
        n = len(v)
        w = n / (n + K_SHRINK)
        pace[t] = w * ((sum(v) / n) / league) + (1 - w) * 1.0
    return pace, league


def games_played(games):
    n = defaultdict(int)
    for g in games:
        n[g["home"]] += 1
        n[g["away"]] += 1
    return n


def blend(cur, prior, n_games):
    """This season takes over from last season as games accumulate."""
    out = {}
    for t in set(cur) | set(prior):
        n = n_games.get(t, 0)
        w = n / (n + K_BLEND)
        out[t] = round(w * cur.get(t, 1.0) + (1 - w) * prior.get(t, 1.0), 4)
    return out


def project(home, away, R):
    """Returns (home_points, away_points). Same math the tool will use."""
    t = R["teams"]
    lp, ld = R["league"]["ppd"], R["league"]["drives"]
    h = t.get(home, {"off": 1.0, "def": 1.0, "pace": 1.0})
    a = t.get(away, {"off": 1.0, "def": 1.0, "pace": 1.0})
    drives = ld * math.sqrt(h["pace"] * a["pace"])
    hp = lp * h["off"] * a["def"] * drives + HFA_POINTS / 2
    ap = lp * a["off"] * h["def"] * drives - HFA_POINTS / 2
    return max(hp, 0.0), max(ap, 0.0)


def backtest(games, R):
    """
    Project every finished game with these ratings, compare to what happened.
    The spread of those errors IS the volatility number the tool asks for -
    it is not a guess, it is measured.
    """
    te, me = [], []
    for g in games:
        hp, ap = project(g["home"], g["away"], R)
        te.append((g["hp"] + g["ap"]) - (hp + ap))
        me.append((g["hp"] - g["ap"]) - (hp - ap))

    def sd(x):
        m = sum(x) / len(x)
        return math.sqrt(sum((v - m) ** 2 for v in x) / len(x))

    def mae(x):
        return sum(abs(v) for v in x) / len(x)

    return {
        "games": len(games),
        "total_bias": round(sum(te) / len(te), 2),
        "total_sd": round(sd(te), 1),
        "total_mae": round(mae(te), 1),
        "margin_sd": round(sd(me), 1),
        "margin_mae": round(mae(me), 1),
    }
