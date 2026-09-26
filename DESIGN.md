# Clover — design direction

The look and the screen rules for every screen from row 4 on. Decided 2026-09-21 (row 3). Read before any mockup. Lives here, not in `DECISIONS.md`, because that file is at its size limit; the same tags apply (Decided / Proposed).

**The look is "A. Board, dark."** Danny picked it from three looks (A Board, B Ticket, C Ledger) drawn with real slips and lines. Canvas, with the live page next to it: https://claude.ai/artifact/S5HiPEgQ8Kys9uuApeKoTq (frame "A. Board, dark"). Rows 4-6 each start with a mockup in this look. B and C stay on the canvas for reference only.
- **Why it was needed:** a 3-pick hot slip drew three whole game grids (about 30 numbers, 9 N/A buttons, 9 column labels to say three things); "selected" was gold on tabs, dark green on chips and pale green on picks; the same game was drawn two ways; names were cut off.
- **Layout (Decided):** the sportsbook pattern. One row per game with Winner / Spread / Total columns. **My Bet is visible on the front door in a right rail** (picks, chance, payout box, whose bet, Open My Bet). Filters are one folded button. Text tabs with an underline.
- **Hot slips show only their own picks (Decided):** ~~headline chance, the picks (team, pick, chance), kickoff window, "Use this slip"~~ **redrawn 2026-09-26 evening as the v3 ticket (below)**; still no board rows on a ticket. Moving a line or swapping a pick happens after "Use this slip".
- **At the market line, spread and total buttons show the line only (Decided).** Winner always shows its chance. A spread or total shows its chance once its number differs from the market line. Why: at market every spread and total sits at 48-52%, so those numbers were noise, and hiding them makes a stale number (Under 40.5 at 61% when the market is 37.5) stand out. Every % still comes from the tables.
- **Colors:** ground `#14171B`, card `#1D2127`, line `#333A44`, text `#F1EFE8`, muted text `#A9AFBC`, accent `#57D68D`, selected fill `#1B4632`, text on accent `#0E1A13`.
- **One of each:** one selected look everywhere (selected fill + 1.5px accent border). One main button (accent, dark text). One secondary button (outline). Buttons 8px corners, cards 12px, nothing under 44px tall.
- **Type:** Archivo only (Google Fonts, already allowed by the page's CSP). Big numbers at 88% width, tabular figures. No all-caps labels.
- **Team colors on dark (Decided 2026-09-21):** use the main color if it is 2:1 or better against the card `#1D2127`; else the second color, if it has real color in it (not white, grey or black); else the main color lightened toward white until it reaches 3:1. Why: NFL teams have no second color and many college second colors are white. Only matters when a logo fails to load; the real page keeps logos.
- **Settled 2026-09-21:** N/A is the ticket's edit button (rulings of 2026-09-21 in `DECISIONS.md`) - *for hot tickets superseded 2026-09-26 evening: tap the pick (below).* Approved mockup: https://claude.ai/artifact/PCbU7P1A4UbhYm4tmvcmCn (first frame). Logos were dots on the canvas only because the canvas cannot load the logo site; the real page keeps logos.

## Screen rules decided 2026-09-20 (moved from `DECISIONS.md` on 2026-09-24, word for word)
- **Screens:** filters folded on load, one click to open; default view is today's upcoming games; Hot Slips always open, no Hide button; ~~Build Your Own moves to its own tab~~ **superseded 2026-09-24 (Danny, option A): no Build tab - building happens on the front-door board, with the ladder in the side column** (the board already was build-your-own after row 4; a tab would have drawn the same game a fourth way); long team names are abbreviated, never wrapped (built 2026-09-24: full name where it fits, abbreviation under 800px); full numbers on My Bet, not one word alone. ~~End-state tabs: NCAA Slips · NFL Slips · My Bet · History.~~ **Since 2026-09-26 evening: Hot Slips · NCAA · NFL · My Bet · History** (rulings of 2026-09-26 evening in `DECISIONS.md`).
- **Open to changing the UI** so it stops feeling clunky. A design-direction step (compare against 4–5 betting apps, mock up 2–3 looks for one screen, Danny picks) comes before any screen is rebuilt.
- **One bet record** follows a bet from tap to result (picks and numbers taken, market line and Clover's chance at placement, payout, whose bet, closing line and closing chance, scores and hit/miss). History is that table read back.
- ~~**Proposed, not yet ruled on:** Build tab uses the grid layout and retires the six-button layout.~~ Overtaken: row 4's board retired the six-button layout; row 5 dropped the tab (above). (The "line moved" flag was ruled on 2026-09-21, below.)
- **Do not write a proposal into a doc as "decided."** Danny called this out on 2026-09-20. Tag every line Decided / Earlier call / Proposed, and name the data that feeds a feature before proposing it. **When options are hard to picture, show a visual instead of describing them.**
- **Rejected 2026-09-20:** a rule based on what "most pick'em apps" offer — no feed reports that for game picks. Syncing betting accounts the way paid trackers do — needs stored passwords.

## The full My Bet screen (row 6, 2026-09-24)
- **Decided:** Has / Needs / Verdict in one row at the same size (Has and Needs to one decimal - the verdict lives in the gap), a bar with a "needs" marker, then pays -> fair pay -> back on average -> per $1. Verdict colors: Great `#57D68D`, Good `#9ED9A8`, Coin toss `#E3C170`, Bad `#F09A7A`, Terrible `#F2707A` (the grid uses the same five). "Shaky" is drawn in the Coin toss color, "Solid" in accent.
- **Decided:** every button 44px or taller, N/A and the remove x included. Tabs move with the arrow keys, Home and End.

## The bet record on My Bet (row 7, 2026-09-25)
- **Decided** (mockup https://claude.ai/artifact/SSRQRBwgm5aBZYk49jE1Gk): the stamp box under the bet card carries every state - Placed (Unmark + **Save bet**), first save on a device (email box + "Email me a link"), Check your email, Saved · Bet #N (+ Void), Voided (dashed border), Couldn't save (red border + Try again). Never says Saved until Supabase confirms. "Copy row for the log" is gone.

## The My Bet rail, option B (2026-09-26)
- **Decided** (Danny picked B, mockup https://claude.ai/artifact/RnyCzSaKPXVSAz1ps5gSXr ): whose bet on top; rows = pick ("O 65.5", "PITT -10.5", "PITT ML") left, game stacked in grey 13px (AWY @ HOM / 09/26 11a, shortest time), %, x; the pick and the %s at 16px bold like Analytics. Tapping the pick edits side + number. Analytics = Markov Prediction / Coin Toss Line / Good Bet Minimum + verdict word. Bet Amount + Pays Out, "Returns $X per $1" (not "ROI"). Save Bet at the bottom.
- **Decided:** whole numbers allowed (a tie pushes); typed lines within ±10 of market.

## Moved from `DECISIONS.md` on 2026-09-25, word for word
#### The Hot Slips page (Decided 2026-09-26 evening; mockup https://claude.ai/artifact/BemZVPCCov9ftUrCBLSpt4 , v3)
- Heading, one line of status, then League (All · NCAA · NFL) · Picks per slip · Pick types · Clear N/A in one row. Tickets one per row, full width: college's six, then the NFL's, no heading between. The rail stays on the right.
- **Ticket (`hot.js`, `hot.css`):** left, a 128px column - the slip's chance in a `--sel` box with `--acc` text, "Use this slip" (or "In My Bet") under it, the box stretching so the column matches the tables' height. Right, one table per pick in a grid (3 across; 2-pick slips 2 across; 4-6 wrap): header row kickoff · To Win / Spread / Total, then two 44px rows - logo, feed abbreviation (full name on hover), the number for spreads (`-3.5`) and totals (`O 57.5` / `U 57.5`), the chance. The favored team first (better chance first for a total); the pick's row is `--sel` with a 3px `--acc` bar and its chance in `--acc`; the other row is muted.
- **Tap a row** (rows are buttons) and the table becomes the pick's menu: its label, "N/A - not offered", Prohibited for a same-game pair, Cancel. The header's kickoff is `Sat 9/26 8:00 PM`, or `Sat 10/3 TBD` when the feed has no time yet (everywhere on the page: `kickDate()` / `kickTime()` in `preview1.js`). Under 1180px the left column goes above the tables; under 700px the tables stack.

#### Filters: which ones Hot Slips obey — CONFIRMED 2026-09-19, SUPERSEDED 2026-09-26 evening
**Now: Hot Slips ignore every filter below** - the page has its own tab, so a filter set on the board would be invisible there. `hotGames()` takes every game **this weekend** (the board's Thu-Mon window, rolling forward Monday night; ruling 6 of 2026-09-26 evening) with a table; pick-type chips and N/A still apply. The table stays for the record.

| Filter | Build Your Own | Hot Slips |
| --- | --- | --- |
| Date | applies ("Today" = the nearest day with games in the chosen Game status, since 2026-09-20) | **ignored** |
| Game status | applies | **ignored** (upcoming only) |
| Game time | applies | applies |
| Conference | applies | applies |
| Division | applies | applies |
| FBS / FCS / Top 25 | applies | applies |
