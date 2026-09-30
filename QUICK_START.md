# Quick Start — Kelola ERP (Demo)

This is the backend-free, local-only demo build. No Firebase project, no
environment variables, and no account to create.

## Prerequisites

- Node.js 20.19.0 or higher
- npm
- A modern browser (Chrome, Firefox, Safari, Edge)

## Run it

```bash
git clone <this-repo-url>
cd kelola-erp-demo
npm install
npm run dev:local
```

Open the URL Vite prints (defaults to `http://localhost:8088`). The app seeds
a fictitious dataset into your browser's IndexedDB on first load — no sign-up,
no config.

The login screen shows the demo credentials. If you ever want a clean slate,
use **Settings → Kelola Data Demo → Reset Data Demo**.

## What to try

1. **Dashboard** — real-time metrics computed from the seeded data.
2. **Sales / Purchases** — create an order, mark it delivered/received, and
   watch inventory and the general ledger update.
3. **Kartu Stok** — per-item stock movement card that reconciles to on-hand.
4. **Laporan Umur Piutang** — AR aging buckets (0–30, 31–60, 61–90, 90+ days).
5. **Settings → Period Lock** — lock an accounting period and see edits to
   locked-period records get rejected.
6. **Bahasa toggle** — Indonesian ⇄ English UI.
7. **Install as PWA** — Settings → Install Aplikasi, then try it offline.

## Building for production

```bash
npm run build:local  # local-only build, no Firebase required
npm run preview       # preview the build
```

## Troubleshooting

**Port already in use**

```bash
npm run dev:local -- --port 3000
```

**Stale seed data / something looks broken**

Use **Reset Data Demo** in Settings, or clear the site's storage from your
browser's DevTools (Application → Storage → Clear site data).

**Tests failing**

```bash
npm run test:run -- --clearCache
```

---

This is a demo build. The production version of this ERP (with an optional
Firebase backend, hosted auth, and an integration API) is not published here.
