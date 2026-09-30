// ═══════════════════════════════════════════════════════════════════════════════
// KELOLA ERP (DEMO) — Navigation with Flyout Menus
// ═══════════════════════════════════════════════════════════════════════════════
// Wrapped in an IIFE so its top-level declarations stay local. As classic
// scripts share one global scope, names like `charts`, `getRenderer`,
// `_filterCloseCtrl`, etc. are already declared by erp-view.js — redeclaring
// them at global scope is a SyntaxError that would silently kill this whole
// file (breaking all sidebar navigation + the theme toggle).
(function () {
  const _renderedViews = new Set();

  // Bridge to the renderer/chart functions defined in erp-view.js (globals).
  let _filterCloseCtrl = null;
  let destroyCharts = () => {
    if (typeof window.destroyCharts === 'function') {
      window.destroyCharts();
    }
  };
  let initCharts = () => {
    if (typeof window.initCharts === 'function') {
      window.initCharts();
    }
  };
  let getRenderer = id =>
    typeof window.getRenderer === 'function' ? window.getRenderer(id) : null;

  // Helper functions (use global if available, otherwise provide fallback)
  const escapeHtml =
    window.escapeHtml ||
    (text =>
      String(text).replace(
        /[&<>"']/g,
        m =>
          ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#39;',
          })[m]
      ));

  const showToast = window.showToast || (msg => console.log('Toast:', msg));

  // Make these available globally for other modules to set
  window.setNavDependencies = function (deps) {
    if (deps.destroyCharts) {
      destroyCharts = deps.destroyCharts;
    }
    if (deps.initCharts) {
      initCharts = deps.initCharts;
    }
    if (deps.getRenderer) {
      getRenderer = deps.getRenderer;
    }
    if (deps.charts) {
      Object.assign(charts, deps.charts);
    }
  };

  // Menu definitions matching Accurate Online structure
  const MENU_CONFIG = {
    dashboard: {
      title: 'Dashboard',
      color: '#2563EB',
      view: 'dashboard',
      items: [],
    },
    company: {
      title: 'Company',
      color: '#3B82F6',
      items: [
        { icon: 'home', label: 'Profil Perusahaan', view: 'settings' },
        { icon: 'percent', label: 'Tax', view: 'tax' },
        { icon: 'clock', label: 'Payment Term', view: 'settings' },
        { icon: 'truck', label: 'Shipment', view: 'settings' },
        { icon: 'users', label: 'Employee', view: 'master' },
        { icon: 'user', label: 'Contact', view: 'master' },
        { icon: 'calendar', label: 'Calendar', view: 'settings' },
        { icon: 'activity', label: 'Activity Log', view: 'settings' },
        { icon: 'trash-2', label: 'Recycle Bin', view: 'settings' },
        { icon: 'download', label: 'Import dari Excel', view: 'excelImport' },
      ],
    },
    ledger: {
      title: 'General Ledger',
      color: '#10B981',
      items: [
        { icon: 'list', label: 'Chart of Accounts', view: 'ledger' },
        { icon: 'book', label: 'Trial Balance', view: 'ledger' },
        { icon: 'pie-chart', label: 'Laporan Keuangan', view: 'reportPL' },
        { icon: 'file-text', label: 'Expense Accrual', view: 'finance' },
        { icon: 'users', label: 'Employee Payroll', view: 'finance' },
        { icon: 'edit-3', label: 'Journal Voucher', view: 'ledger' },
        { icon: 'bar-chart-2', label: 'Budget Monitor', view: 'finance' },
        { icon: 'repeat', label: 'Budget Transfer', view: 'finance' },
        { icon: 'pie-chart', label: 'Budget', view: 'finance' },
        { icon: 'clock', label: 'Account History', view: 'finance' },
        { icon: 'search', label: 'Audit Journal', view: 'finance' },
      ],
    },
    cashbank: {
      title: 'Cash & Bank',
      color: '#0EA5E9',
      items: [
        { icon: 'arrow-up-right', label: 'Other Payment', view: 'finance' },
        { icon: 'arrow-down-left', label: 'Other Deposit', view: 'finance' },
        { icon: 'repeat', label: 'Bank Transfer', view: 'finance' },
        { icon: 'file-text', label: 'Bank Statement', view: 'finance' },
        { icon: 'clock', label: 'Bank History', view: 'finance' },
        { icon: 'check-square', label: 'Bank Reconcile', view: 'finance' },
      ],
    },
    sales: {
      title: 'Sales',
      color: '#10B981',
      items: [
        { icon: 'file-text', label: 'Sales Quotation', view: 'salesQuotations' },
        { icon: 'shopping-bag', label: 'Sales Order', view: 'sales' },
        { icon: 'truck', label: 'Delivery Order', view: 'logistics' },
        { icon: 'credit-card', label: 'Sales Down Payment', view: 'sales' },
        { icon: 'file', label: 'Sales Invoice', view: 'salesInvoices' },
        { icon: 'check-circle', label: 'Sales Receipt', view: 'salesReceipts' },
        { icon: 'rotate-ccw', label: 'Sales Return', view: 'salesReturns' },
        { icon: 'tag', label: 'Customer Category', view: 'master' },
        { icon: 'tag', label: 'Sales Category', view: 'sales' },
        { icon: 'user', label: 'Customer', view: 'master' },
      ],
    },
    purchases: {
      title: 'Purchases',
      color: '#F59E0B',
      items: [
        { icon: 'file-text', label: 'Purchase Quotation', view: 'purchaseQuotations' },
        { icon: 'file-text', label: 'Purchase Order', view: 'purchase' },
        { icon: 'download', label: 'Receive Item', view: 'purchase' },
        { icon: 'credit-card', label: 'Purchase Down Payment', view: 'purchase' },
        { icon: 'file', label: 'Purchase Invoice', view: 'purchaseInvoices' },
        { icon: 'check-circle', label: 'Purchase Payment', view: 'purchasePayments' },
        { icon: 'rotate-ccw', label: 'Purchase Return', view: 'purchaseReturns' },
        { icon: 'dollar-sign', label: 'Supplier Price', view: 'purchase' },
        { icon: 'tag', label: 'Supplier Category', view: 'master' },
        { icon: 'user', label: 'Supplier', view: 'master' },
      ],
    },
    inventory: {
      title: 'Inventory',
      color: '#0EA5E9',
      items: [
        { icon: 'clipboard', label: 'Item Requisition', view: 'inventory' },
        { icon: 'shuffle', label: 'Item Transfer', view: 'warehouse' },
        { icon: 'sliders', label: 'Item Adjustment', view: 'adjustments' },
        { icon: 'tool', label: 'Job Costing', view: 'inventory' },
        { icon: 'package', label: 'Item', view: 'inventory' },
        { icon: 'home', label: 'Warehouse', view: 'warehouse' },
        { icon: 'hash', label: 'Item Unit', view: 'inventory' },
        { icon: 'folder', label: 'Item Category', view: 'inventory' },
        { icon: 'award', label: 'Item Brand', view: 'inventory' },
        { icon: 'download', label: 'Import dari Excel', view: 'excelImport' },
      ],
    },
    assets: {
      title: 'Fixed Asset',
      color: '#8B5CF6',
      items: [
        { icon: 'hard-drive', label: 'Fixed Asset', view: 'assets' },
        { icon: 'folder', label: 'Fixed Asset Category', view: 'assets' },
        { icon: 'percent', label: 'Fiscal FA Category', view: 'assets' },
        { icon: 'edit', label: 'Fixed Asset Edited', view: 'assets' },
        { icon: 'trash-2', label: 'FA Disposition', view: 'assets' },
        { icon: 'shuffle', label: 'Asset Transfer', view: 'assets' },
        { icon: 'map-pin', label: 'Asset per Location', view: 'assets' },
      ],
    },
    logistics: {
      title: 'Logistik',
      color: '#0EA5E9',
      items: [
        { icon: 'truck', label: 'Input Surat Jalan', view: 'suratjalan' },
        { icon: 'file-text', label: 'Daftar Delivery Order', view: 'logistics' },
      ],
    },
    reports: {
      title: 'Reports',
      color: '#F97316',
      items: [
        { icon: 'file-text', label: 'Report List', view: 'reports' },
        { icon: 'clock', label: 'Outstanding (Piutang & Hutang)', view: 'outstanding' },
        { icon: 'pie-chart', label: 'Laba Rugi (P/L)', view: 'reportPL' },
        { icon: 'bar-chart-2', label: 'Neraca (Balance Sheet)', view: 'reportBS' },
        { icon: 'activity', label: 'Arus Kas (Cash Flow)', view: 'reportCF' },
      ],
    },
  };

  // Simple feather-style icon SVG generator
  function _menuIcon(name, color) {
    const icons = {
      'dollar-sign':
        '<line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>',
      percent:
        '<line x1="19" y1="5" x2="5" y2="19"/><circle cx="6.5" cy="6.5" r="2.5"/><circle cx="17.5" cy="17.5" r="2.5"/>',
      clock: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
      truck:
        '<rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/>',
      users:
        '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
      user: '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
      star: '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>',
      calendar:
        '<rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>',
      activity: '<polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>',
      list: '<line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>',
      'file-text':
        '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/>',
      'edit-3':
        '<path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>',
      'bar-chart-2':
        '<line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>',
      repeat:
        '<polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/>',
      'pie-chart':
        '<path d="M21.21 15.89A10 10 0 1 1 8 2.83"/><path d="M22 12A10 10 0 0 0 12 2v10z"/>',
      search: '<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>',
      'arrow-up-right': '<line x1="7" y1="17" x2="17" y2="7"/><polyline points="7 7 17 7 17 17"/>',
      'arrow-down-left': '<line x1="17" y1="7" x2="7" y2="17"/><polyline points="17 17 7 17 7 7"/>',
      smartphone:
        '<rect x="5" y="2" width="14" height="20" rx="2" ry="2"/><line x1="12" y1="18" x2="12.01" y2="18"/>',
      'check-square':
        '<polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>',
      'shopping-bag':
        '<path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/>',
      'credit-card':
        '<rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/>',
      file: '<path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><polyline points="13 2 13 9 20 9"/>',
      'check-circle':
        '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>',
      'rotate-ccw':
        '<polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/>',
      tag: '<path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/>',
      'trending-up':
        '<polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/>',
      download:
        '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>',
      clipboard:
        '<path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/>',
      shuffle:
        '<polyline points="16 3 21 3 21 8"/><line x1="4" y1="20" x2="21" y2="3"/><polyline points="21 16 21 21 16 21"/><line x1="15" y1="15" x2="21" y2="21"/><line x1="4" y1="4" x2="9" y2="9"/>',
      sliders:
        '<line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/>',
      tool: '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>',
      package:
        '<line x1="16.5" y1="9.4" x2="7.5" y2="4.21"/><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/>',
      home: '<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>',
      hash: '<line x1="4" y1="9" x2="20" y2="9"/><line x1="4" y1="15" x2="20" y2="15"/><line x1="10" y1="3" x2="8" y2="21"/><line x1="16" y1="3" x2="14" y2="21"/>',
      folder:
        '<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>',
      award:
        '<circle cx="12" cy="8" r="7"/><polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88"/>',
      'hard-drive':
        '<line x1="22" y1="12" x2="2" y2="12"/><path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/><line x1="6" y1="16" x2="6.01" y2="16"/><line x1="10" y1="16" x2="10.01" y2="16"/>',
      edit: '<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>',
      'trash-2':
        '<polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/>',
      'map-pin':
        '<path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>',
      mail: '<path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/>',
      cpu: '<rect x="4" y="4" width="16" height="16" rx="2" ry="2"/><rect x="9" y="9" width="6" height="6"/><line x1="9" y1="1" x2="9" y2="4"/><line x1="15" y1="1" x2="15" y2="4"/><line x1="9" y1="20" x2="9" y2="23"/><line x1="15" y1="20" x2="15" y2="23"/><line x1="20" y1="9" x2="23" y2="9"/><line x1="20" y1="14" x2="23" y2="14"/><line x1="1" y1="9" x2="4" y2="9"/><line x1="1" y1="14" x2="4" y2="14"/>',
    };
    const path = icons[name] || icons['file'];
    return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${path}</svg>`;
  }

  // Current sub-nav state. `_activeFlyout` holds the menu group whose items are
  // currently shown in the contextual sub-nav panel (second tier).
  let _activeFlyout = null;
  // Label of the flyout item the user actually clicked, so navigate() highlights
  // that exact item — not every item that happens to share the same data-view
  // (many menu items route to the same view, e.g. several → 'settings').
  let _pendingItemLabel = null;

  // True when the viewport is narrow enough that the sub-nav is an overlay flyout
  // rather than a docked column (must match the <=900px CSS breakpoint).
  function _isOverlay() {
    return window.innerWidth <= 900;
  }

  function _showSubnav() {
    document.body.classList.remove('subnav-hidden');
  }
  function _hideSubnav() {
    document.body.classList.add('subnav-hidden');
  }

  // Fill the sub-nav panel with a group's items. Returns false if the group or
  // the panel DOM is missing.
  function _renderSubnav(menuId) {
    const config = MENU_CONFIG[menuId];
    const title = document.getElementById('flyout-title');
    const sep = document.getElementById('flyout-separator');
    const grid = document.getElementById('flyout-grid');
    if (!config || !grid) {
      return false;
    }
    if (title) title.textContent = config.title;
    if (sep) sep.style.background = config.color;

    const bgColor = config.color + '22';
    grid.innerHTML = config.items
      .map(
        item =>
          `<button class="flyout-item" data-view="${item.view}" data-label="${escapeHtml(item.label)}">
      <div class="flyout-item-icon" style="background:${bgColor}">
        ${_menuIcon(item.icon, config.color)}
      </div>
      <span>${escapeHtml(item.label)}</span>
    </button>`
      )
      .join('');
    return true;
  }

  function openFlyout(menuId) {
    const config = MENU_CONFIG[menuId];
    if (!config) {
      return;
    }
    const overlay = _isOverlay();

    // Groups with no children (Dashboard) have no sub-nav: hide the panel and
    // navigate straight to the view so it gets the full content width.
    if (!config.items || config.items.length === 0) {
      closeFlyout();
      _hideSubnav();
      _updateRailActive(menuId);
      _activeFlyout = menuId;
      if (config.view) {
        window.navigate(config.view);
      }
      return;
    }

    // Re-click on the active group toggles the panel.
    if (_activeFlyout === menuId) {
      if (overlay) {
        closeFlyout();
      } else if (document.body.classList.contains('subnav-hidden')) {
        _showSubnav();
      } else {
        _hideSubnav();
      }
      return;
    }

    // On mobile the sidebar is an overlay drawer — close it before opening flyout
    // so the sidebar (z-index:300) doesn't sit on top of the flyout panel.
    if (window.innerWidth <= 768) {
      const sb = document.getElementById('sidebar');
      const sbBackdrop = document.getElementById('sidebar-backdrop');
      const hb = document.getElementById('hamburger');
      if (sb) sb.classList.remove('open');
      if (sbBackdrop) sbBackdrop.classList.remove('open');
      if (hb) { hb.classList.remove('open'); hb.setAttribute('aria-expanded', 'false'); }
      document.body.classList.remove('sidebar-open');
    }

    if (!_renderSubnav(menuId)) {
      return;
    }
    _showSubnav();

    if (overlay) {
      const panel = document.getElementById('flyout-panel');
      const backdrop = document.getElementById('flyout-backdrop');
      if (panel) panel.classList.add('open');
      if (backdrop) backdrop.classList.add('open');
    }
    _activeFlyout = menuId;
    _updateRailActive(menuId);
  }

  // Collapse handle (desktop docked mode) / close button (overlay mode).
  function toggleSubnav() {
    if (_isOverlay()) {
      closeFlyout();
      return;
    }
    if (document.body.classList.contains('subnav-hidden')) {
      if (_activeFlyout && MENU_CONFIG[_activeFlyout] && MENU_CONFIG[_activeFlyout].items) {
        _renderSubnav(_activeFlyout);
      }
      _showSubnav();
    } else {
      _hideSubnav();
    }
  }

  // Reflect the active view's group in the sub-nav on first paint.
  function _initSubnavState() {
    const active = window.activeView || 'dashboard';
    let group = null;
    for (const [mid, cfg] of Object.entries(MENU_CONFIG)) {
      if (cfg.view === active || (cfg.items && cfg.items.some(i => i.view === active))) {
        group = mid;
        break;
      }
    }
    if (group && MENU_CONFIG[group].items && MENU_CONFIG[group].items.length) {
      _renderSubnav(group);
      _showSubnav();
      _activeFlyout = group;
      _updateRailActive(group);
    } else {
      _hideSubnav();
      _activeFlyout = group || 'dashboard';
      _updateRailActive(_activeFlyout);
    }
  }

  function closeFlyout() {
    const panel = document.getElementById('flyout-panel');
    const backdrop = document.getElementById('flyout-backdrop');
    if (panel) {
      panel.classList.remove('open');
    }
    if (backdrop) {
      backdrop.classList.remove('open');
    }
    _activeFlyout = null;
  }

  function _updateRailActive(menuId) {
    document.querySelectorAll('.rail-item').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.menu === menuId);
    });
  }

  // Initialize sidebar event listeners
  function initSidebarNav() {
    console.log('[NAV] Initializing sidebar navigation...');

    // Direct binding to each rail item for maximum reliability
    const railItems = document.querySelectorAll('.rail-item');
    console.log('[NAV] Found', railItems.length, 'rail items');

    railItems.forEach(btn => {
      // RBAC: hide whole menu groups the current role may not view (e.g. a
      // Penjualan role never sees General Ledger / Cash & Bank / Tax / Admin).
      const menuId = btn.dataset.menu;
      if (
        menuId &&
        window.RBAC &&
        typeof window.RBAC.canViewGroup === 'function' &&
        !window.RBAC.canViewGroup(menuId)
      ) {
        btn.style.display = 'none';
        return;
      }
      btn.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        const mid = this.dataset.menu;
        console.log('[NAV] Rail item clicked:', mid);
        if (mid) {
          openFlyout(mid);
        }
      });
    });

    // Flyout item clicks (delegated since they're dynamic)
    document.addEventListener('click', function (e) {
      const flyoutItem = e.target.closest('.flyout-item');
      if (flyoutItem) {
        e.preventDefault();
        const viewId = flyoutItem.dataset.view;
        const itemLabel = flyoutItem.dataset.label || '';
        // Docked sub-nav stays open on desktop; only the overlay flyout closes.
        if (_isOverlay()) {
          closeFlyout();
        }
        // Highlight the chosen item within the panel.
        document.querySelectorAll('.flyout-item').forEach(b => {
          b.classList.toggle('active', b === flyoutItem);
        });
        // Remember exactly which item was clicked so the navigate() sync below
        // doesn't fall back to highlighting every item with the same view.
        _pendingItemLabel = itemLabel;
        if (viewId) {
          // Menu-coverage may fully handle the click (real feature route, or an
          // honest "in development" placeholder). Otherwise navigate normally.
          const handled =
            window.NSAMenu &&
            typeof window.NSAMenu.handle === 'function' &&
            window.NSAMenu.handle(viewId, itemLabel);
          if (!handled) {
            // Go through window.navigate (not the local `navigate` binding):
            // this IIFE's own `navigate` is the pristine, unwrapped original —
            // view-tabs/doc-tabs/rbac/lazy-views all layer wraps onto
            // window.navigate only, so calling it directly here silently
            // bypassed all of them (most importantly the lazy-chunk loader
            // for General Ledger / Financial Reports / Quotations / Returns /
            // Warehouse / Adjustments / Invoices).
            window.navigate(viewId);
          }
          for (const [menuId, config] of Object.entries(MENU_CONFIG)) {
            if (config.items && config.items.some(i => i.view === viewId)) {
              _updateRailActive(menuId);
              break;
            }
          }
        }
        return;
      }

      const backdrop = e.target.closest('.flyout-backdrop');
      if (backdrop) {
        closeFlyout();
        return;
      }

      // On mobile the flyout-panel is a full-screen overlay, so the backdrop
      // underneath it is never reachable. Tapping any empty area of the panel
      // itself (anything that isn't a menu-item button) closes it — giving the
      // expected "tap outside a button = back" gesture. Desktop docked mode keeps
      // the panel persistent, so this gesture only applies in overlay mode.
      const panel = e.target.closest('.flyout-panel');
      if (_isOverlay() && panel && !e.target.closest('.flyout-item')) {
        closeFlyout();
        return;
      }
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && _activeFlyout) {
        closeFlyout();
      }
    });

    // User menu button — dropdown with profile / password / backup / logout
    const userMenuBtn = document.getElementById('user-menu-btn');
    if (userMenuBtn) {
      userMenuBtn.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        _toggleUserMenu();
      });
    }

    // ── Notification bell ─────────────────────────────────────────────────────
    const notifBtn = document.getElementById('notif-btn');
    if (notifBtn) {
      notifBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        _toggleNotifPanel();
      });
    }

    // Hamburger + sidebar backdrop are wired by the inline script in index.html
    // (which also handles Escape, swipe-to-close, resize, and nav-item close).
    // Adding a second toggle handler here causes the two toggles to cancel each
    // other out on tap, so the sidebar never opens on mobile.

    // Sub-nav collapse handle.
    const subnavCollapse = document.getElementById('subnav-collapse');
    if (subnavCollapse) {
      subnavCollapse.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        toggleSubnav();
      });
    }

    // Render the sub-nav for the initially active view (Dashboard hides it).
    _initSubnavState();

    initTheme();
    initSearchToggle();
    initDbStatusIndicator();

    console.log('[NAV] Sidebar navigation initialized successfully');
  }

  // ── Firebase / DB connection status indicator ──────────────────────────────
  function initDbStatusIndicator() {
    const chip = document.getElementById('db-status-chip');
    const dot = document.getElementById('db-status-dot');
    const label = document.getElementById('db-status-label');
    if (!chip || !dot || !label) return;

    function _fmt(ts) {
      if (!ts) return '';
      const d = new Date(ts);
      return d.toLocaleTimeString('id-ID', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });
    }

    function _update() {
      const mode = window.__nsaDataMode;
      if (mode === 'firestore') {
        dot.className = 'db-status-dot online';
        label.className = 'db-status-label online';
        label.textContent = 'Firebase';
        const sync = window.__nsaLastSync ? ' · ' + _fmt(window.__nsaLastSync) : '';
        chip.title = 'Terhubung ke Firebase Firestore' + sync;
      } else if (mode === 'local') {
        dot.className = 'db-status-dot offline';
        label.className = 'db-status-label offline';
        label.textContent = 'Lokal';
        chip.title = 'Mode offline — data disimpan di perangkat ini';
      } else {
        dot.className = 'db-status-dot';
        label.className = 'db-status-label';
        label.textContent = '…';
        chip.title = 'Memuat...';
      }
    }

    _update();
    // Poll every 3s so the indicator reflects changes (e.g. after migration or reconnect)
    setInterval(_update, 3000);
  }

  // ── Search focus shortcut ───────────────────────────────────────────────────
  function initSearchToggle() {
    const input = document.getElementById('search-input');
    if (!input) return;

    // "/" shortcut focuses the search bar from anywhere
    document.addEventListener('keydown', function (e) {
      if (e.key === '/' && !e.ctrlKey && !e.metaKey) {
        const tag = document.activeElement?.tagName?.toLowerCase();
        if (tag !== 'input' && tag !== 'textarea' && tag !== 'select') {
          e.preventDefault();
          input.focus();
          input.select();
        }
      }
    });
  }

  // ── User menu dropdown ──────────────────────────────────────────────────────
  let _userMenuOpen = false;

  function _toggleUserMenu() {
    if (_userMenuOpen) {
      _closeUserMenu();
      return;
    }

    let panel = document.getElementById('user-menu-panel');
    if (!panel) {
      panel = document.createElement('div');
      panel.id = 'user-menu-panel';
      // On <body>, NOT inside the topbar: the topbar's backdrop-filter makes it
      // the containing block for position:fixed, so the mobile bottom-sheet
      // rules would anchor to the topbar and strand the panel above the
      // viewport. Sizing lives in CSS (220px dropdown on desktop, full-width
      // sheet on mobile) — inline width here would override the mobile rule.
      panel.className = 'notif-panel';
      document.body.appendChild(panel);
    }

    const u = (typeof DB !== 'undefined' && DB.settings && DB.settings.user) || {};
    const me = (typeof window !== 'undefined' && window.__ERP_USER) || {};
    const roleLabels = (window.erpUsers && window.erpUsers.roleLabels) || {};
    const displayName = u.name || me.displayName || 'Pengguna';
    const role = roleLabels[me.role] || me.role || u.role || 'Administrator';
    const canManageUsers =
      window.RBAC && typeof window.RBAC.canManageUsers === 'function' && window.RBAC.canManageUsers();

    panel.innerHTML =
      '<div class="notif-panel-hdr">' +
      '<div style="font-weight:700;font-size:13px">' +
      escapeHtml(displayName) +
      '</div>' +
      '<div style="font-size:11px;color:var(--muted)">' +
      escapeHtml(role) +
      '</div>' +
      '</div>' +
      '<div style="padding:4px">' +
      '<button class="user-menu-item" data-user-action="editIdentity">' +
      '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>' +
      'Edit Profil' +
      '</button>' +
      (canManageUsers
        ? '<button class="user-menu-item" data-user-action="manageUsers">' +
          '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>' +
          'Manajemen Pengguna' +
          '</button>'
        : '') +
      '<button class="user-menu-item" data-user-action="changePassword">' +
      '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>' +
      'Ganti Password' +
      '</button>' +
      '<button class="user-menu-item" data-user-action="manage2FA">' +
      '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="M9 12l2 2 4-4"/></svg>' +
      'Verifikasi 2 Langkah' +
      '</button>' +
      '<button class="user-menu-item" data-user-action="manageBackup">' +
      '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>' +
      'Kelola Backup' +
      '</button>' +
      // Install entry lives here (not only in Pengaturan) so every user can
      // install the PWA — Pengaturan is admin/manajer-only via RBAC, which
      // otherwise hides the only install entry point from non-admins.
      '<button class="user-menu-item" data-user-action="installPwaApp">' +
      '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="2" width="14" height="20" rx="2" ry="2"/><line x1="12" y1="18" x2="12.01" y2="18"/><polyline points="9 9 12 12 15 9"/><line x1="12" y1="12" x2="12" y2="5"/></svg>' +
      'Install Aplikasi' +
      '</button>' +
      '<button class="user-menu-item" data-user-action="toggleLang">' +
      '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>' +
      'Bahasa' +
      '<span style="margin-left:auto;font-size:10px;font-weight:700;color:var(--muted)">' +
      (window.I18N && window.I18N.getLang && window.I18N.getLang() === 'en' ? 'EN' : 'ID') +
      '</span>' +
      '</button>' +
      '<div style="border-top:1px solid var(--border);margin:4px 0"></div>' +
      '<button class="user-menu-item" data-user-action="logout" style="color:#EF4444">' +
      '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>' +
      'Logout' +
      '</button>' +
      '</div>';

    panel.style.display = 'block';
    _userMenuOpen = true;

    setTimeout(function () {
      document.addEventListener('click', _closeUserMenuOnOutside);
    }, 0);
  }

  function _closeUserMenu() {
    const panel = document.getElementById('user-menu-panel');
    if (panel) {
      panel.style.display = 'none';
    }
    _userMenuOpen = false;
    document.removeEventListener('click', _closeUserMenuOnOutside);
  }

  function _closeUserMenuOnOutside(e) {
    if (!e.target.closest('#user-menu-panel') && !e.target.closest('#user-menu-btn')) {
      _closeUserMenu();
    }
  }

  // ── Notification panel ────────────────────────────────────────────────────
  var _notifPanelOpen = false;

  // Accent per alert type. Only tints the icon chip and count badge; text uses
  // the theme tokens so the panel reads well in both light and dark mode
  // (the old hardcoded pastel boxes clashed with dark mode).
  var NOTIF_ACCENT = {
    warning: '#F59E0B',
    danger: '#EF4444',
    info: '#3B82F6',
    success: '#34C759',
  };

  // Feather-style icon paths (24×24 viewBox, stroke = currentColor). Keyed by
  // alert.icon (set in src/core/notifications.js) with per-type fallbacks.
  var NOTIF_ICON_PATHS = {
    receivable: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
    payable:
      '<rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/>',
    stock:
      '<path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/>',
    warning:
      '<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>',
    danger:
      '<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>',
    info: '<circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>',
    bell: '<path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>',
    budget: '<line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>',
  };

  function _notifSvg(pathKey, color, size) {
    var d = NOTIF_ICON_PATHS[pathKey] || NOTIF_ICON_PATHS.info;
    return (
      '<svg width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="none" stroke="' +
      color + '" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      d + '</svg>'
    );
  }

  function _renderNotifPanel(panel) {
    var notif = window.NSANotif;
    var alerts = notif ? notif.getAlerts() : [];
    if (notif) notif.markAllRead();

    var rows = '';
    if (alerts.length === 0) {
      rows =
        '<div style="padding:28px 16px;text-align:center">' +
        '<div style="width:44px;height:44px;border-radius:50%;background:var(--surface-hover);display:flex;align-items:center;justify-content:center;margin:0 auto 10px">' +
        _notifSvg('bell', 'var(--text-secondary)', 20) +
        '</div>' +
        '<div style="font-size:13px;font-weight:600;color:var(--text)">Semua beres</div>' +
        '<div style="font-size:11px;color:var(--muted);margin-top:3px">Tidak ada notifikasi saat ini</div>' +
        '</div>';
    } else {
      alerts.forEach(function (a) {
        var accent = NOTIF_ACCENT[a.type] || NOTIF_ACCENT.info;
        var iconKey = NOTIF_ICON_PATHS[a.icon] ? a.icon : a.type;
        rows +=
          '<div class="notif-item" data-notif-link="' + escapeHtml(a.link || '') + '">' +
          // "1f" = ~12% alpha hex suffix → subtle tinted chip from the accent
          '<div style="width:32px;height:32px;border-radius:9px;flex-shrink:0;display:flex;align-items:center;justify-content:center;background:' +
          accent + '1f">' + _notifSvg(iconKey, accent, 16) + '</div>' +
          '<div style="flex:1;min-width:0">' +
          '<div style="font-size:12px;font-weight:700;color:var(--text);line-height:1.35">' + escapeHtml(a.title) +
          (a.count
            ? '<span style="margin-left:6px;font-size:10px;font-weight:800;color:' + accent + ';background:' + accent + '1f;border-radius:99px;padding:1px 7px;vertical-align:1px">' + a.count + '</span>'
            : '') +
          '</div>' +
          '<div style="font-size:11px;color:var(--muted);margin-top:2px;line-height:1.4">' + escapeHtml(a.body) + '</div>' +
          '</div>' +
          '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-secondary)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;align-self:center;opacity:.6" aria-hidden="true"><polyline points="9 18 15 12 9 6"/></svg>' +
          '</div>';
      });
    }

    var permHtml = '';
    if ('Notification' in window && Notification.permission === 'default') {
      permHtml =
        '<div style="margin:8px;padding:11px 12px;background:var(--surface-hover);border:1px solid var(--border);border-radius:10px;font-size:12px;display:flex;gap:10px;align-items:flex-start">' +
        '<div style="width:28px;height:28px;border-radius:8px;flex-shrink:0;display:flex;align-items:center;justify-content:center;background:' +
        NOTIF_ACCENT.info + '1f">' + _notifSvg('bell', NOTIF_ACCENT.info, 14) + '</div>' +
        '<div style="flex:1">' +
        '<div style="font-weight:700;color:var(--text);margin-bottom:2px">Aktifkan notifikasi perangkat</div>' +
        '<div style="color:var(--muted);margin-bottom:8px;line-height:1.4">Terima peringatan meskipun tab tidak aktif.</div>' +
        '<button id="notif-allow-btn" class="btn" style="font-size:11px;padding:4px 12px">Izinkan</button>' +
        '</div></div>';
    }

    panel.innerHTML =
      '<div class="notif-panel-hdr" style="display:flex;align-items:center;justify-content:space-between">' +
      '<span style="font-weight:700;font-size:13px;display:flex;align-items:center;gap:7px">Notifikasi' +
      (alerts.length
        ? '<span style="font-size:10px;font-weight:800;background:var(--primary);color:#fff;border-radius:99px;padding:1px 7px">' + alerts.length + '</span>'
        : '') +
      '</span>' +
      '<button id="notif-check-btn" title="Periksa ulang" style="display:flex;align-items:center;gap:5px;font-size:11px;font-weight:600;color:var(--primary);background:none;border:none;cursor:pointer;padding:2px 0">' +
      '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>' +
      'Perbarui</button>' +
      '</div>' +
      '<div style="padding:4px 0">' + rows + '</div>' +
      permHtml;

    setTimeout(function () {
      var allowBtn = panel.querySelector('#notif-allow-btn');
      if (allowBtn) {
        allowBtn.addEventListener('click', function () {
          window.NSANotif && window.NSANotif.requestPermission().then(function (result) {
            if (result === 'granted') {
              window.showToast && window.showToast('Notifikasi diaktifkan', 'success');
              _renderNotifPanel(panel);
            }
          });
        });
      }
      var checkBtn = panel.querySelector('#notif-check-btn');
      if (checkBtn) {
        checkBtn.addEventListener('click', function () {
          window.NSANotif && window.NSANotif.checkAlerts();
          _renderNotifPanel(panel);
        });
      }
      panel.querySelectorAll('[data-notif-link]').forEach(function (el) {
        el.addEventListener('click', function () {
          var link = el.dataset.notifLink;
          if (link && window.navigate) {
            window.navigate(link);
            _closeNotifPanel();
          }
        });
      });
    }, 0);
  }

  function _toggleNotifPanel() {
    if (_notifPanelOpen) {
      _closeNotifPanel();
      return;
    }
    var panel = document.getElementById('notif-alerts-panel');
    if (!panel) {
      panel = document.createElement('div');
      panel.id = 'notif-alerts-panel';
      // Sizing lives in CSS only: style.css gives the 300px dropdown, and
      // mobile.css turns it into a full-width bottom sheet — inline width
      // here would override that and strand a 300px box at the left edge.
      // On <body>, NOT inside the topbar: its backdrop-filter makes the topbar
      // the containing block for position:fixed, anchoring the mobile bottom
      // sheet to the topbar instead of the viewport (panel hangs off-screen).
      panel.className = 'notif-panel';
      document.body.appendChild(panel);
    }
    _renderNotifPanel(panel);
    panel.style.display = 'block';
    _notifPanelOpen = true;
    setTimeout(function () {
      document.addEventListener('click', _closeNotifPanelOnOutside);
    }, 0);
  }

  function _closeNotifPanel() {
    var panel = document.getElementById('notif-alerts-panel');
    if (panel) panel.style.display = 'none';
    _notifPanelOpen = false;
    document.removeEventListener('click', _closeNotifPanelOnOutside);
  }

  function _closeNotifPanelOnOutside(e) {
    if (!e.target.closest('#notif-alerts-panel') && !e.target.closest('#notif-btn')) {
      _closeNotifPanel();
    }
  }

  document.addEventListener('click', function (e) {
    const item = e.target.closest('[data-user-action]');
    if (!item) return;
    e.preventDefault();
    _closeUserMenu();
    const action = item.dataset.userAction;
    if (action === 'editIdentity' && ERP.registry.actions.has('editIdentity')) {
      ERP.registry.actions.get('editIdentity')();
    } else if (action === 'changePassword' && ERP.registry.actions.has('changePassword')) {
      ERP.registry.actions.get('changePassword')();
    } else if (action === 'manage2FA' && ERP.registry.actions.has('manage2FA')) {
      ERP.registry.actions.get('manage2FA')();
    } else if (action === 'toggleLang' && window.I18N && window.I18N.toggleLang) {
      window.I18N.toggleLang();
    } else if (action === 'manageBackup' && ERP.registry.actions.has('manageBackup')) {
      ERP.registry.actions.get('manageBackup')();
    } else if (action === 'installPwaApp' && ERP.registry.actions.has('installPwaApp')) {
      ERP.registry.actions.get('installPwaApp')();
    } else if (action === 'manageUsers' && typeof window.showUserManagement === 'function') {
      window.showUserManagement();
    } else if (action === 'logout' && window.erpAuth && window.erpAuth.logout) {
      window.erpAuth.logout();
    }
  });

  // ── Theme toggle (light/dark) ───────────────────────────────────────────────
  const THEME_KEY = 'erp_theme';

  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
  }

  function initTheme() {
    // Apply the saved theme (falls back to the data-theme already on <html>).
    let saved = null;
    try {
      saved = localStorage.getItem(THEME_KEY);
    } catch (_) {
      /* ignore */
    }
    if (saved) {
      applyTheme(saved);
    }

    const toggle = document.getElementById('theme-toggle');
    if (!toggle) {
      console.warn('[NAV] Theme toggle button not found');
      return;
    }
    toggle.addEventListener('click', function () {
      const current =
        document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
      const next = current === 'dark' ? 'light' : 'dark';
      applyTheme(next);
      try {
        localStorage.setItem(THEME_KEY, next);
      } catch (_) {
        /* ignore */
      }
    });
  }

  // Run init when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initSidebarNav);
  } else {
    // DOM already loaded
    initSidebarNav();
  }

  // Navigate function (works with new sidebar)
  function navigate(id) {
    var sameView = id === window.activeView;
    window.activeView = id;

    if (typeof _filterCloseCtrl !== 'undefined' && _filterCloseCtrl) {
      _filterCloseCtrl.abort();
      _filterCloseCtrl = null;
    }

    // Drop any filter sheet parked on <body> for the mobile bottom-sheet, so it
    // doesn't survive the re-render and collide on id with the fresh in-card drop.
    if (typeof _cleanupParkedFilters === 'function') {
      _cleanupParkedFilters();
    }

    // Update rail items
    let parentMenu = id;
    for (const [menuId, config] of Object.entries(MENU_CONFIG)) {
      if (config.view === id || (config.items && config.items.some(i => i.view === id))) {
        parentMenu = menuId;
        break;
      }
    }
    _updateRailActive(parentMenu);

    // Keep the contextual sub-nav in sync with programmatic navigation (search,
    // notification links, menu-router) — re-render only when the group changes so
    // a user's manual collapse within a group is respected.
    try {
      const grpCfg = MENU_CONFIG[parentMenu];
      if (grpCfg && grpCfg.items && grpCfg.items.length) {
        if (parentMenu !== _activeFlyout) {
          _renderSubnav(parentMenu);
          _activeFlyout = parentMenu;
          if (!_isOverlay()) {
            _showSubnav();
          }
        }
        // Highlight a SINGLE item: the one the user clicked (matched by label),
        // else the first item routing to this view (for programmatic navigation
        // from search / notifications / menu-router). Without this, every item
        // sharing the view lights up at once.
        const lbl = _pendingItemLabel;
        _pendingItemLabel = null;
        const items = Array.from(document.querySelectorAll('.flyout-item'));
        let chosen = null;
        if (lbl) {
          chosen = items.find(b => b.dataset.view === id && b.dataset.label === lbl);
        }
        if (!chosen) {
          chosen = items.find(b => b.dataset.view === id);
        }
        items.forEach(b => b.classList.toggle('active', b === chosen));
      } else {
        _hideSubnav();
        _activeFlyout = parentMenu;
      }
    } catch (_) {
      /* non-fatal: sub-nav sync is cosmetic */
    }

    // Backwards compatibility with old nav-btn
    document
      .querySelectorAll('.nav-btn')
      .forEach(b => b.classList.toggle('active', b.dataset.view === id));
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));

    const el = document.getElementById(`view-${id}`);
    if (!el) {
      return;
    }

    if (_renderedViews.has(id) && !sameView) {
      if (id === 'dashboard') {
        destroyCharts();
        requestAnimationFrame(() => requestAnimationFrame(initCharts));
      }
    } else {
      destroyCharts();
      try {
        const renderer = getRenderer(id);
        if (renderer) {
          el.innerHTML = renderer();
          _renderedViews.add(id);
        } else {
          el.innerHTML = `<div style="padding:40px;text-align:center">
          <div style="font-size:48px;margin-bottom:16px">🚧</div>
          <h2 style="font-size:18px;font-weight:800;margin-bottom:8px">${escapeHtml(id.charAt(0).toUpperCase() + id.slice(1))}</h2>
          <p style="color:var(--muted);font-size:13px">Halaman ini sedang dalam pengembangan.</p>
        </div>`;
          _renderedViews.add(id);
        }
      } catch (err) {
        el.innerHTML = _renderErrorFallback(id, err);
        console.error(`[ERP] Renderer "${id}" threw:`, err);
        showToast(`Gagal memuat tampilan "${id}"`, 'danger');
        _renderedViews.delete(id);
      }
      if (id === 'dashboard') {
        requestAnimationFrame(() => requestAnimationFrame(initCharts));
      }
    }

    el.classList.add('active');
  }

  // Export navigate function (overrides erp-view.js's, adding flyout rail-active
  // state + a placeholder for views that don't have a renderer yet).
  window.navigate = navigate;
  // Expose the menu config so menu-coverage.js can produce a coverage report.
  window.__NSA_MENU_CONFIG = MENU_CONFIG;
  window.activeView = 'dashboard';

  // Allow other modules to force a full re-render of a view (clears cache).
  window.invalidateView = function (id) {
    _renderedViews.delete(id || window.activeView);
  };

  function _renderErrorFallback(viewId, err) {
    const msg = err && err.message ? escapeHtml(err.message) : 'Unknown error';
    const name = escapeHtml(viewId.charAt(0).toUpperCase() + viewId.slice(1));
    return `
  <div style="padding:40px 0;display:flex;flex-direction:column;align-items:center;gap:16px">
    <div style="width:56px;height:56px;border-radius:50%;background:#FFF1F0;display:flex;align-items:center;justify-content:center">
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#FF3B30" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
      </svg>
    </div>
    <div style="text-align:center;max-width:480px">
      <div style="font-size:16px;font-weight:800;margin-bottom:6px">Halaman ${name} gagal dimuat</div>
      <div style="font-size:13px;color:var(--muted);margin-bottom:14px">Terjadi kesalahan saat merender tampilan ini.</div>
      <code style="display:block;padding:10px 14px;background:var(--bg);border-radius:8px;font-size:11px;color:#FF3B30;text-align:left;word-break:break-all;max-height:100px;overflow:auto">
        ${msg}
      </code>
    </div>
    <button class="btn-ghost" data-action="retryView" data-id="${escapeHtml(viewId)}" style="margin-top:4px">
      Coba Lagi
    </button>
  </div>`;
  }

  // Register retry action if ERP is available
  if (typeof window.ERP !== 'undefined' && window.ERP.registerAction) {
    window.ERP.registerAction('retryView', function retryView(id) {
      _renderedViews.delete(id || window.activeView);
      window.navigate(id || window.activeView);
      return true;
    });
  }
})();
