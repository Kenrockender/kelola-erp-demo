// ═══════════════════════════════════════════════════════════════════════════════
// KELOLA ERP (DEMO) — Lazy view loader  (lazy-views.js)
//
// The 7 heaviest view-tier modules (General Ledger, Financial Reports, Quotations,
// Returns, Warehouse, Item Adjustments, Invoices — ~5k LOC combined) are pulled
// OUT of the core classic bundle (see classicLazy in vite.config.js) and served
// as separate /classic/view-<id>.js chunks. This module fetches the matching
// chunk the first time the user navigates to that view, then re-renders it.
//
// Global-scope rule: classic <script>, IIFE-wrapped. Loads LAST of all classic
// scripts so its window.navigate wrap is the OUTERMOST one — it intercepts a
// navigation, shows a spinner, loads the chunk, then calls window.navigate again
// (re-entering the full nav/rbac/doc-tabs/view-tabs chain) to render for real.
//
// Idempotent by design: the trigger is "is the renderer global still undefined?",
// not "did we fetch it?". So when everything is already present (e.g. the classic
// bundle smoke test evals every file in one pass), nothing is fetched and every
// navigation is a plain passthrough.
// ═══════════════════════════════════════════════════════════════════════════════
(function () {
  'use strict';

  // view-id → { chunk URL, renderer global name }. Kept in sync with
  // classicLazy / classicLazyRenderers / classicLazyAliases in vite.config.js —
  // tests/classic-bundle-smoke.test.ts asserts the two maps match, because a
  // view id present in one and missing from the other renders the "sedang dalam
  // pengembangan" placeholder instead of the real page, with no error anywhere.
  //
  // Several ids share a chunk: the pages split out of the old tabbed views are
  // defined by the same module, so e.g. all four invoice pages load
  // view-invoices.js once between them.
  var LAZY = {
    ledger: { url: '/classic/view-ledger.js', fn: 'renderLedger' },
    financials: { url: '/classic/view-financials.js', fn: 'renderFinancials' },
    quotations: { url: '/classic/view-quotations.js', fn: 'renderQuotations' },
    returns: { url: '/classic/view-returns.js', fn: 'renderReturns' },
    warehouse: { url: '/classic/view-warehouse.js', fn: 'renderWarehouse' },
    adjustments: { url: '/classic/view-adjustments.js', fn: 'renderAdjustments' },
    invoices: { url: '/classic/view-invoices.js', fn: 'renderInvoices' },
    // Pages split out of the tabbed views (aliases onto the chunks above).
    salesInvoices: { url: '/classic/view-invoices.js', fn: 'renderSalesInvoices' },
    purchaseInvoices: { url: '/classic/view-invoices.js', fn: 'renderPurchaseInvoices' },
    salesReceipts: { url: '/classic/view-invoices.js', fn: 'renderSalesReceipts' },
    purchasePayments: { url: '/classic/view-invoices.js', fn: 'renderPurchasePayments' },
    salesQuotations: { url: '/classic/view-quotations.js', fn: 'renderSalesQuotations' },
    purchaseQuotations: { url: '/classic/view-quotations.js', fn: 'renderPurchaseQuotations' },
    salesReturns: { url: '/classic/view-returns.js', fn: 'renderSalesReturns' },
    purchaseReturns: { url: '/classic/view-returns.js', fn: 'renderPurchaseReturns' },
    reportPL: { url: '/classic/view-financials.js', fn: 'renderReportPL' },
    reportBS: { url: '/classic/view-financials.js', fn: 'renderReportBS' },
    reportCF: { url: '/classic/view-financials.js', fn: 'renderReportCF' },
  };

  // Cross-module doc-openers used by doc-flow.js "Jejak" navigation. Before its
  // module is loaded the global is undefined, so we install a stub that loads the
  // chunk then forwards the call. The real fn overwrites the stub on load.
  var STUBS = {
    viewQuotation: 'quotations',
    viewInvoiceDoc: 'invoices',
  };

  var loading = {}; // view-id → Promise, so concurrent navigations share one load

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = src;
      s.async = false;
      s.onload = function () {
        resolve();
      };
      s.onerror = function () {
        reject(new Error('Failed to load view chunk: ' + src));
      };
      document.head.appendChild(s);
    });
  }

  // Ensure the chunk for `id` is loaded. Resolves immediately if its renderer is
  // already defined. Re-wraps doc-tabs and refreshes lazy stubs after load so the
  // freshly-defined viewX fns get the doc-tabs inline-panel behaviour.
  function ensureView(id) {
    var cfg = LAZY[id];
    if (!cfg || typeof window[cfg.fn] === 'function') {
      return Promise.resolve(false);
    }
    if (loading[id]) {
      return loading[id];
    }
    loading[id] = loadScript(cfg.url)
      .then(function () {
        if (window.docTabs && typeof window.docTabs.rewrap === 'function') {
          window.docTabs.rewrap();
        }
        return true;
      })
      .catch(function (err) {
        delete loading[id]; // allow a retry on the next navigation
        throw err;
      });
    return loading[id];
  }
  window.ensureView = ensureView;

  function spinnerHTML() {
    return (
      '<div style="padding:64px 24px;text-align:center;color:var(--muted)">' +
      '<div class="lazy-spin" style="width:34px;height:34px;margin:0 auto 16px;' +
      'border:3px solid var(--border,#e5e7eb);border-top-color:var(--primary,#2563eb);' +
      'border-radius:50%;animation:lazySpin .7s linear infinite"></div>' +
      '<div style="font-size:13px;font-weight:600">Memuat modul…</div></div>'
    );
  }

  function errorHTML(id) {
    return (
      '<div style="padding:48px 24px;text-align:center">' +
      '<div style="font-size:40px;margin-bottom:12px">⚠️</div>' +
      '<h2 style="font-size:16px;font-weight:800;margin-bottom:6px">Gagal memuat modul</h2>' +
      '<p style="color:var(--muted);font-size:13px;margin-bottom:16px">' +
      'Periksa koneksi lalu coba lagi.</p>' +
      '<button class="btn btn-primary" data-lazy-retry="' +
      id +
      '">Coba Lagi</button></div>'
    );
  }

  function installStyles() {
    if (document.getElementById('lazy-views-style')) {
      return;
    }
    var st = document.createElement('style');
    st.id = 'lazy-views-style';
    st.textContent = '@keyframes lazySpin{to{transform:rotate(360deg)}}';
    document.head.appendChild(st);
  }

  function wrapNavigate() {
    if (typeof window.navigate !== 'function' || window.navigate.__lazyWrapped) {
      return;
    }
    var orig = window.navigate;
    var wrapped = function (id) {
      var cfg = LAZY[id];
      // Not lazy, or its module is already present → plain passthrough.
      if (!cfg || typeof window[cfg.fn] === 'function') {
        return orig.apply(this, arguments);
      }
      // Let the real navigate set rail/active state (it renders a placeholder
      // because the renderer is missing), then swap in a spinner.
      var r = orig.call(this, id);
      var el = document.getElementById('view-' + id);
      if (el) {
        el.innerHTML = spinnerHTML();
      }
      ensureView(id)
        .then(function () {
          // Only re-render if the user is still on this view.
          if (window.activeView !== id) {
            return;
          }
          window.invalidateView(id);
          window.navigate(id);
        })
        .catch(function (err) {
          console.error('[lazy-views] ' + id + ' failed:', err);
          var e2 = document.getElementById('view-' + id);
          if (e2 && window.activeView === id) {
            e2.innerHTML = errorHTML(id);
          }
        });
      return r;
    };
    wrapped.__lazyWrapped = true;
    window.navigate = wrapped;
  }

  // For each cross-module doc-opener, install a stub (only if the real fn isn't
  // present yet) that loads the chunk then forwards the original call.
  function installStubs() {
    Object.keys(STUBS).forEach(function (fnName) {
      if (typeof window[fnName] === 'function') {
        return; // real (or already-stubbed) fn present
      }
      var viewId = STUBS[fnName];
      var stub = function () {
        var self = this;
        var args = arguments;
        ensureView(viewId)
          .then(function () {
            var real = window[fnName];
            if (typeof real === 'function' && !real.__lazyStub) {
              real.apply(self, args);
            }
          })
          .catch(function (err) {
            console.error('[lazy-views] stub ' + fnName + ' failed:', err);
          });
      };
      stub.__lazyStub = true;
      window[fnName] = stub;
    });
  }

  // Retry button inside the error state.
  document.addEventListener('click', function (e) {
    var btn = e.target && e.target.closest && e.target.closest('[data-lazy-retry]');
    if (!btn) {
      return;
    }
    var id = btn.getAttribute('data-lazy-retry');
    var el = document.getElementById('view-' + id);
    if (el) {
      el.innerHTML = spinnerHTML();
    }
    ensureView(id)
      .then(function () {
        window.invalidateView(id);
        window.navigate(id);
      })
      .catch(function () {
        var e2 = document.getElementById('view-' + id);
        if (e2) {
          e2.innerHTML = errorHTML(id);
        }
      });
  });

  function init() {
    installStyles();
    wrapNavigate();
    installStubs();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
