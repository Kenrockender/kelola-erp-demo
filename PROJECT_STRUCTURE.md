# Kelola ERP (Demo) - Project Structure

## Overview

Kelola ERP (Demo) - a public, backend-free demo build of a lightweight ERP
originally built with an optional Firebase backend and vanilla JavaScript.
This build runs local-only, on seeded sample data.

**Version:** 3.3.0 (demo)
**Last Updated:** 2026

---

## Root Directory

```
kelola-erp-demo/
├── docs/                 # Documentation
├── public/               # Static assets served by Vite (PWA + classic IIFE scripts)
├── scripts/              # One-off Node.js migration/utility scripts
├── src/                  # Vite-bundled source (ES modules)
├── tests/                # Vitest test suite
├── index.html            # Marketing landing page entry point
├── app.html              # ERP app shell entry point
├── style.css             # Global styles
├── mobile.css             # Mobile-specific styles
├── package.json           # Dependencies & scripts
└── README.md              # Project documentation
```

---

## Documentation (`/docs`)

Production-only documentation (Firebase deployment runbook, the read-only
integration API) has been removed from this demo build. See the root
[README.md](./README.md) and [QUICK_START.md](./QUICK_START.md) instead.

The old table below described the full production repo's docs and no longer
applies here:

| File (removed)           | Description                   |
| ------------------------ | ----------------------------- |
| `ARCHITECTURE.md`        | System architecture overview  |
| `ARCHITECTURE_ERP_V4.md` | ERP v4 architecture details   |
| `CONTRIBUTING.md`        | Contribution guidelines       |
| `DEVELOPMENT.md`         | Development guide             |
| `FIREBASE_AUTH_SETUP.md` | Firebase authentication setup |
| `IMPROVEMENTS.md`        | Feature improvements log      |
| `TESTING.md`             | Testing guide                 |
| `V3_FEATURES.md`         | Version 3 features            |

---

## Public Assets (`/public`)

Served verbatim by Vite — not bundled. Contains both PWA assets and the classic
IIFE script layer that `src/main.js` loads at runtime via `<script>` tags.

```
public/
├── manifest.json                  # PWA manifest
├── sw.js                          # Service worker
└── classic/
    ├── erp.ns.js                  # Global ERP namespace bootstrap
    ├── core/
    │   ├── doc-registry.js        # Document-type registry (SO, PO, DO, …)
    │   ├── doc-engine.js          # Number generation, totals, status transitions
    │   ├── doc-migrate.js         # Data migrations (number-field backfills, etc.)
    │   ├── doc-flow.js            # Multi-step document workflow helpers
    │   ├── erp-crud.js            # Create/Read/Update/Delete for all doc types
    │   ├── erp-view.js            # List & detail view renderers
    │   ├── erp-patch.js           # Additional view patches & modal actions
    │   ├── gl.js                  # General Ledger: journal building & reconcile
    │   ├── gl-view.js             # GL report views (trial balance, ledger)
    │   ├── gl-sync.js             # GL → Firestore sync helpers
    │   ├── cost-ledger.js         # Moving-average cost / COGS engine
    │   ├── schema.js              # Firestore collection schemas
    │   ├── financial-reports.js   # P&L, Balance Sheet
    │   ├── invoice-view.js        # Sales/purchase invoice renderer
    │   ├── quotation-view.js      # Quotation renderer
    │   ├── return-view.js         # Return document renderer
    │   ├── warehouse-view.js      # Warehouse transfer renderer
    │   ├── warehouse.js           # Warehouse / location management
    │   ├── adjust-view.js         # Item adjustment view
    │   ├── asset-extras.js        # Fixed-asset module extras
    │   ├── bank-extras.js         # Bank/payment module extras
    │   ├── budget-gl-extras.js    # Budget & GL extra features
    │   ├── inventory-extras.js    # Inventory module extras
    │   ├── master-extras.js       # Master data extras
    │   ├── menu-router.js         # Client-side menu/route dispatcher
    │   ├── report-extras.js       # Extra report helpers
    │   ├── sales-purchase-extras.js # Sales & purchase extras
    │   ├── settings-extras.js     # Settings module extras
    │   ├── tax-extras.js          # Tax calculation extras
    │   └── xlsx-export.js         # Excel export helper
    ├── modules/
    │   ├── dashboard.js           # Dashboard charts & KPIs
    │   ├── master.js              # Master data management
    │   └── settings.js            # App settings & configuration
    └── ui/
        └── nav.js                 # Navigation & sidebar logic
```

---

## Source Code (`/src`)

Vite-bundled ES modules. Only files here go through TypeScript type-checking.

### Core Modules (`/src/core`)

| File                       | Purpose                     | Key exports / globals                 |
| -------------------------- | --------------------------- | ------------------------------------- |
| `auth.js`                  | Local-first + Firebase auth | `initAuth()`, `login()`, `logout()`   |
| `backup.js`                | Cloud backup system         | `createBackup()`, `restoreBackup()`   |
| `db.js`                    | Firestore database layer    | `loadDB()`, `saveDB()`, `syncData()`  |
| `helpers.js`               | Utility functions           | `idr()`, `sanitizeInput()`, `badge()` |
| `indexeddb.js`             | Offline storage (IDB)       | `idb.put()`, `idb.getAll()`           |
| `intersection-observer.js` | Lazy loading                | `setupLazyLoading()`                  |
| `modal.js`                 | Modal & toast system        | `openModal()`, `showToast()`          |
| `performance-monitor.js`   | Performance tracking        | `performanceMonitor.mark()`           |
| `stock.js`                 | Stock management            | `reserveStock()`, `checkOversell()`   |
| `view-transitions.js`      | Page transitions            | `transitionView()`                    |

### Feature Modules (`/src/modules`)

> Not yet populated — module stubs live in `public/classic/modules/` for now.

### UI Components (`/src/ui`)

> Not yet populated — UI helpers live in `public/classic/ui/` for now.

### Configuration (`/src/config`)

| File          | Purpose                 |
| ------------- | ----------------------- |
| `firebase.js` | Firebase initialization |

### Entry Points

| File                     | Purpose                                                           |
| ------------------------ | ----------------------------------------------------------------- |
| `main.js`                | Application bootstrap — loads classic scripts via `<script>` tags |
| `pwa-register.js`        | PWA registration                                                  |
| `mobile-enhancements.js` | Mobile optimizations                                              |

---

## Scripts (`/scripts`)

| File                     | Purpose                          |
| ------------------------ | --------------------------------- |
| `generate-pwa-icons.ps1` | Regenerates the PWA icon set      |

---

## Tests (`/tests`)

| File                           | Purpose                                          |
| ------------------------------ | ------------------------------------------------ |
| `gl.test.ts`                   | General Ledger: journal posting, trial balance   |
| `cost-ledger.test.ts`          | Moving-average cost / COGS engine                |
| `doc-engine.test.ts`           | Document number generation, totals, status rules |
| `auth.test.ts`                 | Local-first authentication logic                 |
| `data-validation.test.ts`      | Input sanitization, date/currency validation     |
| `stock-reservation.test.ts`    | Stock availability & reservation                 |
| `transaction-rollback.test.ts` | Transaction atomicity & rollback                 |
| `example.test.ts`              | ERP core utility smoke tests                     |
| `setup.ts`                     | Vitest global setup                              |

Tests that import classic IIFE scripts (gl, cost-ledger, doc-engine) do so from
`../public/classic/core/` — the IIFE attaches globals to `window` under happy-dom.

**Framework:** Vitest + happy-dom

---

## Configuration Files

### Build & Development

| File               | Purpose                   |
| ------------------ | ------------------------- |
| `vite.config.js`   | Vite build configuration  |
| `vitest.config.ts` | Vitest test configuration |
| `tsconfig.json`    | TypeScript configuration  |

### Code Quality

| File               | Purpose                   |
| ------------------ | ------------------------- |
| `eslint.config.js` | ESLint rules              |
| `.eslintignore`    | ESLint ignore patterns    |
| `.prettierrc.json` | Prettier formatting rules |
| `.prettierignore`  | Prettier ignore patterns  |

### Firebase (not present in this demo)

The Firebase backend (`firebase.json`, `firestore.rules`,
`firestore.indexes.json`, `storage.rules`, and the `functions/` Cloud
Functions source) has been removed from this demo repo entirely — the app
runs local-only with `isFirebaseConfigured` always false. `src/config/firebase.js`
and `src/core/db.js` still contain the (unused) Firestore integration code for
reference, gated behind that flag.
