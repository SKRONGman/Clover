# Clover — project status

Last updated: 2026-09-11 (NFL added — calibrated, tested offline, deployed by upload)

## NFL — first live run checklist (do once after the upload)
1. Actions → "Refresh lines" → Run workflow → mode `lines`. The log prints every NFL game as `away +spread / total (book)`; check 2–3 against DraftKings. The ESPN feed could not be reached from the dev session, so the parser is written from the known schema and this is its first live test. If anything looks wrong: `python refresh.py --check-nfl` (prints the raw ESPN odds record next to what we parsed). Sign convention lives in `espn_spread()` — reads `details` like "KC -3.5" first, falls back to the `spread` field sign-checked against `favorite`.
2. Open the app: the League switch (College / NFL) sits above Hot slips; the header tag reads "N college + M NFL games with lines". NFL logos come from `a.espncdn.com` (CSP allows it).
3. First Thursday alt pull: the log shows `alt lines [nfl]: … pulled` only on even ISO weeks (credits, see below).

## LIVE
- **App:** https://skrongman.github.io/Clover/  (share this; works on phone)
- **Repo (workshop):** https://github.com/SKRONGman/Clover
- Schedules (GitHub Actions, `refresh.yml`): **full ratings weekly Tue 6am CT**; lines hourly **Thu–Mon** 10am–midnight CT (Monday added for MNF); **DK alternate lines Thursdays 10:10am CT** (mode `alt`). Manual: Actions → "Refresh lines" → Run workflow, mode `full` / `lines` / `alt`.
- Secrets (Settings → Secrets → Actions): `CFBD_KEY`, `ODDS_KEY` (the-odds-api.com free tier, 500 credits/mo). College alt pull ≈ 2 credits × ~50 games + 2 for DK's main lines (one slate-wide call); NFL ≈ 2 × ~16 + 2. Both weekly would top 500/mo, so **NFL alt lines run every other week (even ISO weeks) and go first on those weeks** — `ODDS_MIN_REMAINING = 40` then trims the college tail, not the NFL (`NFL_ALT_EVERY_OTHER_WEEK` in `refresh.py`; the $30/mo tier removes the limit).
- Every refresh is a commit → full line history (click ratings.js → History). Sim tables are seeded by game id, so a game whose line didn't move is byte-identical between commits.
- **Deploying changes.** 2026-09-11: the cloud workspace could `git clone` github.com (public read) but not push — push needs the repo attached to the session's sources; the laptop shell had no network at all that day; api.github.com and raw.githubusercontent.com were blocked. What worked: Claude stages finished files in `C:\Claude\Clover\github-upload\` with an `UPLOAD-ME.txt`, Danny drags them onto github.com (Add file → Upload files → Commit; `refresh.yml` goes into `.github/workflows/`). If a session has the repo attached, Claude pushes directly. The working copy is `C:\Claude\Clover` (`.github\` there is write-protected — `refresh.yml` sits at the folder root). Anything that needs CFBD / ESPN / the-odds-api.com runs on Actions only. **Always start from the repo's files, not the project docs — the docs lag.**
- Two workflows pushing at once collide (non-fast-forward) — re-run the loser.

## What Clover is (plain English)
**An app, not an agent or bot.** One web page (`index.html`) fed by `refresh.py`. You tap picks onto a slip; it tells you the true chance the slip hits and whether the payout is worth it, in one word. It does not predict winners, act on its own, or place bets. Covers **college (FBS) and NFL** — winners, spreads, totals.

### Architecture (since 2026-09-08 rebuild — "option B")
- **Two leagues, one list.** Every game in `upcoming` carries `league: "ncaaf" | "nfl"`. College slate + lines from CFBD. **NFL slate + lines from ESPN's public scoreboard** (`site.api.espn.com/.../nfl/scoreboard`, no key, ESPN BET lines, plus logos/colors and `home_short`/`away_short` nicknames). No NFL rating model — the sim centers on the line, so none is needed; NFL games carry no `proj_home/away`. The refresh keeps college only if the NFL feed fails.
- **The page never simulates.** `refresh.py` → `sim.py` plays every lined game out 20,000 times (centered on the market line; width per league — college SD 15.2, NFL total SD 13.1 / margin SD 11.7) and ships a sparse table of (total, margin) counts per game in `ratings.js` (`g.sim`, ~5 KB/game, varint+base64). Every % on every screen is a lookup in that table — identical on every device, identical across screens, and it's the same code `calibrate.py` certifies (`calibrate.py` imports `sim.py`).
- **Hot slips are built in the page** (beam search over the tables, ~200 ms for 53 games) so feedback can reshuffle them instantly. Top 6, no two share more than half their picks. **Built per league** — the League switch picks which slate the search runs over.
- `ratings.js` carries only what the page needs (slate, lines, alt lines, sims, hot, logos, colors) — ~430 KB raw / ~150 KB gzipped. `ratings.json` keeps everything incl. team ratings + accuracy (research).
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

## Danny's directives
- Desktop-first for now; mobile optimization later (he said so 2026-09-08).
- Rookie weekend gamblers. Simple beats complete. Not Underdog-specific. Likes 3-pick slips.
- Hot Slips = highest win probability, no payout floor. He manages bankroll. Revisit only if he asks.
- Prohibited feedback = notate only until many confirmed examples.
- Odds API: **free tier**, weekly Thursday pull. Upgrade ($30/mo, 20k) only if he asks. NFL decisions 2026-09-11: ESPN feed for NFL lines (1A), NFL alt lines every other week (2A), league switch at the top with a mixable slip (3A).
- Novice coder — deploys are drag-and-drop uploads or Claude pushing; never ask him to run git or a terminal.
- `PAYOUT` table (1→1.909, 2→3x, 3→6x, 4→10x, 5→20x, 6→25x) is a stand-in — the page now asks for the real payout on the Card.
- Streamlit rejected. GitHub Actions + Pages chosen instead.
- Skip the "Odds API Automation" MCP wrapper (Composio middleman) — asked twice, answered twice.
- `theoddsapi.com` (no hyphens) is a look-alike service — ignore that account.

## Components (in repo)
- `index.html` — the app (lookups only). Loads `ratings.js?v=<timestamp>` via a created script tag (no `document.write`). CSP meta restricts scripts to self, images to the CFBD logo CDN + `a.espncdn.com`.
- `sim.py` — **the one football.** `SD_BY_LEAGUE` / `MARGIN_SD_BY_LEAGUE`, `sd_for`, `game_grid`, `Grid.prob`, `Grid.encode/decode`, `attach_sims` (per-league width). `python sim.py` self-checks the encode/decode round trip and prints an NFL-shaped game.
- `refresh.py` — auto-detects season; caches prior season; `--lines-only` (~3 CFBD calls + 1 ESPN call); `--alt-lines` (Odds API, both leagues per the every-other-week rule); `--check-nfl`; calls `sim.attach_sims`; writes atomically (temp + rename).
- `calibrate.py`, `bayes.py` — research tools; `calibrate.py` imports `sim.py`. `--nfl games.csv` (nflverse `data/games.csv`) with `--tails [--vol --msd]` or `--scan v1 v2 …`; `--scan` works for college too.
- `.github/workflows/refresh.yml` — the schedule. `requirements.txt`: requests, numpy.

## Open items / next
1. **Rotate the GitHub PAT** — it's in old chat history. Not needed for deploys anymore (upload or connected-repo session).
2. Pin the two GitHub Actions (`checkout`, `setup-python`) by commit SHA instead of `@v4`/`@v5`.
3. Use DK alt lines as a second truth — where DK's devigged chance and our table disagree by >5 pts, which is right? Could calibrate tails past 83% against DK. Research, not urgent.
4. Player props phase — PrizePicks CFB props available; check Underdog on a Saturday slate.
5. Google Sheet log (Date, Who, Bets, Picks, Payout, Model %, Verdict, Result) — not built; "Copy row" on the Card produces the row.
6. NFL player props are the bigger market when props land.
7. Later: neutral-site toggle; helmet art if Danny finds a set he likes.
