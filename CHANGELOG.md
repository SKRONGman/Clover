# Clover — changelog

History only. Newest first. Current state is in `STATUS.md`; rules and settled findings are in `DECISIONS.md`.
Sections dated 2026-09-20 (pipeline) and 2026-09-19 (redesign) were moved here word for word from `STATUS.md` on 2026-09-20.

## 2026-09-20 (evening) — audit, end state, CFBD outage
- **Five-phase audit** (chat reconciliation, code, UI/UX, instructions, automation). Nothing pushed during the audit. Findings are folded into the build order in `STATUS.md`.
- **Live page checked in Danny's real Chrome** (Claude in Chrome extension, first use). Confirmed: "Final" chip wraps on 15 of 54 college cards; stale words on screen ("Add picks from the Slips tab", "NFL lines from ESPN BET", "See the Card", tab title "Clover — The Card"); My Bet shows the % at 64px and the verdict at 24px; filters take about two-thirds of the first screen; hot slips 6-pick takes 2.2 s on his laptop and returns 4 slips under a "Top 6" header; finished cards are faded to 78% on top of a 3.48:1 chip, about 2.5:1 effective. Dropped: the "(14m ago)" bug — checked live, it is correct.
- **New finding:** the top 3-pick college slip was three 35–42 point favorites at 97%, graded "Great, +485¢" because of the stand-in 6x payout. Led to ruling 1 (no verdict until a real payout is typed).
- **End state rewritten with Danny** as a Claude Doc, "Clover — End State, v2": https://claude.ai/code/artifact/4ca60202-44b4-46b4-bf77-db047f25ef2f . Personal use only, four jobs (find / change or build / track / learn), one bet record, six rulings. Rulings are recorded in `DECISIONS.md`.
- **Outage, 3:05–6:10 PM CT.** Four hourly runs failed with `Out of API calls for the month (429)` — CFBD's free tier is 1,000 calls per calendar month and Clover used them by the 20th. Because `get()` calls `sys.exit` on a 429, the NFL pull (a different provider) died with it. Found through GitHub's failure emails in Gmail, diagnosed by reading the run log in Chrome. **Fix:** Danny moved CFBD to Patreon Tier 1 ($1/mo, 5,000 calls). Claude re-ran the failed job from the run page; it succeeded (`Lines refresh 23:21 UTC`). The code weakness is not fixed yet — it is in build row 1.
- **Keys:** `ODDS_KEY` replaced 2026-09-19. `CFBD_KEY` replaced 2026-09-20 and confirmed valid (a 429, not a 401, on the first run with it). Old GitHub PAT still to be deleted by Danny.
- **STATUS.md split into three files** (this commit set) because it had reached 25.8 KB, the size at which the write tool truncates silently.

## The pipeline change (2026-09-20)
Open items 1–3 of the previous list, built as one unit. **All deployed and confirmed working on the 02:01 UTC run.**
- Page files pushed by Claude and md5-verified (`510724d`, `ef73c20`, `c6836b7`, `b5b51cd`, plus the `onBoard` fix `0c53b4b`). `refresh.py` and `refresh.yml` uploaded by Danny (`de430b6`, `aa83708`) — `refresh.py` landed byte-identical to the staged copy.
- **First live run:** 171 games in the file — 104 upcoming, 29 live, 38 final. All 38 finals carry scores and their closing lines; 48 sim tables for 48 upcoming lined games (so the tables ARE being stripped at kickoff). `results.json`: 38 rows, 228 graded picks, **114 hit / 114 miss** — the even split is the proof the grader is right, since every pick has an opposite side. CFBD's `completed` field is named as assumed. 167 teams have a second colour. NFL came through odds-api (28 games); ESPN 403'd on all three attempts, as expected.
- **Bug found and fixed on the first look at the page** (`0c53b4b`): `onBoard()` required a sim table OR the frozen six, so games that were already final when the feature shipped were filtered out of existence — "Final (today)" showed `Showing 0 of 20` with an empty board. A kicked-off game now only needs a line and a score. **Lesson: a new field the old data lacks must never be the test for whether a row is visible.**
- **One-time gap, cannot be fixed:** the 38 finals of 2026-09-19 have `p: null` — they never saw a pre-kickoff refresh with the new code, so nothing was frozen. On the page they show `—` where the percentage goes; in `results.json` their 228 rows grade hit/miss with no probability attached, so they are **useless for calibration**. Every game kicking off after 2026-09-20 02:01 UTC carries real frozen percentages. Decide whether to drop those 38 rows so the record starts clean (open item 1).
- **"In progress" will read 0 until the slate rolls over**, same cause: CFBD reports no points until a game is final, so tonight's live games have no score and no frozen six. Going forward a live game shows the matchup, an "In Progress" chip and its percentages.
- **Untested:** the NFL scores path (`pull_nfl_scores`, the-odds-api `/scores?daysFrom=1`, 2 credits). College scores rode in free on CFBD's `/games` call and are confirmed; the NFL call has not run against a finished NFL game yet. **First NFL Sunday is the test** — check the log for `NFL scores: N of N kicked-off games scored`.

### What a game looks like now
Every game in `upcoming` carries `status`: **upcoming / live / final**, and `hp`/`ap` (the score) once it has kicked off. Games stay on the board for **24 hours after kickoff** — not "today", because the server runs on UTC and a calendar-day rule would drop Saturday night's finals while it is still Saturday evening in Texas (`RECENT_HOURS` in `refresh.py`).
- A kicked-off game **keeps the line it closed at** (`carry_history` re-freezes it from the previous file every run — the feed's line can drift after kickoff and that is not what the picks were priced at).
- A kicked-off game **loses its 20,000-run table**. That is ~5 KB a game; keeping them would have roughly doubled `ratings.js` on a Saturday night (400 KB → 700 KB) to answer questions the final score already answers.
- What survives instead is `g.p` — the **six frozen percentages** (`homeML/awayML/homeSp/awaySp/over/under`) as of the last pre-kickoff refresh, ~60 bytes. That is what the page shows on a finished card, and it is the number any later calibration check has to use.
- **`S.legs` now carry `p0`**: what Clover said about that pick *at the moment you tapped it*. Stored in `cloverSlip`, not in the lines file. This is the single field that makes bet tracking testable later (open item 2) — without it you can never ask whether the 47% picks land 47% of the time.

### On screen
- **Build your own**: a kicked-off game dims, its six picks lock, and the header becomes score chips + kickoff time + status. Team colors while live, **grey once final** — color means "this is still moving". The home chip darkens automatically when the two teams' colors are too close to tell apart (Georgia/Alabama crimson); `R.colors2` (CFBD `alt_color`) supplies the chip text color, falling back to white when contrast is under 3.5:1.
- **My Bet**: cells on a started game are locked, and a settled leg is marked WON or LOST from the score. The big number drops settled legs out of the math and reads *the chance the remaining legs hit* — "2 legs in, chance the other 1 lands". Any lost leg ⇒ 0% and "Lost".
- **Hot slips are unaffected** — they only ever search games that still have a table.
- **No hit/miss grading on screen** (Danny, 2026-09-19): the user has no reason to see the whole board graded. It is recorded on the back end instead.

### results.json — the calibration record
New file, written by `refresh.py`, committed by the workflow, **never shipped to the page**. One row per finished game: final score, closing line, and for each of the six picks its line, Clover's frozen %, and hit/miss/push. Append-only and deduped by game id, because `ratings.json` is overwritten every refresh and this has to outlive it. ~38 rows on the 2026-09-19 college Saturday.

### Cost
- **NFL hourly**: `NFL_ODDS_MIN_HOURS` 20 → **0**. The throttle was a free-tier relic. ~2 credits/pull × ~14 runs/day × 5 days ≈ 140/week.
- **NFL scores**: the-odds-api `/scores?daysFrom=1` = **2 credits** (1 without `daysFrom`, but `daysFrom` is what includes completed games). Only called when a kicked-off NFL game exists, so quiet days cost nothing. ~30/day on an NFL Sunday.
- **College scores cost nothing** — CFBD's `/games` call `pull_upcoming` already makes returns `home_points`/`away_points`/`completed`. No new endpoint.

### The app is now FOUR files
`index.html` + `preview1.js` + `preview2.js` + **`preview3.js`** (new). The split moved: preview1 = data/filters/odds math/state, preview2 = build-your-own + card grid, preview3 = hot slips/line sheet/N-A/wiring/boot. Reason is unchanged — the 25 KB inline transmit limit, which both old files had grown past. `legRow()` (dead since the redesign) was deleted in the same pass. **All four load in order in `index.html`; they share one global scope.**

## The 2026-09-19 redesign — LIVE
Promoted to `index.html` at commit `7ff7085`, byte-identical to the preview Danny tested.

### What changed
- **Header:** tagline gone. Reload gone (it only called `location.reload()` — it never fetched lines; new lines only arrive when Actions commits). The stamp now reads `Last refresh — Sat 1:12 PM (14m ago)`, sits beside "Clover", and uses the **newer** of `lines_generated` vs `alt_generated`.
- **Three tabs:** `NCAA Slips` / `NFL Slips` / `My Bet` (was Slips / The Card). The league switch is gone — tabs drive it. Game counts live in the tab labels, and count **upcoming games only** — what you can still bet. **A slip can still mix leagues**; My Bet tags each game College/NFL when mixed.
- **Filters, per league, saved separately per tab** (`cloverFilters`). Row 1: Filters + Conference + (Classification | Division). Row 2: Date / Game time / Game status. Row 3: Clear All Filters + Clear N/A.
  - **Conference** is a dropdown for college (11+ conferences won't fit as buttons) and AFC/NFC buttons for the NFL.
  - **Division** is North/South/East/West buttons that **combine** with the conference buttons (AFC + South = AFC South). Not eight buttons — they don't fit. Matching is on the tail of `home_div`/`away_div`.
  - **Game status** is a dropdown (Upcoming only / In progress / Final (today) / All statuses), default **Upcoming only**. Three chip groups would not fit one row. **Working as of 2026-09-20.**
- **Date** defaults to **today, rolling forward to the next day that has games** (`defaultDayKey`). Dynamic label: "Today (Sat 9/19)" or the rolled-forward date. "This weekend" survives as a choice. "All upcoming dates" renamed **"Any date"**.
- **Hot slips** are collapsible (state in `cloverHotOpen`) and the subhead says "searches all upcoming games".
- **The card is a Winner / Spread / Total grid**, teams as rows, **Over on the home row, Under on the away row** (same pattern Underdog uses in its list view). Tapping any cell adds or removes that pick — that is what "tap to edit" means now. Green check + tinted cell marks the pick. Rank badge, payout line and `est.` chip are gone from hot slip heads; the head reads `98% Win Rate Probability`. Used by **both** hot slips and My Bet (`legGroups`).
- **The −/+ nudge buttons are gone from the card.** The line sheet is still reachable: any selected spread/total gets a chip below the grid ("Indiana −38.5 · all lines") that opens it.
- **"Not on my app" → "N/A"**, and N/A now blocks a **whole market for that game** (one button per column blocks both sides), which is how a book actually behaves. Clear N/A moved up into the filters.

### Known gaps in the shipped build
- **"Build your own" still uses the old six-button layout.** The grid was only approved for the card. Open item 4.

## Superseded on 2026-09-20 — kept word for word
These three blocks were replaced by rewritten versions in `STATUS.md` / `DECISIONS.md`. Nothing here is current.

### Old header
(title) Clover — project status

Last updated: 2026-09-20 (PIPELINE SHIPPED AND RUNNING — finished games on the board with scores, NFL hourly, results.json grading. First live run confirmed: 104 upcoming / 29 live / 38 final, 38 games graded.)

### Old "What Clover is"
**An app, not an agent or bot.** One web page fed by `refresh.py`. You tap picks onto a slip; it tells you the true chance the slip hits and whether the payout is worth it, in one word. It does not predict winners, act on its own, or place bets. Covers **college (FBS) and NFL** — winners, spreads, totals.

### Old open items list
**Next chat**
1. **Decide on the 38 uncalibratable rows** in `results.json` (2026-09-19, `p: null`). Drop them so the record starts clean, or leave them — they grade correctly, they just can't answer "do 47% picks land 47%".
2. **Bet tracking.** Danny chose **the Google Sheet** (option B) over browser storage or a database. Capture: app used (DraftKings / Underdog / etc. — a dropdown, since there's no book filter), each leg with its line, wager, projected winnings, boost/promo as % or $, and the settled result **per leg**. Claude's additions Danny hasn't ruled on yet: **the line you actually got vs. the line Clover had**, **timestamp placed**, **the closing line** (beating the close is the only measure that reads true on small samples), who placed it, and a free/promo flag separate from the boost amount. **Clover's probability at placement is now captured automatically** (`leg.p0`) — that one is done. Scores and grading now exist, so this is unblocked.
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
