# Clover

A personal betting tool for Danny and Jaclyn. It shows the true chance a parlay slip hits and, once you type your app's real payout, whether the slip is worth it. College football (FBS) and NFL: winners, spreads, totals. It never predicts winners on its own and never places bets.

**Live:** https://skrongman.github.io/Clover/

## How it works
- The market line is the prediction. Clover plays every lined game out 20,000 times centered on that line (`sim.py`) and ships the result as lookup tables in `ratings.js`.
- The page (`index.html` + `preview1-3.js`) never simulates. Every % on every screen is a lookup in those tables.
- GitHub Actions refreshes the lines hourly Thu-Mon and commits the result, so the repo is also the line history.

## Files
| File | Job |
| --- | --- |
| `refresh.py` | The conductor. Pulls both leagues, runs the sims, writes the data files. |
| `cfbd.py` · `nfl.py` · `odds.py` | The feeds: CollegeFootballData, NFL (the-odds-api), DraftKings alternate lines. |
| `sim.py` | The one football. Nothing else does game math. |
| `common.py` | Shared helpers and `health.json` (calls left, credits left, feeds down). |
| `ratings_math.py` · `calibrate.py` · `bayes.py` | Research only. No model beat the closing line; nothing on the page uses them. |
| `ci/` | The safety net: `python ci/checks.py` runs every test. |
| `ratings.js` · `ratings.json` · `results.json` · `health.json` · `cache_*.json` | Written by the refresh. Don't edit by hand. |

## Project docs
Read in this order: `STATUS.md` (where things stand), `DECISIONS.md` (rules and settled findings), `CHANGELOG.md` (history).
