# Clover — decisions

Rules, settled findings and rulings. Read after `STATUS.md`. If an ask conflicts with anything here, say so before building.
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
2b. **The written recap is automatic**, produced overnight on Actions with a paid Anthropic API key that Danny creates and stores as a GitHub secret. The numbers also live in a History tab.
3. **Bets are saved to the shared Google Sheet** (leaning, 2026-09-20; runner-up is a private GitHub repo). Browser-only storage is out because Actions cannot see a browser. The Apps Script stays tiny and final (add a row, return all rows) so it never needs redeploying. The Sheet link is pasted into Clover once per device and never goes in the public code; Actions gets it as a secret.
4. **N/A stays exactly as it is.** One tap hides one pick type for one game and resets when the game ends. No standing hide rules, no cutoff slider. Heavy-favorite slips will keep topping Hot Slips; that is accepted.
5. **Apps in use: Underdog, PrizePicks, Kalshi.** Underdog is the main target (typed payout). Kalshi prices are in the odds feed (`us_ex`), so auto-filled Kalshi payouts are possible at the cost of a second region per pull — parked with multi-book. PrizePicks is believed to be player props only (unverified) — no help until the props phase.
6. **Keys:** see `STATUS.md` open items.

Also decided 2026-09-20: screens, one bet record, the "Proposed" tag rule and two rejections - moved word for word to `DESIGN.md` on 2026-09-24 (this file hit its size limit). Still in force.

## Rulings of 2026-09-24 (row 6, from the approved mockup https://claude.ai/artifact/7VoHDPSoVXQ4oWpqefsVT1)
1. **"I placed this" is a stamp, not a lock** (Danny). It records who, the payout, the time, the chance and the picks; picks stay editable, and the stamp says so when they change. Saving it anywhere is row 7.
2. **"How solid is it" = the 49-version grid + one word** (Danny picked C of A grid+sentence / B sentence / C grid+word). Solid / Mostly holds / Shaky; no sentence.
3. **The full My Bet screen draws picks as board rows** and opens the ladder in the side column. The old grid (`gcard`/`cellFor`/`legGroups`) and the dialog are gone - one drawing of a game.

## Rulings of 2026-09-24 (row 5)
1. **No Build tab** (Danny picked A of A/B). The ladder - every line for a game with Clover's chance at each - lives in the side column above My Bet, opened by a "Lines" button on the board row; on the full My Bet screen it opened in the dialog until row 6 moved it to the side column there too. One drawing (`ladder.js`). The old line sheet is gone.
2. **"This weekend" rolls forward** once the ending weekend has no game left that has not kicked off. Proposed in the row-5 mockup, built the same day; Danny's A covered the whole row.
3. **Abbreviations come from the feeds** - CFBD `/teams` `abbreviation` for college, ESPN's code for the NFL - never typed by hand. The board shows the full name where it fits and the abbreviation only where it would not.

## Rulings of 2026-09-21 (row 4, from the approved mockup)
1. **N/A is the edit button.** Every hot-slip ticket carries one small N/A in its corner. Tapping it opens the ticket: an N/A button beside each pick, a "Prohibited" button under any same-game pair, and Done to close. One tap on a pick's N/A hides that pick type for that game and the slips rebuild (ruling 4 of 2026-09-20 stands). The My Bet rail uses the same pattern: one N/A next to Clear reveals the per-pick buttons. Tickets and the rail show no N/A or Prohibited until opened.
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
- **Don't hand Danny GitHub chores Claude can do itself** (2026-09-20, emphatically). Claude has write access: push, verify, and report. Only the three limits under "Deploying changes" — oversized files, `.github/workflows/`, and triggering Actions — are his, and each should be named with the reason, not as a to-do list.
- Novice coder — never ask him to run git or a terminal.
- ~~`PAYOUT` stand-in table~~ **deleted 2026-09-20 under ruling 1.** A payout exists only once it is typed on My Bet; until then there is no verdict on My Bet, the bottom bar or the copied row.
- Streamlit rejected. GitHub Actions + Pages chosen instead.
- Skip the "Odds API Automation" MCP wrapper (Composio middleman) — asked twice, answered twice.
- `theoddsapi.com` (no hyphens) is a look-alike service — ignore that account.
- Wants Clover built to a professional-grade product standard — sleek, efficient, accurate.
- **Parked:** a standing rule that recurring, well-defined tasks get reviewed as Cowork background candidates. Danny added it 2026-09-19 then parked it until the redesign shipped. Revisit when he raises it.
- **Superseded 2026-09-20:** "Rookie weekend gamblers" and "professional-grade for strangers" are replaced by *personal use for Danny and Jaclyn*. "Simple beats complete" and "likes 3-pick slips" stand. "One word" is replaced by full numbers with the verdict among them.

### Filters: which ones Hot Slips obey — CONFIRMED 2026-09-19
The old rule ("all filters apply to both") is **split**. Hot Slips always search all **upcoming** games so a thin Thursday or a bowl-season Tuesday can't starve the search (`hotGames()`).

| Filter | Build Your Own | Hot Slips |
| --- | --- | --- |
| Date | applies ("Today" = the nearest day with games in the chosen Game status, since 2026-09-20) | **ignored** |
| Game status | applies | **ignored** (upcoming only) |
| Game time | applies | applies |
| Conference | applies | applies |
| Division | applies | applies |
| FBS / FCS / Top 25 | applies | applies |

### Deploying changes (updated 2026-09-20)
Claude has **direct GitHub read/write** via the GitHub connector (authenticated as SKRONGman) and pushes straight to `main`. **Never ask Danny to run git or a terminal.** Three hard limits, all confirmed by hitting them:
- **The write tool takes file contents inline** — it cannot read from Claude's workspace. Anything over roughly **25 KB must be split into multiple files** or it truncates mid-call, and a truncated file still commits successfully and silently breaks the app. That is why the page is four scripts (`preview1.js`, `filters.js`, `preview2.js`, `preview3.js`) plus `clover.css`, and why `refresh.py` is six modules. **Every code file is now pushable** (split 2026-09-20); `ci/checks.py` fails any hand-edited file at 24.8 KB.
- **`.github/workflows/` is refused with 403** — "Resource not accessible by integration". The connector token lacks the `workflow` scope, and no phrasing gets around it. Workflow edits are a manual upload, every time.
- **Claude cannot trigger or read GitHub Actions runs**, and cannot read or set Secrets. Running a refresh is Danny. **But the committed output is better evidence than the log anyway** — `ratings.js` and `results.json` are in the repo after every run, and Claude can read and analyse them directly. Do that before asking Danny for a log.
- **Run `python ci/checks.py` before every push; don't push on a failure.**
- **Always verify a push.** `git clone` the repo into the workspace (public read works from the sandbox), edit and test there, push via the connector, then compare `git hash-object <file>` with the blob `sha` the push returns (same bytes = same sha), or `git fetch` and md5. Finish by running the checks on a fresh clone. Used on every file shipped 2026-09-20. **Verification is not a formality — it caught a dropped settled rule in the first STATUS.md push of 2026-09-19.**
- **One file per push means the page passes through mixed states.** Push order that keeps the live page working: new files first, then the scripts that only *use* new things, `index.html`, and last the script that *removes* things. Expect one red Checks run in the middle.
- **Test the page headlessly before pushing.** A Node stub of `document`/`localStorage` plus the real `ratings.js` runs `init()` and every render path in about a second, and catches exactly the class of bug that shipped tonight.
- Claude **cannot reach `skrongman.github.io`** from its sandbox (egress allowlist). **Since 2026-09-24 the desktop app's built-in browser can** (Danny allowed the site for it) whenever this chat is linked to his computer; otherwise Danny checks.
- The write tool turns `\uXXXX` escapes in a file into the characters themselves, so that push's sha will not match `git hash-object`. Same code; take GitHub's copy locally and move on (hit on `rail.js`, 2026-09-24).
- **File deletions require Danny's approval** in the UI; Claude's delete call is refused without it.
- The connector must be toggled on for each chat session, not just authorized at the account level.
- Anything that needs CFBD / ESPN / the-odds-api.com runs on Actions only.
- **Added 2026-09-20 — Claude in Chrome closes three of those gaps when Danny's Chrome is open with the extension connected:** Claude can open the live page and check it; can read Actions run logs and re-run a failed job from the run page; and, with Danny's go after he has reviewed the file, can create or edit files under `.github/workflows/` through GitHub's web editor. Each site needs Danny's one-time permission click. **Keep the Chrome window in front** — in a hidden window clicks and screenshots fail and page timers stall. Claude never enters, creates or deletes credentials; Secrets and tokens stay Danny's.
- **GitHub emails every failed run to Danny's Gmail**, and Claude can read Gmail. Check there first when a refresh looks stale.
- **Workflow files stay thin** — a workflow only calls a script Claude can push (`ci/checks.py`), so the 403 matters once per workflow, not once per change.
- **Keep every pushed file under 20 KB.** `STATUS.md` was split into three files on 2026-09-20 for this reason.
