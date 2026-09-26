# Clover

A personal betting tool for Danny and Jaclyn. It shows the true chance a parlay slip hits and, once you type your app's real payout, whether the slip is worth it. College football (FBS) and NFL: winners, spreads, totals. It never predicts winners on its own and never places bets.

**Live:** https://skrongman.github.io/Clover/

## How it works
- The market line is the prediction. Clover plays every lined game out 20,000 times centered on that line (`sim.py`) and ships the result as lookup tables in `ratings.js`.
- The page (`index.html` + nine small scripts, `preview1.js` first and `preview3.js` last) never simulates. Every % on every screen is a lookup in those tables.
- Bets you place are saved to Supabase (`record.js`); every refresh fills in the closing line and the grade (`bets.py`). History reads that table back.
- GitHub Actions refreshes the lines hourly Thu-Mon and commits the result, so the repo is also the line history.

## Files
| File | Job |
| --- | --- |
| `refresh.py` | The conductor. Pulls both leagues, runs the sims, writes the data files. |
| `cfbd.py` · `nfl.py` · `odds.py` | The feeds: CollegeFootballData, NFL (the-odds-api), DraftKings alternate lines. |
| `sim.py` | The one football. Nothing else does game math. |
| `bets.py` | The bet record's GitHub half: closing numbers and grades for saved bets (Supabase). |
| `preview1.js` · `filters.js` · `preview2.js` · `rail.js` · `mybet.js` · `record.js` · `ladder.js` · `hot.js` · `preview3.js` · `clover.css` · `hot.css` | The page: data and slip state, filters, the games board, the My Bet rail, the full My Bet screen, the bet record, the ladder, the hot-slip ticket, hot-slip search + `init`. |
| `common.py` | Shared helpers and `health.json` (calls left, credits left, feeds down). |
| `ratings_math.py` · `calibrate.py` · `bayes.py` | Research only. No model beat the closing line; nothing on the page uses them. |
| `ci/` | The safety net: `python ci/checks.py` runs every test. |
| `ratings.js` · `ratings.json` · `results.json` · `health.json` · `cache_*.json` | Written by the refresh. Don't edit by hand. |

## Project docs
Read in this order: `STATUS.md` (where things stand), `DECISIONS.md` (rules and settled findings), `DESIGN.md` (the look), `DEPLOY.md` (how to push). `CHANGELOG.md` and `CHANGELOG-2.md` are history.
