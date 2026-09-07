# Clover — project status

Last updated: 2026-09-08 (after the architecture review + rebuild)

## LIVE
- **App:** https://skrongman.github.io/Clover/  (share this; works on phone)
- **Repo (workshop):** https://github.com/SKRONGman/Clover
- Schedules (GitHub Actions, `refresh.yml`): **full ratings weekly Tue 6am CT**; lines hourly Thu–Sun 10am–midnight CT; **DK alternate lines Thursdays 10:10am CT** (mode `alt`). Manual: Actions → "Refresh lines" → Run workflow, mode `full` / `lines` / `alt`.
- Secrets (Settings → Secrets → Actions): `CFBD_KEY`, `ODDS_KEY` (the-odds-api.com free tier, 500 credits/mo). Each alt pull ≈ 2 credits × lined games (~50) **+ 2 credits** for DK's main lines (one call, whole slate). `ODDS_MIN_REMAINING = 40` stops the pull early.
- Every refresh is a commit → full line history (click ratings.js → History). Sim tables are seeded by game id, so a game whose line didn't move is byte-identical between commits.
- **Deploying changes — Claude does it.** Claude's cloud workspace can read raw.githubusercontent.com but cannot push, and cannot reach the-odds-api.com; Danny's laptop (device_bash) can reach github.com with his fine-grained PAT (Contents/Secrets/Actions/Workflows on Clover only). Procedure: `device_commit_files` the new files into `C:\Claude\Clover` (`.github\` there is write-protected — keep `refresh.yml` at the folder root), then in device_bash: clone to `$HOME/clover-push` with the token in the URL, copy files in (workflow → `.github/workflows/refresh.yml`), commit, push, `rm -rf` the clone. Workflow dispatch via REST. Anything that needs the-odds-api.com runs on Actions only.
- Two workflows pushing at once collide (non-fast-forward) — re-run the loser.

## What Clover is (plain English)
**An app, not an agent or bot.** One web page (`index.html`) fed by `refresh.py`. You tap picks onto a slip; it tells you the true chance the slip hits and whether the payout is worth it, in one word. It does not predict winners, act on its own, or place bets.

### Architecture (since 2026-09-08 rebuild — "option B")
- **The page never simulates.** `refresh.py` → `sim.py` plays every lined game out 20,000 times (centered on the market line, SD 15.2) and ships a sparse table of (total, margin) counts per game in `ratings.js` (`g.sim`, ~5 KB/game, varint+base64). Every % on every screen is a lookup in that table — identical on every device, identical across screens, and it's the same code `calibrate.py` certifies (`calibrate.py` imports `sim.py`).
- **Hot slips are precomputed too** (`R.hot["2"..."6"]`, top 5 each, beam search in `sim.build_hot_slips`) at market lines. The page recomputes a slip only when you nudge a line.
- `ratings.js` carries only what the page needs (slate, lines, alt lines, sims, hot, logos, colors) — ~430 KB raw / ~150 KB gzipped. `ratings.json` keeps everything incl. team ratings + accuracy (research).
- Games that already kicked off are dropped by `refresh.py` and hidden by the page.
- Games with no line are not offered (nothing to center on). Flip in `sim.attach_sims` if ever wanted.
- One `slip` object in JS state (persisted to localStorage `cloverSlip`, keyed by game id). Every screen reads/writes it. Spread lines are always the side's OWN number (away spread = away team's spread), everywhere.

### Two screens
- **Slips** (home) — **Hot slips** (pick 2–6 → top 5 precomputed; tap to open, −/+ nudges a line by 0.5, tap the number for every line; "Use this slip") and **Build your own** (every lined game grouped by day, six pick buttons with the % on each; tap to add/remove). Sticky bottom bar shows "N picks · X% · verdict" → "See the Card".
- **The Card** (ticket) — big %, verdict, "Show the math"; **Payout: "Your app pays, on $1"** — type what the app shows (until then it's the `PAYOUT` stand-in, tagged **est.** everywhere); picks grouped by game with same-game "together X% vs Y% if unrelated"; **"How sure is this?"** now shifts total AND margin −3..+3 (49 versions) and uses the joint sim (old version never moved the margin, so spread picks always read "Solid"); Copy row for the log.
- **Line sheet** (was the Line Mover tab) — bottom sheet on any spread/total pick: every half-point −10..+10, our chance, fair payout, DK pays, DK's chance. Tap a row to use it.
- One verdict scale everywhere: Great ≥ +15¢ / Good ≥ +5¢ / Coin toss ≥ −5¢ / Bad ≥ −20¢ / Terrible, per $1 of expected value.
- Prohibited button on every same-game pair in hot slips: logs to localStorage `udProhibited`. Notebook only — does NOT change suggestions.

## ⚠️ SETTLED FINDINGS — READ FIRST
1. **No rating model beats the closing line** (2 models, ~5,000 games, 2019+2021–2025, out-of-sample): PPD log loss 0.802; Bayesian MCMC 0.754; market 0.6933 vs coin-flip 0.6931. **Do not retry.** Sims are centered on the market line.
2. **The sim's SHAPE is verified** (`calibrate.py --tails`): within 1–2.5 pts at every rung 19%–83%. `DEFAULT_SD = 15.2` (in `sim.py`). Cross-check 2026-09-07: FSU ML sim 42% / SMU 58%; DK devigged ≈ 43 / 57.
3. Edge is NOT predicting games; it is (a) alt-line pricing, (b) correlated same-game picks, (c) player props (future).
4. Weather / injuries / lineups / news / HFA / polls are already priced into the line. Adding them on top double-counts. Danny agreed. (The old "adjust projected score / volatility" inputs are gone for this reason.)
5. **The Odds API (the-odds-api.com):** NCAAF game lines from 9 US books. **Underdog has NO game-level lines** in the feed. **Alternate spreads + totals: YES** (DK 84 rungs) — pulled weekly (DK only). The `alternate_*` markets do NOT include DK's main line, so `pull_alt_lines` also pulls `spreads,totals` for DK in one slate-wide call and merges them in. Player props: PrizePicks covers NCAAF (flat −137); Underdog inconclusive.

## Danny's directives
- Rookie weekend gamblers. Simple beats complete. Not Underdog-specific. Likes 3-pick slips.
- Hot Slips = highest win probability, no payout floor. He manages bankroll. Revisit only if he asks.
- Prohibited feedback = notate only until many confirmed examples.
- Odds API: **free tier**, weekly Thursday pull. Upgrade ($30/mo, 20k) only if he asks.
- `PAYOUT` table (1→1.909, 2→3x, 3→6x, 4→10x, 5→20x, 6→25x) is a stand-in — the page now asks for the real payout on the Card.
- Streamlit rejected. GitHub Actions + Pages chosen instead.
- Skip the "Odds API Automation" MCP wrapper (Composio middleman) — asked twice, answered twice.
- `theoddsapi.com` (no hyphens) is a look-alike service — ignore that account.

## Components (in repo)
- `index.html` — the app (lookups only). Loads `ratings.js?v=<timestamp>` via a created script tag (no `document.write`). CSP meta restricts scripts to self, images to the CFBD logo CDN.
- `sim.py` — **the one football.** `game_grid`, `Grid.prob`, `Grid.encode/decode`, `build_hot_slips`, `attach_sims`. `python sim.py` self-checks the encode/decode round trip.
- `refresh.py` — auto-detects season; caches prior season; `--lines-only` (~3 CFBD calls); `--alt-lines` (Odds API); calls `sim.attach_sims`; writes atomically (temp + rename).
- `calibrate.py`, `bayes.py` — research tools; `calibrate.py` imports `sim.py`.
- `.github/workflows/refresh.yml` — the schedule. `requirements.txt`: requests, numpy.

## Open items / next
1. **Rotate the GitHub PAT** — it's in chat history. (Was open before; still open.)
2. Pin the two GitHub Actions (`checkout`, `setup-python`) by commit SHA instead of `@v4`/`@v5`.
3. Use DK alt lines as a second truth — where DK's devigged chance and our table disagree by >5 pts, which is right? Could calibrate tails past 83% against DK. Research, not urgent.
4. Player props phase — PrizePicks CFB props available; check Underdog on a Saturday slate.
5. Google Sheet log (Date, Who, Bets, Picks, Payout, Model %, Verdict, Result) — not built; "Copy row" on the Card produces the row.
6. Later: NFL; neutral-site toggle; helmet art if Danny finds a set he likes.
