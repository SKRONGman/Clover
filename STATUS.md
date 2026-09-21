# Clover — project status

Last updated: 2026-09-20 (evening). Refresh is healthy again after a four-hour CFBD outage. End state agreed with Danny; build order set; nothing on the page has changed yet.

**Read order for a new chat:** this file, then `DECISIONS.md` (rules, settled findings, rulings), then the end-state doc. `CHANGELOG.md` is history — read it only when you need the why.
- End-state doc (living; holds the full build order): https://claude.ai/code/artifact/4ca60202-44b4-46b4-bf77-db047f25ef2f
- This file lives at the repo ROOT, not `claude/STATUS.md`. The project instructions still say `claude/`; the root files are the real ones.

## Where things stand
- The live app is the 2026-09-19 redesign plus the 2026-09-20 pipeline (scores, statuses, `results.json`). Both are described in `CHANGELOG.md`.
- A full audit on 2026-09-20 found no broken math. It found: zero committed tests, `refresh.py` too big to push, hot slips that freeze the page for 0.2–2.2 s, stale words on screen, a misleading "Great" on estimated payouts, and no protection against a data provider failing.
- **The outage proved the last point.** CFBD returned 429 (monthly calls used up) and `refresh.py` exited before the NFL pull, so both leagues went stale. Danny's $1 tier fixed the quota. The code still exits on any CFBD failure.
- `results.json`: 67 of 72 rows have `p: null` (the 2026-09-19 slate, frozen before the feature existed). They grade hit/miss but cannot be used for calibration. **Still undecided: drop them or keep them.** Claude recommends dropping.

## Build order — one chat per row
Kick off row 1 with: **"Start row 1: the safety net."**
1. **Safety net (next).** Split `refresh.py` (55.7 KB) into modules under 20 KB — seams: NFL block, odds/alt-lines block, ratings math, core. Add `ci/checks.py` with a headless page smoke test, Python tests, a file-size guard and a stale-string check. Three fixes from the outage: a CFBD failure must not stop the NFL pull (carry college forward, mark it stale); fewer CFBD calls per hour (rankings, conferences, logos weekly, not hourly); calls-left and credits-left written to a `health.json` with a loud failure before zero. Retry on CFBD calls; stop retrying ESPN three times an hour and stop shipping its 850 B error page in `nfl_diag`. Remove 3 unused imports and ~35 lines of dead CSS. Then the one thin workflow file, created through Danny's Chrome after he reviews it (see `DECISIONS.md`), and pin actions by SHA in the same visit. Invisible to Danny.
2. **Truth pass.** Stale words ("ESPN BET", "Slips tab", "See the Card", "Not on my app"/"not on your app", tab title "Clover — The Card", "run refresh.py"); ruling 1 (no verdict before a real payout); 6-pick returning 4 slips under "Top 6"; filter combinations that silently show 0 games; finished-game contrast (chip 3.48:1 under 78% opacity); hot-slip speed (cache the same-game combos; a narrower beam changed the order for 2- and 5-pick, so confirm that is tie-ordering before shipping it); hot slips stalling in a background tab.
3. **Design direction.** Compare Clover with 4–5 betting apps, mock up 2–3 looks for one screen, Danny picks. Before any screen is rebuilt.
4. **Front door.** Folded filters, today's upcoming games, Hot Slips always open, line-moved flag (if Danny approves it). Mockup first.
5. **Build tab.** Own tab, grid layout, abbreviated team names (options in the mockup). Retires the six-button layout.
6. **My Bet.** "Needs vs. has", full numbers reordered, verdict sized to match, "I placed this". Touch targets under 44 px (N/A, Prohibited, ghost buttons) and arrow keys on tabs. Mockup first.
7. **The bet record.** Save to the Google Sheet, capture the closing line and closing chance (finished games drop their tables, so the closing chance for a pick on a moved line must be saved at kickoff — design detail open), automatic grading.
8. **History.** Record, beat-the-close, Clover's accuracy, Danny vs. Jaclyn, and the overnight AI recap.

## Waiting on Danny
- **Approve deleting the orphans** when asked: `cache_teams_2026.json`, `probe_odds.py`, `probe_odds.json`, `preview.html`, `.github/workflows/probe.yml`, and a `README.md` that describes an app that no longer exists (rewrite rather than delete).
- **Drop or keep the 67 `p: null` rows** in `results.json`.
- **NFL alt lines weekly and a lower credit floor?** `NFL_ALT_EVERY_OTHER_WEEK = True` and `ODDS_MIN_REMAINING = 40` are free-tier guards; he is on the 20K tier.
- At rows 7–8 only: the Google Sheet script (about 10 minutes, once) and an Anthropic API key stored as a GitHub secret.
- One paste, once: the rewritten project instructions (Claude cannot edit the instructions box). Draft them at the end of row 1.

## Parked
Player props (needs new math, not just new data) · multi-book and Kalshi prices · second truth for tail calibration past 83% (Pinnacle or a `us_ex` exchange) · mobile polish · renaming `preview1/2/3.js` · neutral-site toggle · helmet art · Cowork background-task rule (Danny parked it 2026-09-19).

## LIVE
- **App:** https://skrongman.github.io/Clover/  (share this; works on phone)
- **Repo (workshop):** https://github.com/SKRONGman/Clover
- Schedules (`refresh.yml`): **full ratings weekly Tue 6am CT**; lines hourly **Thu–Mon** 10am–midnight CT; **DK alternate lines Thursdays 10:10am CT** (mode `alt`). Manual: Actions → "Refresh lines" → Run workflow, mode `full` / `lines` / `alt`.
- Secrets: `CFBD_KEY`, `ODDS_KEY`. **Danny upgraded the-odds-api to the 20K tier ($30/mo) on 2026-09-19** and updated `ODDS_KEY`. Credits **reset on the 1st of every month** (confirmed in their FAQ).
- **Credit math, corrected:** cost = **markets × regions**. **Bookmakers do NOT multiply cost** — but **regions do**, and the US is split into four region keys: `us`, `us2`, `us_dfs`, `us_ex`. Adding FanDuel / BetMGM / Caesars is free (all `us`); adding theScore Bet or Hard Rock (`us2`) doubles that call. `NFL_ALT_EVERY_OTHER_WEEK` and `ODDS_MIN_REMAINING = 40` were free-tier guards and can be relaxed.
- Every refresh is a commit → full line history. Sim tables are seeded by game id, so a game whose line didn't move is byte-identical between commits.
- Two workflows pushing at once collide (non-fast-forward) — re-run the loser.
- **CFBD:** Patreon Tier 1, 5,000 calls per calendar month, since 2026-09-20. `CFBD_KEY` replaced the same day.
- **Old GitHub PAT (`ClaudeCloverToken`) deleted by Danny 2026-09-20.** Not replaced; nothing uses one. All three exposed secrets are now dealt with.

## NFL data source (corrected 2026-09-19)
- **ESPN is blocked on GitHub Actions.** `site.api.espn.com/.../nfl/scoreboard` returns `403 Access Denied` on every attempt — all three retries, every hourly run, confirmed again on 2026-09-20. It refuses datacenter IPs. `pull_nfl_upcoming()` still tries first (free, harmless) but has never succeeded on Actions.
- **NFL actually runs on the-odds-api**, via `pull_nfl_from_odds()`: `/events` is free, then one slate-wide `/odds` call for DraftKings spreads+totals costs **2 credits**. Read `nfl_diag.source` in `ratings.js` to see which path ran.
- ~~Still rate-limited to once per 20 hours.~~ **`NFL_ODDS_MIN_HOURS = 0` as of 2026-09-20** — NFL refreshes hourly like college.
- ESPN still supplies NFL **logos** (`a.espncdn.com`, static URLs). Names come from the static `NFL_TEAMS` table, not a feed.
- `refresh.py --check-nfl` prints the raw feed record next to what we parsed.

## Components (in repo)
- **This file lives at the repo ROOT (`STATUS.md`)**, not `claude/STATUS.md`. The project instructions say `claude/STATUS.md`; the root file is the real one.
- `index.html` — markup + CSS only. Loads `preview1.js`, `preview2.js`, `preview3.js` (classic scripts, shared global scope), and `ratings.js?v=<timestamp>` via a created script tag. CSP meta restricts scripts to self, images to the CFBD logo CDN + `a.espncdn.com`.
- `preview1.js` / `preview2.js` / `preview3.js` — the app logic, split for the transmit limit. See "The app is now FOUR files".
- `sim.py` — **the one football.** `SD_BY_LEAGUE` / `MARGIN_SD_BY_LEAGUE`, `sd_for`, `game_grid`, `Grid.prob`, `Grid.encode/decode`, `attach_sims`. `python sim.py` self-checks the encode/decode round trip.
- `refresh.py` — auto-detects season; caches prior season; `--lines-only`; `--alt-lines`; `--check-nfl`; `pull_nfl` (ESPN → odds-api → carry forward); `pull_nfl_scores`; `carry_history`; `freeze_probs`; `record_results`; calls `sim.attach_sims`; writes atomically.
- `calibrate.py`, `bayes.py` — research tools; `calibrate.py` imports `sim.py`.
- `.github/workflows/refresh.yml` — the schedule; commits `ratings.js`, `ratings.json`, `results.json`, `cache_*.json`. `requirements.txt`: requests, numpy.
- Orphans, safe to delete: `cache_teams_2026.json` (superseded by `cache_teaminfo_2026.json`), `probe_odds.py` / `probe_odds.json` (one-time probe, answered in finding 5), `preview.html` (stale duplicate of the pre-2026-09-20 `index.html`; deletion needs Danny's approval).
- `STATUS.md`, `DECISIONS.md`, `CHANGELOG.md` — the three project docs (split 2026-09-20). Keep each under 20 KB.
