# Apple Shortcut: 9:30 pm auto-fill + reminder

The Shortcut reads today's numbers from Apple Health and opens Growth Journal with them already filled in. You only tap your scores.

Every step uses Apple's own **Shortcuts** app (it comes with iOS). Takes about 10 minutes, once.

> Your app URL: `https://rahulagg2305.github.io/growth-journal/`

## Before you start (important iPhone detail)
On iPhone, a link opened by a Shortcut opens in **Safari**, not inside the Home Screen app. Safari and the Home Screen app keep **separate** local storage.
That's fine, because both sync through your private GitHub repo. You just need to **enter your token once in Safari too**:
1. Open the app URL in Safari.
2. Go to Settings → paste your username, `growth-journal-data` and the token → **Test & connect**.

## Build the automation
1. Open **Shortcuts** → bottom tab **Automation** → **+** (or **New Automation**).
2. Choose **Time of Day** → set **21:30**, **Daily** → choose **Run Immediately** (turn off "Notify When Run" if you like) → **Next** → **New Blank Automation**.
3. Add these actions in order (use the search bar at the bottom to find each one):

**Steps**
- **Find Health Samples** → *Type*: **Steps** · tap *Add Filter* → *Start Date* **is today**.
- **Calculate Statistics** → **Sum** of *Health Samples*.
- **Set Variable** → name it `steps`.

**Distance**
- **Find Health Samples** → *Type*: **Walking + Running Distance** · *Start Date* **is today** · tap the unit and pick **km**.
- **Calculate Statistics** → **Sum** → **Set Variable** `km`.

**Sleep** (needs an Apple Watch or a sleep app that writes to Health)
- **Find Health Samples** → *Type*: **Sleep Analysis** · *Start Date* **is in the last 1 day** · add filter *Value* **is not** *In Bed* · add filter *Value* **is not** *Awake*.
- **Get Details of Health Sample** → **Duration**.
- **Calculate Statistics** → **Sum**.
- **Calculate** → *Result* **÷ 3600** (converts seconds to hours).
- **Round Number** → *to Tenths* → **Set Variable** `sleep`.

**HRV** (needs an Apple Watch)
- **Find Health Samples** → *Type*: **Heart Rate Variability** · *Start Date* **is in the last 1 day** · *Sort by* **Start Date** · *Order* **Latest First** · *Limit* **1**.
- **Get Details of Health Sample** → **Value** → **Set Variable** `hrv`.

**Open the journal**
- **Text** → type this, inserting each variable with the variable picker where shown in brackets:
  `https://rahulagg2305.github.io/growth-journal/?steps=[steps]&km=[km]&sleep=[sleep]&hrv=[hrv]#today`
- **Open URLs** → *Text*.

4. Tap **Done**. The first time it runs, iOS asks for Health permission. Tap **Allow** for each type.

## Test it now
- In the automation list, tap the automation → **▶︎ (play)**.
- Safari opens Growth Journal with a sky-blue banner: "Auto-filled from Apple Health: steps, km, sleep, hrv".
- Check the numbers match the Health app.

## Troubleshooting
- **A number is wrong or missing:** the app ignores values outside sane ranges (steps 0–100,000; km 0–100; sleep 0–16 h; HRV 1–300 ms) and you can type them yourself. If sleep is unreliable, delete `&sleep=[sleep]` from the Text action and type sleep manually.
- **No HRV:** HRV only exists if a watch writes it to Health. Without one, type it from your device or leave it blank.
- **Phone locked at 21:30:** iOS shows a notification. Tap it to run.
