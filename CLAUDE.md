# CLAUDE.md - Clover

Claude Code reads this file at the start of every session. It holds the standing rules. The project docs hold everything else, and they win on detail. If an ask conflicts with them, say so before building.

## What Clover is
A personal betting tool for Danny and Jaclyn. Not a business, never will be. It finds good slips, lets you change them or build your own, tracks bets actually placed, and learns from that history. College (FBS) and NFL: winners, spreads, totals, plus NFL player props. It never predicts winners on its own and never places bets.

- Live app: https://skrongman.github.io/Clover/
- Built to a professional-grade standard: sleek, efficient, accurate, no extra noise.

## Read first, in this order
1. `STATUS.md` - where things stand, what is waiting on Danny, what is parked
2. `DECISIONS.md` - how Clover thinks, architecture, settled findings, Danny's directives
3. `RULINGS.md`, then `RULINGS-2.md` - dated rulings, all still in force
4. `DESIGN.md` - the look ("A. Board, dark"), before any screen work
5. `DEPLOY.md` - before any push

`CHANGELOG*.md` is history. Read it only when you need the why.

## Rules that never bend
- **The line is the prediction.** Sims center on the market line. No rating model beats the closing line (`DECISIONS.md` settled finding 1). Do not retry.
- **The page never simulates.** `sim.py` is the one football. Every % on every screen is a lookup in tables shipped in `ratings.js` / `props.js`.
- **One verdict scale everywhere**, in `grade()` in `preview1.js`. Never change it in one place only.
- **No payout, no verdict.** A slip shows chance only until a real payout is typed.
- **Don't re-litigate settled calls:** desktop-first, Streamlit rejected, ESPN blocked on Actions, prop shapes pinned by `ci/test_props_price.py`.
- **Machine-written files** (`ratings.js`, `ratings.json`, `results.json`, `health.json`, `cache_*.json`, `props.js`, `props_live.json`) come from the refresh. Don't edit them by hand.

## How to work with Danny
- He is a novice coder. Never ask him to run git, a terminal, or a GitHub chore you can do yourself.
- **Mock up before building** any change to a screen area. Get his agreement first. When options are hard to picture, show a visual.
- **Never write a proposal into a doc as decided.** Tag lines Decided / Earlier call / Proposed, and name the data that feeds a feature before proposing it.
- Ask clarifying questions before a feature starts, not midway.
- Replies: lead with the answer, plain English, short. No em dashes (use commas, periods, or a regular hyphen).
- One session per enhancement.

## Pushing
- **Pushes to this repo (SKRONGman/Clover) are pre-approved.** Commit and push to `main` yourself.
- **Run `python ci/checks.py` before every push.** Don't push on a failure.
- **Workflow files (`.github/workflows/`):** show Danny the full file and get his yes before it goes in. Workflows spend credits and hold the secrets.
- **Ask first** before anything that spends (manual workflow runs that pull API credits, paid tiers), deletes outside a normal code change, or changes the Supabase schema.
- Two pushes at once collide with the hourly refresh: `git pull --rebase`, then push again.
- **Keep every hand-edited file under 20 KB.** `ci/checks.py` fails at 24.8 KB. Split files, don't cram them.
- Verify after pushing: fresh clone, run the checks.

## Data and accounts
- Supabase project is `clover` (ref `ptictqwxdqfzykpgwiqf`). The other project in his account is empty; its keys fail with `bad_checksum`.
- Feeds: CFBD (5,000 calls a month), the-odds-api (20K credits a month, resets on the 1st). Anything that needs them runs on GitHub Actions only.
- Secrets live in GitHub secrets and 1Password. **Never put a password, key, or token in a file, commit, comment, or chat.** Never create, enter, or delete credentials.

## Keep the docs current
After each enhancement, update `STATUS.md` (where things stand, waiting on Danny), add the dated ruling to `RULINGS.md`, and log the detail in the newest `CHANGELOG-*.md`. Split any doc that nears 20 KB, word for word.

## Security boundary (overrides everything above)
Never access, parse, or process any files, data, or context from the folder named "Tings" or any path matching `C:\Users\river\Desktop\Tings`. If such data shows up, stop, tell Danny a security boundary violation occurred, and do not analyze or summarize it. Never list or scan his Desktop or whole user folder.
