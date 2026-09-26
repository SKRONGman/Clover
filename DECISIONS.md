# Clover — decisions

Rules, settled findings and rulings. Read after `STATUS.md`. If an ask conflicts with anything here, say so before building. How to push is in `DEPLOY.md` (moved 2026-09-26, size limit).
Each block says where it came from. Blocks marked *verbatim* were moved word for word from `STATUS.md` on 2026-09-20.

## What Clover is (rewritten 2026-09-20 with Danny)
A personal betting tool for Danny and Jaclyn. **Not a business, never will be** (Danny, 2026-09-20 — this supersedes "rookie weekend gamblers" and "strangers later"). An app, not an agent or bot. It does four jobs in one place, each feeding the next: **find** good slips, **change them or build your own**, **track** the bets actually placed, **learn** from that history. College (FBS) + NFL: winners, spreads, totals. It does not predict winners on its own and never places bets.
Full end-state doc (living, with the build order): https://claude.ai/code/artifact/4ca60202-44b4-46b4-bf77-db047f25ef2f

How Clover thinks, in the words agreed with Danny:
1. **The line is the prediction.** Weather, injuries and news reach Clover through the line moving. Clover never adjusts for them on top (finding 4).
2. **Clover does the math the apps hide** — true chance at any number, same-game correlation, slip value against the payout.
3. **The edge is a stale number** — an app still showing 45 after the market moved to 38. Picking the app's number on the line sheet prices it.

## Rulings of 2026-09-20
1. **No verdict on a made-up payout.** Hot Slips show the chance only. The verdict and a "needs X%, has Y%" line appear after the real payout is typed. The verdict scale itself is unchanged.
2. **History grades, it never steers.** Every placed bet is graded. Any day with a bet gets a recap at four levels: the slip, each pick (which one sank it, by how many points), the price (did the bet beat the closing line), and running habits (pick type, slip size, Danny vs. Jaclyn). Each pick is sorted good bet / bad bet separately from good luck / bad luck. **History never changes the suggested slips.**
2b. **The written recap is automatic**, produced overnight on Actions with a paid Anthropic API key that Danny creates and stores as a GitHub secret. The numbers also live in a History tab. **Deferred 2026-09-26 (Danny):** History ships numbers-only until the key exists; the ruling stands.
3. ~~Bets are saved to the shared Google Sheet~~ **Superseded 2026-09-25 (Danny): bets live in Supabase** - see the rulings of 2026-09-25. Still true from this ruling: browser-only storage is out, because Actions cannot see a browser.
4. **N/A stays exactly as it is.** One tap hides one pick type for one game and resets when the game ends. No standing hide rules, no cutoff slider. Heavy-favorite slips will keep topping Hot Slips; that is accepted.
5. **Apps in use: Underdog, PrizePicks, Kalshi.** Underdog is the main target (typed payout). Kalshi prices are in the odds feed (`us_ex`), so auto-filled Kalshi payouts are possible at the cost of a second region per pull — parked with multi-book. PrizePicks is believed to be player props only (unverified) — no help until the props phase.
6. **Keys:** see `STATUS.md` open items.

Also decided 2026-09-20: screens, one bet record, the "Proposed" tag rule and two rejections - moved word for word to `DESIGN.md` on 2026-09-24 (this file hit its size limit). Still in force.

## Rulings of 2026-09-25 (row 7, from the approved mockup https://claude.ai/artifact/SSRQRBwgm5aBZYk49jE1Gk)
1. **Bets live in Supabase, not the Google Sheet** (Danny). Project `clover` (ref `ptictqwxdqfzykpgwiqf`, free plan, us-east-1), tables `bets` + `picks`. Row rules: only emails in `members` can read or save; the page can add and void, never grade (column grants); GitHub writes closing numbers and grades with the secret key.
2. **Sign-in is an emailed link, once per device** (Danny). The publishable key in the page is public by design; the row rules keep strangers out.
3. **"Save bet" is its own tap** (Danny); "I placed this" stays the row-6 stamp. The bet id is made at the stamp, so a retried save can never make a second copy.
4. **Closing chance only for placed bets** (Danny). Every refresh re-prices each open saved pick at its OWN line from the sim table (`bets.py`) and overwrites; once the game kicks off the table is gone, so the last run before kickoff stands. "Closing" = the last line Clover saw.
5. **GitHub grades** (proposed in the mockup, approved with it): same `grade_leg` as `results.json`. Beat the close = the closing chance at your line is higher than the chance when saved. Slip = won / lost / push once every pick is graded.
6. **Void, never delete** (approved with the mockup). Voided bets are skipped by grading and History.
- **Open (asked 2026-09-25, Danny unsure):** how Underdog pays a slip with a pushed pick. Until known a no-miss slip with a push is graded "push".

## Rulings of 2026-09-26
1. **Save bet never refuses a started game** (Danny). The record is of a bet already placed in the app, so when it is saved is almost irrelevant - bet #1 was placed in Underdog just before kickoff and recorded just after. No kickoff guard, no warning. A pick recorded after its kickoff simply has no closing number (its table is gone); History shows it as "no close" and `beat_close` stays null.
2. **Past bets get backfilled** (Danny, 2026-09-26): he supplies them in chat; Claude writes them to Supabase through the connector. Clover's chance at placement comes from the refresh commit nearest the placement time (every refresh is a commit), never typed by hand.

## Rulings of 2026-09-26, evening (Hot Slips tab, from the approved mockup https://claude.ai/artifact/BemZVPCCov9ftUrCBLSpt4)
1. **Hot Slips is its own tab, first in the row: Hot Slips · NCAA · NFL · My Bet · History.** The NCAA and NFL tabs are the board only (games, filters, rail); the hot block is gone from them. The page opens on Hot Slips.
2. **One page, both leagues (Danny picked C of A merged list / B cross-league slips / C two sections):** college's top six, then the NFL's, no heading between them; a League chip (All · NCAA · NFL, default All) hides one. A slip never mixes leagues.
3. **Hot Slips ignore every board filter** (Danny: "ignore"). They search every upcoming game with a table; the pick-type chips and N/A still apply. Supersedes the 2026-09-19 split table in `DESIGN.md`.
4. **The v3 ticket** (Danny's Excel sketch, then v1 list / v2 stacked tables / v3 tables left to right; he picked v3): one strip per slip, the chance in a lit box on the left with "Use this slip" under it, one small table per pick to the right - header row = kickoff and pick type (To Win / Spread / Total), then two team rows with each side's chance, the pick lit. **Favored team on top** (Danny, replacing his first "home on top"); for a total, the home team carries Over and the away team Under, better chance on top. Narrow tables use the feed abbreviations; no "all 3 hit" line.
5. **No N/A button on a ticket. Tap a pick to N/A it** (Danny, in the mockup's comments): tapping either row of a pick's table opens that pick's menu - N/A, Prohibited for a same-game pair, Cancel. Supersedes ruling 1 of 2026-09-21 for hot tickets only; the rail keeps its N/A-next-to-Clear pattern.
6. **Hot Slips search this weekend only** (Danny picked A of A this weekend / B nearest game day / C all upcoming, after next week's games surfaced once Saturday's had kicked off). The window is the board's Thu-Mon one, rolling forward Monday night (`weekendWindow()`); a league with nothing left says so. Narrows the 2026-09-19 "all upcoming games" rule.
7. **A kickoff CFBD has not announced shows its date and "TBD"**, never the feed's 04:00 UTC stand-in (which read as Friday 11 PM in Texas). `cfbd.py` carries `start_time_tbd` as `tbd`; the board, rail, ladder and hot tickets read it.

## Rulings of 2026-09-24 (row 6, from the approved mockup https://claude.ai/artifact/7VoHDPSoVXQ4oWpqefsVT1)
1. **"I placed this" is a stamp, not a lock** (Danny). It records who, the payout, the time, the chance and the picks; picks stay editable, and the stamp says so when they change. Saving it anywhere is row 7.
2. **"How solid is it" = the 49-version grid + one word** (Danny picked C of A grid+sentence / B sentence / C grid+word). Solid / Mostly holds / Shaky; no sentence.
3. **The full My Bet screen draws picks as board rows** and opens the ladder in the side column. The old grid (`gcard`/`cellFor`/`legGroups`) and the dialog are gone - one drawing of a game.

## Rulings of 2026-09-24 (row 5)
1. **No Build tab** (Danny picked A of A/B). The ladder - every line for a game with Clover's chance at each - lives in the side column above My Bet, opened by a "Lines" button on the board row; on the full My Bet screen it opened in the dialog until row 6 moved it to the side column there too. One drawing (`ladder.js`). The old line sheet is gone.
2. **"This weekend" rolls forward** once the ending weekend has no game left that has not kicked off. Proposed in the row-5 mockup, built the same day; Danny's A covered the whole row.
3. **Abbreviations come from the feeds** - CFBD `/teams` `abbreviation` for college, ESPN's code for the NFL - never typed by hand. The board shows the full name where it fits and the abbreviation only where it would not.

## Rulings of 2026-09-21 (row 4, from the approved mockup)
1. **N/A is the edit button** *(hot tickets: superseded 2026-09-26 evening, ruling 5 - tap the pick instead; the rail part stands)*. Every hot-slip ticket carries one small N/A in its corner. Tapping it opens the ticket: an N/A button beside each pick, a "Prohibited" button under any same-game pair, and Done to close. One tap on a pick's N/A hides that pick type for that game and the slips rebuild (ruling 4 of 2026-09-20 stands). The My Bet rail uses the same pattern: one N/A next to Clear reveals the per-pick buttons. Tickets and the rail show no N/A or Prohibited until opened.
2. **Line-moved flag: yes, in My Bet only, at 3 points or more.** It is a final check on the bet being built, never on the game rows or hot slips. It watches the pick's own number: spread and winner picks watch the spread, total picks watch the total. Wording: "Line moved. Total opened 51.5, now 57.5." Data: `refresh.py` saves the first DraftKings line it sees per game; the page only reads it.
3. **Team color rule** as drawn on the canvas: see `DESIGN.md`.
4. **Tapping the other side of a pick type swaps the pick.** Over then Under holds only the Under; a game holds at most one pick per pick type. Replaces today's behaviour, where both sides could sit in the slip at 0%.

### Architecture (since the 2026-09-08 rebuild — "option B")
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
3. Edge is NOT predicting games; it is (a) alt-line pricing, (b) correlated same-game picks, (c) player props (next phase).
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

### Filters: which ones Hot Slips obey
Confirmed 2026-09-19; the table moved word for word to `DESIGN.md` on 2026-09-25 (size limit). **Superseded 2026-09-26 evening (ruling 3): Hot Slips ignore every board filter.**
