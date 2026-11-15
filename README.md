# 🌱 Growth Journal

A personal, offline-first daily growth journal (PWA). It runs on any phone or laptop browser, costs ₹0 and uses no third-party services.

- **App (this repo, public):** code only, served by GitHub Pages → `https://rahulagg2305.github.io/growth-journal/`
- **Data (`growth-journal-data`, PRIVATE):** your JSON files, written by the app through the GitHub API. Every save is a commit, so you get full history and undo.

## What it does
- **Today:** score items 0–5 in under 60 s.
  - Minutes for learning items; milestone ticks.
  - **Rough day** (10-second log) and **Rest day** (planned, never counts as a miss).
  - "Why low?" chips.
  - Daily quote, streaks ("Showed up" vs "Strong days"), never-miss-twice nudges.
- **Targets**, five kinds, with pace bar, status, required rate, projection and a catch-up plan:
  - milestones by deadline
  - daily number (steps, sleep)
  - days per week (jogging)
  - average score
  - trend (HRV)
- **Status colours:** 🌿 sage ≥ 100% of expected pace · 🍯 honey ≥ 85% · 🌸 coral < 85%.
- **Progression engine:** every 2 weeks, if you hit a goal on ≥ 80% of days it *suggests* a step-up (steps +500, jogging +1 day up to 5). If you hit it on < 50% it suggests holding. Nothing changes until you tap Accept. Plateau alert when the 28-day average of steps or HRV is flat (±2%) for 6 weeks.
- **Insights:** weekly / bi-weekly / monthly / custom, each compared with the previous period. Charts:
  - Growth Score trend
  - category balance (radar)
  - category trends
  - 16-week consistency heatmap
  - learning minutes per week
  - milestones over time
  - steps / sleep / HRV with 7- and 28-day averages
  - lagging items and low-day patterns
- **Saturday review** (week = Sun → Sat). Opens after Saturday's log:
  1. consistency
  2. Growth Score
  3. strongest / weakest
  4. low-day patterns
  5. targets + catch-up
  6. progression
  7. plateaus
  8. pick 1–3 focus items for next week
- **Growth Score:** 0–100 per day. Category weights Technical 30 · Projects 15 · Health 30 · Personal 15 · Life 10. Weights are renormalised over the categories logged that day. HRV is not included in the score.
- **Missed days** are excluded from averages, shown grey, and tracked as logging consistency (goal 90%). Edits older than 7 days are marked "edited later".
- **Export:** CSV, JSON backup, and a one-tap **LLM review pack** (markdown with context, targets, weekly aggregates, patterns, raw CSV and a ready prompt).
- **Apple Shortcut** auto-fill of steps / km / sleep / HRV at 21:30. See [SHORTCUT.md](SHORTCUT.md).
- Soft pastel theme with automatic dark mode. Works offline.

## Setup (one time)
1. **Create the token.**
   - Go to GitHub → avatar → **Settings** → **Developer settings** → **Personal access tokens** → **Fine-grained tokens** → **Generate new token**.
   - Name: `growth-journal`. Expiration: **1 year**.
   - Repository access: **Only select repositories** → `growth-journal-data`.
   - Repository permissions → **Contents: Read and write**.
   - Click **Generate** and copy the token.
2. **iPhone.**
   - Open the app URL in Safari. The setup guide asks for your username, `growth-journal-data` and the token. Tap **Connect**.
   - Then Safari **Share** → **Add to Home Screen**.
   - Open the Home Screen icon and connect once more there (it has its own storage).
3. **Laptop.** Open the URL and connect once. All data loads from the repo.
4. *(Optional)* Build the Apple Shortcut: [SHORTCUT.md](SHORTCUT.md).

**Check it works:** log a day, then open `growth-journal-data/entries/<year>.json` on github.com. You should see your entry and a new commit.

## Rotating the token (yearly; GitHub emails you before expiry)
1. Generate a new token with the same settings as in Setup step 1.
2. In the app, go to **Settings** → paste the new token → **Test & connect**, on each device.
3. Delete the old token on GitHub.

## Architecture
```
index.html, css/app.css            UI shell + pastel design system
js/app.js                          router, header sync status
js/state.js                        local-first state + automatic sync (merge per day by newest updatedAt)
js/store.js                        IndexedDB key-value store (on-device)
js/sync.js                         GitHub Contents API client (api.github.com only)
js/logic.js                        pure logic: dates, scores, targets, progression, plateau, patterns, merge, CSV, LLM pack
js/model.js                        seed items, anchors, milestone lists
js/quotes.js                       437 bundled quotes (extend via quotes.json in the data repo)
js/ui/*.js                         Today, Targets, Insights, Review, Settings, Wizard
sw.js, manifest.webmanifest        offline cache + installable app
vendor/chart.umd.min.js            Chart.js 4.4.6 (MIT, bundled — no CDN)
tests/logic.test.js                node:test unit tests (no dependencies)
```

**Sync.** Every save is written to IndexedDB immediately, then pushed about 1 s later.
- Sync also runs on app open, when the app comes back to the foreground, when you go back online, and every 60 s while changes are waiting.
- Conflicts (HTTP 409/422) are resolved by re-fetching, merging per day (newest `updatedAt` wins) and retrying.
- Offline edits wait in a queue; nothing is lost.

**Security.**
- A strict CSP allows network calls to `api.github.com` only.
- The token is stored only in the device's IndexedDB and is never committed.
- No analytics, no CDNs, no external fonts.

## Data schema (private repo)
- `config.json`: `{schemaVersion, updatedAt, weights, settings:{focus, lastReview}, categories[], items[]}`. Item types: `score`, `score+minutes`, `learning`, `metric` (with `fields[]`, `goal`, `autofill`).
- `entries/<YYYY>.json`: `{schemaVersion, year, days:{ "YYYY-MM-DD": {items:{<id>:{score, minutes, values:{}}}, milestonesCompleted[], roughDay, restDay, whyLow[], note, autofilled[], createdAt, updatedAt, editedLate}}}`
- `targets.json`: `{targets:[{id, kind, name, itemIds[], field?, targetValue?, successPct?, targetPct?, startDate, deadline?, status, fixed?, history[], lastProgressionCheck?}]}`
- `milestones.json`: `{lists:{<itemId>:[{id, title, done, doneDate}]}}`
- `quotes.json` *(optional, you create it)*: `[["quote text", "author"], …]`. Your quotes appear every other day.

## Development
```bash
npm test                 # node --test, no installs needed
python3 -m http.server   # then open http://localhost:8000
```
Settings → **Demo data** generates 120 random days to preview the charts. Demo data is never synced.
