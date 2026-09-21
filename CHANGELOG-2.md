# Clover — changelog, part 2

History only, newest first. Starts at row 2 (2026-09-20) because `CHANGELOG.md` reached the 20 KB house limit; everything older is there. Keep this file under 20 KB too.

## 2026-09-21 — row 3: design direction (mockups only, no code)
- Danny's words for the problem: nothing looks consistent, everything looks dated, the cards are too busy, it does not flow.
- **Audit of the live front door:** a 3-pick hot slip drew three whole game grids, so six slips put about 190 numbers on screen to say 18 things; spread and total chances at the market line are always 48-52%; three different "selected" colors; five button styles; the same game drawn two ways; names cut off; the slip invisible until you change tabs.
- **Apps compared** (reviews and public screenshots; Claude cannot log in): FanDuel (cleanest, fewest taps), DraftKings (the Winner/Spread/Total grid, but busier), Underdog (payout always at the bottom, big tiles mean lots of scrolling), PrizePicks and Kalshi (from memory, not checked that day).
- **Three looks** of the front door with that night's real slips and Saturday's real lines: A Board (sportsbook rows + right rail), B Ticket (dark pick'em tiles + bottom tray), C Ledger (airy list, chance drawn as bars). Danny asked for A in dark and picked it. Canvas: https://claude.ai/artifact/S5HiPEgQ8Kys9uuApeKoTq
- **Approved with it:** picks-only hot slips, My Bet visible on the front door, line-only spread/total buttons at the market line (explained on one game, Iowa at Michigan: Under 37.5 is 54%, Under 40.5 is 61%).
- **New file `DESIGN.md`** holds the look and screen rules; `DECISIONS.md` was too close to the 20 KB limit to take them.
- **Caught late, carried to row 4:** picks-only tickets leave N/A and Prohibited without a home. Ruling 4 is unchanged; only the placement is open.

## 2026-09-20 (late night) — row 2: the truth pass
- **Hot slips: exact search** (`bestSlip`, a knapsack over games) replaces the 600-wide beam. Why 5- and 6-pick showed 4 slips: the beam's 600 best were near-copies of slip 1, and the "differ by half" rule threw them out. New = old in every slot the old search filled, so the earlier "narrower beam changed the order" worry is moot - there is no beam. Same-game combos are priced once per page load (that was 390 ms of every rebuild), 0% combos are dropped, and there is no timer. College 6-pick: 1,261 ms -> 132 ms in the sandbox.
- **"Today" follows Game status** (`defaultDayKey` in `filters.js`). Live bug found while testing: Sunday night the NFL default view (Today + Upcoming only) was empty. An empty list now names the filter hiding the games (`filterBlame`; Date is tried last, because someone who picked a day meant that day).
- **Ruling 1:** the `PAYOUT` stand-in table is deleted. No verdict on My Bet, the bottom bar or the copied row until a payout is typed. "Type your app's payout above" became "below" - the box is under the board.
- **Stale words all at 0.** Also cut: "both run close to most pick'em apps" (never measured). College lines are DraftKings first, then ESPN Bet, then Bovada (`BOOKS` in `cfbd.py`); all 65 lined college games tonight were DraftKings.
- **Files:** CSS -> `clover.css` (25 dead rules removed), filters -> `filters.js`. `index.html` had been 33 bytes under the push limit. Script tags carry `?v=20260920`.
- **Checks:** page wiring, plus six smoke checks (6 slips from a full slate, none at 0%, order, overlap, no verdict before a payout, default view never empty, one-game slate). Two were proven by breaking the code on purpose. `smoke.js` now loads whatever `index.html` loads.
- **Push order** that kept the live page working through eight single-file pushes is written into `DECISIONS.md` > Deploying changes. One red Checks run in the middle was expected (`36ee95d`).
- **Finished-game contrast:** pick text was effectively 1.77:1 (78% card fade x 60% disabled fade), score chips 2.46:1, Final chip 3.99:1. Fixed the same night after Danny OK'd a before/after mockup: both fades removed, same grey look in solid colors, text `--done:#4F5C57` (5.4:1 on the grey chip, 6.5:1 on paper). Locked cells on My Bet and hot slips got the same treatment.
