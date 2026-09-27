"""props_check.py - research, run by hand: 2025 NFL props, DraftKings' chance vs what happened.

    python props_check.py            # writes props_check_2025.json

Reads props_hist_2025.json (props_backtest.py) and nflverse's free 2025 weekly player
stats + snap counts (downloaded once into $TMPDIR). Per market: DK's no-vig over chance
against the real over rate, a recalibration fit, betting every under at DK's price, and
(anytime TD, Yes price only) the power-method shave. Last part: moving off DK's number with
a normal width fitted on weeks 1-9 and tested on weeks 10-22. Findings: DECISIONS.md 8.
A player DK listed who took a snap but has no stat row counts as 0 (DK grades him);
a player with no snap is void. Nicknames (Kenny/Kenneth) match on last name + first letters.
"""
import csv, json, math, os, re, sys, tempfile, collections, urllib.request
from datetime import datetime, timezone
from statistics import NormalDist

HERE = os.path.dirname(os.path.abspath(__file__))
REL = "https://github.com/nflverse/nflverse-data/releases/download/"
def fetch(path):
    local = os.path.join(tempfile.gettempdir(), os.path.basename(path))
    if not os.path.exists(local):
        urllib.request.urlretrieve(REL + path, local)
    return local

N = NormalDist()
D = json.load(open(os.path.join(HERE, 'props_hist_2025.json')))
DROP_ZEROS = '--drop-zeros' in sys.argv   # sensitivity: leave out snap-but-no-stat rows
ABBR = {"Arizona Cardinals":"ARI","Atlanta Falcons":"ATL","Baltimore Ravens":"BAL","Buffalo Bills":"BUF",
"Carolina Panthers":"CAR","Chicago Bears":"CHI","Cincinnati Bengals":"CIN","Cleveland Browns":"CLE",
"Dallas Cowboys":"DAL","Denver Broncos":"DEN","Detroit Lions":"DET","Green Bay Packers":"GB",
"Houston Texans":"HOU","Indianapolis Colts":"IND","Jacksonville Jaguars":"JAX","Kansas City Chiefs":"KC",
"Los Angeles Rams":"LA","Los Angeles Chargers":"LAC","Las Vegas Raiders":"LV","Miami Dolphins":"MIA",
"Minnesota Vikings":"MIN","New England Patriots":"NE","New Orleans Saints":"NO","New York Giants":"NYG",
"New York Jets":"NYJ","Philadelphia Eagles":"PHI","Pittsburgh Steelers":"PIT","Seattle Seahawks":"SEA",
"San Francisco 49ers":"SF","Tampa Bay Buccaneers":"TB","Tennessee Titans":"TEN","Washington Commanders":"WAS"}

def norm(n):
    n = n.lower().replace('.', '').replace("'", '').replace('-', ' ')
    n = re.sub(r'\b(jr|sr|ii|iii|iv|v)\b', '', n)
    return ' '.join(n.split())

stats = collections.defaultdict(dict)      # game_id -> norm name -> row
games = collections.defaultdict(list)      # frozenset(teams) -> [(week, game_id, away, home)]
for r in csv.DictReader(open(fetch('stats_player/stats_player_week_2025.csv'))):
    stats[r['game_id']][norm(r['player_display_name'])] = r
for gid in stats:
    s, w, a, h = gid.split('_')
    games[frozenset((a, h))].append((int(w), gid, a, h))
played = collections.defaultdict(set)      # game_id -> names with offense snaps
for r in csv.DictReader(open(fetch('snap_counts/snap_counts_2025.csv'))):
    if float(r['offense_snaps'] or 0) > 0 or float(r['st_snaps'] or 0) > 0:
        played[r['game_id']].add(norm(r['player']))

START = datetime(2025, 9, 2, 12, tzinfo=timezone.utc)   # Tue before week 1
def week_of(kick):
    t = datetime.fromisoformat(kick.replace('Z', '+00:00'))
    w = (t - START).days // 7 + 1
    return w   # postseason runs on; the nearest week picks the right meeting

def find_game(ev):
    a, h = ABBR[ev['away']], ABBR[ev['home']]
    cands = games.get(frozenset((a, h)), [])
    w = week_of(ev['kick'])
    return min(cands, key=lambda c: abs(c[0] - w))[1] if cands else None

def val(r, m):
    f = lambda k: float(r[k] or 0)
    return {'pass_yds': f('passing_yards'), 'pass_tds': f('passing_tds'), 'rush_yds': f('rushing_yards'),
            'rec_yds': f('receiving_yards'), 'rec': f('receptions'),
            'any_td': f('rushing_tds') + f('receiving_tds') + f('special_teams_tds')}[m]

def imp(a):
    return 100 / (a + 100) if a > 0 else -a / (-a + 100)

ALIAS = {'drew': 'andrew'}
def lookup(gid, n):
    r = stats[gid].get(n)
    if r is not None: return r
    f, l = n.split(' ', 1) if ' ' in n else (n, '')
    f = ALIAS.get(f, f); hits = []
    for k, v in stats[gid].items():
        f2, l2 = k.split(' ', 1) if ' ' in k else (k, '')
        if l2 == l and (f2.startswith(f) or f.startswith(f2) or f2[:3] == f[:3]):
            hits.append(v)
    if len(hits) == 1:
        audit['nickname_match'] += 1; return hits[0]
    return None

rows, audit = [], collections.Counter()
for ev_id, g in D['games'].items():
    gid = find_game(g)
    if not gid:
        audit['no_game'] += len(g['props']); continue
    wk = int(gid.split('_')[1])
    for m, p, line, o, u in g['props']:
        if p.endswith('D/ST'):
            audit['dst_skipped'] += 1; continue
        n = norm(p)
        r = lookup(gid, n)
        if r is None:
            if n in played[gid]:
                audit['played_no_stats'] += 1
                if DROP_ZEROS: continue
                actual = 0.0
            else:
                audit['void_did_not_play'] += 1; continue
        else:
            actual = val(r, m)
        rows.append(dict(m=m, p=p, line=line, o=o, u=u, a=actual, wk=wk, gid=gid))
print('audit', dict(audit), 'graded rows', len(rows))

def ll(p, y):
    p = min(max(p, 1e-6), 1 - 1e-6); return -(y * math.log(p) + (1 - y) * math.log(1 - p))

def logit(p): return math.log(p / (1 - p))

def fit_recal(ps, ys, it=50):
    """logistic y ~ a + b*logit(p); Newton. returns a, b, se_a, se_b"""
    a, b = 0.0, 1.0
    xs = [logit(p) for p in ps]
    for _ in range(it):
        g0 = g1 = h00 = h01 = h11 = 0.0
        for x, y in zip(xs, ys):
            q = 1 / (1 + math.exp(-(a + b * x))); w = q * (1 - q)
            g0 += y - q; g1 += (y - q) * x; h00 += w; h01 += w * x; h11 += w * x * x
        det = h00 * h11 - h01 * h01
        a += (h11 * g0 - h01 * g1) / det; b += (h00 * g1 - h01 * g0) / det
    return a, b, math.sqrt(h11 / det), math.sqrt(h00 / det)

out = {}
for m in ['pass_yds', 'pass_tds', 'rush_yds', 'rec_yds', 'rec']:
    R = [r for r in rows if r['m'] == m and r['o'] is not None and r['u'] is not None]
    push = [r for r in R if r['a'] == r['line']]
    R = [r for r in R if r['a'] != r['line']]
    ps, ys = [], []
    unders_units = 0.0; vig = []
    for r in R:
        io, iu = imp(r['o']), imp(r['u'])
        vig.append(io + iu - 1)
        p = io / (io + iu); y = 1 if r['a'] > r['line'] else 0
        ps.append(p); ys.append(y)
        pay = (r['u'] / 100) if r['u'] > 0 else (100 / -r['u'])
        unders_units += pay if y == 0 else -1
    n = len(R)
    a, b, sa, sb = fit_recal(ps, ys)
    bands = []
    for lo in [0, .40, .45, .50, .55, .60]:
        hi = {0: .40, .40: .45, .45: .50, .50: .55, .55: .60, .60: 1}[lo]
        s = [(p, y) for p, y in zip(ps, ys) if lo <= p < hi]
        if s:
            bands.append((f'{lo:.2f}-{hi:.2f}', len(s), round(100 * sum(p for p, _ in s) / len(s), 1),
                          round(100 * sum(y for _, y in s) / len(s), 1)))
    out[m] = dict(n=n, pushes=len(push), vig=round(100 * sum(vig) / n, 1),
                  dk_over=round(100 * sum(ps) / n, 1), real_over=round(100 * sum(ys) / n, 1),
                  se_over=round(100 * math.sqrt(.25 / n), 1),
                  ll_dk=round(sum(ll(p, y) for p, y in zip(ps, ys)) / n, 4),
                  ll_coin=round(math.log(2), 4),
                  recal=(round(a, 3), round(b, 2), round(sa, 3), round(sb, 2)),
                  bands=bands, all_unders_roi=round(100 * unders_units / n, 1))

# Anytime TD: Yes price only.
T = [r for r in rows if r['m'] == 'any_td']
tb = []
for lo, hi in [(0, .10), (.10, .20), (.20, .30), (.30, .40), (.40, .50), (.50, .60), (.60, 1)]:
    s = [r for r in T if lo <= imp(r['o']) < hi]
    if s:
        tb.append((f'{lo:.2f}-{hi:.2f}', len(s), round(100 * sum(imp(r['o']) for r in s) / len(s), 1),
                   round(100 * sum(1 for r in s if r['a'] >= 1) / len(s), 1)))
raw = sum(imp(r['o']) for r in T); hit = sum(1 for r in T if r['a'] >= 1)
out['any_td'] = dict(n=len(T), raw_implied=round(100 * raw / len(T), 1), real=round(100 * hit / len(T), 1),
                     scale=round(hit / raw, 3), bands=tb)
# power-method fit: fair = raw**k, choose k so totals match
lo, hi = 1.0, 2.0
for _ in range(60):
    k = (lo + hi) / 2
    if sum(imp(r['o']) ** k for r in T) > hit: lo = k
    else: hi = k
out['any_td']['power_k'] = round(k, 3)
pb = []
for lo_, hi_ in [(0, .10), (.10, .20), (.20, .30), (.30, .45), (.45, 1)]:
    s = [r for r in T if lo_ <= imp(r['o']) ** k < hi_]
    if s:
        pb.append((f'{lo_:.2f}-{hi_:.2f}', len(s), round(100 * sum(imp(r['o']) ** k for r in s) / len(s), 1),
                   round(100 * sum(1 for r in s if r['a'] >= 1) / len(s), 1)))
out['any_td']['power_bands'] = pb

# Moving off DK's number (the app shows a different number): normal width per market,
# fitted on weeks 1-9, tested on weeks 10-22 at DK's line +/- k.
alt = {}
for m, steps in [('pass_yds', [-30, -15, 15, 30]), ('rush_yds', [-20, -10, 10, 20]),
                 ('rec_yds', [-20, -10, 10, 20]), ('rec', [-2, -1, 1, 2]), ('pass_tds', [-1, 1])]:
    R = [r for r in rows if r['m'] == m and r['o'] is not None]
    def mu_of(r, sd):
        io, iu = imp(r['o']), imp(r['u']); p = io / (io + iu)
        return r['line'] + sd * N.inv_cdf(p)
    fit = [r for r in R if r['wk'] <= 9]; test = [r for r in R if r['wk'] > 9]
    best = None
    for sd10 in range(5, 800, 5):
        sd = sd10 / 10; L = 0
        for r in fit:
            for k in steps:
                x = r['line'] + k
                if r['a'] == x: continue
                q = 1 - N.cdf((x - mu_of(r, sd)) / sd); L += ll(q, 1 if r['a'] > x else 0)
        if best is None or L < best[0]: best = (L, sd)
    sd = best[1]; res = []
    for k in steps:
        s = [(1 - N.cdf((r['line'] + k - mu_of(r, sd)) / sd), 1 if r['a'] > r['line'] + k else 0)
             for r in test if r['a'] != r['line'] + k]
        res.append((k, len(s), round(100 * sum(q for q, _ in s) / len(s), 1), round(100 * sum(y for _, y in s) / len(s), 1)))
    alt[m] = dict(sd=sd, test=res)
out['alt'] = alt
out['audit'] = dict(audit)
name = 'props_check_2025%s.json' % ('_dropzeros' if DROP_ZEROS else '')
with open(os.path.join(HERE, name), 'w') as f:
    json.dump(out, f, indent=1)
for m, v in out.items():
    if m not in ('alt', 'audit'):
        print(m, {k: v[k] for k in v if 'bands' not in k})
print('alt', json.dumps(alt))
