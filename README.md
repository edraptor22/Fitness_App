# Lift Log

A workout tracker that costs nothing to run. Static files, no build step, no
server, no account. It lives on GitHub Pages and stores everything in your
phone's own database, so it works in a basement gym with no signal.

- **Everything counts down to a date.** Set the event you're training for and
  Today leads with days remaining, weeks of training left, and sessions banked.
- **Plans** are weekly templates — Plan A might be 3 lifting days, 2 plyo days
  and mobility every day. Switch to Plan B and Today follows the new schedule.
- **Per-set logging.** Every set is its own row, pre-filled with what you did
  last time, so progressive overload is a one-tap change.
- **Last session is always on screen**, right under the exercise name.
- **Anything can be added on the day**, whether the plan has it or not.
- **Mobility-style workouts** are a single check-off with an optional video link.
- **Daily weigh-in** with a goal weight, a trend line, and milestones you attach
  your own rewards to — cross one and the app tells you what you've earned.
- **A quote a day** on the home screen, drawn from your own list.

---

## 1. Put it on GitHub

From this folder:

```bash
git init
git add .
git commit -m "Lift Log"
git branch -M main
git remote add origin https://github.com/<you>/<repo>.git
git push -u origin main
```

Then in the repo on github.com: **Settings → Pages → Source: Deploy from a
branch → Branch: `main` / `(root)` → Save.**

A minute later it's live at `https://<you>.github.io/<repo>/`.

Everything uses relative paths, so it works whether the repo is served from a
subfolder or from a custom domain.

> Make the repo **public** — GitHub Pages on private repos needs a paid plan.
> Nothing sensitive is in the code; your workout data never leaves your phone.

## 2. Make it feel like a real app on your iPhone

1. Open the Pages URL in **Safari** (this only works in Safari, not Chrome).
2. Tap the **Share** button, scroll down, tap **Add to Home Screen**.
3. Name it and tap **Add**.

Launched from that icon it runs fullscreen with no address bar and no browser
chrome, keeps its own storage, and opens instantly offline. That is as close to
a native app as you can get without an Apple Developer account ($99/yr) and Xcode.

A few things that come with the home-screen install:

- **Offline.** A service worker caches the app on first load.
- **Storage is protected.** Safari clears unused site data after seven days;
  home-screen web apps are exempt from that.
- **Its own data.** The home-screen copy and the Safari tab do not share a
  database. Pick one and stick with it — use the icon.

## 3. Reminders

There is no server, so there are no push notifications. The free options:

- **Shortcuts app → Automation → Time of Day.** Pick your training days and
  time, then add an **Open App** (or **Open URLs**) action pointing at Lift Log.
  It nudges you and opens straight to Today.
- **A repeating Calendar event** with an alert. Cruder, works everywhere.

Settings → *Workout reminders* has the same walkthrough on the phone.

If you ever want real push notifications, iOS 16.4+ supports the Web Push API
for home-screen web apps. It needs something to send them from — a free
Cloudflare Worker or a Vercel hobby function is enough — plus a VAPID key pair.
The app is structured so that can be added later without touching the data model.

## 4. Backups

Your data is in IndexedDB on one device. Nothing syncs anywhere.

**Settings → Export backup** writes a `.json` file. On iPhone it opens the share
sheet — "Save to Files" into iCloud Drive is the easy answer. Do this before
switching phones, and every month or so out of habit.

**Settings → Restore from backup** takes that file (or pasted JSON) and replaces
everything on the device.

## 5. Working on it

You can't just double-click `index.html` — ES modules and service workers are
blocked on `file://`. Serve it instead (no dependencies needed):

```bash
npm run serve         # → http://localhost:5173
```

That also prints a `http://192.168.x.x:5173` address. Open it on your iPhone
while both are on the same Wi-Fi and you get the real thing on the real device.
Two limits on a LAN address: the service worker won't register (browsers only
allow that on `https` or `localhost`), so there's no offline mode, and the URL
dies when the computer sleeps. Fine for trying it out, not for daily use —
that's what deploying is for.

After you change anything, bump `CACHE` in `sw.js` (`liftlog-v1` → `liftlog-v2`)
before pushing, or phones will keep serving the cached copy.

Regenerate the icons with `powershell -File tools/make-icons.ps1`.

There's an end-to-end smoke test that drives the whole app in an iPhone-sized
browser and screenshots every screen into `tools/shots/`:

```bash
npm install
npx playwright install chromium
npm test
```

The app itself has no dependencies — `package.json` exists only for that test.

### Layout

```
index.html            shell: top bar, view container, tab bar
styles.css            all styling; light/dark via CSS custom properties
manifest.webmanifest  home-screen name, icons, standalone display
sw.js                 offline cache
js/
  app.js              hash router + app shell
  db.js               IndexedDB read/write
  store.js            in-memory state, domain logic, export/import
  seed.js             starter exercises and two example plans
  util.js             dates, formatting, per-exercise metric rules
  ui.js               DOM helpers, bottom sheets, toasts
  views/              one module per screen
```

### Daily quotes

Settings → **Daily quotes** takes a pasted list, one per line. Numbering and
bullets are stripped, wrapping quotation marks are removed, and a trailing
`— Author` is split out and shown underneath. Turn the card off entirely with
the *Daily quote on Today* switch.

The rotation is deterministic per date — the same quote all day — but the order
interleaves authors, so you never get a run of the same person. Every quote
appears once before any repeats, and the order is reshuffled each time the list
is exhausted.

### Data model

- **exercise** — a name plus `track` flags for `weight` / `reps` / `duration` /
  `distance`. A bench press tracks weight and reps; a broad jump tracks reps and
  distance; basketball tracks minutes. One shape covers every workout type.
- **workout** — a template inside a plan: which days of the week, and either a
  list of exercises with target sets/reps or a single check-off.
- **session** — what actually happened on a date. Sessions copy the exercise
  name at log time, so renaming or deleting an exercise never rewrites history.
- **weight** — one row per day, keyed by the date, so logging twice replaces
  rather than duplicates.
- **goal** — start weight, target weight, and milestones (`weight`, `reward`,
  `hitDate`). Saving a weigh-in checks every unhit milestone and marks the ones
  it crossed, which is what triggers the reward screen.
- **events** — the countdown targets. The soonest one that hasn't passed is the
  one Today leads with.

Sets are only counted as done when they're ticked, which is what keeps the
"last session" line honest.
