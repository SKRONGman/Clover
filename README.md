# Clover — The Card

A one-page app that tells you the true chance a college football pick (or slip of picks) hits, and whether the payout is worth it.

**Live page:** turn on GitHub Pages (Settings → Pages → Branch: main, folder: / root) and the link appears there.

## Files
- `index.html` — the app. Loads `ratings.js`.
- `ratings.js` / `ratings.json` — this week's games, lines, and team ratings. Rewritten automatically by the refresh job.
- `refresh.py` — pulls games and betting lines from CollegeFootballData and writes the two files above.
- `.github/workflows/refresh.yml` — the schedule that runs `refresh.py` on GitHub's servers.
- `bayes.py`, `calibrate.py` — research tools (model calibration). Not needed to run the app.
- `cache_*.json` — last season's data, cached so the refresh doesn't re-download it.

## Setup (once)
1. Settings → Secrets and variables → Actions → New repository secret → name `CFBD_KEY`, value = your key.
2. Actions tab → "Refresh lines" → Run workflow → mode `full`. Wait ~1 minute. `ratings.js` updates.
3. Settings → Pages → Source: Deploy from a branch → Branch `main`, folder `/ (root)` → Save. Your link appears at the top of that page in a minute or two.

## Every week after that
Nothing. Lines refresh hourly on game days and ratings daily. Open the page; the header says how old the lines are. Tap "Refresh lines" to reload.

## Updating the app
Upload a new `index.html` (Add file → Upload files, drop it in, Commit). The live page updates within a couple of minutes.

## History
Every refresh is a commit. Click any file → History to see what the lines were at any point in time.
