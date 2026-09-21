# Clover — project status

Last updated: 2026-09-20 (night). **Row 1, the safety net, is built and live except for the workflow files** (they need Danny's Chrome). Next chat: finish the workflow step if it is still open, then row 2.

**Read order for a new chat:** this file, then `DECISIONS.md` (rules, settled findings, rulings), then the end-state doc. `CHANGELOG.md` is history — read it only when you need the why.
- End-state doc (living; holds the full build order): https://claude.ai/code/artifact/4ca60202-44b4-46b4-bf77-db047f25ef2f
- This file lives at the repo ROOT, not `claude/STATUS.md`. The project instructions still say `claude/`; the root files are the real ones.

## Where things stand
- The live app is the 2026-09-19 redesign plus the 2026-09-20 pipeline (scores, statuses, `results.json`) plus tonight's safety net. History is in `CHANGELOG.md`.
- **`refresh.py` is split** into `refresh.py` (18.8 KB, the conductor) + `cfbd.py` + `nfl.py` + `odds.py` + `ratings_math.py` + `common.py`. All under 20 KB, all pushed by Claude and md5-verified. Old and new code were run against the same fake feeds and produced a byte-identical slate.
- **A dead feed no longer stops the other league.** CFBD down -> college games carry forward at their last good line, NFL still refreshes, `R.stale` names the league, and the page's Last refresh tag adds **"API ISSUE — College lines last updated <time>"** in red (Danny's wording). Same for the NFL if the-odds-api dies. `lines_generated` only moves on a fresh pull, so the clock never lies.
- **`health.json`** (new, written every run): CFBD calls left (asked from CFBD's `/info` every 6 h, Clover's own count as fallback), odds credits left, which feeds are down. Under 500 CFBD calls, under 1,000 odds credits, or a stale league turns the run red **once a day, after the data is saved** - GitHub emails Danny. *Needs the new `refresh.yml` to be committed and to fire.*
- **Tests exist now:** `python ci/checks.py` = file-size guard (fail 24.8 KB, warn 20 KB), stale-word check, 12 Python tests (one replays the 2026-09-20 outage), and a headless page test that proves the page's % equals Python's % and fails on a truncated file. All pass on the exact GitHub copy.
- Fewer CFBD calls: AP poll fetched once per week's poll (kept in `ratings.json`), not hourly. ESPN tried once, not three times; its error page no longer ships in `nfl_diag`.
- **Bug found and fixed:** the Tuesday full refresh started from a blank record, so alt lines and frozen percentages vanished until Thursday. It now carries them over (`CARRY_KEYS` in `refresh.py`).
- **Doc debt (fix first thing next chat):** `DECISIONS.md` > Deploying changes still says `refresh.py` is 56 KB and cannot be pushed. No longer true - every code file is now pushable. Also add there: run `python ci/checks.py` before every push.
- `results.json`: 67 of 72 early rows have `p: null` (frozen before the feature existed). They grade hit/miss but cannot be used for calibration. **Still undecided: drop or keep.** Claude recommends dropping.

## Build order — one chat per row
Kick off the next row with: **"Start row 2: the truth pass."**
1. **Safety net - DONE 2026-09-20, except the workflow step.** Open: (a) `ci.yml` (new) and the edited `refresh.yml` go in through Danny's Chrome after he reviews them - both are staged in the chat's outputs and described in `CHANGELOG.md`; actions are pinned by SHA in those files. Until then the new code runs fine under the old workflow, but `health.json` is not committed and no alarm fires. (b) Orphan deletes approved by Danny but each needs his approval click. (c) 3 unused imports (`calibrate.py` x2, `bayes.py` x1) and `index.html`'s 17 dead CSS rules: built, not pushed - fold into the next change to those files (`calibrate.py` is 24.5 KB, split it then).
2. **Truth pass (next).** Stale words ("ESPN BET", "Slips tab", "See the Card", "Not on my app"/"not on your app", tab title "Clover — The Card", "run refresh.py", "every other Thursday") - `ci/checks.py` holds the list with today's counts; take each to 0 and lower the number there; ruling 1 (no verdict before a real payout); 6-pick returning 4 slips under "Top 6"; filter combinations that silently show 0 games; finished-game contrast (chip 3.48:1 under 78% opacity); hot-slip speed (cache the same-game combos; a narrower beam changed the order for 2- and 5-pick, so confirm that is tie-ordering before shipping it); hot slips stalling in a background tab; `buildSlips` can rank an impossible same-game combo (0%) when the slate is tiny - drop p=0 blocks.
3. **Design direction.** Compare Clover with 4–5 betting apps, mock up 2–3 looks for one screen, Danny picks. Before any screen is rebuilt.
4. **Front door.** Folded filters, today's upcoming games, Hot Slips always open, line-moved flag (if Danny approves it). Mockup first.
5. **Build tab.** Own tab, grid layout, abbreviated team names (options in the mockup). Retires the six-button layout.
6. **My Bet.** "Needs vs. has", full numbers reordered, verdict sized to match, "I placed this". Touch targets under 44 px (N/A, Prohibited, ghost buttons) and arrow keys on tabs. Mockup first.
7. **The bet record.** Save to the Google Sheet, capture the closing line and closing chance (finished games drop their tables, so the closing chance for a pick on a moved line must be saved at kickoff — design detail open), automatic grading.
8. **History.** Record, beat-the-close, Clover's accuracy, Danny vs. Jaclyn, and the overnight AI recap.

## Waiting on Danny
- **One Chrome visit:** review `ci.yml` + `refresh.yml`, then Claude creates them through GitHub's web editor.
- **Approval clicks for the orphan deletes** (approved in chat 2026-09-20): `cache_teams_2026.json`, `probe_odds.py`, `probe_odds.json`, `preview.html`, `.github/workflows/probe.yml`. README rewrite is done.
- **NFL alternate lines every week?** (about 35 credits a week; Claude recommends yes). Asked 2026-09-20, Danny asked what alt lines are, answer given, no decision yet. One flag: `NFL_ALT_EVERY_OTHER_WEEK` in `odds.py`, plus the "every other Thursday" sentence in `preview3.js`.
- **Drop or keep the 67 `p: null` rows** in `results.json`.
- At rows 7–8 only: the Google Sheet script (about 10 minutes, once) and an Anthropic API key stored as a GitHub secret.
- One paste, once: the rewritten project instructions (Claude cannot edit the instructions box). Draft delivered in the row 1 chat.

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
- `refresh.py` — the conductor: `write_upcoming`, `carry_college`, `note_freshness`, `rankings_for`, `carry_history`, `freeze_probs`, `record_results`, `build_ratings`; flags `--lines-only`, `--alt-lines`, `--health-gate`, `--check`, `--check-nfl`. Re-exports the names `calibrate.py` uses.
- `cfbd.py` (college feed; `get` retries + counts calls; raises `CFBDDown`, never exits) · `nfl.py` (ESPN once → odds-api → carry forward; scores) · `odds.py` (`odds_get`, `team_match`, `pull_alt_lines`) · `ratings_math.py` (research-only ratings) · `common.py` (file names, dates, `atomic_write`, `health.json`).
- `ci/` — `checks.py` (the one entry point), `test_refresh.py`, `fixture.py`, `smoke.js`. Run `python ci/checks.py` before every push.
- `health.json` — calls left, credits left, feeds down, today's alert state.
- `calibrate.py`, `bayes.py` — research tools; `calibrate.py` imports `sim.py`.
- `.github/workflows/refresh.yml` — the schedule; commits `ratings.js`, `ratings.json`, `results.json`, `cache_*.json` (and `health.json` once the new file is in). `.github/workflows/ci.yml` (pending) only runs `python ci/checks.py`. `requirements.txt`: requests, numpy.
- Orphans, safe to delete: `cache_teams_2026.json` (superseded by `cache_teaminfo_2026.json`), `probe_odds.py` / `probe_odds.json` (one-time probe, answered in finding 5), `preview.html` (stale duplicate of the pre-2026-09-20 `index.html`; deletion needs Danny's approval).
- `STATUS.md`, `DECISIONS.md`, `CHANGELOG.md` — the three project docs (split 2026-09-20). Keep each under 20 KB.
