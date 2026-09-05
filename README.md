# Rutin.app

## A daily routine tracker

An app for managing your daily routines, pending tasks, and Pomodoro sessions. Each habit can be tracked **by count** (press the button to add a completed session), **by time** (press it to start a countdown), or using both methods at the same time.

It doesn't require a server or an account: it's built with HTML, CSS, and JavaScript with no dependencies, and your data is stored directly in the browser using `localStorage`.

## Installing it on iPhone

The app is designed to work as an iOS app installed from Safari:

1. Open the app's URL **in Safari** (Chrome won't work: on iOS, only Safari can install it).
2. Tap **Share** (the square with the upward arrow).
3. Select **Add to Home Screen** → **Add**.

The app will appear alongside your other apps and open in full screen, without the Safari toolbar. It works offline, and your data stays on your phone.

### Native-like features

Several details were implemented to make the app behave more like a native iOS app:

* Custom icon, splash screens for common iPhone sizes, and a status bar color that follows the light/dark theme.
* Supports the notch, Dynamic Island, and the Home Indicator using `safe-area-inset`.
* No zoom when tapping an input field, no page bounce, no text selection menu on long press, and 44px buttons, following Apple's recommended minimum touch target.
* Selecting a different duration opens a bottom sheet with common durations instead of the browser's default dialog.
* Notification sounds are unlocked with the first user interaction, as required by Safari.
* The screen stays awake while a countdown is running using Screen Wake Lock.

### iOS limitations you should know about

* **When the app is closed or the phone is locked, iOS freezes JavaScript**: the alert sound won't play and no notification will be triggered when a countdown finishes. The countdown **is not lost**: when you return to the app, it recalculates the elapsed time using the timestamp. The session is saved with its minutes, and you'll see the message: *"A session was completed while you weren't looking."*
* **Notifications** on iOS only work when the app has been added to the Home Screen (iOS 16.4 or later) and while the app is open.
* If you need notifications while the app is closed, you need a real native app using something like Capacitor or SwiftUI. This version cannot provide them.

### About the "user system"

Profiles and routine sharing work **without a server or accounts**: everything is stored on the device, and routines can be shared through a link or code. This fits well with a static app published on GitHub Pages and installed on an iPhone.

What it **doesn't** do: there is no login system, cross-device synchronization, or shared routine wall. These features would require a backend (for example, Supabase or Firebase) with authentication and a database. The data model is already separated by profile, so this layer could be added later without rebuilding the app.

## Publishing

The repository includes `.github/workflows/pages.yml`, which publishes the app to **GitHub Pages** on every `push` to `main`.

To enable it, go to GitHub → *Settings → Pages → Source: GitHub Actions* (the repository must be public or you need a paid plan).

The URL will be:

`https://<username>.github.io/Rutin.app/`

## Running it on a computer

Open `index.html` in your browser.

If you prefer to serve it locally (required for installing it as an app and for offline mode):

```bash
npx http-server -p 8080 .
# Then open http://localhost:8080
```

In **Settings**, you can select **Load sample routine** to explore the app with example data.

## Features

### Routines

When creating a routine, you can choose how you want to track it:

| **Mode**     | **How it works**                                                                                | **Example**                               |
| ------------ | ----------------------------------------------------------------------------------------------- | ----------------------------------------- |
| **By count** | Press the button to record a completed session. The goal is a number of times per day.          | Gym once a day, drink water 8 times       |
| **By time**  | Press the button to start a countdown. When it ends, the session is recorded with its duration. | Read for 30 min, meditate for 10 min      |
| **Both**     | You have both buttons: quickly mark a session or track it with a timer depending on the day.    | Gym: mark it some days, time it on others |

Additional features:

* **Days of the week**: each routine can be scheduled for the days you want. Days when a routine isn't scheduled remain visible with the *Not scheduled today* label, in case you still want to do it.
* **⏱ Custom duration**: start a countdown with any number of minutes, not just the routine's default duration.
* **↺ Undo**: remove the last record of the day if you made a mistake.
* **Streaks**: consecutive days of completing a routine.

### Countdown Timer

When a session is running, a floating bar displays the remaining time:

* **Pause / Resume** without losing your progress.
* **Finish** records the minutes completed up to that point.
* **✕** cancels the session without recording anything.
* The session survives page reloads and closing the tab. When you return, it continues from where it should be. If the timer finished while you were away, the session is automatically recorded.
* The app plays a sound and, if permission is granted, displays a browser notification.

### Tasks and Pomodoros

* To-do list with estimated Pomodoros (`0/3 🍅`) and completed Pomodoros.
* The 🍅 button on a task opens the Pomodoro timer already associated with it. Each completed Pomodoro is added to the task.
* Configurable durations for focus time, short breaks, long breaks, and how many Pomodoros are required before a long break. Pomodoros can also be chained automatically.

### Calendar

A navigable monthly view where each day is colored according to the percentage of scheduled routines you completed. This makes it easy to see where you fell behind.

Clicking a day opens a detailed view showing each routine, what you completed, and what remains pending.

### Reports

The same report is available across four time scales: **day**, **month**, **year**, and **all time**, with arrows to navigate between periods.

* Completion percentage (completed / scheduled), sessions, time, and Pomodoros.
* Charts adapt to the selected period: by time of day for a day, by days for a month, by months for a year, or across the entire history.
* Routine-by-routine breakdown with completion percentages and detailed statistics.
* Period history, with the option to delete individual records.

### Profiles and Shared Routines

Multiple profiles can coexist on the same device, each with their own routines, tasks, and history.

You can switch profiles using the profile button in the header.

Routines can be shared with another person in three ways. In all three cases, **only the routine definitions are shared** — never your history, tasks, or personal data.

| **Method**          | **Purpose**                                                                                                                                                                                                                                 |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Link**            | Copy the link (or use the iOS sharing menu) and the recipient will see a dialog asking whether to add the routines. The routines are included directly in the URL using the `#share=...` fragment, so **they never pass through a server**. |
| **Code**            | The same content as plain text, which you can paste wherever you want. Import it from *Settings → Shared Routines*.                                                                                                                         |
| **Another profile** | Copy routines to another profile on the same device without leaving the app.                                                                                                                                                                |

When importing, you can preview what will be added and which profile it will go to. Nothing is added without confirmation, and routines with the same name are not duplicated.

Since shared links come from external sources, their contents are validated and restricted when imported: names, emojis, numbers, and out-of-range days are sanitized or discarded.

### Your Data

Everything is stored in your browser.

In **Settings**, you can **export** a copy as JSON, **import** it on another device, or **delete everything**.

When served over HTTP, the app can be installed as a PWA and works offline.

## Project Structure

```text
index.html            View structure, sheets, and dialogs
assets/styles.css     Styles (dark/light themes, iOS safe areas)
assets/icon.svg       Vector icon
assets/icons/         PNG icons (iOS and manifest)
assets/splash/        iOS splash screens
src/store.js          State, profiles, reports, calendar, and sharing
src/timer.js          Countdown timers and Pomodoros, audio, notifications, and wake lock
src/ui.js             View rendering
src/app.js            Application startup and events
manifest.json         PWA manifest
sw.js                 Service worker (offline support)
tools/                Icon and splash screen generator
tests/                Automated tests
.github/workflows/    GitHub Pages deployment
```

## Tests

```bash
npm i -g playwright && playwright install chromium   # first time only
./tests/run.sh
```

The test suite starts a static server and runs four suites: store logic without a browser (data migration, reports, calendar, and validation of shared-link data), plus three browser-based suites (desktop app, new features, and an iPhone profile).

There are **152 automated checks**.

PNG assets can be regenerated from `assets/icon.svg` using:

```bash
NODE_PATH=$(npm root -g) node tools/generate-assets.js
```
