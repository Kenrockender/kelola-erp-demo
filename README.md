# Kelola ERP (Demo)

A public demo of a local-first, lightweight ERP for small Indonesian businesses.
This build runs entirely in your browser — sales, purchasing, inventory, and
accounting on **sample data only**. There is no backend, no account creation,
and nothing you enter here is uploaded anywhere.

This is a demo of a product built for a real client; the production version is
not published, and this repo does not contain any of that client's data or
configuration.

## What this demo is

- **Local-first**: the whole dataset lives in your browser's IndexedDB. Nothing
  is sent to a server.
- **Seeded on first load**: a fictitious dataset (customers, suppliers,
  inventory, sales/purchase orders, invoices, and payments) is generated
  automatically so every screen has something to show.
- **Resettable**: Settings → Kelola Data Demo → **Reset Data Demo** wipes the
  browser storage and reseeds fresh sample data.
- **Fully functional within that scope**: create sales/purchase orders, receive
  goods, post payments, and watch the general ledger, AR/AP aging, and stock
  cards update accordingly.

## What's disabled in this build

The production version of this app supports an optional Firebase backend
(real-time multi-device sync, hosted authentication, server-enforced RBAC,
nightly backups, and a read-only integration API). None of that ships in this
demo:

- No cloud sync — Firebase is not configured, so the app runs entirely on the
  local-only code path.
- No integration API (`/api/v1`) — that surface is server-side only and isn't
  part of this build.
- Two-factor authentication (TOTP) still works, but it's local-only — there's
  no server to recover a lost device from, so don't enable it here with a
  device you're not willing to lose.
- The "Log Akses (Audit Trail)" server-side view is unavailable in local-only
  mode; a local-only audit log of your session's own changes still works.

## Try it

Sign in with the seeded local user (shown on the login screen), or check
`.env.offline` for the default. Click around: add a sales order, mark it
delivered, check the stock card, look at Laporan Umur Piutang (AR aging). When
you're done, use **Reset Data Demo** in Settings to start over.

## Run it locally

Requires Node.js 20.19+.

```bash
npm install
npm run dev:local   # forces the local-only (no-Firebase) build
```

Open the URL Vite prints (defaults to `http://localhost:8088`).

```bash
npm run build:local # production build of the local-only demo
npm run preview      # preview the built demo
```

## Testing

```bash
npm test              # watch mode
npm run test:run      # single run
npm run type-check    # TypeScript check
```

## Project structure

See [PROJECT_STRUCTURE.md](./PROJECT_STRUCTURE.md).

## License

Proprietary — demo purposes only. Not for redistribution or commercial reuse.
