# Clover — project status

Last updated: 2026-09-20 (late night). **Rows 1 and 2 are done and live**, except one visual item from row 2 (finished-game contrast) that is waiting on a mockup OK. Next chat: row 3.

**Read order for a new chat:** this file, then `DECISIONS.md` (rules, settled findings, rulings), then the end-state doc. `CHANGELOG.md` is history — read it only when you need the why.
- End-state doc (living; holds the full build order): https://claude.ai/code/artifact/4ca60202-44b4-46b4-bf77-db047f25ef2f
- This file lives at the repo ROOT, not `claude/STATUS.md`. The project instructions still say `claude/`; the root files are the real ones.

## Where things stand
- The live app is the 2026-09-19 redesign plus the 2026-09-20 pipeline (scores, statuses, `results.json`) plus tonight's safety net. History is in `CHANGELOG.md`.
- **`refresh.py` is split** into `refresh.py` (18.8 KB, the conductor) + `cfbd.py` + `nfl.py` + `odds.py` + `ratings_math.py` + `common.py`. All under 20 KB, all pushed by Claude and md5-verified. Old and new code were run against the same fake feeds and produced a byte-identical slate.
- **A dead feed no longer stops the other league.** CFBD down -> college games carry forward at their last good line, NFL still refreshes, `R.stale` names the league, and the page's Last refresh tag adds **"API ISSUE — College lines last updated <time>"** in red (Danny's wording). Same for the NFL if the-odds-api dies. `lines_generated` only moves on a fresh pull, so the clock never lies.
- **`health.json`** (new, written every run): CFBD calls left (asked from CFBD's `/info` every 6 h, Clover's own count as fallback), odds credits left, which feeds are down. Under 500 CFBD calls, under 1,000 odds credits, or a stale league turns the run red **once a day, after the data is saved** - GitHub emails Danny. The new `refresh.yml` went in at 8:30 PM CT (`6c3550f`).
- **Tests exist now:** `python ci/checks.py` = file-size guard (fail 24.8 KB, warn 20 KB), stale-word check, 12 Python tests (one replays the 2026-09-20 outage), and a headless page test that proves the page's % equals Python's % and fails on a truncated file. All pass on the exact GitHub copy, and **the `Checks` workflow ran green on GitHub twice** (`bbd0453`, `6c3550f`). First real refresh on the split code (01:17 UTC) was clean: both leagues fresh, no stale flag, `nfl_diag.errors` = `["ESPN 403"]`.
- Fewer CFBD calls: AP poll fetched once per week's poll (kept in `ratings.json`), not hourly. ESPN tried once, not three times; its error page no longer ships in `nfl_diag`.
- **Bug found and fixed:** the Tuesday full refresh started from a blank record, so alt lines and frozen percentages vanished until Thursday. It now carries them over (`CARRY_KEYS` in `refresh.py`).
- **Row 2, the truth pass (2026-09-20):**
  - Hot slips use an **exact search** now, not a 600-wide beam: 6 slips at every size (5- and 6-pick used to return 4), same order as before in every slot the old search filled, about 10x faster (college 6-pick 1,261 ms -> 132 ms in the sandbox). Same-game combos are priced once per page load, 0% combos are dropped, and there is no timer, so a background tab cannot stall on "Searching".
  - **"Today" follows Game status.** Before, Sunday night's NFL default (Today + Upcoming only) showed nothing. An empty list now names the filter hiding the games.
  - **Ruling 1 is in:** the stand-in payout table is deleted; no verdict on My Bet, the bar or the copied row until a payout is typed.
  - **Every stale word is at 0** and the list in `ci/checks.py` says so. The ESPN BET note now says DraftKings for both leagues; the unmeasured claim "both run close to most pick'em apps" was cut.
  - Page files: CSS moved to `clover.css` (25 dead rules removed), filters moved to `filters.js`. `index.html` 24.8 -> 8.7 KB, `preview1.js` 21.7 -> 13.6 KB. Script tags carry `?v=20260920` - bump it when a script changes.
  - New checks: page wiring (files `index.html` loads exist; ids the scripts ask for exist), 6 slips from a full slate, none at 0%, order, overlap, no verdict before a payout, default view never empty, one-game slate. `smoke.js` loads whatever `index.html` loads.
  - `health.json` confirmed after the first scheduled run on the new workflow (02:17 UTC): 4,982 CFBD calls and 19,954 odds credits left, nothing stale.
- **Open, found in row 2:** NFL games drop off the slate once final (they are graded in `results.json`), so "Final (today)" is always empty for the NFL. `CHANGELOG.md` is at the 20 KB house limit - start `CHANGELOG-2.md` on the next entry.
- `results.json`: 67 of 72 early rows have `p: null` (frozen before the feature existed). They grade hit/miss but cannot be used for calibration. **Still undecided: drop or keep.** Claude recommends dropping.

## Build order — one chat per row
Kick off the next row with: **"Start row 3: design direction."**
1. **Safety net - DONE 2026-09-20.** `ci.yml` and the new `refresh.yml` were created through Danny's Chrome (GitHub web editor; new-file link with `?filename=&value=` for `ci.yml`, `execCommand("insertText")` into the editor for `refresh.yml`), both md5-verified against the reviewed copies. Actions pinned by SHA. Orphans deleted and NFL alt lines switched to weekly the same night. Leftovers: 3 unused imports (`calibrate.py` x2, `bayes.py` x1) - fold into the next change to those files (`calibrate.py` is 24.7 KB, split it then).
2. **Truth pass - DONE 2026-09-20**, except **finished-game contrast**: pick text on a finished card is effectively 1.77:1 (78% card fade x 60% disabled-button fade), score chips 2.46:1. Proposed fix: drop both fades, keep the grey look with solid colors, text `#4F5C57` (5.4:1 or better). CSS only (`clover.css`). Needs a before/after mockup and Danny's OK first.
3. **Design direction (next).** Compare Clover with 4–5 betting apps, mock up 2–3 looks for one screen, Danny picks. Before any screen is rebuilt.
4. **Front door.** Folded filters, today's upcoming games, Hot Slips always open, line-moved flag (if Danny approves it). Mockup first.
5. **Build tab.** Own tab, grid layout, abbreviated team names (options in the mockup). Retires the six-button layout.
6. **My Bet.** "Needs vs. has", full numbers reordered, verdict sized to match, "I placed this". Touch targets under 44 px (N/A, Prohibited, ghost buttons) and arrow keys on tabs. Mockup first.
7. **The bet record.** Save to the Google Sheet, capture the closing line and closing chance (finished games drop their tables, so the closing chance for a pick on a moved line must be saved at kickoff — design detail open), automatic grading.
8. **History.** Record, beat-the-close, Clover's accuracy, Danny vs. Jaclyn, and the overnight AI recap.

## Waiting on Danny
- **OK the finished-game contrast mockup** (row 2 leftover, above).
- **Drop or keep the 67 `p: null` rows** in `results.json`.
- At rows 7–8 only: the Google Sheet script (about 10 minutes, once) and an Anthropic API key stored as a GitHub secret.
- One paste, once: the rewritten project instructions (Claude cannot edit the instructions box). Draft delivered in the row 1 chat.

## Parked
Player props (needs new math, not just new data) · multi-book and Kalshi prices · second truth for tail calibration past 83% (Pinnacle or a `us_ex` exchange) · mobile polish · renaming `preview1/2/3.js` · neutral-site toggle · helmet art · Cowork background-task rule (Danny parked it 2026-09-19).

## LIVE
- **App:** https://skrongman.github.io/Clover/  (share this; works on phone)
- **Repo (workshop):** https://github.com/SKRONGman/Clover
- Schedules (`refresh.yml`): **full ratings weekly Tue 6am CT**; lines hourly **Thu–Mon** 10am–midnight CT; **DK alternate lines Thursdays 10:10am CT, college and NFL** (mode `alt`). Manual: Actions → "Refresh lines" → Run workflow, mode `full` / `lines` / `alt`.
- Secrets: `CFBD_KEY`, `ODDS_KEY`. **Danny upgraded the-odds-api to the 20K tier ($30/mo) on 2026-09-19** and updated `ODDS_KEY`. Credits **reset on the 1st of every month** (confirmed in their FAQ).
- **Credit math, corrected:** cost = **markets × regions**. **Bookmakers do NOT multiply cost** — but **regions do**, and the US is split into four region keys: `us`, `us2`, `us_dfs`, `us_ex`. Adding FanDuel / BetMGM / Caesars is free (all `us`); adding theScore Bet or Hard Rock (`us2`) doubles that call. **NFL alternate lines are weekly since 2026-09-20** (Danny's call; `NFL_ALT_EVERY_OTHER_WEEK = False` in `odds.py`, about 35 credits a week). `ODDS_MIN_REMAINING = 40` stays as a hard stop.
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
- `index.html` — markup only. Loads `clover.css` (all styles) and `preview1.js`, `filters.js`, `preview2.js`, `preview3.js` (classic scripts, shared global scope, that order), and `ratings.js?v=<timestamp>` via a created script tag. CSP meta restricts scripts to self, images to the CFBD logo CDN + `a.espncdn.com`.
- `preview1.js` (data, lookups, slip state) / `filters.js` (filters, what "Today" means) / `preview2.js` (Build your own, the game grid, My Bet) / `preview3.js` (hot slips, line sheet, N/A, wiring, `init`) — split for the transmit limit.
- `sim.py` — **the one football.** `SD_BY_LEAGUE` / `MARGIN_SD_BY_LEAGUE`, `sd_for`, `game_grid`, `Grid.prob`, `Grid.encode/decode`, `attach_sims`. `python sim.py` self-checks the encode/decode round trip.
- `refresh.py` — the conductor: `write_upcoming`, `carry_college`, `note_freshness`, `rankings_for`, `carry_history`, `freeze_probs`, `record_results`, `build_ratings`; flags `--lines-only`, `--alt-lines`, `--health-gate`, `--check`, `--check-nfl`. Re-exports the names `calibrate.py` uses.
- `cfbd.py` (college feed; `get` retries + counts calls; raises `CFBDDown`, never exits) · `nfl.py` (ESPN once → odds-api → carry forward; scores) · `odds.py` (`odds_get`, `team_match`, `pull_alt_lines`) · `ratings_math.py` (research-only ratings) · `common.py` (file names, dates, `atomic_write`, `health.json`).
- `ci/` — `checks.py` (the one entry point), `test_refresh.py`, `fixture.py`, `smoke.js`. Run `python ci/checks.py` before every push.
- `health.json` — calls left, credits left, feeds down, today's alert state.
- `calibrate.py`, `bayes.py` — research tools; `calibrate.py` imports `sim.py`.
- `.github/workflows/refresh.yml` — the schedule; commits `ratings.js`, `ratings.json`, `results.json`, `cache_*.json` and `health.json`; boots the page against the fresh `ratings.js` before committing; last step is the health alarm. `.github/workflows/ci.yml` only runs `python ci/checks.py` on code pushes. `requirements.txt`: requests, numpy.
- `STATUS.md`, `DECISIONS.md`, `CHANGELOG.md` — the three project docs (split 2026-09-20). Keep each under 20 KB.
