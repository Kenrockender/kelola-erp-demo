import { defineConfig } from 'vite';
import { resolve } from 'path';
import { readFileSync } from 'fs';

// Lazy view-tier modules. Each is a self-contained IIFE that exposes only its
// `window.render<View>` renderer (+ a couple of `viewX` doc-openers used by
// doc-flow's "Jejak"). They are NOT in the core bundle: lazy-views.js loads the
// matching chunk on first navigate() to that view (see public/classic/core/
// lazy-views.js), keyed by the renderer global so it stays idempotent — if the
// renderer is already defined (e.g. the smoke test evals everything at once),
// no chunk is fetched. Emitted as /classic/view-<id>.js.
// One emitted chunk per entry — do NOT add the split-out pages here or each
// would ship its own full copy of the module. They are aliases; see
// classicLazyAliases below.
export const classicLazy = {
  ledger: ['public/classic/core/gl-view.js'],
  financials: ['public/classic/core/financial-reports.js'],
  quotations: ['public/classic/core/quotation-view.js'],
  returns: ['public/classic/core/return-view.js'],
  warehouse: ['public/classic/core/warehouse-view.js'],
  adjustments: ['public/classic/core/adjust-view.js'],
  invoices: ['public/classic/core/invoice-view.js'],
};

// The former tabbed views were split into one page per document type. Each new
// view id is served by the SAME chunk as the view it came from, so the four
// invoice pages still cost one download between them.
//   new view id → [chunk id it lives in, renderer global it defines]
export const classicLazyAliases = {
  salesInvoices: ['invoices', 'renderSalesInvoices'],
  purchaseInvoices: ['invoices', 'renderPurchaseInvoices'],
  salesReceipts: ['invoices', 'renderSalesReceipts'],
  purchasePayments: ['invoices', 'renderPurchasePayments'],
  salesQuotations: ['quotations', 'renderSalesQuotations'],
  purchaseQuotations: ['quotations', 'renderPurchaseQuotations'],
  salesReturns: ['returns', 'renderSalesReturns'],
  purchaseReturns: ['returns', 'renderPurchaseReturns'],
  reportPL: ['financials', 'renderReportPL'],
  reportBS: ['financials', 'renderReportBS'],
  reportCF: ['financials', 'renderReportCF'],
};

// Renderer global that each lazy view exposes — used by lazy-views.js to decide
// whether the chunk still needs loading. Kept beside classicLazy so the two
// never drift.
export const classicLazyRenderers = {
  ledger: 'renderLedger',
  financials: 'renderFinancials',
  quotations: 'renderQuotations',
  returns: 'renderReturns',
  warehouse: 'renderWarehouse',
  adjustments: 'renderAdjustments',
  invoices: 'renderInvoices',
};

// Dependency order matters — each script may rely on globals set by the previous one.
// `classicAll` is the full ordered list of every classic file (source of truth
// for ordering). `classicCore` (below) is classicAll minus the lazy view files —
// that is what the core bundle serves/emits. `classicOrder` stays = classicAll so
// tests/classic-bundle-smoke.test.ts still boots the entire surface in one pass.
const classicAll = [
  // doc-registry.js migrated to src/classic/core/doc-registry.js (ES module).
  // window.DocRegistry is set by that module before this bundle loads.
  'public/classic/core/doc-engine.js',
  'public/classic/core/cost-ledger.js',
  'public/classic/core/warehouse.js',
  'public/classic/core/gl.js',
  'public/classic/core/erp-crud.js',
  'public/classic/core/doc-migrate.js',
  'public/classic/core/erp-view.js',
  // erp-patch.js merged into erp-crud.js + erp-view.js (2026-06-10)
  'public/classic/core/xlsx-export.js',
  'public/classic/core/budget-gl-extras.js',
  'public/classic/core/sales-purchase-extras.js',
  'public/classic/core/settings-extras.js',
  'public/classic/core/inventory-extras.js',
  'public/classic/core/master-extras.js',
  'public/classic/core/bank-extras.js',
  'public/classic/core/tax-extras.js',
  'public/classic/core/report-extras.js',
  'public/classic/core/asset-extras.js',
  'public/classic/core/menu-router.js',
  'public/classic/core/gl-sync.js',
  // trash.js between gl-sync and integrity: integrity wraps OUTERMOST, so a
  // period-lock revert returns before the recycle-bin capture runs.
  'public/classic/core/trash.js',
  // Must load AFTER gl-sync.js so the integrity guard wraps the GL-synced save
  // (period-lock revert then also skips the GL reconcile + persist).
  'public/classic/core/integrity.js',
  'public/classic/erp.ns.js',
  'public/classic/core/gl-view.js',
  'public/classic/core/financial-reports.js',
  'public/classic/core/quotation-view.js',
  'public/classic/core/return-view.js',
  'public/classic/core/warehouse-view.js',
  'public/classic/core/adjust-view.js',
  'public/classic/core/invoice-view.js',
  'public/classic/core/excel-import.js',
  // rekap-import.js after excel-import.js — separate parser for the client's
  // REKAP workbooks (2-row header, one sheet per material, kg thousands
  // separators). Exposes window.RekapImport.
  'public/classic/core/rekap-import.js',
  // rekap-export.js after xlsx-export.js (NSAXlsx) and rekap-import.js —
  // rebuilds the client's own REKAP and PO layouts. Exposes window.RekapExport.
  'public/classic/core/rekap-export.js',
  // outstanding-view.js — two-sided AR/AP screen. Exposes window.renderOutstanding.
  'public/classic/core/outstanding-view.js',
  // surat-jalan-view.js — the only screen the `lapangan` role can reach.
  // Exposes window.renderSuratJalan.
  'public/classic/core/surat-jalan-view.js',
  'public/classic/core/order-summary.js',
  'public/classic/core/doc-flow.js',
  'public/classic/core/schema.js',
  'public/classic/modules/dashboard.js',
  'public/classic/modules/master.js',
  'public/classic/ui/nav.js',
  // view-tabs.js wraps nav.js's navigate (must be after it, before rbac.js so
  // the rbac navigate guard stays outermost). Adds the multi-tab view bar.
  'public/classic/ui/view-tabs.js',
  // doc-tabs.js adds Accurate-style second-level tabs INSIDE each transaction
  // module (Daftar / Data Baru / one tab per open document). After view-tabs.js
  // and before rbac.js.
  'public/classic/ui/doc-tabs.js',
  'public/classic/modules/settings.js',
  // rbac.js MUST load last: its saveDB wrap is the outermost guard (reverts an
  // unauthorized mutation before integrity.js/trash.js inner wraps run), and it
  // wraps window.navigate to gate buttons after each view renders.
  'public/classic/core/rbac.js',
  // lazy-views.js MUST load last of all: it wraps window.navigate one final time
  // (outermost) to intercept navigation to a lazy view, fetch its /classic/
  // view-<id>.js chunk, then re-navigate to render it for real.
  'public/classic/core/lazy-views.js',
];

// The set of files pulled out of the core bundle and served as lazy chunks.
const _lazyFiles = new Set(Object.values(classicLazy).flat());

// Core bundle = every classic file except the lazy view modules.
export const classicCore = classicAll.filter(p => !_lazyFiles.has(p));

// Smoke test loads the entire surface (core + every lazy module) in one pass.
export const classicOrder = classicAll;

function classicBundlePlugin() {
  function concat(files) {
    return files.map(p => readFileSync(resolve(__dirname, p), 'utf-8')).join('\n;\n');
  }

  async function minifyBundle(code) {
    const { minify } = await import('terser');
    const out = await minify(code, {
      compress: { drop_console: true, drop_debugger: true },
      mangle: true,
    });
    return out.code;
  }

  return {
    name: 'classic-bundle',

    // Dev server: serve the (unminified) core bundle + each lazy view chunk
    // on-the-fly. Chunks are keyed by view-id → /classic/view-<id>.js.
    configureServer(server) {
      server.middlewares.use('/classic/bundle.js', (_req, res) => {
        res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
        res.end(concat(classicCore));
      });
      for (const [id, files] of Object.entries(classicLazy)) {
        server.middlewares.use(`/classic/view-${id}.js`, (_req, res) => {
          res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
          res.end(concat(files));
        });
      }
    },

    // Build: concat + minify (drop_console). The core bundle and every lazy
    // chunk are emitted as static assets (picked up by the SW's stale-while-
    // revalidate cache, so lazy chunks work offline after first visit).
    async generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'classic/bundle.js',
        source: await minifyBundle(concat(classicCore)),
      });
      for (const [id, files] of Object.entries(classicLazy)) {
        this.emitFile({
          type: 'asset',
          fileName: `classic/view-${id}.js`,
          source: await minifyBundle(concat(files)),
        });
      }
    },
  };
}

export default defineConfig({
  root: '.',
  publicDir: 'public',
  plugins: [classicBundlePlugin()],
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: true,
    rollupOptions: {
      input: {
        // Marketing landing page → dist/index.html, served at `/` (Firebase
        // serves this static file before any rewrite, so it owns the root).
        landing: resolve(__dirname, 'index.html'),
        // The ERP app shell → dist/app.html, served at `/app` (firebase.json
        // rewrite) and directly at `/app.html`.
        main: resolve(__dirname, 'app.html'),
      },
      output: {
        // Split the large, rarely-changing SDKs out of the app's main chunk so
        // (a) the single >1MB chunk warning goes away and (b) these vendor
        // chunks stay browser-cached across app deploys that don't touch them.
        manualChunks(id) {
          if (id.includes('node_modules/firebase') || id.includes('node_modules/@firebase')) {
            return 'vendor-firebase';
          }
          if (id.includes('node_modules/chart.js')) {
            return 'vendor-chart';
          }
        },
      },
    },
    chunkSizeWarningLimit: 1000,
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true,
        drop_debugger: true,
      },
    },
  },
  server: {
    // host:true binds all interfaces (IPv4 + IPv6) so http://localhost,
    // http://127.0.0.1, and LAN access (e.g. from a phone) all work. Vite's
    // default only binds IPv6 (::1), which fails when the OS resolves
    // "localhost" to 127.0.0.1 first (common on Windows).
    host: true,
    port: 8088,
    open: true,
    cors: true,
  },
  preview: {
    port: 8080,
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
      '@core': resolve(__dirname, './src/core'),
      '@modules': resolve(__dirname, './src/modules'),
      '@ui': resolve(__dirname, './src/ui'),
    },
  },
  optimizeDeps: {
    include: [
      'firebase/app',
      'firebase/auth',
      'firebase/firestore',
      'firebase/storage',
      'chart.js',
    ],
  },
});
