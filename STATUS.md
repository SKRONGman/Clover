# Clover — project status

Last updated: 2026-09-19 (REDESIGN SHIPPED — three tabs, new filters, grid card; NFL source corrected; Odds API upgraded to 20K; Underdog props confirmed)

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
- **The Game status filter is inert.** `refresh.py` still deletes kicked-off games, so there is nothing for it to show. `statusOf(G)` reads `G.status` and defaults to `upcoming`. It starts working the moment the pipeline ships finished games. **This is Open item 1.**
- **"Build your own" still uses the old six-button layout.** The grid was only approved for the card. Open item 6.
- `legRow()` is now dead code in `preview2.js` — nothing calls it. Harmless; delete whenever that file is next touched.

## NFL data source (corrected 2026-09-19)
- **ESPN is blocked on GitHub Actions.** `site.api.espn.com/.../nfl/scoreboard` returns `403 Access Denied` on every attempt — all three retries, every hourly run, confirmed across the 2026-09-17 → 09-19 commits. It refuses datacenter IPs. `pull_nfl_upcoming()` still tries first (free, harmless) but has not succeeded on Actions.
- **NFL actually runs on the-odds-api**, via `pull_nfl_from_odds()`: `/events` is free, then one slate-wide `/odds` call for DraftKings spreads+totals costs **2 credits**. Read `nfl_diag.source` in `ratings.js` to see which path ran.
- **Still rate-limited to once per 20 hours** (`NFL_ODDS_MIN_HOURS = 20`), a relic of the free tier. On 20K credits this is no longer necessary — **Open item 2**.
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

### Deploying changes (2026-09-19)
Claude has **direct GitHub read/write** via the GitHub connector (authenticated as SKRONGman) and pushes straight to `main`. **Never ask Danny to run git or a terminal.**
- **The write tool takes file contents inline** — it cannot read from Claude's workspace. Anything over roughly **25 KB must be split into multiple files** or it truncates mid-call, and a truncated file still commits successfully and silently breaks the app. That is why the app is three files.
- **Always verify a push**: download it from `raw.githubusercontent.com/SKRONGman/Clover/<commit-sha>/<file>` and diff against the local copy. Every file shipped 2026-09-19 was md5-verified this way.
- **Claude cannot trigger or read GitHub Actions runs**, and cannot read or set Secrets. Running a refresh and reading its log is Danny (Actions → "Refresh lines" → Run workflow).
- Claude **cannot reach `skrongman.github.io`** from its sandbox (egress allowlist) — it can never confirm the live page renders. Danny checks.
- **File deletions require Danny's approval** in the UI; Claude's delete call is refused without it.
- The connector must be toggled on for each chat session, not just authorized at the account level.
- Anything that needs CFBD / ESPN / the-odds-api.com runs on Actions only.

## What Clover is (plain English)
**An app, not an agent or bot.** One web page fed by `refresh.py`. You tap picks onto a slip; it tells you the true chance the slip hits and whether the payout is worth it, in one word. It does not predict winners, act on its own, or place bets. Covers **college (FBS) and NFL** — winners, spreads, totals.

### Architecture (since the 2026-09-08 rebuild — "option B")
- **Two leagues, one list.** Every game in `upcoming` carries `league: "ncaaf" | "nfl"`. College slate + lines from CFBD. **NFL slate + lines from the-odds-api (DraftKings)** — see "NFL data source". No NFL rating model — the sim centers on the line, so none is needed.
- **The page never simulates.** `refresh.py` → `sim.py` plays every lined game out 20,000 times (centered on the market line; college SD 15.2, NFL total SD 13.1 / margin SD 11.7) and ships a sparse (total, margin) table per game in `ratings.js` (`g.sim`, ~5 KB/game, varint+base64). Every % on every screen is a lookup in that table — identical on every device, identical across screens, and it is the same code `calibrate.py` certifies.
- **Hot slips are built in the page** (beam search over the tables) so N/A feedback reshuffles instantly. Top 6, no two share more than half their picks. Built per league.
- Games with no line are not offered (nothing to center on).
- One `slip` object in JS state (`cloverSlip`, keyed by game id). Every screen reads/writes it. Spread lines are always the side's OWN number, everywhere.

## ⚠️ SETTLED FINDINGS — READ FIRST
1. **No rating model beats the closing line** (2 models, ~5,000 games, 2019+2021–2025, out-of-sample): PPD log loss 0.802; Bayesian MCMC 0.754; market 0.6933 vs coin-flip 0.6931. **Do not retry.** Sims are centered on the market line.
2. **The college sim's SHAPE is verified** (`calibrate.py --tails`): within 1–2.5 pts at every rung 19%–83%. `DEFAULT_SD = 15.2` (in `sim.py`). Cross-check 2026-09-07: FSU ML sim 42% / SMU 58%; DK devigged ≈ 43 / 57.
2b. **NFL sim verified 2026-09-11** (`calibrate.py --nfl games.csv --tails`, nflverse closing lines, 1,615 games 2019+2021–2025): totals within 2.3 pts at every rung 14–88%; spreads within 3 pts at every rung 11–89%, the residual being a real-world −1.4 pt lean (home teams cover 48.6% at the closing line in this era) that we do NOT model (finding 4). Real NFL games are tighter than the drive engine can produce alone (floor SD ≈ 13.7): real total SD 13.1, margin SD 12.7 (fat-tailed; body calibrates at 11.7). So `sim_game` scales NFL deviations to `NFL_SD = 13.1` / `NFL_MARGIN_SD = 11.7`; college untouched. Calibrating a league = `--scan` a few widths, then `--tails` on the best. Results in `calibration_tails_nfl.json`.
3. Edge is NOT predicting games; it is (a) alt-line pricing, (b) correlated same-game picks, (c) player props (next phase).
4. Weather / injuries / lineups / news / HFA / polls are already priced into the line. Adding them on top double-counts. Danny agreed.
5. **The Odds API — updated 2026-09-19 from their published bookmaker list.**
   - **Underdog has NO game-level lines. Confirmed, not inferred:** Underdog is listed under **US DFS sites** (region `us_dfs`), which the API covers for **player props only**. It is not a sportsbook in this feed. This killed the "filter by sportsbook" idea per Danny's own condition.
   - **Underdog player props ARE available** (region `us_dfs`, key `underdog`) — this flips the old "Underdog inconclusive" note. Their note: selections with non-default multipliers (not x1) land in `_alternate` markets. PrizePicks, DraftKings Pick6 and Dabble are in the same region.
   - **The 20K tier unlocked Caesars (`williamhill_us`) and Fanatics** — both are marked paid-only.
   - **Pinnacle is available** (region `eu`, "odds are from public website which may incur a delay"), and there is a **US exchange region** (`us_ex`): Novig, ProphetX, Kalshi, Polymarket. Exchanges run at near-zero vig, so their price is a cleaner read on true probability than DK devigged — a better yardstick for the tail-calibration idea (Open item 9).
   - **Alternate spreads + totals: YES** (DK 84 rungs), pulled weekly, DK only. The `alternate_*` markets do NOT include DK's main line, so `pull_alt_lines` also pulls `spreads,totals` for DK in one slate-wide call and merges them in.
6. **ESPN's public scoreboard does not work from GitHub Actions** (403, datacenter IPs). Don't "fix" it — the fallback is already in place.

## Danny's directives
- **Desktop-first — re-confirmed 2026-09-19.** Mobile-first was proposed 2026-09-13 and declined: the app renders fine on his laptop and iPhone. **Do not re-litigate.**
- Rookie weekend gamblers. Simple beats complete. Not Underdog-specific. Likes 3-pick slips.
- Hot Slips = highest win probability, no payout floor. He manages bankroll.
- Prohibited feedback = notate only until many confirmed examples.
- **Mock up before building.** For any change to a screen area (header, filters, hot slips, card), show a mockup and get agreement first. The 2026-09-19 redesign was agreed on a Design canvas before a line of code was written, and it saved rework.
- Novice coder — never ask him to run git or a terminal. Claude pushes directly.
- `PAYOUT` table (1→1.909, 2→3x, 3→6x, 4→10x, 5→20x, 6→25x) is a stand-in — the page asks for the real payout on My Bet.
- Streamlit rejected. GitHub Actions + Pages chosen instead.
- Skip the "Odds API Automation" MCP wrapper (Composio middleman) — asked twice, answered twice.
- `theoddsapi.com` (no hyphens) is a look-alike service — ignore that account.
- Wants Clover built to a professional-grade product standard — sleek, efficient, accurate.
- **Parked:** a standing rule that recurring, well-defined tasks get reviewed as Cowork background candidates. Danny added it 2026-09-19 then parked it until the redesign shipped. Revisit when he raises it.

## Components (in repo)
- **This file lives at the repo ROOT (`STATUS.md`)**, not `claude/STATUS.md`. The project instructions say `claude/STATUS.md`; the root file is the real one.
- `index.html` — markup + CSS only. Loads `preview1.js` then `preview2.js` (classic scripts, shared global scope), and `ratings.js?v=<timestamp>` via a created script tag. CSP meta restricts scripts to self, images to the CFBD logo CDN + `a.espncdn.com`.
- `preview1.js` / `preview2.js` — the app logic, split for the transmit limit. See the redesign section.
- `sim.py` — **the one football.** `SD_BY_LEAGUE` / `MARGIN_SD_BY_LEAGUE`, `sd_for`, `game_grid`, `Grid.prob`, `Grid.encode/decode`, `attach_sims`. `python sim.py` self-checks the encode/decode round trip.
- `refresh.py` — auto-detects season; caches prior season; `--lines-only`; `--alt-lines`; `--check-nfl`; `pull_nfl` (ESPN → odds-api → carry forward); calls `sim.attach_sims`; writes atomically.
- `calibrate.py`, `bayes.py` — research tools; `calibrate.py` imports `sim.py`.
- `.github/workflows/refresh.yml` — the schedule. `requirements.txt`: requests, numpy.
- Orphans, safe to delete: `cache_teams_2026.json` (superseded by `cache_teaminfo_2026.json`), `probe_odds.py` / `probe_odds.json` (one-time probe, answered in finding 5), `preview.html` (byte-identical duplicate of `index.html`; deletion needs Danny's approval).

## Open items / next
**Next chat — the pipeline (items 1–3 are one unit; 2 and 3 are nearly free once 1 is done)**
1. **`refresh.py`: keep finished games + a `status` field** (`upcoming` / `live` / `final`), **today only** (Danny's scope call), each keeping **the line it closed at** and the **final score**. `index.html` also drops kicked-off games in `init()` — both sides need changing. This is what activates the Game status filter, which is already built and shipped.
2. **`refresh.py`: NFL hourly.** Drop `NFL_ODDS_MIN_HOURS = 20` to match the college cadence. ~2 credits/pull, ~600/month against 20,000. The 20-hour throttle only existed for the free tier.
3. **A scores feed.** the-odds-api has a Scores endpoint; CFBD has college scores. **Price it before building.** The same feed serves items 1 and 4, so pick once.

**Then**
4. **Bet tracking.** Danny chose **the Google Sheet** (option B) over browser storage or a database. Capture: app used (DraftKings / Underdog / etc. — a dropdown, since there's no book filter), each leg with its line, wager, projected winnings, boost/promo as % or $, and the settled result **per leg**. Claude's additions Danny hasn't ruled on yet: **Clover's probability and verdict frozen at placement** (without it you can never test calibration — the single most valuable field), **the line you actually got vs. the line Clover had**, **timestamp placed**, **the closing line** (beating the close is the only measure that reads true on small samples), who placed it, and a free/promo flag separate from the boost amount. Needs item 3 first.
5. **"Build your own" still uses the old six-button layout.** Convert to the grid card for consistency, or decide to leave it.
6. **Multi-book lines** — FanDuel / BetMGM / Caesars cost **no extra credits** (same `us` region). Decide whether picking a book changes the lines Clover prices or only a payout column.
7. **Player props phase.** Both **Underdog** and **PrizePicks** confirmed available (`us_dfs`). NFL props are the bigger market. This is edge (c) in finding 3.
8. **Rotate the GitHub PAT** — it's in old chat history. Not needed for deploys anymore.
9. **Second truth for tail calibration.** Where a book's devigged chance and our table disagree by >5 pts, which is right? **Pinnacle or a `us_ex` exchange is a sharper yardstick than DraftKings** (finding 5). Could calibrate tails past 83%. Research, not urgent.
10. Pin the two GitHub Actions (`checkout`, `setup-python`) by commit SHA instead of `@v4`/`@v5`.
11. Delete the orphan files listed under Components (needs Danny's approval in the UI).
12. Rename `preview1.js` / `preview2.js` to something production-appropriate — must update `index.html` in the same pass. Cosmetic.
13. Later: neutral-site toggle; helmet art if Danny finds a set he likes.
