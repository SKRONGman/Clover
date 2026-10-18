# Clover — changelog 4

Continues `CHANGELOG-3.md` (which reached the 20 KB house rule). History only: the
why behind a change. Rules and settled findings live in `DECISIONS.md`, dated
rulings in `RULINGS.md`, screen rules in `DESIGN.md`, where things stand in `STATUS.md`.

## 2026-10-18 — the props schedule never fired, and the pull moved
- **The report (Danny, 9:53 AM CT):** "Still has not loaded - Jacksonville vs Houston already kicked off."
- **Not a code fault.** `gh workflow list` showed **NFL props / active**, and a manual `workflow_dispatch` in plan mode came back green on every step - checkout, the shape tests, the pull, the page boot, the commit. The pipeline was sound. **GitHub had simply never run the cron**, not once, in 14 hours. `20 13-23 * * 0,1,4` includes Sunday, and 13:20 and 14:20 UTC had both passed.
- **Why:** scheduled runs on this repo are dropped and delayed badly. `refresh.yml` should have run six overnight slots (00:05-05:05 UTC) and ran three - 00:41, 04:17, 09:27 - the last **4h22m** late. A brand-new schedule competing for the same queue lost every time. This was visible in Saturday's sync (the refresh firing every 2-3 hours instead of hourly) and was left as a footnote instead of treated as a constraint; props were then built on exactly the mechanism that was already known to be unreliable.
- **Fixed (ruling 1 of 2026-10-18):** the pull moved into `refresh.yml` as a `continue-on-error` step after the lines commit, so a props failure can never cost a lines refresh. `props.yml` deleted.
- **`due()` rewritten to tolerate delay.** The old version wanted a run inside a +/-30 minute window, plus a morning sweep that fired only when `now.hour == 14` - so today's 15:00 run missed the sweep and the late games got nothing. Now: a game nobody has priced is pulled the first time any run sees it, then marks are claimed nearest-kickoff-first, each at most once, and a mark whose moment has passed is still taken up to 45 minutes late. Better a number 40 minutes before kickoff than no number at all. Ten assertions cover it, including a game whose 2-hour run was dropped still getting a late price.
- **One manual pull with Danny's go** (~48 credits): 7 noon games, 421 props, `e1c3864`. JAX/HOU was already gone and is not recoverable.
- **Two bugs found by using the real page, again.** (1) Every row read **"—"** until a number was typed - 421 dashes on open - because the Chance cell priced only the typed number, while `DESIGN.md` said a blank field prices the book's line. It now prices the book's line by default, and falls back to it when the field is cleared. (2) `props.js` is 81 KB of generated data and the file-size guard fails anything over 24.8 KB, so the next code push would have gone red on a file nobody edits by hand; it joins `ratings.js` in `MACHINE_WRITTEN`.
- **Cache tag `?v=20261018a`, bumped in the same commit as the page change** - the lesson from last night, applied.
