# Clover — rulings by date

Every dated ruling. The newest block is first; the older blocks keep the order they had in `DECISIONS.md`. Split out of `DECISIONS.md` on 2026-09-27, word for word (that file hit its size limit). Settled findings, the architecture and Danny's directives stay in `DECISIONS.md`. Same tags: Decided / Earlier call / Proposed. If an ask conflicts with anything here, say so before building.

## Rulings of 2026-09-27 (props phase opens; scope chat with Danny)
1. **Props: option 3 - market-only first, a player sim later** (Danny picked 3 of 1 market-only / 2 player sim / 3 both in order). Step one prices a prop from DraftKings' own over/under (the vig taken out) at the app's number - the "stale number" edge, no new model, no correlation. The player sim tied to the game sim (edge (b) for props) is built only if step one shows props are worth it. Either way the page never simulates: Python ships lookups.
2. **NFL first** (Danny). College props wait: thinner book coverage, and grading needs box scores per player.
3. **Test on one past season, pulled before the Oct 1 credit reset** (Danny). `props_backtest.py` pulls 2025 NFL DraftKings props 10 minutes before each kickoff (6 markets: pass yds, pass TDs, rush yds, rec yds, receptions, anytime TD) into `props_hist_2025.json`; at most ~17,100 credits; it stops for good at 1,500 left so the live refresh never runs dry. No plan upgrade: September's leftover credits would not carry over anyway (believed, not confirmed).
4. **Build props step one now, with the two corrections** (Danny picked 1 of 1 build now / 2 test Underdog numbers first, after `props_check.py`): DK's over chance lowered ~3 pts on rush yds / rec yds and ~4 on receptions; anytime TD priced as (DK's Yes chance)^1.1.
5. **Its own tab, "NFL Props"; Danny types his app's number** (no `us_dfs` pull); **DK props pulled 3 times per game day** (morning, ~2 h before kickoff, ~15 min before). Replaces the live-pull proposal below. Screen mockup (the rest of it Proposed until Danny approves): https://claude.ai/artifact/KNH9NxRgfWHkwEVxwmQQv7
- **Earlier call, overtaken by 4 (2026-09-27):** step one is worth building with two fixed corrections - take ~3 pts off DK's over chance on rush yds / rec yds and ~4 on receptions, and price anytime TD as (DK's Yes chance)^1.1 - plus a count shape for receptions at other numbers. Not yet tested: whether Underdog / PrizePicks numbers differ from DK's enough to beat those corrections (no 2025 `us_dfs` pull exists).
- **Overtaken by 5:** live prop pulls a few times per game day, not hourly (~12 credits a game a pull with DK + `us_dfs`; hourly would outgrow the 20K plan).

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

## Rulings of 2026-09-26, night (row 8 History, from the approved mockup https://claude.ai/artifact/PufiYFbfdgymMATGfNsYfh )
1. **History is a ledger; tap a bet for its card** (Danny picked C of A cards / B ledger / C ledger + tap). Newest first. Whose (All · Danny · Jaclyn) and League chips; voided bets hidden until "Show voided", then greyed.
2. **Good bet / bad bet is sorted at the slip level** (Danny picked A): the verdict at placement crossed with the result - "Good bet · bad luck", "Bad bet · got lucky", "Coin toss · won". Per pick: hit / miss, the final and the points by, beat the close. The per-pick yardstick (each pick against its share of the needed chance) was offered and declined.
3. **Clover reviews every game it scored** (Danny: "we'll only track mine and Jaclyn's bet history, but Clover should review all games scored and learn from it"): `R.scorecard` boils `results.json` down to chance bands -> hit rate, per league, next to a tile for their own graded picks. It is a report card: the sim's widths still change only on `calibrate.py --tails` evidence (finding 2), and History never steers the slips (ruling 2 of 2026-09-20).
4. Numbers only for now (2b stands); the card shows a bet's written recap once `bets.recap` exists.

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
