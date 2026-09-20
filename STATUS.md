# Clover — project status

Last updated: 2026-09-20 (PIPELINE: finished + live games stay on the board with scores; NFL hourly; results.json grading record. Page files PUSHED and verified; refresh.py + refresh.yml still to upload.)

## The pipeline change (2026-09-20)
Open items 1–3 of the previous list, built as one unit.
- **Pushed and verified live:** `index.html`, `preview1.js`, `preview2.js`, `preview3.js` (commits `510724d`, `ef73c20`, `c6836b7`, `b5b51cd`). Each was fetched back from `origin/main` and md5-checked against the local copy, and the three published JS files were booted together in Node against the real `ratings.js` with games forced to live/final — every render path clean.
- **Still to upload by hand:** `refresh.py` (56 KB — over the ~25 KB the GitHub write tool can transmit in one call) and `.github/workflows/refresh.yml` (**the connector token has no `workflow` scope — GitHub refuses any write under `.github/workflows/` with 403**). Both are staged in `C:\Claude\Clover\github-upload\`.
- **Until `refresh.py` lands, nothing changes on screen** — no game carries `status` or a score yet, so every game reads as upcoming, exactly as before. The new page code is inert until the data arrives. That is by design, not a half-deploy.
- **After uploading `refresh.py`:** Actions → "Refresh lines" → mode `lines`, then check the log for `N upcoming, N in progress, N final (kept 24h)`, the `NFL scores:` line, and `results.json: N newly finished game(s) graded`. **Claude has no tool that can trigger an Actions run or read its log** — that step is Danny's.

### What a game looks like now
Every game in `upcoming` carries `status`: **upcoming / live / final**, and `hp`/`ap` (the score) once it has kicked off. Games stay on the board for **24 hours after kickoff** — not "today", because the server runs on UTC and a calendar-day rule would drop Saturday night's finals while it is still Saturday evening in Texas (`RECENT_HOURS` in `refresh.py`).
- A kicked-off game **keeps the line it closed at** (`carry_history` re-freezes it from the previous file every run — the feed's line can drift after kickoff and that is not what the picks were priced at).
- A kicked-off game **loses its 20,000-run table**. That is ~5 KB a game; keeping them would have roughly doubled `ratings.js` on a Saturday night (400 KB → 700 KB) to answer questions the final score already answers.
- What survives instead is `g.p` — the **six frozen percentages** (`homeML/awayML/homeSp/awaySp/over/under`) as of the last pre-kickoff refresh, ~60 bytes. That is what the page shows on a finished card, and it is the number any later calibration check has to use.
- **`S.legs` now carry `p0`**: what Clover said about that pick *at the moment you tapped it*. Stored in `cloverSlip`, not in the lines file. This is the single field that makes bet tracking testable later (open item 4) — without it you can never ask whether the 47% picks land 47% of the time.

### On screen
- **Build your own**: a kicked-off game dims, its six picks lock, and the header becomes score chips + kickoff time + status. Team colors while live, **grey once final** — color means "this is still moving". The home chip darkens automatically when the two teams' colors are too close to tell apart (Georgia/Alabama crimson); `R.colors2` (CFBD `alt_color`) supplies the chip text color, falling back to white when contrast is under 3.5:1.
- **My Bet**: cells on a started game are locked, and a settled leg is marked WON or LOST from the score. The big number drops settled legs out of the math and reads *the chance the remaining legs hit* — "2 legs in, chance the other 1 lands". Any lost leg ⇒ 0% and "Lost".
- **Hot slips are unaffected** — they only ever search games that still have a table.
- **No hit/miss grading on screen** (Danny, 2026-09-19): the user has no reason to see the whole board graded. It is recorded on the back end instead.

### results.json — the calibration record
New file, written by `refresh.py`, committed by the workflow, **never shipped to the page**. One row per finished game: final score, closing line, and for each of the six picks its line, Clover's frozen %, and hit/miss/push. Append-only and deduped by game id, because `ratings.json` is overwritten every refresh and this has to outlive it. ~55 rows a college Saturday.

### Cost
- **NFL hourly**: `NFL_ODDS_MIN_HOURS` 20 → **0**. The throttle was a free-tier relic. ~2 credits/pull × ~14 runs/day × 5 days ≈ 140/week.
- **NFL scores**: the-odds-api `/scores?daysFrom=1` = **2 credits** (1 without `daysFrom`, but `daysFrom` is what includes completed games). Only called when a kicked-off NFL game exists, so quiet days cost nothing. ~30/day on an NFL Sunday.
- **College scores cost nothing** — CFBD's `/games` call `pull_upcoming` already makes returns `home_points`/`away_points`/`completed`. No new endpoint.

### Verified offline, NOT yet against the live APIs
`grade_leg`, `leg_line`, `freeze_probs`, `record_results`, `carry_history`, `status_for` all unit-tested against a synthetic finished game; the whole page was loaded in Node against the real `ratings.js` with games forced to live/final — settle, split, frozen-% lookup, chip colors, and every render path run clean. **What is unverified: CFBD's `completed` field name** (`pick()` is used defensively) and **the odds-api `/scores` response shape**. First run after upload: check the log for the `upcoming / in progress / final` line and the `NFL scores:` line.

### The app is now FOUR files
`index.html` + `preview1.js` + `preview2.js` + **`preview3.js`** (new). The split moved: preview1 = data/filters/odds math/state, preview2 = build-your-own + card grid, preview3 = hot slips/line sheet/N-A/wiring/boot. Reason is unchanged — the 25 KB inline transmit limit, which both old files had grown past. `legRow()` (dead since the redesign) was deleted in the same pass. **All four load in order in `index.html`; they share one global scope.**

## The 2026-09-19 redesign — LIVE
Promoted to `index.html` at commit `7ff7085`, byte-identical to the preview Danny tested. **The app is now three files:** `index.html` (markup + CSS, 23 KB) loading `preview1.js` (data, filters, odds math, state, build-your-own) and `preview2.js` (card grid, hot slips, line sheet, N/A, boot). The split exists because Claude's GitHub write tool takes file contents inline and a 70 KB single file cannot be transmitted intact — see "Deploying changes". **The `preview*.js` names are a leftover; renaming them is cosmetic cleanup, not urgent, and `index.html` must be updated in the same pass if they are renamed.**

### What changed
- **Header:** tagline gone. Reload gone (it only called `location.reload()` — it never fetched lines; new lines only arrive when Actions commits). The stamp now reads `Last refresh — Sat 1:12 PM (14m ago)`, sits beside "Clover", and uses the **newer** of `lines_generated` vs `alt_generated`.
- **Three tabs:** `NCAA Slips` / `NFL Slips` / `My Bet` (was Slips / The Card). The league switch is gone — tabs drive it. Game counts live in the tab labels. **A slip can still mix leagues**; My Bet tags each game College/NFL when mixed.
- **Filters, per league, saved separately per tab** (`cloverFilters`). Row 1: Filters + Conference + (Classification | Division). Row 2: Date / Game time / Game status. Row 3: Clear All Filters + Clear N/A.
  - **Conference** is a dropdown for college (11+ conferences won't fit as buttons) and AFC/NFC buttons for the NFL.
  - **Division** is North/South/East/West buttons that **combine** with the conference buttons (AFC + South = AFC South). Not eight buttons — they don't fit. Matching is on the tail of `home_div`/`away_div`.
  - **Game status** is a dropdown (Upcoming only / In progress / Final (today) / All statuses), default **Upcoming only**. Three chip groups would not fit one row.
- **Date** defaults to **today, rolling forward to the next day that has games** (`defaultDayKey`). Dynamic label: "Today (Sat 9/19)" or the rolled-forward date. "This weekend" survives as a choice. "All upcoming dates" renamed **"Any date"** because once finished games ship it will no longer be upcoming-only.
- **Hot slips** are collapsible (state in `cloverHotOpen`) and the subhead says "searches all upcoming games".
- **The card is a Winner / Spread / Total grid**, teams as rows, **Over on the home row, Under on the away row** (same pattern Underdog uses in its list view). Tapping any cell adds or removes that pick — that is what "tap to edit" means now. Green check + tinted cell marks the pick. Rank badge, payout line and `est.` chip are gone from hot slip heads; the head reads `98% Win Rate Probability`. Used by **both** hot slips and My Bet (`legGroups`).
- **The −/+ nudge buttons are gone from the card.** The line sheet is still reachable: any selected spread/total gets a chip below the grid ("Indiana −38.5 · all lines") that opens it.
- **"Not on my app" → "N/A"**, and N/A now blocks a **whole market for that game** (one button per column blocks both sides), which is how a book actually behaves. Clear N/A moved up into the filters.

### Filters: which ones Hot Slips obey — CONFIRMED 2026-09-19
The old rule ("all filters apply to both") is **split**. Hot Slips always search all **upcoming** games so a thin Thursday or a bowl-season Tuesday can't starve the search (`hotGames()`).

| Filter | Build Your Own | Hot Slips |
| --- | --- | --- |
| Date | applies | **ignored** |
| Game status | applies | **ignored** (upcoming only) |
| Game time | applies | applies |
| Conference | applies | applies |
| Division | applies | applies |
| FBS / FCS / Top 25 | applies | applies |

### Known gaps in the shipped build
- ~~The Game status filter is inert.~~ **Fixed 2026-09-20** — `refresh.py` now ships `status` on every game, so In progress / Final (today) / All statuses do something. Still needs a live run to confirm.
- **"Build your own" still uses the old six-button layout.** The grid was only approved for the card. Open item 5.
- ~~`legRow()` is dead code.~~ Deleted 2026-09-20.

## NFL data source (corrected 2026-09-19)
- **ESPN is blocked on GitHub Actions.** `site.api.espn.com/.../nfl/scoreboard` returns `403 Access Denied` on every attempt — all three retries, every hourly run, confirmed across the 2026-09-17 → 09-19 commits. It refuses datacenter IPs. `pull_nfl_upcoming()` still tries first (free, harmless) but has not succeeded on Actions.
- **NFL actually runs on the-odds-api**, via `pull_nfl_from_odds()`: `/events` is free, then one slate-wide `/odds` call for DraftKings spreads+totals costs **2 credits**. Read `nfl_diag.source` in `ratings.js` to see which path ran.
- ~~Still rate-limited to once per 20 hours.~~ **`NFL_ODDS_MIN_HOURS = 0` as of 2026-09-20** — NFL refreshes hourly like college.
- ESPN still supplies NFL **logos** (`a.espncdn.com`, static URLs). Names come from the static `NFL_TEAMS` table, not a feed.
- `refresh.py --check-nfl` prints the raw feed record next to what we parsed.

## LIVE
- **App:** https://skrongman.github.io/Clover/  (share this; works on phone)
- **Repo (workshop):** https://github.com/SKRONGman/Clover
- Schedules (`refresh.yml`): **full ratings weekly Tue 6am CT**; lines hourly **Thu–Mon** 10am–midnight CT; **DK alternate lines Thursdays 10:10am CT** (mode `alt`). Manual: Actions → "Refresh lines" → Run workflow, mode `full` / `lines` / `alt`.
- Secrets: `CFBD_KEY`, `ODDS_KEY`. **Danny upgraded the-odds-api to the 20K tier ($30/mo) on 2026-09-19** and updated `ODDS_KEY`. Credits **reset on the 1st of every month** (confirmed in their FAQ).
- **Credit math, corrected:** cost = **markets × regions**. **Bookmakers do NOT multiply cost** — but **regions do**, and the US is split into four region keys: `us`, `us2`, `us_dfs`, `us_ex`. Adding FanDuel / BetMGM / Caesars is free (all `us`); adding theScore Bet or Hard Rock (`us2`) doubles that call. `NFL_ALT_EVERY_OTHER_WEEK` and `ODDS_MIN_REMAINING = 40` were free-tier guards and can be relaxed.
- Every refresh is a commit → full line history. Sim tables are seeded by game id, so a game whose line didn't move is byte-identical between commits.
- Two workflows pushing at once collide (non-fast-forward) — re-run the loser.

### Deploying changes (updated 2026-09-20)
Claude has **direct GitHub read/write** via the GitHub connector (authenticated as SKRONGman) and pushes straight to `main`. **Never ask Danny to run git or a terminal.** Three hard limits, all confirmed by hitting them:
- **The write tool takes file contents inline** — it cannot read from Claude's workspace. Anything over roughly **25 KB must be split into multiple files** or it truncates mid-call, and a truncated file still commits successfully and silently breaks the app. That is why the app is four files. **`refresh.py` is 56 KB and therefore cannot be pushed at all** — splitting it into modules under 25 KB each is the fix, and it should be done before the next change to it (see open item 3).
- **`.github/workflows/` is refused with 403** — "Resource not accessible by integration". The connector token lacks the `workflow` scope, and no phrasing gets around it. Workflow edits are a manual upload, every time.
- **Claude cannot trigger or read GitHub Actions runs**, and cannot read or set Secrets. Running a refresh and reading its log is Danny.
- **Always verify a push.** Best method: `git clone` the repo into the workspace (public read works from the sandbox), edit and test there, push via the connector, then `git fetch` and md5 the pushed file against the local one. Used on every file shipped 2026-09-20. **Verification is not a formality — it caught a dropped settled rule in the first STATUS.md push of 2026-09-19.**
- Claude **cannot reach `skrongman.github.io`** from its sandbox (egress allowlist) — it can never confirm the live page renders. Danny checks.
- **File deletions require Danny's approval** in the UI; Claude's delete call is refused without it.
- The connector must be toggled on for each chat session, not just authorized at the account level.
- Anything that needs CFBD / ESPN / the-odds-api.com runs on Actions only.

## What Clover is (plain English)
**An app, not an agent or bot.** One web page fed by `refresh.py`. You tap picks onto a slip; it tells you the true chance the slip hits and whether the payout is worth it, in one word. It does not predict winners, act on its own, or place bets. Covers **college (FBS) and NFL** — winners, spreads, totals.

### Architecture (since the 2026-09-08 rebuild — "option B")
- **Two leagues, one list.** Every game in `upcoming` carries `league: "ncaaf" | "nfl"`. College slate + lines from CFBD. **NFL slate + lines from the-odds-api (DraftKings)** — see "NFL data source". No NFL rating model — the sim centers on the line, so none is needed.
- **The page never simulates.** `refresh.py` → `sim.py` plays every lined game out 20,000 times (centered on the market line; college SD 15.2, NFL total SD 13.1 / margin SD 11.7) and ships a sparse (total, margin) table per game in `ratings.js` (`g.sim`, ~5 KB/game, varint+base64). Every % on every screen is a lookup in that table — identical on every device, identical across screens, and it is the same code `calibrate.py` certifies. **A game that has kicked off carries no table** — only the six frozen percentages it was priced at.
- **Hot slips are built in the page** (beam search over the tables) so N/A feedback reshuffles instantly. Top 6, no two share more than half their picks. Built per league.
- `ratings.js` carries only what the page needs (slate, lines, alt lines, sims, logos, colors). `ratings.json` keeps everything incl. team ratings + accuracy (research). `results.json` is the append-only grading record.
- Games with no line are not offered (nothing to center on).
- One `slip` object in JS state (`cloverSlip`, keyed by game id). Every screen reads/writes it. Spread lines are always the side's OWN number, everywhere.
- **ONE VERDICT SCALE EVERYWHERE — per $1 of expected value: Great ≥ +15¢ / Good ≥ +5¢ / Coin toss ≥ −5¢ / Bad ≥ −20¢ / Terrible.** Lives in `grade()` in `preview1.js`. Do not change it in one place only.
- **Prohibited** logs a same-game pair the app wouldn't allow, to `udProhibited`. Notebook only — it does NOT change the picks.

## ⚠️ SETTLED FINDINGS — READ FIRST
1. **No rating model beats the closing line** (2 models, ~5,000 games, 2019+2021–2025, out-of-sample): PPD log loss 0.802; Bayesian MCMC 0.754; market 0.6933 vs coin-flip 0.6931. **Do not retry.** Sims are centered on the market line.
2. **The college sim's SHAPE is verified** (`calibrate.py --tails`): within 1–2.5 pts at every rung 19%–83%. `DEFAULT_SD = 15.2` (in `sim.py`). Cross-check 2026-09-07: FSU ML sim 42% / SMU 58%; DK devigged ≈ 43 / 57.
2b. **NFL sim verified 2026-09-11** (`calibrate.py --nfl games.csv --tails`, nflverse closing lines, 1,615 games 2019+2021–2025): totals within 2.3 pts at every rung 14–88%; spreads within 3 pts at every rung 11–89%, the residual being a real-world −1.4 pt lean (home teams cover 48.6% at the closing line in this era) that we do NOT model (finding 4). Real NFL games are tighter than the drive engine can produce alone (floor SD ≈ 13.7): real total SD 13.1, margin SD 12.7 (fat-tailed; body calibrates at 11.7). So `sim_game` scales NFL deviations to `NFL_SD = 13.1` / `NFL_MARGIN_SD = 11.7`; college untouched. Calibrating a league = `--scan` a few widths, then `--tails` on the best. Results in `calibration_tails_nfl.json`.
3. Edge is NOT predicting games; it is (a) alt-line pricing, (b) correlated same-game picks, (c) player props (next phase).
4. Weather / injuries / lineups / news / HFA / polls are already priced into the line. Adding them on top double-counts. Danny agreed.
5. **The Odds API — updated 2026-09-19 from their published bookmaker list.**
   - **Underdog has NO game-level lines. Confirmed, not inferred:** Underdog is listed under **US DFS sites** (region `us_dfs`), which the API covers for **player props only**. It is not a sportsbook in this feed. This killed the "filter by sportsbook" idea per Danny's own condition.
   - **Underdog player props ARE available** (region `us_dfs`, key `underdog`) — this supersedes the old "Underdog inconclusive" note. Their note: selections with non-default multipliers (not x1) land in `_alternate` markets. PrizePicks, DraftKings Pick6 and Dabble are in the same region.
   - **The 20K tier unlocked Caesars (`williamhill_us`) and Fanatics** — both are marked paid-only.
   - **Pinnacle is available** (region `eu`, "odds are from public website which may incur a delay"), and there is a **US exchange region** (`us_ex`): Novig, ProphetX, Kalshi, Polymarket. Exchanges run at near-zero vig, so their price is a cleaner read on true probability than DK devigged — a better yardstick for the tail-calibration idea (Open item 9).
   - **Alternate spreads + totals: YES** (DK 84 rungs), pulled weekly, DK only. The `alternate_*` markets do NOT include DK's main line, so `pull_alt_lines` also pulls `spreads,totals` for DK in one slate-wide call and merges them in.
   - **Scores endpoint: 1 credit, or 2 with `daysFrom`** (which is what includes completed games). Used for NFL finals; college scores come free with CFBD's `/games` call.
6. **ESPN's public scoreboard does not work from GitHub Actions** (403, datacenter IPs). Don't "fix" it — the fallback is already in place.

## Danny's directives
- **Desktop-first — re-confirmed 2026-09-19.** Mobile-first was proposed 2026-09-13 and declined: the app renders fine on his laptop and iPhone. **Do not re-litigate.**
- Rookie weekend gamblers. Simple beats complete. Not Underdog-specific. Likes 3-pick slips.
- Hot Slips = highest win probability, no payout floor. He manages bankroll.
- Prohibited feedback = notate only until many confirmed examples.
- **Mock up before building.** For any change to a screen area (header, filters, hot slips, card), show a mockup and get agreement first. The 2026-09-19 redesign was agreed on a Design canvas before a line of code was written, and it saved rework.
- **Don't hand Danny GitHub chores Claude can do itself** (2026-09-20, emphatically). Claude has write access: push, verify, and report. Only the three limits under "Deploying changes" — oversized files, `.github/workflows/`, and triggering Actions — are his, and each should be named with the reason, not as a to-do list.
- Novice coder — never ask him to run git or a terminal.
- `PAYOUT` table (1→1.909, 2→3x, 3→6x, 4→10x, 5→20x, 6→25x) is a stand-in — the page asks for the real payout on My Bet.
- Streamlit rejected. GitHub Actions + Pages chosen instead.
- Skip the "Odds API Automation" MCP wrapper (Composio middleman) — asked twice, answered twice.
- `theoddsapi.com` (no hyphens) is a look-alike service — ignore that account.
- Wants Clover built to a professional-grade product standard — sleek, efficient, accurate.
- **Parked:** a standing rule that recurring, well-defined tasks get reviewed as Cowork background candidates. Danny added it 2026-09-19 then parked it until the redesign shipped. Revisit when he raises it.

## Components (in repo)
- **This file lives at the repo ROOT (`STATUS.md`)**, not `claude/STATUS.md`. The project instructions say `claude/STATUS.md`; the root file is the real one.
- `index.html` — markup + CSS only. Loads `preview1.js`, `preview2.js`, `preview3.js` (classic scripts, shared global scope), and `ratings.js?v=<timestamp>` via a created script tag. CSP meta restricts scripts to self, images to the CFBD logo CDN + `a.espncdn.com`.
- `preview1.js` / `preview2.js` / `preview3.js` — the app logic, split for the transmit limit. See "The app is now FOUR files".
- `sim.py` — **the one football.** `SD_BY_LEAGUE` / `MARGIN_SD_BY_LEAGUE`, `sd_for`, `game_grid`, `Grid.prob`, `Grid.encode/decode`, `attach_sims`. `python sim.py` self-checks the encode/decode round trip.
- `refresh.py` — auto-detects season; caches prior season; `--lines-only`; `--alt-lines`; `--check-nfl`; `pull_nfl` (ESPN → odds-api → carry forward); `pull_nfl_scores`; `carry_history`; `freeze_probs`; `record_results`; calls `sim.attach_sims`; writes atomically.
- `calibrate.py`, `bayes.py` — research tools; `calibrate.py` imports `sim.py`.
- `.github/workflows/refresh.yml` — the schedule; commits `ratings.js`, `ratings.json`, `results.json`, `cache_*.json`. `requirements.txt`: requests, numpy.
- Orphans, safe to delete: `cache_teams_2026.json` (superseded by `cache_teaminfo_2026.json`), `probe_odds.py` / `probe_odds.json` (one-time probe, answered in finding 5), `preview.html` (stale duplicate of the pre-2026-09-20 `index.html`; deletion needs Danny's approval).

## Open items / next
**Next chat**
1. **Upload `refresh.py` and `refresh.yml`, run a `lines` refresh, verify** (see the 2026-09-20 section). Nothing on screen changes until this happens.
2. **Bet tracking.** Danny chose **the Google Sheet** (option B) over browser storage or a database. Capture: app used (DraftKings / Underdog / etc. — a dropdown, since there's no book filter), each leg with its line, wager, projected winnings, boost/promo as % or $, and the settled result **per leg**. Claude's additions Danny hasn't ruled on yet: **the line you actually got vs. the line Clover had**, **timestamp placed**, **the closing line** (beating the close is the only measure that reads true on small samples), who placed it, and a free/promo flag separate from the boost amount. **Clover's probability at placement is now captured automatically** (`leg.p0`) — that one is done.
3. **Split `refresh.py` into modules under 25 KB** so Claude can push it. Natural seams: the NFL block (`NFL_TEAMS`, `NFL_DIVISIONS`, `pull_nfl_*`, `espn_*`), the odds/alt-lines block (`odds_get`, `team_match`, `pull_alt_lines`), and the ratings math (`fit`, `fit_pace`, `blend`, `project`, `backtest`). Do this before the next change to that file.

**Then**
4. **"Build your own" still uses the old six-button layout.** Convert to the grid card for consistency, or decide to leave it.
5. **Multi-book lines** — FanDuel / BetMGM / Caesars cost **no extra credits** (same `us` region). Decide whether picking a book changes the lines Clover prices or only a payout column.
6. **Player props phase.** Both **Underdog** and **PrizePicks** confirmed available (`us_dfs`). NFL props are the bigger market. This is edge (c) in finding 3. Note: props do not fit the (total, margin) table — this needs new math, not just new data.
7. **Rotate the GitHub PAT** — it's in old chat history. Not needed for deploys anymore.
8. **Second truth for tail calibration.** Where a book's devigged chance and our table disagree by >5 pts, which is right? **Pinnacle or a `us_ex` exchange is a sharper yardstick than DraftKings** (finding 5). `results.json` is now accumulating the other half of that answer. Could calibrate tails past 83%. Research, not urgent.
9. Pin the two GitHub Actions (`checkout`, `setup-python`) by commit SHA instead of `@v4`/`@v5`.
10. Delete the orphan files listed under Components (needs Danny's approval in the UI).
11. Rename `preview1.js` / `preview2.js` / `preview3.js` to something production-appropriate — must update `index.html` in the same pass. Cosmetic.
12. Later: neutral-site toggle; helmet art if Danny finds a set he likes.
