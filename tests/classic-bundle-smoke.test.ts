// ═══════════════════════════════════════════════════════════════════════════════
// Classic bundle smoke test
//
// The ~750KB of classic scripts (erp-crud/erp-view/erp-patch/extras/…) had no
// test coverage at all: a load-order mistake or a renderer typo only surfaced
// when a user clicked the broken menu. This test boots the real bundle the same
// way the app does — every file in vite.config's classicOrder, executed in
// order against the real index.html DOM — then:
//   1. asserts every script loads without throwing,
//   2. asserts the load-bearing globals exist,
//   3. navigates to every registered view and asserts no renderer threw
//      (nav.js swallows renderer errors into a "gagal dimuat" fallback),
//   4. invokes every NSAMenu route and asserts the handler ran (handle()
//      returns false when the extras fn is missing or threw).
// ═══════════════════════════════════════════════════════════════════════════════
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import {
  classicOrder,
  classicLazy,
  classicLazyRenderers,
  classicLazyAliases,
} from '../vite.config.js';

const ROOT = resolve(__dirname, '..');

declare global {
  interface Window {
    DB: any;
    NSAMenu: any;
    GL: any;
    Integrity: any;
    DocEngine: any;
    NSAXlsx: any;
    navigate: (id: string) => void;
    invalidateView: (id?: string) => void;
    __NSA_MENU_CONFIG: any;
    activeView: string;
  }
}

function seedDB() {
  (window as any).DB = {
    salesOrders: [],
    purchaseOrders: [],
    inventoryItems: [],
    deliveryOrders: [],
    customers: [],
    suppliers: [],
    paymentLogs: [],
    notifications: [],
    fleet: [],
    expedition: [],
    accounts: { cash: 0, bca: 0, mandiri: 0 },
    reservations: {},
    numberSequences: {},
    accountsChart: [],
    journals: [],
    itemAdjustments: [],
    salesInvoices: [],
    purchaseInvoices: [],
    salesReceipts: [],
    purchasePayments: [],
    salesQuotations: [],
    purchaseQuotations: [],
    salesReturns: [],
    purchaseReturns: [],
    itemTransfers: [],
    warehouses: [],
    auditLog: [],
    revenueData: [],
    topProducts: [],
    accountsTrend: [],
    budgets: [],
    budgetTransfers: [],
    expenseAccruals: [],
    employees: [],
    payrollRuns: [],
    salesDownPayments: [],
    purchaseDownPayments: [],
    salesTargets: [],
    goodsReceipts: [],
    supplierPrices: [],
    settings: {
      user: { name: 'Test', initials: 'T', role: 'Admin', access: 'Full' },
      company: { name: 'Test Co', address: '-', phone: '-' },
      tax: { pkp: true, npwp: '01.234', ppnRate: 0.11, pphRate: 0, rounding: 'round' },
      users: [],
      itemCategories: [],
      units: [],
      assetCategories: [],
      assetFiscalCategories: [],
      assets: [],
      assetTransfers: [],
      assetDisposals: [],
    },
  };
}

const loadErrors: { file: string; error: unknown }[] = [];

// The real app shell body (app.html), so scripts find the elements they expect.
// (index.html is the marketing landing page; the ERP app lives in app.html.)
const indexHtml = readFileSync(resolve(ROOT, 'app.html'), 'utf-8');
// Strip <script> tags: happy-dom would otherwise try (and fail) to load them.
const bodyHtml = (indexHtml.match(/<body[^>]*>([\s\S]*)<\/body>/i)?.[1] ?? '').replace(
  /<script[\s\S]*?<\/script>/gi,
  ''
);

// tests/setup.ts wipes document.body before every test — restore the app DOM.
beforeEach(() => {
  document.body.innerHTML = bodyHtml;
});

beforeAll(() => {
  document.body.innerHTML = bodyHtml;

  // ── Globals the ES-module layer (main.js et al.) provides before the bundle ──
  seedDB();
  (window as any).defaultData = {};
  (window as any).saveDB = vi.fn();
  (window as any).loadDB = vi.fn();
  (window as any).showToast = vi.fn();
  (window as any).showUndoToast = vi.fn();
  (window as any).openModal = vi.fn();
  (window as any).closeModal = vi.fn();
  (window as any).confirmDialog = vi.fn();
  (window as any).escapeHtml = (s: unknown) =>
    String(s ?? '').replace(
      /[&<>"']/g,
      c => (({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }) as any)[c]
    );
  (window as any).Chart = class {
    static register() {}
    destroy() {}
    update() {}
  };
  (window as any).erpAuth = {
    getCurrentUser: () => ({ email: 'test@nsa.local', name: 'Test' }),
    logout: vi.fn(),
  };
  (window as any).erpBackup = {
    getBackupStatus: () => ({ lastBackup: false, lastBackupDate: null, hoursUntilNext: 24 }),
    getBackupList: async () => [],
  };
  (window as any).NSANotif = {
    getAlerts: () => [],
    checkAlerts: () => [],
    getUnreadCount: () => 0,
    markAllRead: () => {},
    requestPermission: async () => 'denied',
  };

  // ES modules the real app loads before the bundle: helpers.js sets the
  // window.idr/idrFull/secHdr/filters/escapeHtml globals the renderers use,
  // doc-registry.js sets window.DocRegistry.
  return Promise.all([
    import('../src/core/helpers.js'),
    import('../src/classic/core/doc-registry.js'),
  ]).then(() => {
    // ── Execute the bundle exactly like production ────────────────────────────
    // Concatenated into ONE script (same join as vite.config's concatRaw) and
    // run via indirect eval (global scope). A single eval is required: classic
    // scripts share top-level let/const bindings (e.g. erp-view's `charts`),
    // which per-file evals would not propagate in Node.
    const bundle = classicOrder
      .map(file => readFileSync(resolve(ROOT, file), 'utf-8'))
      .join('\n;\n');
    try {
      // eslint-disable-next-line no-eval -- intentionally executing the real bundle in global scope
      (0, eval)(bundle);
    } catch (error) {
      loadErrors.push({ file: '(bundle)', error });
    }
  });
});

describe('classic bundle', () => {
  it('every script in classicOrder loads without throwing', () => {
    const report = loadErrors.map(e => `${e.file}: ${e.error}`).join('\n');
    expect(loadErrors, report).toEqual([]);
  });

  it('exposes the load-bearing globals', () => {
    expect(window.NSAMenu, 'menu-router.js').toBeTruthy();
    expect(window.GL, 'gl.js').toBeTruthy();
    expect(window.Integrity, 'integrity.js').toBeTruthy();
    expect(window.DocEngine, 'doc-engine.js').toBeTruthy();
    expect(window.NSAXlsx, 'xlsx-export.js').toBeTruthy();
    expect(typeof window.navigate, 'nav.js').toBe('function');
    expect(typeof window.invalidateView, 'nav.js').toBe('function');
  });

  it('every registered view renders without the error fallback', () => {
    const viewIds = Array.from(document.querySelectorAll('[id^="view-"]')).map(el =>
      el.id.replace(/^view-/, '')
    );
    expect(viewIds.length).toBeGreaterThan(5);

    const failures: string[] = [];
    // nav.js swallows renderer errors (console.error + fallback HTML) — spy the
    // console to recover the real error message for the failure report.
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    for (const id of viewIds) {
      seedDB(); // fresh data each view so one view's mutations can't break the next
      errSpy.mockClear();
      try {
        window.invalidateView(id);
        window.navigate(id);
      } catch (e) {
        failures.push(`${id}: navigate threw ${e}`);
        continue;
      }
      const el = document.getElementById(`view-${id}`)!;
      if (el.innerHTML.includes('gagal dimuat')) {
        const call = errSpy.mock.calls.find(c => String(c[0]).includes('Renderer'));
        failures.push(`${id}: renderer threw — ${call ? call[1] : '(no console.error captured)'}`);
      }
    }
    errSpy.mockRestore();
    expect(failures, failures.join('\n')).toEqual([]);
  });

  it('every NSAMenu route resolves to a working handler', () => {
    const routes = window.NSAMenu.routes as Record<string, [string, string]>;
    const labels = Object.keys(routes);
    expect(labels.length).toBeGreaterThan(40);

    const failures: string[] = [];
    for (const label of labels) {
      seedDB();
      const handled = window.NSAMenu.handle('', label);
      if (!handled) {
        const [globalName, method] = routes[label];
        failures.push(`"${label}" → window.${globalName}.${method} missing or threw`);
      }
    }
    expect(failures, failures.join('\n')).toEqual([]);
  });

  // The lazy loader keeps its own copy of the view-id → chunk map (it is a plain
  // classic script and cannot import the Vite config). When the two drift, the
  // affected page silently renders the "sedang dalam pengembangan" placeholder —
  // no exception, no console error, nothing to notice in review. That is exactly
  // how the split-out invoice/quotation/return/report pages first shipped broken,
  // so the two maps are pinned to each other here.
  it('lazy-views.js agrees with vite.config on every lazy view id', () => {
    const src = readFileSync(resolve(ROOT, 'public/classic/core/lazy-views.js'), 'utf-8');
    const body = src.slice(src.indexOf('var LAZY'), src.indexOf('};', src.indexOf('var LAZY')));

    const runtime: Record<string, { url: string; fn: string }> = {};
    const entry = /(\w+):\s*\{\s*url:\s*'([^']+)',\s*fn:\s*'([^']+)'/g;
    for (const m of body.matchAll(entry)) {
      runtime[m[1]] = { url: m[2], fn: m[3] };
    }

    const expected: Record<string, { url: string; fn: string }> = {};
    for (const id of Object.keys(classicLazy)) {
      expected[id] = {
        url: `/classic/view-${id}.js`,
        fn: (classicLazyRenderers as Record<string, string>)[id],
      };
    }
    for (const [id, pair] of Object.entries(classicLazyAliases)) {
      const [chunk, fn] = pair as [string, string];
      expected[id] = { url: `/classic/view-${chunk}.js`, fn };
    }

    expect(Object.keys(runtime).sort()).toEqual(Object.keys(expected).sort());
    expect(runtime).toEqual(expected);
  });

  // Every alias must point at a chunk that is actually emitted, and at a
  // renderer the app can route to.
  it('every lazy alias resolves to a real chunk and a defined renderer', () => {
    for (const [id, pair] of Object.entries(classicLazyAliases)) {
      const [chunk, fn] = pair as [string, string];
      expect(Object.keys(classicLazy), `${id} → ${chunk}`).toContain(chunk);
      expect(typeof (window as any)[fn], `${id} → window.${fn}`).toBe('function');
      expect(typeof (window as any).getRenderer(id), `getRenderer(${id})`).toBe('function');
    }
  });
});
