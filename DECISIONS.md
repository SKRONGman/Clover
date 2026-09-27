# Clover — decisions

Rules and settled findings. Read after `STATUS.md`; dated rulings are in `RULINGS.md`. If an ask conflicts with anything here, say so before building. How to push is in `DEPLOY.md` (moved 2026-09-26, size limit).
Each block says where it came from. Blocks marked *verbatim* were moved word for word from `STATUS.md` on 2026-09-20.

## What Clover is (rewritten 2026-09-20 with Danny)
A personal betting tool for Danny and Jaclyn. **Not a business, never will be** (Danny, 2026-09-20 — this supersedes "rookie weekend gamblers" and "strangers later"). An app, not an agent or bot. It does four jobs in one place, each feeding the next: **find** good slips, **change them or build your own**, **track** the bets actually placed, **learn** from that history. College (FBS) + NFL: winners, spreads, totals. It does not predict winners on its own and never places bets.
Full end-state doc (living, with the build order): https://claude.ai/code/artifact/4ca60202-44b4-46b4-bf77-db047f25ef2f

How Clover thinks, in the words agreed with Danny:
1. **The line is the prediction.** Weather, injuries and news reach Clover through the line moving. Clover never adjusts for them on top (finding 4).
2. **Clover does the math the apps hide** — true chance at any number, same-game correlation, slip value against the payout.
3. **The edge is a stale number** — an app still showing 45 after the market moved to 38. Picking the app's number on the line sheet prices it.

## Rulings by date
Moved word for word to `RULINGS.md` on 2026-09-27 (this file hit its size limit). Every ruling there is still in force; read it right after this file.

## Architecture (since the 2026-09-08 rebuild — "option B")
- **Two leagues, one list.** Every game in `upcoming` carries `league: "ncaaf" | "nfl"`. College slate + lines from CFBD. **NFL slate + lines from the-odds-api (DraftKings)** — see "NFL data source". No NFL rating model — the sim centers on the line, so none is needed.
- **The page never simulates.** `refresh.py` → `sim.py` plays every lined game out 20,000 times (centered on the market line; college SD 15.2, NFL total SD 13.1 / margin SD 11.7) and ships a sparse (total, margin) table per game in `ratings.js` (`g.sim`, ~5 KB/game, varint+base64). Every % on every screen is a lookup in that table — identical on every device, identical across screens, and it is the same code `calibrate.py` certifies. **A game that has kicked off carries no table** — only the six frozen percentages it was priced at.
- **Hot slips are built in the page** from the tables so N/A feedback reshuffles instantly. Top 6, no two share more than half their picks. Built per league. **Exact search since 2026-09-20** (`bestSlip` in `preview3.js`): games are independent, so the best slip is a knapsack over games - no beam, no tie-order surprises, and it always finds all 6. Same-game combos are priced once per page load; 0% combos are never offered.
- `ratings.js` carries only what the page needs (slate, lines, alt lines, sims, logos, colors). `ratings.json` keeps everything incl. team ratings + accuracy (research). `results.json` is the append-only grading record.
- Games with no line are not offered (nothing to center on).
- One `slip` object in JS state (`cloverSlip`, keyed by game id). Every screen reads/writes it. Spread lines are always the side's OWN number, everywhere.
- **ONE VERDICT SCALE EVERYWHERE — per $1 of expected value: Great ≥ +15¢ / Good ≥ +5¢ / Coin toss ≥ −5¢ / Bad ≥ −20¢ / Terrible.** Lives in `grade()` in `preview1.js`. Do not change it in one place only.
- **Prohibited** logs a same-game pair the app wouldn't allow, to `udProhibited`. Notebook only — it does NOT change the picks.

## ⚠️ SETTLED FINDINGS — READ FIRST
1. **No rating model beats the closing line** (2 models, ~5,000 games, 2019+2021–2025, out-of-sample): PPD log loss 0.802; Bayesian MCMC 0.754; market 0.6933 vs coin-flip 0.6931. **Do not retry.** Sims are centered on the market line.
2. **The college sim's SHAPE is verified** (`calibrate.py --tails`): within 1–2.5 pts at every rung 19%–83%. `DEFAULT_SD = 15.2` (in `sim.py`). Cross-check 2026-09-07: FSU ML sim 42% / SMU 58%; DK devigged ≈ 43 / 57.
2b. **NFL sim verified 2026-09-11** (`calibrate.py --nfl games.csv --tails`, nflverse closing lines, 1,615 games 2019+2021–2025): totals within 2.3 pts at every rung 14–88%; spreads within 3 pts at every rung 11–89%, the residual being a real-world −1.4 pt lean (home teams cover 48.6% at the closing line in this era) that we do NOT model (finding 4). Real NFL games are tighter than the drive engine can produce alone (floor SD ≈ 13.7): real total SD 13.1, margin SD 12.7 (fat-tailed; body calibrates at 11.7). So `sim_game` scales NFL deviations to `NFL_SD = 13.1` / `NFL_MARGIN_SD = 11.7`; college untouched. Calibrating a league = `--scan` a few widths, then `--tails` on the best. Results in `calibration_tails_nfl.json`.
3. Edge is NOT predicting games; it is (a) alt-line pricing, (b) correlated same-game picks, (c) player props (phase opened 2026-09-27 - see `RULINGS.md`).
4. Weather / injuries / lineups / news / HFA / polls are already priced into the line. Adding them on top double-counts. Danny agreed.
5. **The Odds API — updated 2026-09-19 from their published bookmaker list.**
   - **Underdog has NO game-level lines. Confirmed, not inferred:** Underdog is listed under **US DFS sites** (region `us_dfs`), which the API covers for **player props only**. It is not a sportsbook in this feed. This killed the "filter by sportsbook" idea per Danny's own condition.
   - **Underdog player props ARE available** (region `us_dfs`, key `underdog`) — this supersedes the old "Underdog inconclusive" note. Their note: selections with non-default multipliers (not x1) land in `_alternate` markets. PrizePicks, DraftKings Pick6 and Dabble are in the same region.
   - **The 20K tier unlocked Caesars (`williamhill_us`) and Fanatics** — both are marked paid-only.
   - **Pinnacle is available** (region `eu`, "odds are from public website which may incur a delay"), and there is a **US exchange region** (`us_ex`): Novig, ProphetX, Kalshi, Polymarket. Exchanges run at near-zero vig, so their price is a cleaner read on true probability than DK devigged — a better yardstick for the tail-calibration idea (open item 8).
   - **Alternate spreads + totals: YES** (DK 84 rungs), pulled weekly, DK only. The `alternate_*` markets do NOT include DK's main line, so `pull_alt_lines` also pulls `spreads,totals` for DK in one slate-wide call and merges them in.
   - **Scores endpoint: 1 credit, or 2 with `daysFrom`** (which is what includes completed games). Used for NFL finals; college scores come free with CFBD's `/games` call.
6. **ESPN's public scoreboard does not work from GitHub Actions** (403, datacenter IPs). Don't "fix" it — the fallback is already in place.
7. **CFBD's free tier is 1,000 calls per calendar month** and Clover's hourly schedule burns through it by about the 20th. Danny is on **Patreon Tier 1 ($1/mo, 5,000 calls)** since 2026-09-20. The cap is per account, not per key — a new key does not reset it. CFBD's terms forbid extra free keys under other emails. Tier 2 ($5) only adds live play-by-play, which no planned phase uses.

## Danny's directives
- **Desktop-first — re-confirmed 2026-09-19.** Mobile-first was proposed 2026-09-13 and declined: the app renders fine on his laptop and iPhone. **Do not re-litigate.**
- Rookie weekend gamblers. Simple beats complete. Not Underdog-specific. Likes 3-pick slips.
- Hot Slips = highest win probability, no payout floor. He manages bankroll.
- Prohibited feedback = notate only until many confirmed examples.
- **Mock up before building.** For any change to a screen area (header, filters, hot slips, card), show a mockup and get agreement first. The 2026-09-19 redesign was agreed on a Design canvas before a line of code was written, and it saved rework.
- **Don't hand Danny GitHub chores Claude can do itself** (2026-09-20, emphatically). Claude has write access: push, verify, and report. Only the three limits in `DEPLOY.md` — oversized files, `.github/workflows/`, and triggering Actions — are his, and each should be named with the reason, not as a to-do list.
- Novice coder — never ask him to run git or a terminal.
- ~~`PAYOUT` stand-in table~~ **deleted 2026-09-20 under ruling 1.** A payout exists only once it is typed on My Bet; until then there is no verdict on My Bet, the bottom bar or the copied row.
- Streamlit rejected. GitHub Actions + Pages chosen instead.
- Skip the "Odds API Automation" MCP wrapper (Composio middleman) — asked twice, answered twice.
- `theoddsapi.com` (no hyphens) is a look-alike service — ignore that account.
- Wants Clover built to a professional-grade product standard — sleek, efficient, accurate.
- **Parked:** a standing rule that recurring, well-defined tasks get reviewed as Cowork background candidates. Danny added it 2026-09-19 then parked it until the redesign shipped. Revisit when he raises it.
- **Superseded 2026-09-20:** "Rookie weekend gamblers" and "professional-grade for strangers" are replaced by *personal use for Danny and Jaclyn*. "Simple beats complete" and "likes 3-pick slips" stand. "One word" is replaced by full numbers with the verdict among them.
- Filters vs Hot Slips: the 2026-09-19 table is in `DESIGN.md`; superseded 2026-09-26 evening (Hot Slips ignore every board filter).
