# Kelola ERP — Public Demo

A local-first ERP demo for small Indonesian businesses, covering the day-to-day flow from sales and purchasing to inventory and accounting.

**[Open the live demo](https://kelola-erp-demo.vercel.app/)**

Built for a real-business context. This public repository contains only a safe, sample-data demo—no client data, production configuration, or production backend is included.

## What the demo shows

| Area | Workflow |
|---|---|
| Sales | Create orders, deliver goods, issue invoices, and record payments |
| Purchasing | Create purchase orders, receive stock, and track supplier invoices |
| Inventory | Review stock cards and see inventory update after transactions |
| Finance | General ledger, accounts receivable/payable aging, and payment posting |
| Auditability | Local audit log of actions completed in the demo |
| Reporting | Charts and spreadsheet-oriented data workflows |

The first visit seeds a fictitious dataset of customers, suppliers, products, orders, invoices, and payments, so each feature can be explored immediately.

## Local-first by design

This demo runs entirely in the browser using IndexedDB:

- No account creation is required.
- No data entered in the demo is uploaded to a server.
- **Settings → Kelola Data Demo → Reset Data Demo** clears browser storage and reseeds the sample data.

The production product has optional cloud capabilities, but they are deliberately excluded from this public build.

## Technology

| Area | Tools |
|---|---|
| App tooling | Vite, TypeScript |
| Storage | IndexedDB via `idb` |
| Reporting | Chart.js, XLSX |
| Optional production services | Firebase, Firebase Admin |
| PWA | Vite PWA / Workbox |
| Quality | Vitest, ESLint, Prettier |

## Run locally

Requires Node.js 20.19+.

```bash
git clone https://github.com/Kenrockender/kelola-erp-demo.git
cd kelola-erp-demo
npm install
npm run dev:local
```

Open the URL Vite prints (normally `http://localhost:8088`).

```bash
npm run build:local  # build the sample-data, local-only version
npm run preview      # preview a production build
```

## Quality checks

```bash
npm run type-check
npm run lint
npm run test:run
```

## Scope and limitations

- The demo uses **sample data only** and does not contain the production client’s data or configuration.
- Cloud sync, hosted authentication, server-enforced roles, backups, and the production integration API are not part of this build.
- Local two-factor authentication has no recovery flow in demo mode; do not enable it with a device you cannot afford to lose.
- This repository is proprietary and published for demonstration only. It is not licensed for commercial reuse.

## Project structure

See [PROJECT_STRUCTURE.md](./PROJECT_STRUCTURE.md) for the codebase map.
