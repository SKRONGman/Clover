# Clover — project status

Last updated: 2026-09-19 (filters VERIFIED live; NFL source corrected — ESPN is blocked, the-odds-api is the real feed; Odds API credits low; desktop-first confirmed)

## Filters (added 2026-09-13, VERIFIED LIVE 2026-09-19)
- New filter panel on the Slips tab, above Hot slips: **Date**, **Game time** (both leagues); **Conference, FBS, FCS, Top 25 (AP)** (college); **Conference, Division** (NFL). Filters apply to BOTH Build your own and Hot Slips generation — a filtered-out game can't be searched into a hot slip either.
- **Date** defaults to "This weekend" — the nearest Thu–Mon window (computed client-side from today's date, not hardcoded); dropdown also lists every specific date in the loaded slate, or "All upcoming dates."
- **Game time** buckets: Morning (<12pm), Afternoon (12–4pm), Evening (4–8pm), Primetime (8pm+) — by the browser's local hour, same as every other time shown on the page (no fixed timezone).
- **FBS/FCS** are two independent toggles, not a radio: since `refresh.py` only ever pulls games with at least one FBS side (pure FCS-vs-FCS was always excluded), "FCS" here means "FBS team vs FCS opponent." Neither checked = show all; one checked = only that kind; both checked = same as neither (standard checkbox-filter behavior).
- **Top 25** = at least one team in the game is CFBD's AP Top 25 that week.
- All filter state persists per-league in localStorage (`cloverFilters`), like the slip/league/markets state already did.
- **New data on every game** (added in `refresh.py`, written every refresh — full or `--lines-only`, no separate step needed): college games get `home_conf`/`away_conf` (from CFBD `/teams`) and `home_rank`/`away_rank` (from a CFBD `/rankings` pull, one call per week in the slate — well inside the free CFBD quota) and `fcs` (bool, from the classification fields CFBD already returned). NFL games get `home_conf`/`away_conf` (AFC/NFC) and `home_div`/`away_div` from a static `NFL_DIVISIONS` table in `refresh.py` — no network cost.
- The team-info cache key changed `teams_<season>` → `teaminfo_<season>`, so the stale `cache_teams_2026.json` in the repo is ignored. It is orphaned — safe to delete, not required.
- **VERIFIED against live data 2026-09-19** (read straight out of the deployed `ratings.js`, 144 games): CFBD `/rankings` returns real AP data — 16 college games carry a ranked team (e.g. USC 12, Alabama 10, Texas A&M 9, Utah 17, Michigan 19, SMU 16 / Louisville 23). Conferences populate on **all 128** college games, zero nulls, 11 distinct conferences. `fcs` true on 29 games. NFL `home_conf`/`home_div` correct (Falcons / NFC / NFC South, Ravens / AFC / AFC North). **No defect found. This item is closed — do not re-verify.**

## NFL data source (corrected 2026-09-19 — this replaced the old ESPN description)
- **ESPN is blocked on GitHub Actions.** `site.api.espn.com/.../nfl/scoreboard` returns `403 Access Denied` on every attempt — all three retries, every hourly run, confirmed across the 2026-09-17 → 2026-09-19 commits. It refuses datacenter IPs. `pull_nfl_upcoming()` still tries it first (it's free and harmless) but it has not succeeded on Actions.
- **NFL actually runs on the-odds-api**, via `pull_nfl_from_odds()`: `/events` is free, then one slate-wide `/odds` call for DraftKings spreads+totals costs **2 credits**. Check which path ran by reading `nfl_diag.source` in `ratings.js` — `"espn"`, `"odds-api"`, or `"carried forward (odds pull rate-limited)"`.
- **Rate-limited to once per 20 hours** (`NFL_ODDS_MIN_HOURS = 20` in `refresh.py`) to protect credits. Between pulls the last NFL slate is carried forward unchanged, with kicked-off games dropped. **Net effect: college lines move hourly, NFL lines move roughly once a day (~10:10am CT).** Whether that is good enough for a Sunday slate is Open item 1.
- ESPN still supplies NFL **logos** (`a.espncdn.com`, static URLs, CSP allows it). Team full names and nicknames come from the static `NFL_TEAMS` table in `refresh.py`, not from a feed. Both leagues' names match the-odds-api exactly ("Kansas City Chiefs").
- `refresh.py --check-nfl` prints the raw feed record next to what we parsed, if the NFL numbers ever look wrong.

## LIVE
- **App:** https://skrongman.github.io/Clover/  (share this; works on phone)
- **Repo (workshop):** https://github.com/SKRONGman/Clover
- Schedules (GitHub Actions, `refresh.yml`): **full ratings weekly Tue 6am CT**; lines hourly **Thu–Mon** 10am–midnight CT (Monday added for MNF); **DK alternate lines Thursdays 10:10am CT** (mode `alt`). Manual: Actions → "Refresh lines" → Run workflow, mode `full` / `lines` / `alt`.
- Secrets (Settings → Secrets → Actions): `CFBD_KEY`, `ODDS_KEY` (the-odds-api.com free tier, 500 credits/mo). College alt pull ≈ 2 credits × ~50 games + 2 for DK's main lines (one slate-wide call); NFL ≈ 2 × ~16 + 2. Both weekly would top 500/mo, so **NFL alt lines run every other week (even ISO weeks) and go first on those weeks** — `ODDS_MIN_REMAINING = 40` then trims the college tail, not the NFL (`NFL_ALT_EVERY_OTHER_WEEK` in `refresh.py`; the $30/mo tier removes the limit).
- **⚠️ Credit burn (measured 2026-09-19): 139 of 500 remaining** (`nfl.odds_remaining` in `ratings.js`). The daily NFL main-line pull (2/day ≈ 60/mo) was **never in the original budget** — it exists only because ESPN died, and it was added on top of the alt-line math above. A full college alt pull needs ~104 credits, so the next Thursday `alt` run will hit the `ODDS_MIN_REMAINING = 40` guard partway through the college slate and stop. **Reset date is NOT confirmed** — free tier likely resets on the account anniversary (account created ~2026-09-07, so ~Oct 7) rather than the 1st. Check the-odds-api dashboard before planning around it. See Open item 2.
- Every refresh is a commit → full line history (click ratings.js → History). Sim tables are seeded by game id, so a game whose line didn't move is byte-identical between commits.
- **Deploying changes. 2026-09-19: Claude has direct GitHub read/write** through the GitHub connector (authenticated as SKRONGman) and pushes straight to `main` — **no upload staging, no `UPLOAD-ME.txt`, never ask Danny to run git.** Two limits: Claude **cannot trigger or read GitHub Actions runs**, and **cannot read or set repo Secrets** — running a refresh and reading its log is Danny (Actions → "Refresh lines" → Run workflow). The connector must be toggled on for each chat session, not just authorized at the account level. Anything that needs CFBD / ESPN / the-odds-api.com runs on Actions only.
  - *History (superseded):* before 2026-09-13 the cloud workspace could clone but not push, so Claude staged files in `C:\Claude\Clover\github-upload\` for drag-and-drop onto github.com. Not needed anymore.
- Two workflows pushing at once collide (non-fast-forward) — re-run the loser.

## What Clover is (plain English)
**An app, not an agent or bot.** One web page (`index.html`) fed by `refresh.py`. You tap picks onto a slip; it tells you the true chance the slip hits and whether the payout is worth it, in one word. It does not predict winners, act on its own, or place bets. Covers **college (FBS) and NFL** — winners, spreads, totals.

### Architecture (since 2026-09-08 rebuild — "option B")
- **Two leagues, one list.** Every game in `upcoming` carries `league: "ncaaf" | "nfl"`. College slate + lines from CFBD. **NFL slate + lines from the-odds-api (DraftKings) — see "NFL data source" above; ESPN was the original source and is now 403-blocked on Actions.** No NFL rating model — the sim centers on the line, so none is needed; NFL games carry no `proj_home/away`. The refresh keeps college only if the NFL feed fails entirely.
- **The page never simulates.** `refresh.py` → `sim.py` plays every lined game out 20,000 times (centered on the market line; width per league — college SD 15.2, NFL total SD 13.1 / margin SD 11.7) and ships a sparse table of (total, margin) counts per game in `ratings.js` (`g.sim`, ~5 KB/game, varint+base64). Every % on every screen is a lookup in that table — identical on every device, identical across screens, and it's the same code `calibrate.py` certifies (`calibrate.py` imports `sim.py`).
- **Hot slips are built in the page** (beam search over the tables, ~200 ms for 53 games) so feedback can reshuffle them instantly. Top 6, no two share more than half their picks. **Built per league** — the League switch picks which slate the search runs over.
- `ratings.js` carries only what the page needs (slate, lines, alt lines, sims, hot, logos, colors) — ~640 KB raw. `ratings.json` keeps everything incl. team ratings + accuracy (research).
- Games that already kicked off are dropped by `refresh.py` and hidden by the page.
- Games with no line are not offered (nothing to center on). Flip in `sim.attach_sims` if ever wanted.
- One `slip` object in JS state (persisted to localStorage `cloverSlip`, keyed by game id). Every screen reads/writes it. **A slip can mix leagues** (the Card tags each game College/NFL when mixed). Chosen league persists in `cloverLeague`; the page opens on whichever league has games if the saved one has none. Spread lines are always the side's OWN number (away spread = away team's spread), everywhere.

### Two screens
- **Slips** (home) — **League switch** (College / NFL, with game counts) → **Hot slips** (pick 2–6 → top 6 in a 3-up grid; tap to open, −/+ nudges a line by 0.5, tap the number for every line; "Use this slip"). **"Not on my app"** on any pick blocks it (localStorage `cloverNA`, keyed by game id so it expires with the game) and reshuffles; **"Pick types my app offers"** Winner/Spread/Total toggles (`cloverMarkets`) are the global lever. Blocked picks show struck-through in Build your own. and **Build your own** (every lined game in that league grouped by day, six pick buttons with the % on each; tap to add/remove; NFL shows nicknames — "Chiefs" — where space is tight, full names on the Card). Sticky bottom bar shows "N picks · X% · verdict" → "See the Card".
- **The Card** (ticket) — big %, verdict, "Show the math"; **Payout: "Your app pays, on $1"** — type what the app shows (until then it's the `PAYOUT` stand-in, tagged **est.** everywhere); picks grouped by game with same-game "together X% vs Y% if unrelated"; **"How sure is this?"** now shifts total AND margin −3..+3 (49 versions) and uses the joint sim (old version never moved the margin, so spread picks always read "Solid"); Copy row for the log.
- **Line sheet** (was the Line Mover tab) — bottom sheet on any spread/total pick: every half-point −10..+10, our chance, fair payout, DK pays, DK's chance. Tap a row to use it.
- One verdict scale everywhere: Great ≥ +15¢ / Good ≥ +5¢ / Coin toss ≥ −5¢ / Bad ≥ −20¢ / Terrible, per $1 of expected value.
- Prohibited button on every same-game pair in hot slips: logs to localStorage `udProhibited`. Notebook only — does NOT change suggestions.

## ⚠️ SETTLED FINDINGS — READ FIRST
1. **No rating model beats the closing line** (2 models, ~5,000 games, 2019+2021–2025, out-of-sample): PPD log loss 0.802; Bayesian MCMC 0.754; market 0.6933 vs coin-flip 0.6931. **Do not retry.** Sims are centered on the market line.
2. **The college sim's SHAPE is verified** (`calibrate.py --tails`): within 1–2.5 pts at every rung 19%–83%. `DEFAULT_SD = 15.2` (in `sim.py`). Cross-check 2026-09-07: FSU ML sim 42% / SMU 58%; DK devigged ≈ 43 / 57.
2b. **NFL sim verified 2026-09-11** (`calibrate.py --nfl games.csv --tails`, nflverse closing lines, 1,615 games 2019+2021–2025): totals within 2.3 pts at every rung 14–88%; spreads within 3 pts at every rung 11–89%, with the residual being a real-world −1.4 pt lean (home teams cover 48.6% at the closing line in this era) that we do NOT model (finding 4). Real NFL games are tighter than the drive engine can produce on its own (its floor is SD ≈ 13.7): real total SD 13.1, margin SD 12.7 (fat-tailed; the body calibrates at 11.7). So for the NFL, `sim_game` scales the total and margin deviations to `NFL_SD = 13.1` / `NFL_MARGIN_SD = 11.7` before rounding; college is untouched (`MARGIN_SD_BY_LEAGUE["ncaaf"] = None`). Calibrating a league = `--scan` a few widths, then `--tails` on the best. Results in `calibration_tails_nfl.json`.
3. Edge is NOT predicting games; it is (a) alt-line pricing, (b) correlated same-game picks, (c) player props (future).
4. Weather / injuries / lineups / news / HFA / polls are already priced into the line. Adding them on top double-counts. Danny agreed. (The old "adjust projected score / volatility" inputs are gone for this reason.)
5. **The Odds API (the-odds-api.com):** NCAAF and NFL game lines from 9 US books. NFL team names in the feed are full names = ESPN `displayName`, exact match. **Underdog has NO game-level lines** in the feed. **Alternate spreads + totals: YES** (DK 84 rungs) — pulled weekly (DK only). The `alternate_*` markets do NOT include DK's main line, so `pull_alt_lines` also pulls `spreads,totals` for DK in one slate-wide call and merges them in. Player props: PrizePicks covers NCAAF (flat −137); Underdog inconclusive.
6. **ESPN's public scoreboard does not work from GitHub Actions** (403, datacenter IPs). Don't "fix" it — the fallback is already in place. See "NFL data source."

## Danny's directives
- **Desktop-first — re-confirmed 2026-09-19.** Mobile-first was proposed 2026-09-13 and Danny declined: he checked the app on his laptop and his iPhone and is comfortable with how it renders on both. **Do not re-litigate this.**
- Rookie weekend gamblers. Simple beats complete. Not Underdog-specific. Likes 3-pick slips.
- Hot Slips = highest win probability, no payout floor. He manages bankroll. Revisit only if he asks.
- Prohibited feedback = notate only until many confirmed examples.
- Odds API: **free tier**, weekly Thursday pull. Upgrade ($30/mo, 20k) only if he asks. NFL decisions 2026-09-11: NFL alt lines every other week (2A), league switch at the top with a mixable slip (3A). (The 1A "ESPN feed for NFL lines" decision was overtaken by ESPN blocking Actions — see "NFL data source.")
- Novice coder — never ask him to run git or a terminal. Claude pushes directly now.
- `PAYOUT` table (1→1.909, 2→3x, 3→6x, 4→10x, 5→20x, 6→25x) is a stand-in — the page now asks for the real payout on the Card.
- Streamlit rejected. GitHub Actions + Pages chosen instead.
- Skip the "Odds API Automation" MCP wrapper (Composio middleman) — asked twice, answered twice.
- `theoddsapi.com` (no hyphens) is a look-alike service — ignore that account.
- Wants Clover built to a professional-grade product standard — sleek, efficient, accurate.

## Components (in repo)
- **This file lives at the repo ROOT (`STATUS.md`)**, not `claude/STATUS.md`. The project instructions say `claude/STATUS.md`; the root file is the real one.
- `index.html` — the app (lookups only). Loads `ratings.js?v=<timestamp>` via a created script tag (no `document.write`). CSP meta restricts scripts to self, images to the CFBD logo CDN + `a.espncdn.com`.
- `sim.py` — **the one football.** `SD_BY_LEAGUE` / `MARGIN_SD_BY_LEAGUE`, `sd_for`, `game_grid`, `Grid.prob`, `Grid.encode/decode`, `attach_sims` (per-league width). `python sim.py` self-checks the encode/decode round trip and prints an NFL-shaped game.
- `refresh.py` — auto-detects season; caches prior season; `--lines-only` (~3 CFBD calls + the NFL pull); `--alt-lines` (Odds API, both leagues per the every-other-week rule); `--check-nfl`; `pull_nfl` (ESPN → odds-api → carry forward); calls `sim.attach_sims`; writes atomically (temp + rename).
- `calibrate.py`, `bayes.py` — research tools; `calibrate.py` imports `sim.py`. `--nfl games.csv` (nflverse `data/games.csv`) with `--tails [--vol --msd]` or `--scan v1 v2 …`; `--scan` works for college too.
- `.github/workflows/refresh.yml` — the schedule. `requirements.txt`: requests, numpy.
- Orphans, safe to delete: `cache_teams_2026.json` (superseded by `cache_teaminfo_2026.json`), `probe_odds.py` / `probe_odds.json` (one-time coverage probe, already answered in Settled finding 5).

## Open items / next
1. **NFL line staleness — decide.** NFL lines refresh once per ~20 hours, college hourly. On a Sunday slate the NFL numbers can be most of a day old by kickoff. Options if it matters: shorten `NFL_ODDS_MIN_HOURS` (costs credits), pull NFL only on game days at a smarter hour (cheap), or upgrade the Odds API tier. Raised with Danny 2026-09-19.
2. **Odds API credits — 139 of 500 left as of 2026-09-19.** Confirm the reset date on the dashboard, then decide: accept a partial college alt pull next Thursday, trim the alt slate, or upgrade to $30/mo. Tied to item 1.
3. **Rotate the GitHub PAT** — it's in old chat history. Not needed for deploys anymore (connector).
4. Pin the two GitHub Actions (`checkout`, `setup-python`) by commit SHA instead of `@v4`/`@v5`.
5. Delete the orphan files listed under Components.
6. Use DK alt lines as a second truth — where DK's devigged chance and our table disagree by >5 pts, which is right? Could calibrate tails past 83% against DK. Research, not urgent.
7. Player props phase — PrizePicks CFB props available; check Underdog on a Saturday slate.
8. Google Sheet log (Date, Who, Bets, Picks, Payout, Model %, Verdict, Result) — not built; "Copy row" on the Card produces the row.
9. NFL player props are the bigger market when props land.
10. Later: neutral-site toggle; helmet art if Danny finds a set he likes.
