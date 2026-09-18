# Flashcards

An offline-first flashcard study PWA. No build step, no server required to
run it — plain HTML/CSS/JS that works entirely in the browser and stores
everything on-device (IndexedDB + localStorage). Optional Firebase-backed
cloud sync can be turned on to back up data and share it across devices.

## What's inside

```
index.html            entry point — loads CSS/JS, PWA/iOS install meta tags
manifest.json         PWA install config (name, icons, colors, display mode)
sw.js                  service worker — caches every file so it works offline
css/
  tokens.css           design variables — colors, light/dark, accents, font sizes
  base.css             layout — topbar, sidebar drawer, page structure
  components.css        cards, buttons, forms, flip-card, charts, sheets
js/
  main.js              app bootstrap — shell wiring, router, service worker, cloud.init()
  db.js                all local data storage (IndexedDB for content, localStorage for settings/profile)
  cloud.js             optional Firebase accounts + cross-device sync (inactive until configured)
  firebase-config.js    your Firebase project's config goes here (null = cloud sync off)
  utils.js             date/greeting helpers + stats & weak-topic analysis
  charts.js             hand-built SVG line charts (no charting library)
  icons.js              hand-drawn SVG icon set, zero dependency
  ui.js                 toasts, confirm dialogs, bottom sheets
  nav.js                 tiny router indirection so views avoid circular imports
  views/
    home.js, study.js, manage.js, search.js, profile.js, settings.js, account.js
icons/                 app icons (16/32/192/512/maskable/apple-touch)
```

## Run it locally

Any static file server works — the app just needs to be served over
`http://` or `https://` (service workers don't run from `file://`).

```bash
cd flashcards-app
python3 -m http.server 8080
# open http://localhost:8080
```

## Deploy to GitHub Pages (get a public URL)

1. Extract this project's files (don't upload the `.zip` itself — GitHub
   doesn't auto-extract it).
2. Create a new **public** repository on GitHub (or reuse your existing one —
   updating these files in place preserves everyone's data; see "Updating
   the app without losing data" below).
3. Upload all the extracted files and folders, keeping `index.html` at
   the repo root, then commit.
4. In the repo: **Settings → Pages** → Source: **Deploy from a branch**
   → Branch: `main`, folder `/ (root)` → Save.
5. After ~a minute, your live URL appears on that same Pages screen:
   `https://<your-username>.github.io/<repo-name>/`

Once installed from that URL (Add to Home Screen on iOS, or the browser's
install prompt), the app keeps working with no connection.

### Updating the app without losing data

Upload new/changed files over the existing ones in the same repo (GitHub
will ask to replace them — say yes) rather than deleting the repo and
starting over. All flashcard data lives in the browser (IndexedDB), not in
the repo, so pushing updated code never touches it. After updating, force-quit
and reopen the app (sometimes twice) so it picks up the new service worker.

## Cloud sync setup (optional — accounts + automatic cross-device backup)

By default the app is fully local: flashcards live only in this browser/device,
and moving them elsewhere means using **Settings → Backup and Restore**
(export a `.json` file, restore it on the other device). That still works
after cloud sync is on — it becomes a manual backup on top of automatic
syncing, not a replacement.

Turning cloud sync on adds: an account (email + password) under **Profile →
Cloud sync**, automatic background sync whenever you're signed in and
online, and real cross-device sync — sign in with the same account on
another device and your flashcards, progress, and settings appear there
too, kept in sync going forward. It uses [Firebase](https://firebase.google.com)
(a free backend service from Google) — no server of your own to run or pay
for at this app's scale.

### 1. Create a free Firebase project

1. Go to <https://console.firebase.google.com> and sign in with any Google
   account.
2. Click **Add project**, give it any name, and finish the wizard (you can
   decline Google Analytics — not needed here).

### 2. Turn on Email/Password sign-in

1. In the left sidebar: **Build → Authentication** → **Get started**.
2. Under **Sign-in method**, click **Email/Password**, enable it, **Save**.

### 3. Create a Firestore database

1. In the left sidebar: **Build → Firestore Database** → **Create database**.
2. Choose any nearby region, and start in **production mode** (the security
   rules below lock it down properly).

### 4. Set the security rules

Still in Firestore, go to the **Rules** tab, replace the contents with the
following, and click **Publish**:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{uid}/{document=**} {
      allow read, write: if request.auth != null && request.auth.uid == uid;
    }
  }
}
```

This means: a signed-in user can only ever read or write their own data
(everything under `users/<their-uid>/...`), never anyone else's.

### 5. Get your web config and paste it in

1. In the Firebase console: the gear icon next to **Project Overview** →
   **Project settings**.
2. Under **Your apps**, click the **</>** (web) icon to register a new web
   app (any nickname is fine; you don't need Firebase Hosting).
3. Copy the `firebaseConfig` object it shows you.
4. Open `js/firebase-config.js` in this project and replace its contents
   with:

   ```js
   export const firebaseConfig = {
     apiKey: "AIzaSy...",
     authDomain: "your-project-id.firebaseapp.com",
     projectId: "your-project-id",
     storageBucket: "your-project-id.appspot.com",
     messagingSenderId: "123456789012",
     appId: "1:123456789012:web:abcdef1234567890",
   };
   ```

5. Upload the changed `js/firebase-config.js` to GitHub over the old one,
   and force-quit/reopen the app (twice, if needed) so the new service
   worker version takes over.

### 6. Verify it actually works

1. On device A, open **Profile → Cloud sync**, tap **Sign up**, create an
   account, add or edit a flashcard.
2. In the Firebase console, go to **Firestore Database → Data** and confirm
   you see documents appear under `users/<a long id>/...`.
3. On device B, open the same app URL, go to **Profile → Cloud sync**, tap
   **Log in** with the same email/password.
4. Confirm the flashcard from device A shows up on device B within a few
   seconds (needs both devices online). Edits and deletes on either device
   should now show up on the other automatically.

If sign-in or sync fails, the app shows a plain-language reason (e.g. "no
internet connection", "incorrect email or password") rather than a generic
error.

## Notes / assumptions

- **Grading:** to produce the correct/incorrect counts the spec's stats
  cards reference, the study session asks "Did you get it right?" right
  after you reveal the answer, then asks for a difficulty rating.
- **Images:** stored as embedded data URLs. Locally there's no size limit
  beyond IndexedDB's own ceiling; if cloud sync is on, an individual image
  larger than ~900KB (base64) is skipped from cloud sync specifically (it
  still saves fine on the device that added it) since Firestore caps a
  single document at 1MB — the app tells you when this happens.
- **Data without cloud sync:** everything lives in this browser/device only
  (IndexedDB + localStorage) — it does not sync between devices on its own,
  and clearing the browser's site data/history for this app deletes it with
  no way to recover it. Use Settings → Backup and Restore to move data
  manually, or turn on Cloud sync above for automatic backup.
