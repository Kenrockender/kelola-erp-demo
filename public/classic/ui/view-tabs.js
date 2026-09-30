// ═══════════════════════════════════════════════════════════════════════════════
// KELOLA ERP (DEMO) — Multi-tab View Bar  (view-tabs.js)
//
// Accurate Online-style open-page tabs: every view opened via navigate() gets a
// tab in a bar under the topbar. Clicking a tab switches views (the DOM already
// keeps every rendered #view-* alive, so switching is instant); ✕ closes it.
// Dashboard is pinned and can't be closed. Open tabs persist per-browser in
// localStorage (nsa_view_tabs_v1) — only the tab LIST is restored, the session
// still boots on Dashboard.
//
// Load order (vite.config.js classicOrder): after ui/nav.js (needs its
// window.navigate as the wrap target) and before core/rbac.js (rbac wraps
// whatever navigate it finds, so the rbac guard stays outermost).
// ═══════════════════════════════════════════════════════════════════════════════
(function () {
  'use strict';

  var STORE_KEY = 'nsa_view_tabs_v1';
  var PINNED = 'dashboard';

  // view-id → tab label (ids = the #view-* containers in app.html)
  var VIEW_LABELS = {
    dashboard: 'Dashboard',
    sales: 'Sales Order',
    purchase: 'Purchase Order',
    inventory: 'Inventory',
    customers: 'Pelanggan',
    suppliers: 'Supplier',
    products: 'Produk',
    finance: 'Finance',
    logistics: 'Delivery Order',
    master: 'Master Data',
    reports: 'Reports',
    settings: 'Pengaturan',
    company: 'Company',
    ledger: 'General Ledger',
    adjustments: 'Item Adjustment',
    invoices: 'Faktur & Pembayaran',
    cashbank: 'Cash & Bank',
    assets: 'Fixed Asset',
    tax: 'Tax',
    financials: 'Laporan Keuangan',
    quotations: 'Quotation',
    returns: 'Retur',
    warehouse: 'Warehouse',
  };

  var tabs = [PINNED];

  var esc =
    window.escapeHtml ||
    function (s) {
      return String(s == null ? '' : s).replace(/[&<>"']/g, function (m) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m];
      });
    };

  function labelOf(id) {
    return VIEW_LABELS[id] || id.charAt(0).toUpperCase() + id.slice(1);
  }
  function viewExists(id) {
    return !!document.getElementById('view-' + id);
  }

  function save() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(tabs));
    } catch (_) {
      /* ignore */
    }
  }
  function load() {
    try {
      var saved = JSON.parse(localStorage.getItem(STORE_KEY) || '[]');
      if (Array.isArray(saved)) {
        saved.forEach(function (id) {
          if (typeof id === 'string' && viewExists(id) && tabs.indexOf(id) === -1) {
            tabs.push(id);
          }
        });
      }
    } catch (_) {
      /* ignore */
    }
  }

  // ── Bar DOM ─────────────────────────────────────────────────────────────────
  function injectStyles() {
    if (document.getElementById('view-tabs-style')) {
      return;
    }
    var st = document.createElement('style');
    st.id = 'view-tabs-style';
    st.textContent =
      '.view-tabs{display:flex;align-items:flex-end;gap:4px;padding:8px 14px 0;' +
      'background:var(--card);border-bottom:1px solid var(--border);' +
      'overflow-x:auto;overflow-y:hidden;scrollbar-width:thin;flex-shrink:0}' +
      '.view-tabs::-webkit-scrollbar{height:4px}' +
      '.view-tabs::-webkit-scrollbar-thumb{background:var(--border);border-radius:2px}' +
      '.vtab{display:inline-flex;align-items:center;gap:8px;padding:7px 14px;' +
      'border:1px solid var(--border);border-bottom:none;border-radius:9px 9px 0 0;' +
      'background:var(--bg);color:var(--muted);font-size:12px;font-weight:700;' +
      'cursor:pointer;white-space:nowrap;user-select:none;max-width:200px;' +
      'transition:background .15s,color .15s}' +
      '.vtab:hover{color:var(--text)}' +
      '.vtab.active{background:var(--primary);border-color:var(--primary);color:#fff}' +
      '.vtab-label{overflow:hidden;text-overflow:ellipsis}' +
      '.vtab-close{display:inline-flex;align-items:center;justify-content:center;' +
      'width:16px;height:16px;border-radius:50%;font-size:13px;line-height:1;' +
      'opacity:.65;flex-shrink:0}' +
      '.vtab-close:hover{opacity:1;background:rgba(255,255,255,.25)}' +
      '.vtab:not(.active) .vtab-close:hover{background:var(--border)}' +
      '@media (max-width:768px){.view-tabs{padding:6px 10px 0}.vtab{padding:6px 10px}}';
    document.head.appendChild(st);
  }

  function ensureBar() {
    var bar = document.getElementById('view-tabs-bar');
    if (bar) {
      return bar;
    }
    var content = document.getElementById('main-content');
    if (!content || !content.parentNode) {
      return null;
    }
    injectStyles();
    bar = document.createElement('div');
    bar.id = 'view-tabs-bar';
    bar.className = 'view-tabs';
    bar.setAttribute('role', 'tablist');
    bar.setAttribute('aria-label', 'Halaman terbuka');
    content.parentNode.insertBefore(bar, content);

    bar.addEventListener('click', function (e) {
      var closeBtn = e.target.closest('.vtab-close');
      if (closeBtn) {
        e.stopPropagation();
        closeTab(closeBtn.dataset.id);
        return;
      }
      var tab = e.target.closest('.vtab');
      if (tab && tab.dataset.id && tab.dataset.id !== window.activeView) {
        if (typeof window.navigate === 'function') {
          window.navigate(tab.dataset.id);
        }
      }
    });
    // Middle-click closes a tab, like a browser.
    bar.addEventListener('auxclick', function (e) {
      if (e.button !== 1) {
        return;
      }
      var tab = e.target.closest('.vtab');
      if (tab && tab.dataset.id) {
        e.preventDefault();
        closeTab(tab.dataset.id);
      }
    });
    return bar;
  }

  function render() {
    var bar = ensureBar();
    if (!bar) {
      return;
    }
    var active = window.activeView;
    bar.innerHTML = tabs
      .map(function (id) {
        var on = id === active;
        return (
          '<div class="vtab' +
          (on ? ' active' : '') +
          '" role="tab" aria-selected="' +
          on +
          '" data-id="' +
          esc(id) +
          '" title="' +
          esc(labelOf(id)) +
          '"><span class="vtab-label">' +
          esc(labelOf(id)) +
          '</span>' +
          (id === PINNED
            ? ''
            : '<span class="vtab-close" data-id="' +
              esc(id) +
              '" role="button" aria-label="Tutup tab ' +
              esc(labelOf(id)) +
              '">×</span>') +
          '</div>'
        );
      })
      .join('');
    var act = bar.querySelector('.vtab.active');
    if (act && typeof act.scrollIntoView === 'function') {
      act.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
  }

  // ── Tab ops ─────────────────────────────────────────────────────────────────
  function openTab(id) {
    if (!id || !viewExists(id)) {
      return;
    }
    if (tabs.indexOf(id) === -1) {
      tabs.push(id);
      save();
    }
    render();
  }

  function closeTab(id) {
    if (!id || id === PINNED) {
      return;
    }
    var i = tabs.indexOf(id);
    if (i === -1) {
      return;
    }
    tabs.splice(i, 1);
    save();
    if (window.activeView === id) {
      // Fall back to the neighbouring tab (Accurate behaviour), else Dashboard.
      var next = tabs[Math.min(i, tabs.length - 1)] || PINNED;
      if (typeof window.navigate === 'function') {
        window.navigate(next); // re-renders the bar via the navigate wrap
        return;
      }
    }
    render();
  }

  // ── Wire up ─────────────────────────────────────────────────────────────────
  function wrapNavigate() {
    if (typeof window.navigate !== 'function') {
      return;
    }
    var orig = window.navigate;
    window.navigate = function tabbedNavigate(id) {
      var r = orig.apply(this, arguments);
      openTab(id);
      return r;
    };
  }

  function init() {
    load();
    render();
    wrapNavigate();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Exposed for other modules / console use.
  window.viewTabs = { open: openTab, close: closeTab, list: () => tabs.slice() };
})();
