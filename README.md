# Flashcards

An offline-first flashcard study PWA. No build step, no server, no external
dependencies — plain HTML/CSS/JS that runs entirely in the browser and
stores everything on-device with `localStorage`.

## What's inside

```
index.html          entry point — loads CSS/JS, PWA/iOS install meta tags
manifest.json        PWA install config (name, icons, colors, display mode)
sw.js                 service worker — caches every file so it works offline
css/
  tokens.css          design variables — colors, light/dark, accents, font sizes
  base.css            layout — topbar, sidebar drawer, page structure
  components.css       cards, buttons, forms, flip-card, charts, sheets
js/
  main.js             app bootstrap — shell wiring, router, service worker
  db.js               all data storage (localStorage)
  utils.js            date/greeting helpers + stats & weak-topic analysis
  charts.js            hand-built SVG line charts (no charting library)
  icons.js             hand-drawn SVG icon set, zero dependency
  ui.js                toasts, confirm dialogs, bottom sheets
  nav.js                tiny router indirection so views avoid circular imports
  views/
    home.js, study.js, manage.js, search.js, profile.js, settings.js
icons/                app icons (16/32/192/512/maskable/apple-touch)
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
2. Create a new **public** repository on GitHub.
3. Upload all the extracted files and folders, keeping `index.html` at
   the repo root, then commit.
4. In the repo: **Settings → Pages** → Source: **Deploy from a branch**
   → Branch: `main`, folder `/ (root)` → Save.
5. After ~a minute, your live URL appears on that same Pages screen:
   `https://<your-username>.github.io/<repo-name>/`

Once installed from that URL (Add to Home Screen on iOS, or the browser's
install prompt), the app keeps working with no connection.

## Notes / assumptions

- **Grading:** to produce the correct/incorrect counts the spec's stats
  cards reference, the study session asks "Did you get it right?" right
  after you reveal the answer, then asks for a difficulty rating.
- **Images:** stored as embedded data URLs (no file server), so backups
  containing images can be large.
- **Data:** everything lives in this browser's `localStorage` — it does
  not sync between devices. Use Settings → Backup and Restore to move
  data to another device or browser.
