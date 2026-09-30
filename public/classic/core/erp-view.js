// ═══════════════════════════════════════════════════════════════════════════════
// KELOLA ERP (DEMO) — Views Module
// Renderers · Navigation · Charts · Event Delegation · Filters · Search · Notif
// Depends on: erp-core.js (DB, filters, activeView, helpers, modal, toast)
//             erp-crud.js (CRUD functions)
// ═══════════════════════════════════════════════════════════════════════════════
// FIX SUMMARY
//  • clear search    — × button clears the search field; input is also cleared
//                      after navigating to a result via the search modal.
//  • filter labels   — filterBtn() overrides the core stub and reads
//                      FILTER_OPTIONS to display human-readable labels; an active
//                      filter shows a "×" chip so the user can dismiss it inline.
//  • sortable tables — sortState tracks {col, dir} per view; every sortable
//                      column header shows ↑/↓ indicators and toggles on click.
//  • empty states    — filtered empty states name the active filter and offer a
//                      one-click "Hapus filter" link.
//  • export CSV      — each list view gains an "Export CSV" button that downloads
//                      the currently filtered+sorted rows as UTF-8 CSV with BOM
//                      (so Excel opens it cleanly).

// ── Document number normalizer ────────────────────────────────────────────────
// Accurate exports SI. (Sales Invoice) and PI. (Purchase Invoice) prefixes.
// Display them as SO. / PO. to match the app's own numbering scheme.
function docNum(number, id) {
  // Merged from erp-patch.js — this stricter version (formerly the live
  // override) only rewrites Accurate-style prefixes and shows '—' when empty.
  const raw = number || id || '—';
  if (typeof raw === 'string') {
    if (raw.startsWith('SI.')) {
      return 'SO.' + raw.slice(3);
    }
    if (raw.startsWith('PI.')) {
      return 'PO.' + raw.slice(3);
    }
  }
  return raw;
}
window.docNum = docNum;
window.getRenderer = getRenderer;

// ── Date range filters ────────────────────────────────────────────────────────
const dateFilters = {
  sales: { from: '', to: '' },
  purchase: { from: '', to: '' },
  logistics: { from: '', to: '' },
};

// ── Pagination ────────────────────────────────────────────────────────────────
const PAGE_SIZE = 15;
const pageState = {
  sales: 1,
  purchase: 1,
  inventory: 1,
  logistics: 1,
  master_cust: 1,
  master_supp: 1,
};

function applyPage(arr, view) {
  const p = pageState[view] || 1;
  const start = (p - 1) * PAGE_SIZE;
  return arr.slice(start, start + PAGE_SIZE);
}

function pagerHTML(total, view) {
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const cur = Math.min(pageState[view] || 1, pages);
  if (pages <= 1) {
    return '';
  }
  return `<div style="display:flex;align-items:center;justify-content:flex-end;gap:8px;margin-top:12px;font-size:12px;color:var(--muted)">
    <span>${(cur - 1) * PAGE_SIZE + 1}–${Math.min(cur * PAGE_SIZE, total)} dari ${total}</span>
    <button class="btn-ghost" data-action="pageNav" data-view="${view}" data-page="${cur - 1}" ${cur === 1 ? 'disabled' : ''} style="padding:3px 10px;font-size:12px${cur === 1 ? ';opacity:.35;cursor:not-allowed' : ''}">‹ Prev</button>
    <button class="btn-ghost" data-action="pageNav" data-view="${view}" data-page="${cur + 1}" ${cur === pages ? 'disabled' : ''} style="padding:3px 10px;font-size:12px${cur === pages ? ';opacity:.35;cursor:not-allowed' : ''}">Next ›</button>
  </div>`;
}

function applyDateFilter(arr, view) {
  const df = dateFilters[view];
  if (!df) {
    return arr;
  }
  let r = arr;
  // FIX 4.6: Convert both sides to Date objects before comparing.
  // String comparison works for strict YYYY-MM-DD but silently misbehaves
  // if either side has a non-padded month/day or a different separator.
  // Using Date.parse guarantees correct chronological ordering.
  if (df.from) {
    const fromMs = Date.parse(df.from);
    r = r.filter(o => o.date && Date.parse(o.date) >= fromMs);
  }
  if (df.to) {
    const toMs = Date.parse(df.to);
    r = r.filter(o => o.date && Date.parse(o.date) <= toMs);
  }
  return r;
}

function dateFilterBar(view) {
  const df = dateFilters[view] || {};
  const active = df.from || df.to;
  return `<div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
    <label style="font-size:11px;color:var(--muted)">Dari</label>
    <input type="date" class="form-input" style="padding:4px 8px;font-size:12px;width:138px"
           value="${df.from || ''}" data-action="setDateFrom" data-view="${view}">
    <label style="font-size:11px;color:var(--muted)">s/d</label>
    <input type="date" class="form-input" style="padding:4px 8px;font-size:12px;width:138px"
           value="${df.to || ''}" data-action="setDateTo" data-view="${view}">
    ${active ? `<button class="btn-ghost" data-action="clearDateFilter" data-view="${view}" style="font-size:11px;padding:3px 8px">× Hapus</button>` : ''}
  </div>`;
}

const FILTER_OPTIONS = {
  sales: [
    ['all', 'Semua'],
    ['Draft', 'Draft'],
    ['Waiting on Process', 'Menunggu Proses'],
    ['Partially Processed', 'Diproses Sebagian'],
    ['Processed', 'Diproses'],
    ['Confirmed', 'Dikonfirmasi'],
    ['Paid', 'Lunas'],
    ['Delivered', 'Terkirim'],
    ['Cancelled', 'Dibatalkan'],
  ],
  purchase: [
    ['all', 'Semua'],
    ['Draft', 'Draft'],
    ['Waiting on Process', 'Menunggu Proses'],
    ['Partially Processed', 'Diproses Sebagian'],
    ['Processed', 'Diproses'],
    ['Confirmed', 'Dikonfirmasi'],
    ['Paid', 'Lunas'],
    ['Received', 'Diterima'],
    ['Cancelled', 'Dibatalkan'],
  ],
  inventory: [
    ['all', 'Semua'],
    ['Low', 'Stok Rendah'],
    ['Granit', 'Granit'],
    ['Marmer', 'Marmer'],
    ['Andesit', 'Andesit'],
    ['Travertine', 'Travertine'],
    ['Koral', 'Koral'],
    ['Candi', 'Candi'],
    ['Paras', 'Paras'],
  ],
  logistics: [
    ['all', 'Semua'],
    ['Sent', 'Terkirim'],
    ['Partially invoiced', 'Faktur Sebagian'],
    ['Invoiced', 'Difakturkan'],
  ],
};

// ── Finance reports — populated dynamically by renderFinance() ────────────────
// (was a hardcoded const; now rebuilt each render so values track the DB live)
let _financeReports = [];
let _reportCatalog = [];

function applyTaxRounding(value, mode) {
  switch (mode) {
    case 'floor':
      return Math.floor(value);
    case 'ceil':
      return Math.ceil(value);
    default:
      return Math.round(value);
  }
}

function getTaxSettings() {
  const t = (DB.settings && DB.settings.tax) || {};
  const ppnRate = typeof t.ppnRate === 'number' ? t.ppnRate : 0.11;
  const pphRate = typeof t.pphRate === 'number' ? t.pphRate : 0;
  return {
    pkp: t.pkp !== false,
    npwp: t.npwp || '—',
    ppnRate,
    pphRate,
    rounding: t.rounding || 'round',
  };
}

function calcTaxSummary() {
  const tax = getTaxSettings();
  const salesOrders = DB.salesOrders.filter(o => o.status !== 'Draft');
  const purchaseOrders = DB.purchaseOrders.filter(o => o.status !== 'Draft');
  const salesBase = salesOrders.reduce((s, o) => s + (o.amount || 0), 0);
  const purchaseBase = purchaseOrders.reduce((s, o) => s + (o.amount || 0), 0);
  const salesWithTax = salesOrders.filter(o => typeof o.tax === 'number').length;
  const purchaseWithTax = purchaseOrders.filter(o => typeof o.tax === 'number').length;

  const outputTaxRaw = salesOrders.reduce(
    (s, o) => s + (typeof o.tax === 'number' ? o.tax : (o.amount || 0) * tax.ppnRate),
    0
  );
  const inputTaxRaw = purchaseOrders.reduce(
    (s, o) => s + (typeof o.tax === 'number' ? o.tax : (o.amount || 0) * tax.ppnRate),
    0
  );

  const outputTax = applyTaxRounding(outputTaxRaw, tax.rounding);
  const inputTax = applyTaxRounding(inputTaxRaw, tax.rounding);
  const netTax = outputTax - inputTax;

  return {
    tax,
    salesOrders,
    purchaseOrders,
    salesBase,
    purchaseBase,
    salesWithTax,
    purchaseWithTax,
    outputTax,
    inputTax,
    netTax,
  };
}

// ── Chart instances ───────────────────────────────────────────────────────────
let charts = {};

function destroyCharts() {
  Object.values(charts).forEach(c => c.destroy());
  charts = {};
}

// ── Sort state ────────────────────────────────────────────────────────────────
// FIX (sortable tables): per-view sort state tracks which column is active and
// the direction. Clicking the same column toggles asc ↔ desc.
const sortState = {
  sales: { col: 'date', dir: 'desc' },
  purchase: { col: 'date', dir: 'desc' },
  logistics: { col: 'date', dir: 'desc' },
};

/**
 * Sort a copy of `arr` using the current sortState for `view`.
 * Falls back to the original order when no sort is active.
 */
function applySorted(arr, view) {
  const s = sortState[view];
  if (!s) {
    return arr;
  }
  return [...arr].sort((a, b) => {
    let va = a[s.col],
      vb = b[s.col];
    if (typeof va === 'string') {
      va = va.toLowerCase();
      vb = vb.toLowerCase();
    }
    if (va < vb) {
      return s.dir === 'asc' ? -1 : 1;
    }
    if (va > vb) {
      return s.dir === 'asc' ? 1 : -1;
    }
    return 0;
  });
}

function sortCol(view, col) {
  const cur = sortState[view];
  sortState[view] =
    cur && cur.col === col ? { col, dir: cur.dir === 'asc' ? 'desc' : 'asc' } : { col, dir: 'asc' };
  refreshActiveView();
}

// Re-render the current view. navigate() caches rendered views in _renderedViews
// and skips re-render when re-navigating to an already-rendered view, so in-view
// data changes (pagination, sort, filters) need an explicit cache-invalidate
// first. See [[navigate-render-cache-gotcha]].
function refreshActiveView() {
  if (window.invalidateView) {
    window.invalidateView(activeView);
  }
  navigate(activeView);
}

/**
 * Return a sortable <th> element string.
 * `view` is the sortState key; `col` is the data-property name.
 */
function sortTh(label, view, col) {
  const s = sortState[view];
  const active = s && s.col === col;
  const arrow = active ? (s.dir === 'asc' ? ' ↑' : ' ↓') : '';
  return `<th class="th-sort${active ? ' th-sort-active' : ''}"
    data-action="sortCol" data-type="${view}" data-col="${col}"
    title="Klik untuk urut berdasarkan ${label}"
    style="cursor:pointer;user-select:none;white-space:nowrap">
    ${escapeHtml(label)}<span style="font-size:10px;opacity:${active ? 1 : 0.3}">${arrow || ' ↕'}</span>
  </th>`;
}

// ── Filter button ─────────────────────────────────────────────────────────────
// FIX (filter labels): overrides the stub in erp-core.js with a version that
// reads FILTER_OPTIONS to surface human-readable labels, marks the button active
// when a filter is applied, and inlines a dismiss × chip.
function filterBtn(type) {
  const f = filters[type];
  const opts = FILTER_OPTIONS[type] || [];
  const entry = opts.find(([val]) => val === f);
  const label = f === 'all' ? 'Filter' : entry ? entry[1] : f;
  const isActive = f !== 'all';

  const activeStyle = isActive
    ? 'background:var(--primary);color:#fff;border-color:var(--primary)'
    : '';

  const clearChip = isActive
    ? `<button data-action="clearFilter" data-type="${type}"
         style="background:rgba(255,255,255,0.25);border:none;border-radius:4px;
                color:#fff;font-size:10px;font-weight:700;padding:1px 5px;
                cursor:pointer;margin-left:2px;line-height:1.4" title="Hapus filter">×</button>`
    : '';

  return `<div class="filter-wrap" style="display:flex;align-items:center;gap:6px">
    <button class="filter-btn" data-action="toggleFilter" data-type="${type}" style="${activeStyle}">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>
      ${escapeHtml(label)}
    </button>${clearChip}
    <div class="filter-drop" id="filter-${type}"></div>
  </div>`;
}

// ── Export CSV ────────────────────────────────────────────────────────────────
// FIX (export CSV): downloads the current view's filtered+sorted data as a
// UTF-8 CSV with BOM so Excel auto-detects encoding correctly.
function exportCSV(view) {
  let headers, rows;

  if (view === 'sales') {
    const f = filters.sales;
    let data = f === 'all' ? DB.salesOrders : DB.salesOrders.filter(o => o.status === f);
    data = applyDateFilter(data, 'sales');
    data = applySorted(data, 'sales');
    headers = ['No. SO', 'Pelanggan', 'Tanggal', 'Total (Rp)', 'Status'];
    rows = data.map(o => [docNum(o.number, o.id), o.customer, o.date, o.amount, o.status]);
  } else if (view === 'purchase') {
    const f = filters.purchase;
    let data = f === 'all' ? DB.purchaseOrders : DB.purchaseOrders.filter(o => o.status === f);
    data = applyDateFilter(data, 'purchase');
    data = applySorted(data, 'purchase');
    headers = ['No. PO', 'Supplier', 'Tanggal', 'Total (Rp)', 'Status'];
    rows = data.map(o => [docNum(o.number, o.id), o.supplier, o.date, o.amount, o.status]);
  } else if (view === 'inventory') {
    const f = filters.inventory;
    let data =
      f === 'all'
        ? DB.inventoryItems
        : f === 'Low'
          ? DB.inventoryItems.filter(i => i.stock < i.min)
          : DB.inventoryItems.filter(i => i.category === f);
    data = applySorted(data, 'inventory');
    headers = [
      'Nama Item',
      'Kategori',
      'Satuan',
      'Stok',
      'Min. Stok',
      'Harga Beli (Rp)',
      'Harga Jual (Rp)',
      'Status',
    ];
    rows = data.map(i => [
      i.name,
      i.category,
      i.unit,
      i.stock,
      i.min,
      i.cost,
      i.sell,
      i.stock < i.min ? 'Stok Rendah' : 'Normal',
    ]);
  } else if (view === 'logistics') {
    const f = filters.logistics;
    let data = f === 'all' ? DB.deliveryOrders : DB.deliveryOrders.filter(o => o.status === f);
    data = applyDateFilter(data, 'logistics');
    data = applySorted(data, 'logistics');
    headers = ['No. DO', 'Pelanggan', 'Tujuan', 'Tanggal', 'Driver', 'Kendaraan', 'Status'];
    rows = data.map(d => [
      docNum(d.number, d.id),
      d.customer,
      d.destination,
      d.date,
      d.driver,
      d.vehicle,
      d.status,
    ]);
  } else {
    showToast('Export tidak tersedia untuk halaman ini', 'warning');
    return;
  }

  const csv = [headers, ...rows]
    .map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))
    .join('\r\n');

  // BOM (\uFEFF) ensures Excel reads the file as UTF-8
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${view}-${today()}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast('File CSV berhasil diunduh', 'success');
}

// ── Export XLSX ───────────────────────────────────────────────────────────────
// Real .xlsx via the offline writer (xlsx-export.js). Mirrors exportCSV's
// filtered+sorted dataset but with typed columns (currency / integer) so Excel
// formats numbers natively instead of treating them as text.
function exportXLSX(view) {
  if (!window.NSAXlsx) {
    showToast('Modul Excel belum siap', 'warning');
    return;
  }
  let columns, rows, sheetName;

  if (view === 'sales') {
    const f = filters.sales;
    let data = f === 'all' ? DB.salesOrders : DB.salesOrders.filter(o => o.status === f);
    data = applyDateFilter(data, 'sales');
    data = applySorted(data, 'sales');
    sheetName = 'Sales Order';
    columns = [
      { header: 'No. SO', width: 16 },
      { header: 'Pelanggan', width: 26 },
      { header: 'Tanggal', width: 13 },
      { header: 'Total (Rp)', type: 'currency', width: 18 },
      { header: 'Status', width: 14 },
    ];
    rows = data.map(o => [docNum(o.number, o.id), o.customer, o.date, o.amount, o.status]);
  } else if (view === 'purchase') {
    const f = filters.purchase;
    let data = f === 'all' ? DB.purchaseOrders : DB.purchaseOrders.filter(o => o.status === f);
    data = applyDateFilter(data, 'purchase');
    data = applySorted(data, 'purchase');
    sheetName = 'Purchase Order';
    columns = [
      { header: 'No. PO', width: 16 },
      { header: 'Supplier', width: 26 },
      { header: 'Tanggal', width: 13 },
      { header: 'Total (Rp)', type: 'currency', width: 18 },
      { header: 'Status', width: 14 },
    ];
    rows = data.map(o => [docNum(o.number, o.id), o.supplier, o.date, o.amount, o.status]);
  } else if (view === 'inventory') {
    const f = filters.inventory;
    let data =
      f === 'all'
        ? DB.inventoryItems
        : f === 'Low'
          ? DB.inventoryItems.filter(i => i.stock < i.min)
          : DB.inventoryItems.filter(i => i.category === f);
    data = applySorted(data, 'inventory');
    sheetName = 'Inventori';
    columns = [
      { header: 'Nama Item', width: 28 },
      { header: 'Kategori', width: 16 },
      { header: 'Satuan', width: 10 },
      { header: 'Stok', type: 'int', width: 10 },
      { header: 'Min. Stok', type: 'int', width: 10 },
      { header: 'Harga Beli', type: 'currency', width: 16 },
      { header: 'Harga Jual', type: 'currency', width: 16 },
      { header: 'Status', width: 13 },
    ];
    rows = data.map(i => [
      i.name,
      i.category,
      i.unit,
      i.stock,
      i.min,
      i.cost,
      i.sell,
      i.stock < i.min ? 'Stok Rendah' : 'Normal',
    ]);
  } else if (view === 'logistics') {
    const f = filters.logistics;
    let data = f === 'all' ? DB.deliveryOrders : DB.deliveryOrders.filter(o => o.status === f);
    data = applyDateFilter(data, 'logistics');
    data = applySorted(data, 'logistics');
    sheetName = 'Delivery Order';
    columns = [
      { header: 'No. DO', width: 16 },
      { header: 'Pelanggan', width: 24 },
      { header: 'Tujuan', width: 22 },
      { header: 'Tanggal', width: 13 },
      { header: 'Driver', width: 18 },
      { header: 'Kendaraan', width: 16 },
      { header: 'Status', width: 14 },
    ];
    rows = data.map(d => [d.id, d.customer, d.destination, d.date, d.driver, d.vehicle, d.status]);
  } else {
    showToast('Export tidak tersedia untuk halaman ini', 'warning');
    return;
  }

  try {
    window.NSAXlsx.download(`${view}-${today()}`, [{ name: sheetName, columns, rows }]);
    showToast('File Excel berhasil diunduh', 'success');
  } catch (err) {
    console.error('[exportXLSX]', err);
    showToast('Gagal membuat file Excel', 'danger');
  }
}

// ── Export button helper ──────────────────────────────────────────────────────
function exportBtn(view) {
  return `<button class="btn-ghost" data-action="exportCSV" data-type="${view}"
    style="display:flex;align-items:center;gap:5px;font-size:12px">
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
      <polyline points="7 10 12 15 17 10"/>
      <line x1="12" y1="15" x2="12" y2="3"/>
    </svg> Export CSV
  </button>`;
}

// ── Export Excel button helper ────────────────────────────────────────────────
function excelBtn(view) {
  return `<button class="btn-ghost" data-action="exportXLSX" data-type="${view}"
    style="display:flex;align-items:center;gap:5px;font-size:12px">
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#16A34A" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
      <polyline points="14 2 14 8 20 8"/>
      <line x1="8" y1="13" x2="16" y2="17"/><line x1="16" y1="13" x2="8" y2="17"/>
    </svg> Export Excel
  </button>`;
}

// ── Import Excel button helper ────────────────────────────────────────────────
// Per-module import (Sales / Purchase / Logistics). Wired to importModuleExcel()
// in excel-import.js, which dedups re-uploads by date and rejects duplicate DO
// numbers.
function importBtn(view) {
  return `<button class="btn-ghost" data-action="importXLSX" data-type="${view}"
    style="display:flex;align-items:center;gap:5px;font-size:12px">
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#2563EB" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
      <polyline points="17 8 12 3 7 8"/>
      <line x1="12" y1="3" x2="12" y2="15"/>
    </svg> Import Excel
  </button>`;
}

// ── REKAP import button helper ────────────────────────────────────────────────
// Logistics only. Wired to RekapImport.open() in rekap-import.js — the client's
// own "REKAP TMA-<lokasi>.xlsx" layout, which importBtn's flat-sheet parser
// cannot read (2-row header, one sheet per material, kg thousands separators).
function rekapImportBtn() {
  return `<button class="btn-ghost" data-action="importRekap"
    style="display:flex;align-items:center;gap:5px;font-size:12px">
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#059669" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M3 3h18v18H3z"/><path d="M3 9h18"/><path d="M9 9v12"/>
    </svg> Import REKAP
  </button>`;
}

// ── REKAP export button helper ────────────────────────────────────────────────
// Logistics only. Wired to RekapExport.open() in rekap-export.js — rebuilds the
// client's "REKAP TMA-<lokasi>.xlsx" shape (sheet per material, subtotal per
// date), unlike exportBtn/excelBtn which dump the flat on-screen table.
function rekapExportBtn() {
  return `<button class="btn-ghost" data-action="exportRekap"
    style="display:flex;align-items:center;gap:5px;font-size:12px">
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#059669" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
      <polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
    </svg> Export REKAP
  </button>`;
}

// ── PDF summary button helper ─────────────────────────────────────────────────
// Sales / Purchase only. Wired to printOrderSummary() in order-summary.js, which
// opens a period picker then prints a per-item + per-document recap as PDF.
function summaryBtn(view) {
  return `<button class="btn-ghost" data-action="printSummary" data-type="${view}"
    style="display:flex;align-items:center;gap:5px;font-size:12px">
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#DC2626" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M6 9V2h12v7"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/>
      <rect x="6" y="14" width="12" height="8"/>
    </svg> Ringkasan PDF
  </button>`;
}

// ── Empty state helper ────────────────────────────────────────────────────────
// FIX (empty states): when a filter is active and returns no rows the message
// names the filter and offers a one-click dismiss link.
function emptyRow(colspan, view) {
  const f = filters[view];
  if (!f || f === 'all') {
    return `<tr><td colspan="${colspan}" class="td-empty">Belum ada data — tambah entri baru di atas.</td></tr>`;
  }
  const opts = FILTER_OPTIONS[view] || [];
  const entry = opts.find(([val]) => val === f);
  const label = entry ? entry[1] : f;
  return `<tr><td colspan="${colspan}" class="td-empty">
    Tidak ada data dengan filter "<strong>${escapeHtml(label)}</strong>" —
    <span class="link-btn" data-action="clearFilter" data-type="${view}"
          style="cursor:pointer;color:var(--primary);text-decoration:underline">hapus filter</span>
  </td></tr>`;
}

// ── Navigation ────────────────────────────────────────────────────────────────
// BUG #1 FIX: Use getRenderer() for late binding so that function re-declarations
// in later-loading classic scripts (e.g. dashboard.js's renderDashboard) are
// picked up at runtime. The old `const renderers = { sales: renderSales, … }`
// captured references at parse time, before later scripts loaded.
function getRenderer(id) {
  switch (id) {
    case 'dashboard':
      return renderDashboard;
    case 'sales':
      return renderSales;
    case 'purchase':
      return renderPurchase;
    case 'inventory':
      return renderInventory;
    case 'finance':
      return renderFinance;
    case 'assets':
      return renderAssets;
    case 'tax':
      return renderTax;
    case 'reports':
      return renderReports;
    case 'ledger':
      // Phase 2b: General Ledger view, defined additively in gl-view.js.
      return typeof window.renderLedger === 'function' ? window.renderLedger : null;
    case 'adjustments':
      // Phase 3a: Item Adjustment view, defined additively in adjust-view.js.
      return typeof window.renderAdjustments === 'function' ? window.renderAdjustments : null;
    case 'invoices':
      // Phase 4: Invoice & Receipt view, defined additively in invoice-view.js.
      return typeof window.renderInvoices === 'function' ? window.renderInvoices : null;
    case 'outstanding':
      // Two-sided AR/AP screen, defined additively in outstanding-view.js.
      return typeof window.renderOutstanding === 'function' ? window.renderOutstanding : null;
    case 'suratjalan':
      // Field-operator input screen, defined additively in surat-jalan-view.js.
      return typeof window.renderSuratJalan === 'function' ? window.renderSuratJalan : null;
    // Pages split out of the former tabbed views. Each renderer is defined by
    // the same module that owns the shared view, so the lazy-loading path is
    // unchanged — only the entry points multiplied.
    case 'salesInvoices':
      return window.renderSalesInvoices || null;
    case 'purchaseInvoices':
      return window.renderPurchaseInvoices || null;
    case 'salesReceipts':
      return window.renderSalesReceipts || null;
    case 'purchasePayments':
      return window.renderPurchasePayments || null;
    case 'salesQuotations':
      return window.renderSalesQuotations || null;
    case 'purchaseQuotations':
      return window.renderPurchaseQuotations || null;
    case 'salesReturns':
      return window.renderSalesReturns || null;
    case 'purchaseReturns':
      return window.renderPurchaseReturns || null;
    case 'reportPL':
      return window.renderReportPL || null;
    case 'reportBS':
      return window.renderReportBS || null;
    case 'reportCF':
      return window.renderReportCF || null;
    case 'financials':
      // Phase 5: Financial Reports (P/L, Balance Sheet, Cash Flow).
      return typeof window.renderFinancials === 'function' ? window.renderFinancials : null;
    case 'quotations':
      // Phase 5: Sales/Purchase Quotation view.
      return typeof window.renderQuotations === 'function' ? window.renderQuotations : null;
    case 'returns':
      // Phase 5: Sales/Purchase Return view.
      return typeof window.renderReturns === 'function' ? window.renderReturns : null;
    case 'warehouse':
      // Phase 3b: Warehouse management + Item Transfer view.
      return typeof window.renderWarehouse === 'function' ? window.renderWarehouse : null;
    case 'excelImport':
      // Import dari Excel — defined additively in excel-import.js.
      return typeof window.renderExcelImport === 'function' ? window.renderExcelImport : null;
    case 'logistics':
      return renderLogistics;
    case 'master':
      return renderMasterData;
    case 'settings':
      return renderSettings;
    default:
      return null;
  }
}

function navigate(id) {
  activeView = id;

  // BUG #5 FIX: Clean up any open filter dropdown and its listeners when navigating
  // (also removes any drop parked on <body> for the mobile bottom-sheet).
  _cleanupParkedFilters();

  document
    .querySelectorAll('.nav-btn')
    .forEach(b => b.classList.toggle('active', b.dataset.view === id));
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  destroyCharts();

  const el = document.getElementById(`view-${id}`);
  const renderer = getRenderer(id);
  if (el && renderer) {
    el.innerHTML = renderer();
    el.classList.add('active');
  }

  if (id === 'dashboard') {
    requestAnimationFrame(() => requestAnimationFrame(initCharts));
  }
}

// ── View: Dashboard ───────────────────────────────────────────────────────────
// NOTE: renderDashboard() and initCharts() are defined in dashboard.js, which
// loads after this file. The getRenderer('dashboard') call in navigate()
// picks up dashboard.js's version at runtime via late binding.

// ── View: Sales ───────────────────────────────────────────────────────────────
// renderSales() (checkbox selection, inline status dropdown, bulk status bar)
// lives in the merged erp-patch section at the bottom of this file. The
// getRenderer() switch references it by name via late binding.

// ── View: Purchase ────────────────────────────────────────────────────────────
function renderPurchase() {
  const f = filters.purchase;
  const now = new Date();
  const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const MONTH_NAMES = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'Mei',
    'Jun',
    'Jul',
    'Agu',
    'Sep',
    'Okt',
    'Nov',
    'Des',
  ];
  const monthLabel = `${MONTH_NAMES[now.getMonth()]} ${now.getFullYear()}`;

  let orders = f === 'all' ? DB.purchaseOrders : DB.purchaseOrders.filter(o => o.status === f);
  orders = applyDateFilter(orders, 'purchase');
  orders = applySorted(orders, 'purchase');

  const _isPInv = o => !o._type || o._type === 'invoice';
  const stats = DB.purchaseOrders.reduce(
    (acc, o) => {
      if (!_isPInv(o) || o.status === 'Draft' || o.status === 'Cancelled') return acc;
      acc.totalVal += o.amount || 0;
      if (o.date && o.date.startsWith(thisMonth)) {
        acc.thisMthOrders.push(o);
        acc.thisMthVal += o.amount || 0;
      }
      if (o.status === 'Confirmed') {
        acc.pendingCnt++;
        acc.hutangVal += o.owing != null ? o.owing : Math.max(0, (o.amount || 0) - (o.paid || 0));
      }
      return acc;
    },
    { totalVal: 0, thisMthOrders: [], thisMthVal: 0, pendingCnt: 0, hutangVal: 0 }
  );

  const { totalVal, thisMthOrders, thisMthVal, pendingCnt, hutangVal } = stats;

  const totalFiltered = orders.length;
  const paged = applyPage(orders, 'purchase');

  return `
  ${secHdr('Pembelian', 'Kelola purchase order dan hutang supplier', 'Buat PO Baru', 'addPO')}
  ${statRow([
    { label: 'PO Bulan Ini', value: String(thisMthOrders.length), sub: monthLabel },
    { label: 'Nilai Bulan Ini', value: idr(thisMthVal), sub: `Total all-time: ${idr(totalVal)}` },
    {
      label: 'Menunggu Barang',
      value: `${pendingCnt} PO`,
      sub: 'Belum diterima',
      color: '#FF9F0A',
    },
    { label: 'Hutang Belum Lunas', value: idr(hutangVal), sub: 'Ke supplier', color: '#FF3B30' },
  ])}
  <div class="card">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
      <div style="font-size:14px;font-weight:700">Daftar Purchase Order</div>
      <div style="display:flex;align-items:center;gap:8px">
        ${summaryBtn('purchase')}
        ${importBtn('purchase')}
        ${exportBtn('purchase')}
        ${excelBtn('purchase')}
        ${filterBtn('purchase')}
      </div>
    </div>
    <div style="margin-bottom:12px">${dateFilterBar('purchase')}</div>
    <div class="table-wrap">
      <table>
        <thead><tr>
          ${sortTh('No. PO', 'purchase', 'id')}
          ${sortTh('Supplier', 'purchase', 'supplier')}
          ${sortTh('Tanggal', 'purchase', 'date')}
          ${sortTh('Total', 'purchase', 'amount')}
          ${sortTh('Status', 'purchase', 'status')}
          <th>Aksi</th>
        </tr></thead>
        <tbody>
          ${
            paged.length === 0
              ? emptyRow(6, 'purchase')
              : paged
                  .map(
                    o => `<tr data-action="viewPO" data-id="${escapeHtml(o.id)}" style="cursor:pointer">
              <td class="td-p" style="font-size:11px;font-weight:700;color:var(--primary)">${escapeHtml(docNum(o.number, o.id))}</td>
              <td class="td-p" style="font-size:13px;font-weight:600">${escapeHtml(o.supplier)}</td>
              <td class="td-p" style="font-size:11px;color:var(--muted)">${escapeHtml(o.date)}</td>
              <td class="td-p" style="font-size:13px;font-weight:800">${idr(o.amount)}</td>
              <td class="td-p">${badge(o.status)}</td>
              <td class="td-p">${actionBtns('PO', o.id)}</td>
            </tr>`
                  )
                  .join('')
          }
        </tbody>
      </table>
    </div>
    ${pagerHTML(totalFiltered, 'purchase')}
  </div>`;
}

// ── View: Inventory ───────────────────────────────────────────────────────────
function renderInventory() {
  const f = filters.inventory;
  const lowCount = DB.inventoryItems.filter(i => i.stock < i.min).length;
  let items =
    f === 'all'
      ? DB.inventoryItems
      : f === 'Low'
        ? DB.inventoryItems.filter(i => i.stock < i.min)
        : DB.inventoryItems.filter(i => i.category === f);
  items = applySorted(items, 'inventory');

  const totalValue = DB.inventoryItems.reduce((s, i) => s + i.stock * i.cost, 0);
  const cats = [...new Set(DB.inventoryItems.map(i => i.category))];

  const totalFiltered = items.length;
  const pagedItems = applyPage(items, 'inventory');

  return `
  ${secHdr('Inventori', 'Katalog item dan manajemen stok batu alam', 'Tambah Item', 'addItem')}
  ${
    lowCount > 0
      ? `<div class="alert-warn">
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#FF9F0A" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
      <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
    </svg>
    <span><strong>${lowCount} item</strong> di bawah stok minimum — segera lakukan pembelian.</span>
  </div>`
      : ''
  }
  ${statRow([
    { label: 'Total Item', value: String(DB.inventoryItems.length), sub: 'Aktif di katalog' },
    { label: 'Nilai Stok Total', value: idr(totalValue), sub: 'Berdasarkan harga beli' },
    { label: 'Stok Rendah', value: `${lowCount} item`, sub: 'Di bawah minimum', color: '#FF3B30' },
    { label: 'Kategori', value: String(cats.length), sub: 'Jenis batu alam' },
  ])}
  <div class="card">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
      <div style="font-size:14px;font-weight:700">Katalog Item</div>
      <div style="display:flex;align-items:center;gap:8px">
        ${exportBtn('inventory')}
        ${excelBtn('inventory')}
        ${filterBtn('inventory')}
      </div>
    </div>
    <div class="table-wrap">
      <table>
        <thead><tr>
          ${sortTh('Nama', 'inventory', 'name')}
          ${sortTh('Kategori', 'inventory', 'category')}
          <th>Satuan</th>
          ${sortTh('Stok', 'inventory', 'stock')}
          <th>Min</th>
          ${sortTh('Harga Beli', 'inventory', 'cost')}
          ${sortTh('Harga Jual', 'inventory', 'sell')}
          <th>Status</th>
          <th>Aksi</th>
        </tr></thead>
        <tbody>
          ${
            pagedItems.length === 0
              ? emptyRow(9, 'inventory')
              : pagedItems
                  .map(i => {
                    const isLow = i.stock < i.min;
                    return `<tr data-action="viewItem" data-id="${escapeHtml(i.id)}" style="cursor:pointer">
                <td class="td-p" style="font-size:13px;font-weight:700">${escapeHtml(i.name)}</td>
                <td class="td-p"><span class="cat">${escapeHtml(i.category)}</span></td>
                <td class="td-p" style="font-size:11px;color:var(--muted)">${escapeHtml(i.unit)}</td>
                <td class="td-p" style="font-size:13px;font-weight:800;color:${isLow ? '#FF3B30' : 'var(--text)'}">${i.stock}</td>
                <td class="td-p" style="font-size:11px;color:var(--muted)">${i.min}</td>
                <td class="td-p" style="font-size:12px">${idr(i.cost)}</td>
                <td class="td-p" style="font-size:12px;font-weight:700">${idr(i.sell)}</td>
                <td class="td-p">${badge(isLow ? 'Low' : 'OK')}</td>
                <td class="td-p">${actionBtns('Item', i.id)}</td>
              </tr>`;
                  })
                  .join('')
          }
        </tbody>
      </table>
    </div>
    ${pagerHTML(totalFiltered, 'inventory')}
  </div>`;
}

// ── View: Finance ─────────────────────────────────────────────────────────────
function renderFinance() {
  const acc = DB.accounts || { cash: 0, bca: 0, mandiri: 0 };
  const totalSaldo = (acc.cash || 0) + (acc.bca || 0) + (acc.mandiri || 0);
  // FIX: Add null checks to prevent crashes if stock or cost is null/undefined
  const stokVal = DB.inventoryItems.reduce((s, i) => s + (i.stock || 0) * (i.cost || 0), 0);

  // Rebuild finance reports dynamically
  _financeReports = [
    {
      title: 'Laporan Laba Rugi',
      sub: 'Pendapatan vs pengeluaran periode ini',
      value: 'Lihat',
      color: '#3B82F6',
      icon: '<line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>',
      items: (() => {
        const _si = DB.salesOrders.filter(o => (!o._type || o._type === 'invoice') && o.status !== 'Draft' && o.status !== 'Cancelled');
        const _pi = DB.purchaseOrders.filter(o => (!o._type || o._type === 'invoice') && o.status !== 'Draft' && o.status !== 'Cancelled');
        const _siTotal = _si.reduce((s, o) => s + (o.amount || 0), 0);
        const _piTotal = _pi.reduce((s, o) => s + (o.amount || 0), 0);
        return [
          `✓ Total penjualan: ${idrFull(_siTotal)}`,
          `✓ Total pembelian: ${idrFull(_piTotal)}`,
          `✓ Laba kotor: ${idrFull(_siTotal - _piTotal)}`,
        ];
      })(),
    },
    {
      title: 'Neraca Keuangan',
      sub: 'Aset, liabilitas, dan ekuitas',
      value: 'Lihat',
      color: '#34C759',
      icon: '<rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/>',
      items: (() => {
        const _ow = o => o.owing != null ? o.owing : Math.max(0, (o.amount || 0) - (o.paid || 0));
        const _si = DB.salesOrders.filter(o => (!o._type || o._type === 'invoice') && o.status !== 'Draft' && o.status !== 'Cancelled');
        const _pi = DB.purchaseOrders.filter(o => (!o._type || o._type === 'invoice') && o.status !== 'Draft' && o.status !== 'Cancelled');
        return [
          `✓ Total kas & bank: ${idrFull(totalSaldo)}`,
          `✓ Total nilai stok inventori: ${idrFull(stokVal)}`,
          `✓ Piutang: ${idrFull(_si.reduce((s, o) => s + _ow(o), 0))}`,
          `✓ Hutang: ${idrFull(_pi.reduce((s, o) => s + _ow(o), 0))}`,
        ];
      })(),
    },
    {
      title: 'Arus Kas',
      sub: 'Pemasukan dan pengeluaran kas',
      value: 'Lihat',
      color: '#FF9F0A',
      icon: '<line x1="12" y1="1" x2="12" y2="23"/><polyline points="17 5 12 1 7 5"/><polyline points="7 19 12 23 17 19"/>',
      items: (() => {
        const _si = DB.salesOrders.filter(o => (!o._type || o._type === 'invoice') && (o.status === 'Paid' || o.status === 'Delivered'));
        const _pi = DB.purchaseOrders.filter(o => (!o._type || o._type === 'invoice') && (o.status === 'Paid' || o.status === 'Received'));
        return [
          `✓ Kas masuk (penjualan): ${idrFull(_si.reduce((s, o) => s + (o.paid || 0), 0))}`,
          `✓ Kas keluar (pembelian): ${idrFull(_pi.reduce((s, o) => s + (o.paid || 0), 0))}`,
          `✓ Saldo akhir: ${idrFull(totalSaldo)}`,
        ];
      })(),
    },
  ];

  // Real values from settings — no hardcoded compliance claims.
  const taxCfg = (DB.settings && DB.settings.tax) || {};
  const finItems = [
    {
      title: 'Kepatuhan Pajak',
      items: [
        `Status PKP: ${taxCfg.pkp ? 'Terdaftar (PKP)' : 'Non-PKP'}`,
        `NPWP: ${taxCfg.npwp || 'Belum diisi'}`,
        `Tarif PPN: ${Math.round((taxCfg.ppnRate || 0) * 100)}%`,
      ],
    },
    {
      title: 'Rekonsiliasi Bank',
      items: [
        `Saldo tercatat BCA: ${idr(acc.bca || 0)}`,
        `Saldo tercatat Mandiri: ${idr(acc.mandiri || 0)}`,
        'Cocokkan dengan mutasi: menu Kas & Bank › Bank Reconcile',
      ],
    },
  ];

  // Real audit trail + period lock + ledger check panel (integrity.js).
  const integrityPanel =
    typeof window.Integrity !== 'undefined' && typeof window.Integrity.statusCardHTML === 'function'
      ? window.Integrity.statusCardHTML()
      : '';

  return `
  ${secHdr('Keuangan & Pajak', 'Laporan keuangan, kas & bank, dan kepatuhan pajak')}
  <div style="display:flex;justify-content:flex-end;margin-bottom:8px">
    <button class="btn-ghost" data-action="editAccounts" style="font-size:12px;display:flex;align-items:center;gap:5px">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
      Edit Saldo Kas & Bank
    </button>
  </div>
  ${statRow([
    { label: 'Kas Tunai', value: idr(acc.cash || 0), sub: 'Saldo saat ini' },
    { label: 'Bank BCA', value: idr(acc.bca || 0), sub: 'Saldo saat ini' },
    { label: 'Bank Mandiri', value: idr(acc.mandiri || 0), sub: 'Saldo saat ini' },
    { label: 'Total Saldo', value: idr(totalSaldo), sub: 'Semua akun', color: '#3B82F6' },
  ])}
  <div class="fin-2col">
    ${_financeReports
      .map(
        (r, idx) => `
      <div class="card fin-card-row" data-action="openFinance" data-idx="${idx}" style="cursor:pointer">
        <div class="fin-ico" style="background:${r.color}20">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="${r.color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${r.icon}</svg>
        </div>
        <div style="flex:1">
          <div style="font-size:13px;font-weight:700">${escapeHtml(r.title)}</div>
          <div style="font-size:11px;color:var(--muted);margin-top:2px">${escapeHtml(r.sub)}</div>
        </div>
        <div style="font-size:14px;font-weight:800;color:${r.color};flex-shrink:0">${escapeHtml(r.value)}</div>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
      </div>`
      )
      .join('')}
  </div>
  <div class="fin-3col">
    ${finItems
      .map(
        s => `<div class="card">
      <div style="font-size:13px;font-weight:700;margin-bottom:12px">${escapeHtml(s.title)}</div>
      ${s.items.map(item => `<div style="font-size:11px;color:var(--muted);padding:7px 0;border-bottom:1px solid var(--border);line-height:1.4">${escapeHtml(item)}</div>`).join('')}
    </div>`
      )
      .join('')}
  </div>
  ${integrityPanel}
  ${_piutangAgingSection()}
  ${_hutangAgingSection()}`;
}

// ── View: Assets ──────────────────────────────────────────────────────────────
function renderAssets() {
  const assets = (DB.settings && DB.settings.assets) || [];
  const categories = (DB.settings && DB.settings.assetCategories) || [];
  const fiscalCategories = (DB.settings && DB.settings.assetFiscalCategories) || [];
  const transfers = (DB.settings && DB.settings.assetTransfers) || [];
  const disposals = (DB.settings && DB.settings.assetDisposals) || [];

  const totalCost = assets.reduce((s, a) => s + (a.cost || 0), 0);
  const maintenanceCount = assets.filter(a => a.status === 'Maintenance').length;
  const disposedCount = assets.filter(a => a.status === 'Disposed').length;
  const locationMap = new Map();
  assets.forEach(a => {
    const loc = a.location || 'Tidak ditentukan';
    locationMap.set(loc, (locationMap.get(loc) || 0) + 1);
  });
  const locationList = [...locationMap.entries()].sort((a, b) => b[1] - a[1]);

  const listAssets = assets.slice().sort((a, b) => String(b.id).localeCompare(String(a.id)));
  const recentTransfers = transfers.slice(0, 5);
  const recentDisposals = disposals.slice(0, 5);

  return `
  ${secHdr('Aset Tetap', 'Registrasi aset tetap, kategori, mutasi, dan disposisi', 'Tambah Aset', 'addAsset')}
  ${statRow([
    { label: 'Total Aset', value: String(assets.length), sub: 'Aset tercatat' },
    { label: 'Nilai Perolehan', value: idrFull(totalCost), sub: 'Total biaya perolehan' },
    {
      label: 'Perlu Perawatan',
      value: String(maintenanceCount),
      sub: 'Status Maintenance',
      color: '#8B5CF6',
    },
    {
      label: 'Sudah Dilepas',
      value: String(disposedCount),
      sub: 'Disposisi aset',
      color: '#EF4444',
    },
  ])}
  <div class="fin-2col">
    <div class="card">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
        <div style="font-size:13px;font-weight:700">Kategori Aset</div>
        <button class="btn-ghost" data-action="addAssetCategory" style="font-size:11px;padding:4px 10px">+ Tambah</button>
      </div>
      ${
        categories.length === 0
          ? `<div style="font-size:12px;color:var(--muted);text-align:center;padding:14px">Belum ada kategori aset.</div>`
          : `<div style="display:flex;flex-wrap:wrap;gap:6px">${categories
              .map(c => `<span class="cat">${escapeHtml(c)}</span>`)
              .join('')}</div>`
      }
    </div>
    <div class="card">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
        <div style="font-size:13px;font-weight:700">Kategori Fiskal</div>
        <button class="btn-ghost" data-action="addAssetFiscalCategory" style="font-size:11px;padding:4px 10px">+ Tambah</button>
      </div>
      ${
        fiscalCategories.length === 0
          ? `<div style="font-size:12px;color:var(--muted);text-align:center;padding:14px">Belum ada kategori fiskal.</div>`
          : `<div style="display:flex;flex-wrap:wrap;gap:6px">${fiscalCategories
              .map(c => `<span class="cat">${escapeHtml(c)}</span>`)
              .join('')}</div>`
      }
    </div>
  </div>
  <div class="card" style="margin-top:16px">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
      <div style="font-size:14px;font-weight:700">Daftar Aset</div>
      <div style="font-size:11px;color:var(--muted)">Berdasarkan data aset yang tersimpan</div>
    </div>
    <div class="table-wrap">
      <table>
        <thead><tr>
          <th>ID</th>
          <th>Nama</th>
          <th>Kategori</th>
          <th>Lokasi</th>
          <th>Tanggal Perolehan</th>
          <th>Nilai</th>
          <th>Status</th>
          <th>Aksi</th>
        </tr></thead>
        <tbody>
          ${
            listAssets.length === 0
              ? `<tr><td colspan="8" class="td-empty">Belum ada aset terdaftar.</td></tr>`
              : listAssets
                  .map(
                    a => `<tr data-action="viewAsset" data-id="${escapeHtml(a.id)}" style="cursor:pointer">
              <td class="td-p" style="font-size:11px;font-weight:700">${escapeHtml(a.id)}</td>
              <td class="td-p" style="font-size:12px;font-weight:700">${escapeHtml(a.name)}</td>
              <td class="td-p"><span class="cat">${escapeHtml(a.category || '—')}</span></td>
              <td class="td-p" style="font-size:11px;color:var(--muted)">${escapeHtml(a.location || '—')}</td>
              <td class="td-p" style="font-size:11px;color:var(--muted)">${escapeHtml(a.acquired || '—')}</td>
              <td class="td-p" style="font-size:12px;font-weight:700">${idrFull(a.cost || 0)}</td>
              <td class="td-p">${badge(a.status || 'OK')}</td>
              <td class="td-p">${actionBtns('Asset', a.id)}</td>
            </tr>`
                  )
                  .join('')
          }
        </tbody>
      </table>
    </div>
  </div>
  <div class="fin-2col" style="margin-top:16px">
    <div class="card">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
        <div style="font-size:13px;font-weight:700">Mutasi Aset</div>
        <button class="btn-ghost" data-action="addAssetTransfer" style="font-size:11px;padding:4px 10px">+ Catat</button>
      </div>
      ${
        recentTransfers.length === 0
          ? `<div style="font-size:12px;color:var(--muted);text-align:center;padding:14px">Belum ada mutasi aset.</div>`
          : recentTransfers
              .map(
                t => `<div style="display:flex;justify-content:space-between;gap:8px;padding:8px 0;border-bottom:1px solid var(--border)">
          <div>
            <div style="font-size:12px;font-weight:700">${escapeHtml(t.assetName || t.assetId)}</div>
            <div style="font-size:11px;color:var(--muted)">${escapeHtml(t.from || '—')} → ${escapeHtml(t.to || '—')}</div>
          </div>
          <div style="font-size:11px;color:var(--muted)">${escapeHtml(t.date || '—')}</div>
        </div>`
              )
              .join('')
      }
    </div>
    <div class="card">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
        <div style="font-size:13px;font-weight:700">Disposisi Aset</div>
        <button class="btn-ghost" data-action="addAssetDisposal" style="font-size:11px;padding:4px 10px">+ Catat</button>
      </div>
      ${
        recentDisposals.length === 0
          ? `<div style="font-size:12px;color:var(--muted);text-align:center;padding:14px">Belum ada disposisi aset.</div>`
          : recentDisposals
              .map(
                d => `<div style="display:flex;justify-content:space-between;gap:8px;padding:8px 0;border-bottom:1px solid var(--border)">
          <div>
            <div style="font-size:12px;font-weight:700">${escapeHtml(d.assetName || d.assetId)}</div>
            <div style="font-size:11px;color:var(--muted)">${escapeHtml(d.method || '—')}</div>
          </div>
          <div style="font-size:11px;color:var(--muted)">${escapeHtml(d.date || '—')}</div>
        </div>`
              )
              .join('')
      }
    </div>
  </div>
  <div class="card" style="margin-top:16px">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
      <div style="font-size:13px;font-weight:700">Aset per Lokasi</div>
      <div style="font-size:11px;color:var(--muted)">Berdasarkan lokasi pada aset</div>
    </div>
    ${
      locationList.length === 0
        ? `<div style="font-size:12px;color:var(--muted);text-align:center;padding:14px">Belum ada lokasi aset.</div>`
        : locationList
            .map(
              ([
                loc,
                count,
              ]) => `<div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border)">
        <div style="font-size:12px;font-weight:700">${escapeHtml(loc)}</div>
        <div style="font-size:12px;color:var(--muted)">${count} aset</div>
      </div>`
            )
            .join('')
    }
  </div>`;
}

// ── View: Tax ─────────────────────────────────────────────────────────────────
function renderTax() {
  const summary = calcTaxSummary();
  const tax = summary.tax;
  const ratePct = (tax.ppnRate * 100).toFixed(2).replace(/\.00$/, '');
  const roundingLabel =
    tax.rounding === 'floor'
      ? 'Dibulatkan ke bawah'
      : tax.rounding === 'ceil'
        ? 'Dibulatkan ke atas'
        : 'Dibulatkan normal';

  const salesRecent = summary.salesOrders
    .slice()
    .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')))
    .slice(0, 5);
  const purchaseRecent = summary.purchaseOrders
    .slice()
    .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')))
    .slice(0, 5);

  const efakturCount = summary.salesOrders.filter(
    o => o.status === 'Paid' || o.status === 'Delivered'
  ).length;

  return `
  ${secHdr('Perpajakan', 'Rekap PPN, e-Faktur, dan kepatuhan pajak', 'Edit Pengaturan Pajak', 'editTaxSettings')}
  ${statRow([
    {
      label: 'PPN Keluaran',
      value: idrFull(summary.outputTax),
      sub: `Berdasarkan ${summary.salesOrders.length} transaksi`,
    },
    {
      label: 'PPN Masukan',
      value: idrFull(summary.inputTax),
      sub: `Berdasarkan ${summary.purchaseOrders.length} transaksi`,
    },
    {
      label: 'PPN Terutang',
      value: idrFull(summary.netTax),
      sub: `Keluaran - Masukan`,
      color: summary.netTax >= 0 ? '#3B82F6' : '#EF4444',
    },
    { label: 'Tarif PPN', value: `${ratePct}%`, sub: roundingLabel },
  ])}
  <div class="fin-2col">
    <div class="card">
      <div style="font-size:13px;font-weight:700;margin-bottom:10px">Dasar Perhitungan</div>
      <div style="font-size:12px;color:var(--muted);line-height:1.5;margin-bottom:10px">
        PPN dihitung dari total transaksi non-draft. Jika transaksi memiliki nilai <strong>tax</strong>,
        nilai tersebut dipakai. Jika tidak, sistem menghitung <strong>amount × tarif PPN</strong>.
      </div>
      <div style="font-size:12px;display:flex;flex-direction:column;gap:6px">
        <div>Penjualan kena pajak: <strong>${idrFull(summary.salesBase)}</strong></div>
        <div>Pembelian kena pajak: <strong>${idrFull(summary.purchaseBase)}</strong></div>
        <div>Transaksi dengan tax eksplisit: <strong>${summary.salesWithTax + summary.purchaseWithTax}</strong></div>
      </div>
    </div>
    <div class="card">
      <div style="font-size:13px;font-weight:700;margin-bottom:10px">Status Kepatuhan</div>
      <div style="font-size:12px;display:flex;flex-direction:column;gap:6px">
        <div>Status PKP: <strong>${tax.pkp ? 'Terdaftar' : 'Belum PKP'}</strong></div>
        <div>NPWP: <strong>${escapeHtml(tax.npwp)}</strong></div>
        <div>e-Faktur siap kirim: <strong>${efakturCount} transaksi</strong></div>
      </div>
      <div style="margin-top:10px;font-size:11px;color:var(--muted)">
        Berdasarkan transaksi penjualan berstatus Paid/Delivered.
      </div>
    </div>
  </div>
  <div class="fin-2col" style="margin-top:16px">
    <div class="card">
      <div style="font-size:13px;font-weight:700;margin-bottom:10px">Dasar Penjualan (PPN Keluaran)</div>
      ${
        salesRecent.length === 0
          ? `<div style="font-size:12px;color:var(--muted);text-align:center;padding:14px">Belum ada penjualan tercatat.</div>`
          : salesRecent
              .map(
                o => `<div style="display:flex;justify-content:space-between;gap:10px;padding:8px 0;border-bottom:1px solid var(--border)">
          <div>
            <div style="font-size:12px;font-weight:700">${escapeHtml(docNum(o.number, o.id))}</div>
            <div style="font-size:11px;color:var(--muted)">${escapeHtml(o.customer || '—')} • ${escapeHtml(o.date || '—')}</div>
          </div>
          <div style="font-size:12px;font-weight:700">${idrFull(o.amount || 0)}</div>
        </div>`
              )
              .join('')
      }
    </div>
    <div class="card">
      <div style="font-size:13px;font-weight:700;margin-bottom:10px">Dasar Pembelian (PPN Masukan)</div>
      ${
        purchaseRecent.length === 0
          ? `<div style="font-size:12px;color:var(--muted);text-align:center;padding:14px">Belum ada pembelian tercatat.</div>`
          : purchaseRecent
              .map(
                o => `<div style="display:flex;justify-content:space-between;gap:10px;padding:8px 0;border-bottom:1px solid var(--border)">
          <div>
            <div style="font-size:12px;font-weight:700">${escapeHtml(docNum(o.number, o.id))}</div>
            <div style="font-size:11px;color:var(--muted)">${escapeHtml(o.supplier || '—')} • ${escapeHtml(o.date || '—')}</div>
          </div>
          <div style="font-size:12px;font-weight:700">${idrFull(o.amount || 0)}</div>
        </div>`
              )
              .join('')
      }
    </div>
  </div>`;
}

// ── View: Reports ─────────────────────────────────────────────────────────────
function renderReports() {
  const taxSummary = calcTaxSummary();
  const salesTotal = taxSummary.salesBase;
  const purchaseTotal = taxSummary.purchaseBase;
  const inventoryVal = DB.inventoryItems.reduce((s, i) => s + (i.stock || 0) * (i.cost || 0), 0);
  const lowStock = DB.inventoryItems.filter(i => i.stock < i.min).length;
  const topCustomer = DB.salesOrders.reduce(
    (acc, o) => {
      if (!o.customer) {
        return acc;
      }
      acc.counts[o.customer] = (acc.counts[o.customer] || 0) + (o.amount || 0);
      if (acc.counts[o.customer] > acc.bestValue) {
        acc.bestValue = acc.counts[o.customer];
        acc.bestName = o.customer;
      }
      return acc;
    },
    { counts: {}, bestName: '—', bestValue: 0 }
  );
  const topSupplier = DB.purchaseOrders.reduce(
    (acc, o) => {
      if (!o.supplier) {
        return acc;
      }
      acc.counts[o.supplier] = (acc.counts[o.supplier] || 0) + (o.amount || 0);
      if (acc.counts[o.supplier] > acc.bestValue) {
        acc.bestValue = acc.counts[o.supplier];
        acc.bestName = o.supplier;
      }
      return acc;
    },
    { counts: {}, bestName: '—', bestValue: 0 }
  );

  _reportCatalog = [
    {
      title: 'Laporan Penjualan',
      sub: 'Ringkasan penjualan non-draft',
      value: idrFull(salesTotal),
      items: [
        `✓ Jumlah transaksi: ${taxSummary.salesOrders.length}`,
        `✓ Total penjualan: ${idrFull(salesTotal)}`,
        `✓ Pelanggan terbesar: ${topCustomer.bestName}`,
      ],
    },
    {
      title: 'Laporan Pembelian',
      sub: 'Ringkasan pembelian non-draft',
      value: idrFull(purchaseTotal),
      items: [
        `✓ Jumlah transaksi: ${taxSummary.purchaseOrders.length}`,
        `✓ Total pembelian: ${idrFull(purchaseTotal)}`,
        `✓ Supplier terbesar: ${topSupplier.bestName}`,
      ],
    },
    {
      title: 'Laporan Persediaan',
      sub: 'Nilai stok dan stok rendah',
      value: idrFull(inventoryVal),
      items: [
        `✓ Total nilai stok: ${idrFull(inventoryVal)}`,
        `✓ Item stok rendah: ${lowStock} item`,
        `✓ Jumlah item aktif: ${DB.inventoryItems.length}`,
      ],
    },
    {
      title: 'Ringkasan Pajak',
      sub: 'PPN keluaran vs masukan',
      value: idrFull(taxSummary.netTax),
      items: [
        `✓ PPN keluaran: ${idrFull(taxSummary.outputTax)}`,
        `✓ PPN masukan: ${idrFull(taxSummary.inputTax)}`,
        `✓ PPN terutang: ${idrFull(taxSummary.netTax)}`,
      ],
    },
  ];

  return `
  ${secHdr('Laporan', 'Ringkasan laporan penjualan, pembelian, pajak, dan analisis')}
  <div class="fin-2col">
    ${_reportCatalog
      .map(
        (r, idx) => `
      <div class="card fin-card-row" data-action="openReport" data-idx="${idx}" style="cursor:pointer">
        <div class="fin-ico" style="background:#EFF6FF">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#3B82F6" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
        </div>
        <div style="flex:1">
          <div style="font-size:13px;font-weight:700">${escapeHtml(r.title)}</div>
          <div style="font-size:11px;color:var(--muted);margin-top:2px">${escapeHtml(r.sub)}</div>
        </div>
        <div style="font-size:13px;font-weight:800;color:#3B82F6">${escapeHtml(r.value)}</div>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
      </div>`
      )
      .join('')}
  </div>
  `;
}

// ── View: Logistics ───────────────────────────────────────────────────────────
function renderLogistics() {
  const f = filters.logistics;
  let orders = f === 'all' ? DB.deliveryOrders : DB.deliveryOrders.filter(o => o.status === f);
  orders = applyDateFilter(orders, 'logistics');
  orders = applySorted(orders, 'logistics');

  const invoiced = DB.deliveryOrders.filter(o => o.status === 'Invoiced').length;
  const sent = DB.deliveryOrders.filter(o => o.status === 'Sent').length;
  const partialInv = DB.deliveryOrders.filter(o => o.status === 'Partially invoiced').length;
  // Fix #4: compute from real data — count unique drivers dispatched this month
  const now = new Date();
  const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const thisMthDO = DB.deliveryOrders.filter(o => o.date && o.date.startsWith(thisMonth));
  const uniqueDrivers = new Set(thisMthDO.map(o => o.driver).filter(d => d && d !== '—')).size;

  const fleet = DB.fleet || [];
  const expedition = DB.expedition || [];
  const totalFiltered = orders.length;
  const paged = applyPage(orders, 'logistics');

  return `
  ${secHdr('Logistik', 'Pengiriman, armada kendaraan, dan ekspedisi', 'Buat DO Baru', 'addDO')}
  ${statRow([
    {
      label: 'DO Difakturkan',
      value: String(invoiced),
      sub: 'Sudah jadi faktur',
      color: '#34C759',
    },
    { label: 'DO Terkirim', value: String(sent), sub: 'Belum difaktur', color: '#3B82F6' },
    { label: 'DO Faktur Sebagian', value: String(partialInv), sub: 'Sebagian difaktur', color: '#FF9F0A' },
    {
      label: 'Driver Aktif Bln Ini',
      value: String(uniqueDrivers),
      sub: `${thisMthDO.length} DO bulan ini`,
    },
  ])}
  <div class="log-2col">
    <div class="card">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
        <div style="font-size:13px;font-weight:700">Armada Kendaraan</div>
        <button class="btn-ghost" data-action="addFleet" style="font-size:11px;padding:4px 10px">+ Tambah</button>
      </div>
      ${
        fleet.length === 0
          ? `<div style="font-size:12px;color:var(--muted);text-align:center;padding:16px">Belum ada armada — tambah kendaraan di atas.</div>`
          : fleet
              .map(
                v => `<div style="display:flex;align-items:center;gap:12px;padding:9px 0;border-bottom:1px solid var(--border)">
          <div style="flex:1">
            <div style="font-size:12px;font-weight:700;font-family:monospace">${escapeHtml(v.plate)}</div>
            <div style="font-size:11px;color:var(--muted)">${escapeHtml(v.type)} · ${escapeHtml(v.driver)}</div>
          </div>
          ${badge(v.status === 'OK' ? 'OK' : 'In Transit')}
          <button class="action-ghost" data-action="editFleet" data-id="${escapeHtml(v.id)}" style="font-size:11px">Edit</button>
        </div>`
              )
              .join('')
      }
    </div>
    <div class="card">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
        <div style="font-size:13px;font-weight:700">Ekspedisi Rekanan</div>
        <button class="btn-ghost" data-action="addExpedition" style="font-size:11px;padding:4px 10px">+ Tambah</button>
      </div>
      ${
        expedition.length === 0
          ? `<div style="font-size:12px;color:var(--muted);text-align:center;padding:16px">Belum ada ekspedisi — tambah rekanan di atas.</div>`
          : expedition
              .map(
                e => `<div style="display:flex;align-items:center;gap:8px;padding:9px 0;border-bottom:1px solid var(--border)">
          <div style="flex:1">
            <div style="font-size:12px;font-weight:700">${escapeHtml(e.name)}</div>
            <div style="font-size:11px;color:var(--muted)">${escapeHtml(e.area)} · ${escapeHtml(e.rate)}</div>
          </div>
          <button class="action-ghost" data-action="editExpedition" data-id="${escapeHtml(e.id)}" style="font-size:11px">Edit</button>
        </div>`
              )
              .join('')
      }
    </div>
  </div>
  <div class="card">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
      <div style="font-size:14px;font-weight:700">Daftar Delivery Order</div>
      <div style="display:flex;align-items:center;gap:8px">
        ${rekapExportBtn()}
        ${rekapImportBtn()}
        ${importBtn('logistics')}
        ${exportBtn('logistics')}
        ${excelBtn('logistics')}
        ${filterBtn('logistics')}
      </div>
    </div>
    <div style="margin-bottom:12px">${dateFilterBar('logistics')}</div>
    <div class="table-wrap">
      <table>
        <thead><tr>
          ${sortTh('No. DO', 'logistics', 'id')}
          <th>Ref.</th>
          ${sortTh('Pelanggan', 'logistics', 'customer')}
          ${sortTh('Tujuan', 'logistics', 'destination')}
          ${sortTh('Tanggal', 'logistics', 'date')}
          <th>Driver</th>
          <th>Kendaraan</th>
          ${sortTh('Status', 'logistics', 'status')}
          <th>Aksi</th>
        </tr></thead>
        <tbody>
          ${
            paged.length === 0
              ? emptyRow(9, 'logistics')
              : paged
                  .map(d => {
                    const rawRef = d.soId || d.poId || null;
                    // Prefix the reference with its source type so it's obvious
                    // at a glance whether the DO came from an SO or a PO.
                    const refKind = d.soId ? 'SO' : d.poId ? 'PO' : '';
                    const ref = rawRef ? `${refKind} · ${docNum(null, rawRef)}` : '—';
                    const refColor = d.soId
                      ? 'var(--primary)'
                      : d.poId
                        ? '#FF9F0A'
                        : 'var(--muted)';
                    return `<tr data-action="viewDO" data-id="${escapeHtml(d.id)}" style="cursor:pointer${d.needsCorrection ? ';background:#FFFBEB' : ''}">
              <td class="td-p" style="font-size:11px;font-weight:700;color:var(--primary)">${escapeHtml(docNum(d.number, d.id))}${
                d.needsCorrection
                  ? ` <span title="${escapeHtml(d.correctionNote || 'Petugas lapangan meminta koreksi')}" style="display:inline-block;font-size:9px;font-weight:800;color:#92400E;background:#FEF3C7;border:1px solid #FCD34D;border-radius:99px;padding:1px 6px;vertical-align:middle">⚠ KOREKSI</span>`
                  : ''
              }</td>
              <td class="td-p" style="font-size:10px;font-weight:600;color:${refColor}">${escapeHtml(ref)}</td>
              <td class="td-p" style="font-size:12px;font-weight:600">${escapeHtml(d.customer)}</td>
              <td class="td-p" style="font-size:12px;color:var(--muted)">${escapeHtml(d.destination)}${
                d.destChanged
                  ? ` <span title="${escapeHtml(d.destOriginal ? 'Tujuan diubah dari: ' + d.destOriginal : 'Tujuan diubah')}" style="display:inline-block;font-size:9px;font-weight:800;color:#B45309;background:#FEF3C7;border:1px solid #FCD34D;border-radius:99px;padding:1px 6px;vertical-align:middle">⚠ TUJUAN DIUBAH</span>`
                  : ''
              }</td>
              <td class="td-p" style="font-size:11px;color:var(--muted)">${escapeHtml(d.date)}</td>
              <td class="td-p" style="font-size:12px">${escapeHtml(d.driver)}</td>
              <td class="td-p" style="font-size:11px;font-family:monospace">${escapeHtml(d.vehicle)}</td>
              <td class="td-p">${badge(d.status)}</td>
              <td class="td-p">${actionBtns('DO', d.id)}</td>
            </tr>`;
                  })
                  .join('')
          }
        </tbody>
      </table>
    </div>
    ${pagerHTML(totalFiltered, 'logistics')}
  </div>`;
}

// ── View: Master Data ─────────────────────────────────────────────────────────
function renderMasterData() {
  // Paginate customers and suppliers separately
  let custs = [...DB.customers];
  let supps = [...DB.suppliers];
  const totalCust = custs.length;
  const totalSupp = supps.length;
  custs = applyPage(custs, 'master_cust');
  supps = applyPage(supps, 'master_supp');

  function custRow(c) {
    const orders = DB.salesOrders.filter(o => o.customer === c.name);
    return `<tr data-action="viewCustomer" data-id="${escapeHtml(c.id)}" style="cursor:pointer">
      <td class="td-p" style="font-size:13px;font-weight:700">${escapeHtml(c.name)}</td>
      <td class="td-p" style="font-size:12px;color:var(--muted)">${escapeHtml(c.phone || '—')}</td>
      <td class="td-p" style="font-size:12px;color:var(--muted)">${escapeHtml(c.address || '—')}</td>
      <td class="td-p" style="font-size:12px;font-weight:700">${orders.length} SO</td>
      <td class="td-p">${actionBtns('Customer', c.id)}</td>
    </tr>`;
  }

  function suppRow(s) {
    const orders = DB.purchaseOrders.filter(o => o.supplier === s.name);
    return `<tr data-action="viewSupplier" data-id="${escapeHtml(s.id)}" style="cursor:pointer">
      <td class="td-p" style="font-size:13px;font-weight:700">${escapeHtml(s.name)}</td>
      <td class="td-p" style="font-size:12px;color:var(--muted)">${escapeHtml(s.contact || '—')}</td>
      <td class="td-p" style="font-size:12px;color:var(--muted)">${escapeHtml(s.phone || '—')}</td>
      <td class="td-p" style="font-size:12px;color:var(--muted)">${escapeHtml(s.address || '—')}</td>
      <td class="td-p" style="font-size:12px;font-weight:700">${orders.length} PO</td>
      <td class="td-p">${actionBtns('Supplier', s.id)}</td>
    </tr>`;
  }

  return `
  ${secHdr('Master Data', 'Kelola data pelanggan dan supplier')}
  ${statRow([
    { label: 'Total Pelanggan', value: String(DB.customers.length), sub: 'Data aktif' },
    { label: 'Total Supplier', value: String(DB.suppliers.length), sub: 'Rekanan pembelian' },
    { label: 'SO Terhubung', value: String(DB.salesOrders.length), sub: 'Ke pelanggan terdaftar' },
    {
      label: 'PO Terhubung',
      value: String(DB.purchaseOrders.length),
      sub: 'Ke supplier terdaftar',
    },
  ])}

  <div class="card" style="margin-bottom:16px">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
      <div style="font-size:14px;font-weight:700">Pelanggan</div>
      <button class="btn" data-action="addCustomer" style="font-size:12px">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        Tambah Pelanggan
      </button>
    </div>
    <div class="table-wrap">
      <table>
        ${tblHdr(['Nama', 'Telepon', 'Alamat', 'Riwayat SO', 'Aksi'])}
        <tbody>
          ${
            custs.length === 0
              ? `<tr><td colspan="5" class="td-empty">Belum ada pelanggan terdaftar.</td></tr>`
              : custs.map(custRow).join('')
          }
        </tbody>
      </table>
    </div>
    ${pagerHTML(totalCust, 'master_cust')}
  </div>

  <div class="card">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
      <div style="font-size:14px;font-weight:700">Supplier</div>
      <button class="btn" data-action="addSupplier" style="font-size:12px">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        Tambah Supplier
      </button>
    </div>
    <div class="table-wrap">
      <table>
        ${tblHdr(['Nama', 'Kontak', 'Telepon', 'Alamat', 'Riwayat PO', 'Aksi'])}
        <tbody>
          ${
            supps.length === 0
              ? `<tr><td colspan="6" class="td-empty">Belum ada supplier terdaftar.</td></tr>`
              : supps.map(suppRow).join('')
          }
        </tbody>
      </table>
    </div>
    ${pagerHTML(totalSupp, 'master_supp')}
  </div>`;
}

// ── View: Settings ────────────────────────────────────────────────────────────
function renderSettings() {
  const currentUser = window.erpAuth?.getCurrentUser() || 'admin';
  const backupStatus = window.erpBackup?.getBackupStatus() || { backupCount: 0 };

  const items = [
    {
      title: 'Profil Perusahaan',
      sub: 'Nama, alamat, NPWP, logo perusahaan',
      icon: '<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>',
    },
    {
      title: 'Keamanan & Password',
      sub: 'Ganti password login sistem',
      icon: '<rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
      action: 'changePassword',
    },
    {
      title: 'Kelola Backup',
      sub: `${backupStatus.backupCount} backup otomatis tersimpan`,
      icon: '<path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/>',
      action: 'manageBackup',
    },
    {
      title: 'Install Aplikasi',
      sub: window.erpPwa && window.erpPwa.isStandalone()
        ? 'Aplikasi sudah terpasang di perangkat ini ✓'
        : 'Pasang Kelola ERP di homescreen / desktop',
      icon: '<rect x="5" y="2" width="14" height="20" rx="2" ry="2"/><line x1="12" y1="18" x2="12.01" y2="18"/><polyline points="9 9 12 12 15 9"/><line x1="12" y1="12" x2="12" y2="5"/>',
      action: 'installPwaApp',
    },
    {
      title: 'Notifikasi Sistem',
      sub:
        typeof Notification === 'undefined'
          ? 'Tidak didukung browser ini'
          : Notification.permission === 'granted'
            ? 'Aktif — alert jatuh tempo & stok rendah ✓'
            : 'Aktifkan notifikasi jatuh tempo & stok rendah',
      icon: '<path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>',
      action: 'manageNotifications',
    },
    {
      title: 'Manajemen Pengguna',
      sub: 'Undang staff, atur role & akses',
      icon: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
      action: 'manageUsers',
    },
    {
      title: 'Kategori Item',
      sub: 'Kelola jenis dan kategori batu alam',
      icon: '<path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>',
      action: 'manageItemCategories',
    },
    {
      title: 'Satuan Ukur',
      sub: 'm², ton, m³, pcs, dan lainnya',
      icon: '<path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/>',
      action: 'manageUnits',
    },
    {
      title: 'Pengaturan Pajak',
      sub: 'Status PKP, tarif PPN, PPh',
      icon: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>',
      action: 'editTaxSettings',
    },
    {
      title: 'Chart of Accounts',
      sub: 'Konfigurasi akun dan pembukuan',
      icon: '<line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>',
      action: 'editAccounts',
    },
  ];

  return `
  ${secHdr('Pengaturan', 'Konfigurasi sistem, perusahaan, dan akun')}
  
  <div class="card" style="margin-bottom:20px;background:linear-gradient(135deg, #667eea 0%, #764ba2 100%);color:#fff;border:none">
    <div style="display:flex;align-items:center;gap:16px">
      <div style="width:48px;height:48px;background:rgba(255,255,255,0.2);border-radius:12px;display:flex;align-items:center;justify-content:center">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
          <circle cx="12" cy="7" r="4"/>
        </svg>
      </div>
      <div style="flex:1">
        <div style="font-size:14px;font-weight:700;margin-bottom:4px">Login sebagai: ${escapeHtml(currentUser)}</div>
        <div style="font-size:12px;opacity:0.9">Sistem dilindungi dengan autentikasi password</div>
      </div>
      <button class="btn-ghost" data-action="logout" style="background:rgba(255,255,255,0.2);color:#fff;border:1px solid rgba(255,255,255,0.3)">
        Logout
      </button>
    </div>
  </div>
  
  <div class="set-2col">
    ${items
      .map(
        s => `
      <div class="card set-row" ${s.action ? `data-action="${s.action}"` : `data-action="openSettings" data-title="${escapeHtml(s.title)}" data-sub="${escapeHtml(s.sub)}"`}>
        <div class="set-ico">
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#3B82F6" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${s.icon}</svg>
        </div>
        <div style="flex:1">
          <div style="font-size:13px;font-weight:700">${escapeHtml(s.title)}</div>
          <div style="font-size:11px;color:var(--muted);margin-top:2px">${escapeHtml(s.sub)}</div>
        </div>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
      </div>`
      )
      .join('')}
    <div class="card set-row" data-action="exportBackup" style="cursor:pointer">
      <div class="set-ico" style="background:#EFF6FF">
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#3B82F6" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
      </div>
      <div style="flex:1">
        <div style="font-size:13px;font-weight:700">Ekspor Backup JSON</div>
        <div style="font-size:11px;color:var(--muted);margin-top:2px">Unduh seluruh data ERP sebagai file JSON</div>
      </div>
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
    </div>
    <div class="card set-row" style="cursor:pointer;position:relative">
      <div class="set-ico" style="background:#F0FDF4">
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#34C759" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
      </div>
      <div style="flex:1">
        <div style="font-size:13px;font-weight:700">Impor Backup JSON</div>
        <div style="font-size:11px;color:var(--muted);margin-top:2px">Pulihkan data dari file backup sebelumnya</div>
      </div>
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
      <input type="file" accept=".json" id="importBackupInput" style="position:absolute;inset:0;opacity:0;cursor:pointer" data-action="importBackup">
    </div>
    <div class="card set-row" data-action="resetDB" style="border-color:var(--danger-light)">
      <div class="set-ico" style="background:var(--danger-light)">
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="var(--danger)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-3.44"/></svg>
      </div>
      <div style="flex:1">
        <div style="font-size:13px;font-weight:700;color:var(--danger)">Reset Data Demo</div>
        <div style="font-size:11px;color:var(--muted);margin-top:2px">Kembalikan semua data ke data contoh awal</div>
      </div>
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
    </div>
  </div>`;
}

// ── Charts ────────────────────────────────────────────────────────────────────
// FIX: Add debouncing to prevent rapid re-rendering on quick navigation
let _chartInitTimer = null;

function initCharts() {
  clearTimeout(_chartInitTimer);
  _chartInitTimer = setTimeout(_initChartsImpl, 100);
}

function _initChartsImpl() {
  const rc = document.getElementById('revenueChart');
  const sc = document.getElementById('stockChart');
  if (!rc || !sc) {
    return;
  }

  const chartFont = { family: "'Plus Jakarta Sans', sans-serif" };
  const tooltipDefaults = {
    backgroundColor: '#fff',
    titleColor: '#1D1D1F',
    bodyColor: '#6E6E73',
    borderColor: 'rgba(0,0,0,0.06)',
    borderWidth: 1,
    cornerRadius: 12,
    padding: 10,
    titleFont: { ...chartFont, weight: '700' },
    bodyFont: chartFont,
  };

  // ── Fix #3a: Revenue chart — aggregate real SO/PO data per calendar month ──
  // Build a 12-month rolling window ending this month
  const now = new Date();
  const revenueLabels = [];
  const revenuePenjualan = [];
  const revenuePengeluaran = [];
  const MONTH_NAMES_SHORT = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'Mei',
    'Jun',
    'Jul',
    'Agu',
    'Sep',
    'Okt',
    'Nov',
    'Des',
  ];

  // FIX #4: Only use seed data if DB is completely empty (first run)
  const hasAnyData = DB.salesOrders.length > 0 || DB.purchaseOrders.length > 0;

  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    revenueLabels.push(MONTH_NAMES_SHORT[d.getMonth()]);

    if (hasAnyData) {
      // Use real data from DB
      const soMonth = DB.salesOrders.filter(
        o => o.date && o.date.startsWith(key) && o.status !== 'Draft'
      );
      const poMonth = DB.purchaseOrders.filter(o => o.date && o.date.startsWith(key));
      const soTotal = soMonth.reduce((s, o) => s + (o.amount || 0), 0);
      const poTotal = poMonth.reduce((s, o) => s + (o.amount || 0), 0);
      revenuePenjualan.push(Math.round(soTotal / 1_000_000));
      revenuePengeluaran.push(Math.round(poTotal / 1_000_000));
    } else {
      // First run: use seed data for demo purposes.
      // DB.revenueData is not a Firestore collection, so it may be undefined.
      const seed = (DB.revenueData || []).find(r => r.month === MONTH_NAMES_SHORT[d.getMonth()]);
      revenuePenjualan.push(seed ? seed.penjualan : 0);
      revenuePengeluaran.push(seed ? seed.pengeluaran : 0);
    }
  }

  charts.revenue = new Chart(rc, {
    type: 'line',
    data: {
      labels: revenueLabels,
      datasets: [
        {
          label: 'Penjualan',
          data: revenuePenjualan,
          borderColor: '#3B82F6',
          borderWidth: 2.5,
          tension: 0.4,
          pointRadius: 0,
          pointHoverRadius: 4,
          fill: true,
          backgroundColor: ctx => {
            const g = ctx.chart.ctx.createLinearGradient(0, 0, 0, 200);
            g.addColorStop(0, 'rgba(59,130,246,0.18)');
            g.addColorStop(1, 'rgba(59,130,246,0)');
            return g;
          },
        },
        {
          label: 'Pengeluaran',
          data: revenuePengeluaran,
          borderColor: '#FF9F0A',
          borderWidth: 2.5,
          tension: 0.4,
          pointRadius: 0,
          pointHoverRadius: 4,
          fill: true,
          backgroundColor: ctx => {
            const g = ctx.chart.ctx.createLinearGradient(0, 0, 0, 200);
            g.addColorStop(0, 'rgba(255,159,10,0.18)');
            g.addColorStop(1, 'rgba(255,159,10,0)');
            return g;
          },
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: { ...tooltipDefaults, callbacks: { label: c => `Rp ${c.raw}jt` } },
      },
      scales: {
        x: {
          grid: { display: false },
          border: { display: false },
          ticks: { font: { size: 10 }, color: '#6E6E73' },
        },
        y: {
          grid: { color: 'rgba(0,0,0,0.04)' },
          border: { display: false },
          ticks: { font: { size: 10 }, color: '#6E6E73' },
        },
      },
    },
  });

  // ── Fix #3b: Stock chart — read live DB.inventoryItems, not static stockData ─
  const stockItems = DB.inventoryItems.slice(0, 8);
  charts.stock = new Chart(sc, {
    type: 'bar',
    data: {
      labels: stockItems.map(i => (i.name.length > 14 ? i.name.slice(0, 13) + '…' : i.name)),
      datasets: [
        {
          label: 'Stok',
          data: stockItems.map(i => i.stock),
          backgroundColor: stockItems.map(i => (i.stock < i.min ? '#FF3B30' : '#3B82F6')),
          borderRadius: 4,
          borderSkipped: false,
        },
        {
          label: 'Min',
          data: stockItems.map(i => i.min),
          backgroundColor: 'rgba(255,59,48,0.18)',
          borderRadius: 4,
          borderSkipped: false,
        },
      ],
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          ...tooltipDefaults,
          callbacks: {
            label: c => (c.dataset.label === 'Min' ? `Min: ${c.raw}` : `Stok: ${c.raw}`),
          },
        },
      },
      scales: {
        x: {
          grid: { color: 'rgba(0,0,0,0.04)' },
          border: { display: false },
          ticks: { font: { size: 9 }, color: '#6E6E73' },
        },
        y: {
          grid: { display: false },
          border: { display: false },
          ticks: { font: { size: 10 }, color: '#6E6E73' },
        },
      },
    },
  });
}

// ── Filter System ─────────────────────────────────────────────────────────────
// FIX: Use AbortController to prevent memory leak from stacking event listeners
let _filterCloseCtrl = null;

// Mobile (≤768px) renders .filter-drop as a position:fixed bottom sheet. But the
// drop lives inside a .card whose backdrop-filter makes the card the containing
// block for fixed descendants, so the sheet would anchor to the card and strand
// above the viewport (same root cause as the topbar menus, fixed 2026-06-13 by
// re-parenting to <body>; see nav.js _toggleUserMenu). So on mobile we "park" the
// drop on <body> while open and return it to its card slot on close. On desktop
// the drop is position:absolute and anchors to its .filter-wrap (a closer
// positioned ancestor than the card), so no re-parenting is needed there.
function _filterMobile() {
  return window.matchMedia('(max-width: 768px)').matches;
}

function _parkFilterDrop(drop) {
  if (!_filterMobile() || drop._homeParent) {
    return;
  }
  drop._homeParent = drop.parentNode;
  drop._homeNext = drop.nextSibling;
  document.body.appendChild(drop);
}

// Return a parked drop to its original card slot. _homeParent may be detached if
// the view re-rendered while the drop was open; appending to a detached node just
// drops it out of the document (no visible orphan), and the fresh render owns a
// new in-card drop.
function _unparkFilterDrop(drop) {
  if (!drop._homeParent) {
    return;
  }
  const parent = drop._homeParent;
  const next = drop._homeNext;
  drop._homeParent = null;
  drop._homeNext = null;
  if (next && next.parentNode === parent) {
    parent.insertBefore(drop, next);
  } else {
    parent.appendChild(drop);
  }
}

function _closeFilterDrop(drop) {
  drop.classList.remove('open');
  _unparkFilterDrop(drop);
}

// Return any drops parked on <body> to their home card (only parked drops are
// direct children of body — in-card drops are nested under .filter-wrap). Called
// on navigation/re-render paths so a parked drop never lingers as an orphan or
// collides on id with a freshly rendered in-card drop. We *unpark* rather than
// remove: nav.js caches rendered views (_renderedViews) and skips re-rendering on
// revisit, so destroying the drop would leave the cached card permanently without
// its filter. _unparkFilterDrop handles a detached home (e.g. a view that did get
// re-rendered) by simply dropping the element out of the document.
function _cleanupParkedFilters() {
  document.querySelectorAll('body > .filter-drop').forEach(d => {
    d.classList.remove('open');
    if (d._homeParent) {
      _unparkFilterDrop(d);
    } else {
      d.remove();
    }
  });
  if (_filterCloseCtrl) {
    _filterCloseCtrl.abort();
    _filterCloseCtrl = null;
  }
}

function toggleFilter(type) {
  document.querySelectorAll('.filter-drop.open').forEach(d => {
    if (d.id !== `filter-${type}`) {
      _closeFilterDrop(d);
    }
  });

  const drop = document.getElementById(`filter-${type}`);
  if (!drop) {
    return;
  }

  if (drop.classList.contains('open')) {
    _closeFilterDrop(drop);
    if (_filterCloseCtrl) {
      _filterCloseCtrl.abort();
      _filterCloseCtrl = null;
    }
    return;
  }

  const opts = FILTER_OPTIONS[type] || [];
  drop.innerHTML = opts
    .map(
      ([val, label]) =>
        `<button class="filter-option${filters[type] === val ? ' active' : ''}"
         data-action="setFilter" data-type="${type}" data-val="${escapeHtml(val)}">
       ${escapeHtml(label)}
     </button>`
    )
    .join('');

  drop.classList.add('open');
  _parkFilterDrop(drop);

  // Cancel any stale outside-click handler from a previous open cycle
  if (_filterCloseCtrl) {
    _filterCloseCtrl.abort();
    _filterCloseCtrl = null;
  }

  _filterCloseCtrl = new AbortController();
  const { signal } = _filterCloseCtrl;

  setTimeout(() => {
    function closeOutside(e) {
      const insideDrop = e.target.closest(`#filter-${type}`);
      const insideBtn = e.target.closest(`[data-action="toggleFilter"][data-type="${type}"]`);
      if (!insideDrop && !insideBtn) {
        _closeFilterDrop(drop);
        if (_filterCloseCtrl) {
          _filterCloseCtrl.abort();
          _filterCloseCtrl = null;
        }
      }
    }
    document.addEventListener('click', closeOutside, { signal });
  }, 50);
}

function setFilter(type, val) {
  // The clicked option may live in a drop parked on <body>; drop it before the
  // re-render recreates the in-card drop, so no orphan/id-collision lingers.
  _cleanupParkedFilters();
  filters[type] = val;
  pageState[type] = 1; // reset to first page on filter change
  refreshActiveView();
}

// ── Global Event Delegation ───────────────────────────────────────────────────
document.addEventListener('click', async e => {
  const btn = e.target.closest('[data-action]');
  if (!btn) {
    return;
  }

  // FIX #6: Search results carry a data-nav attribute pointing to the view that
  // owns the record. Navigate there first so the correct view is rendered behind
  // the detail modal, and clear the search field so the user doesn't need to.
  if (btn.dataset.nav) {
    navigate(btn.dataset.nav);
    const searchInput = document.getElementById('search-input');
    if (searchInput) {
      searchInput.value = '';
      const clearBtn = document.querySelector('#search-wrap button[aria-label]');
      if (clearBtn) {
        clearBtn.style.display = 'none';
      }
    }
  }

  const action = btn.dataset.action;
  const id = btn.dataset.id;
  const type = btn.dataset.type;
  const val = btn.dataset.val;
  const title = btn.dataset.title;
  const sub = btn.dataset.sub;
  const idx = btn.dataset.idx;
  const col = btn.dataset.col;

  switch (action) {
    // ── Modal ─────────────────────────────────────────────────────────────────
    case 'closeModal':
      closeModal();
      break;

    // ── Navigation ────────────────────────────────────────────────────────────
    case 'navSales':
      navigate('sales');
      break;

    // ── Sales Orders ──────────────────────────────────────────────────────────
    case 'addSO':
      showAddSO();
      break;
    case 'viewSO':
      viewSO(id);
      break;
    case 'editSO':
      editSO(id);
      break;
    case 'deleteSO':
      deleteSO(id);
      break;

    // ── Purchase Orders ───────────────────────────────────────────────────────
    case 'addPO':
      showAddPO();
      break;
    case 'viewPO':
      viewPO(id);
      break;
    case 'editPO':
      editPO(id);
      break;
    case 'deletePO':
      deletePO(id);
      break;

    // ── Inventory ─────────────────────────────────────────────────────────────
    case 'addItem':
      showAddItem();
      break;
    case 'viewItem':
      viewItem(id);
      break;
    case 'stockCard':
      showStockCard(id);
      break;
    case 'editItem':
      editItem(id);
      break;
    case 'deleteItem':
      deleteItem(id);
      break;

    // ── Delivery Orders ───────────────────────────────────────────────────────
    case 'addDO':
      showAddDO();
      break;
    case 'viewDO':
      viewDO(id);
      break;
    case 'editDO':
      editDO(id);
      break;
    case 'deleteDO':
      deleteDO(id);
      break;

    // FIX #2: Fleet & Expedition CRUD — previously defined in erp-crud.js but
    // never wired up to any UI action. Now routed from the Logistics view.
    case 'addFleet':
      showAddFleet();
      break;
    case 'editFleet':
      editFleet(id);
      break;
    case 'deleteFleet':
      deleteFleet(id);
      break;
    case 'addExpedition':
      showAddExpedition();
      break;
    case 'editExpedition':
      editExpedition(id);
      break;
    case 'deleteExpedition':
      deleteExpedition(id);
      break;

    // ── Customers (Master Data) ───────────────────────────────────────────────
    case 'addCustomer':
      showAddCustomer();
      break;
    case 'viewCustomer':
      viewCustomer(id);
      break;
    case 'custStatement':
      showPartyStatement('customer', id);
      break;
    case 'editCustomer':
      editCustomer(id);
      break;
    case 'deleteCustomer':
      deleteCustomer(id);
      break;

    // ── Suppliers (Master Data) ───────────────────────────────────────────────
    case 'addSupplier':
      showAddSupplier();
      break;
    case 'viewSupplier':
      viewSupplier(id);
      break;
    case 'suppStatement':
      showPartyStatement('supplier', id);
      break;
    case 'editSupplier':
      editSupplier(id);
      break;
    case 'deleteSupplier':
      deleteSupplier(id);
      break;

    // ── Filters ───────────────────────────────────────────────────────────────
    case 'toggleFilter':
      toggleFilter(type);
      break;
    case 'setFilter':
      setFilter(type, val);
      break;
    // FIX (clear filter): dismiss an active filter without opening the dropdown
    case 'clearFilter':
      e.stopPropagation(); // prevent the click from re-opening the dropdown
      filters[type] = 'all';
      pageState[type] = 1;
      refreshActiveView();
      break;

    // ── Sorting ───────────────────────────────────────────────────────────────
    // FIX (sortable tables): route column header clicks to sortCol()
    case 'sortCol':
      sortCol(type, col);
      break;

    // ── Export CSV ────────────────────────────────────────────────────────────
    // FIX (export CSV)
    case 'exportCSV':
      exportCSV(type);
      break;
    case 'exportXLSX':
      exportXLSX(type);
      break;
    case 'importXLSX':
      if (typeof window.importModuleExcel === 'function') {
        window.importModuleExcel(type);
      }
      break;
    case 'importRekap':
      if (window.RekapImport && typeof window.RekapImport.open === 'function') {
        window.RekapImport.open();
      }
      break;
    case 'exportRekap':
      if (window.RekapExport && typeof window.RekapExport.open === 'function') {
        window.RekapExport.open();
      }
      break;
    case 'resolveCorrection': {
      // Office side of the field-operator correction loop: the note stays on the
      // record as history, only the open flag is cleared.
      const d = DB.deliveryOrders.find(x => String(x.id) === String(id));
      if (d) {
        d.needsCorrection = false;
        d.correctionResolvedAt = new Date().toISOString();
        saveDB();
        closeModal();
        invalidateView('logistics');
        navigate(activeView);
        showToast(`Koreksi ${docNum(d.number, d.id)} ditandai selesai`, 'success');
      }
      break;
    }
    case 'printSummary':
      if (typeof window.printOrderSummary === 'function') {
        window.printOrderSummary(type);
      }
      break;

    // ── Notifications ─────────────────────────────────────────────────────────
    case 'markAllRead':
      markAllRead();
      break;
    case 'readNotif':
      readNotif(id);
      break;

    // ── Finance reports ───────────────────────────────────────────────────────
    case 'openFinance': {
      const r = _financeReports[parseInt(idx, 10)];
      if (r) {
        showFinanceDetail(r.title, r.items);
      }
      break;
    }
    case 'openReport': {
      const r = _reportCatalog[parseInt(idx, 10)];
      if (r) {
        showFinanceDetail(r.title, r.items);
      }
      break;
    }

    // ── Settings panels ───────────────────────────────────────────────────────────
    case 'openSettings':
      showSettingPanel(title, sub);
      break;
    case 'editTaxSettings':
      showTaxSettings();
      break;
    case 'manageUsers':
      showUserManagement();
      break;
    case 'manageItemCategories':
      showItemCategories();
      break;
    case 'manageUnits':
      showUnitSettings();
      break;
    case 'editAccounts':
      editAccounts();
      break;
    case 'resetDB':
      resetDB();
      break;

    // ── Security & Authentication ─────────────────────────────────────────────
    case 'logout':
      if (confirm('Keluar dari sistem?')) {
        window.erpAuth.logout();
      }
      break;

    // ── Pagination ────────────────────────────────────────────────────────────
    case 'pageNav': {
      const v = btn.dataset.view;
      const p = parseInt(btn.dataset.page, 10);
      console.log('[Pagination] Clicked:', { view: v, page: p, currentPage: pageState[v] });

      if (!v) {
        console.error('[Pagination] No view specified');
        break;
      }

      if (!p || p < 1) {
        console.error('[Pagination] Invalid page number:', p);
        break;
      }

      pageState[v] = p;
      refreshActiveView();
      break;
    }

    // ── Assets ────────────────────────────────────────────────────────────────
    case 'addAsset':
      showAddAsset();
      break;
    case 'viewAsset':
      viewAsset(id);
      break;
    case 'editAsset':
      editAsset(id);
      break;
    case 'deleteAsset':
      deleteAsset(id);
      break;
    case 'addAssetCategory':
      showAddAssetCategory();
      break;
    case 'addAssetFiscalCategory':
      showAddAssetFiscalCategory();
      break;
    case 'addAssetTransfer':
      showAddAssetTransfer();
      break;
    case 'addAssetDisposal':
      showAddAssetDisposal();
      break;

    // ── Date range filter ─────────────────────────────────────────────────────
    case 'clearDateFilter':
      dateFilters[type] = { from: '', to: '' };
      refreshActiveView();
      break;

    // ── Print ─────────────────────────────────────────────────────────────────
    case 'printSO': {
      const o = DB.salesOrders.find(o => o.id === id);
      if (o) {
        printDocument('SO', o);
      }
      break;
    }
    case 'printPO': {
      const o = DB.purchaseOrders.find(o => o.id === id);
      if (o) {
        printDocument('PO', o);
      }
      break;
    }
    case 'exportPOForm':
      if (window.RekapExport && typeof window.RekapExport.exportPO === 'function') {
        window.RekapExport.exportPO(id);
      }
      break;
    case 'printDO': {
      const o = DB.deliveryOrders.find(o => o.id === id);
      if (o) {
        printDocument('DO', o);
      }
      break;
    }

    // ── Backup / Restore ──────────────────────────────────────────────────────
    case 'exportBackup': {
      const json = JSON.stringify(DB, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `erp-backup-${today()}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showToast('Backup berhasil diunduh', 'success');
      break;
    }

    // ── Bulk selection (Sales) ───────────────────────────────────────────────
    case 'clearSOSelection':
      if (typeof window.soSelection !== 'undefined' && window.soSelection) {
        window.soSelection.clear();

        // Force uncheck all checkboxes immediately
        document.querySelectorAll('.so-check').forEach(cb => {
          cb.checked = false;
        });

        // Update bulk bar
        if (typeof window.updateBulkBar === 'function') {
          window.updateBulkBar();
        }

        // Then navigate to refresh the view
        navigate(activeView);
      } else {
        console.warn('soSelection not found');
      }
      break;
    case 'bulkSOStatus':
      if (typeof window.bulkSOStatus === 'function') {
        window.bulkSOStatus(btn.dataset.status);
      } else if (typeof bulkSOStatus === 'function') {
        bulkSOStatus(btn.dataset.status);
      }
      break;

    default:
      break;
  }
});

// ── Global Search ─────────────────────────────────────────────────────────────
// Called by the search-input listeners in _initViewListeners(). Searches the
// in-memory DB across the main collections and renders grouped, clickable results
// in a modal. Each result row carries data-nav (view to render behind the modal)
// plus data-action/data-id (the detail handler) — both consumed by the global
// click delegation defined above. Previously this function was referenced but
// never defined, so typing in the search bar threw a ReferenceError and did
// nothing.
function handleSearch(query) {
  const q = String(query == null ? '' : query)
    .toLowerCase()
    .trim();
  const open = window.openModal || (typeof openModal === 'function' ? openModal : null);
  if (!open) {
    return;
  }
  if (q.length < 2) {
    return;
  }

  const esc = window.escapeHtml || (s => String(s == null ? '' : s));
  const money = v => (typeof window.idrFull === 'function' ? window.idrFull(v) : 'Rp ' + (v || 0));
  const db = window.DB || {};
  const LIMIT = 8;
  const match = (...vals) => vals.some(v => v != null && String(v).toLowerCase().includes(q));

  const groups = [];

  const so = (db.salesOrders || [])
    .filter(o => match(o.number, o.customerName, o.id, o.notes, o.status))
    .slice(0, LIMIT)
    .map(o => ({
      action: 'viewSO',
      nav: 'sales',
      id: o.id,
      title: docNum(o.number, o.id),
      sub: [o.customerName, o.status].filter(Boolean).join(' · '),
      right: money(o.total != null ? o.total : o.amount),
    }));
  if (so.length) {
    groups.push({ label: 'Sales Order', rows: so });
  }

  const po = (db.purchaseOrders || [])
    .filter(o => match(o.number, o.supplierName, o.id, o.notes, o.status))
    .slice(0, LIMIT)
    .map(o => ({
      action: 'viewPO',
      nav: 'purchase',
      id: o.id,
      title: docNum(o.number, o.id),
      sub: [o.supplierName, o.status].filter(Boolean).join(' · '),
      right: money(o.total != null ? o.total : o.amount),
    }));
  if (po.length) {
    groups.push({ label: 'Purchase Order', rows: po });
  }

  const items = (db.inventoryItems || [])
    .filter(i => match(i.name, i.sku, i.id, i.category))
    .slice(0, LIMIT)
    .map(i => ({
      action: 'viewItem',
      nav: 'inventory',
      id: i.id,
      title: i.name || i.id,
      sub: [i.sku, i.category].filter(Boolean).join(' · '),
      right: 'Stok: ' + (Number(i.stock) || 0) + ' ' + (i.unit || ''),
    }));
  if (items.length) {
    groups.push({ label: 'Barang', rows: items });
  }

  const customers = (db.customers || [])
    .filter(c => match(c.name, c.phone, c.email, c.id))
    .slice(0, LIMIT)
    .map(c => ({
      action: 'viewCustomer',
      nav: 'master',
      id: c.id,
      title: c.name || c.id,
      sub: [c.phone, c.email].filter(Boolean).join(' · '),
      right: '',
    }));
  if (customers.length) {
    groups.push({ label: 'Pelanggan', rows: customers });
  }

  const suppliers = (db.suppliers || [])
    .filter(s => match(s.name, s.phone, s.email, s.id))
    .slice(0, LIMIT)
    .map(s => ({
      action: 'viewSupplier',
      nav: 'master',
      id: s.id,
      title: s.name || s.id,
      sub: [s.phone, s.email].filter(Boolean).join(' · '),
      right: '',
    }));
  if (suppliers.length) {
    groups.push({ label: 'Supplier', rows: suppliers });
  }

  const total = groups.reduce((n, g) => n + g.rows.length, 0);

  let body;
  if (total === 0) {
    body = `<div style="padding:24px 8px;text-align:center;color:var(--muted)">
      Tidak ada hasil untuk "<strong>${esc(query)}</strong>".
    </div>`;
  } else {
    body = groups
      .map(g => {
        const rows = g.rows
          .map(
            r => `<button type="button"
              data-action="${r.action}" data-nav="${r.nav}" data-id="${esc(r.id)}"
              style="display:flex;align-items:center;gap:12px;width:100%;text-align:left;
                background:none;border:none;border-bottom:1px solid var(--border);
                padding:10px 4px;cursor:pointer">
              <span style="flex:1;min-width:0">
                <span style="display:block;font-weight:700;color:var(--ink);font-size:13px">${esc(r.title)}</span>
                <span style="display:block;color:var(--muted);font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(r.sub)}</span>
              </span>
              <span style="flex-shrink:0;color:var(--muted);font-size:12px;font-variant-numeric:tabular-nums">${esc(r.right)}</span>
            </button>`
          )
          .join('');
        return `<div style="margin-bottom:14px">
          <div style="font-size:11px;font-weight:800;letter-spacing:.04em;text-transform:uppercase;color:var(--muted);margin-bottom:4px">${esc(g.label)}</div>
          ${rows}
        </div>`;
      })
      .join('');
  }

  open(`Hasil pencarian: "${query}"`, body, '', true);
}

// ── Initialisation ────────────────────────────────────────────────────────────
// NOTE: loadDB() and navigate('dashboard') are called by main.js (ES module).
// This script is loaded as a classic script AFTER DOMContentLoaded has fired,
// so we run init code immediately (no DOMContentLoaded wrapper needed).
// We do NOT call loadDB() or navigate() again to avoid double-init.

(function _initViewListeners() {
  // ── Search: Enter key + 400 ms debounce on typing ──────────────────────────
  // FIX (clear search): inject a × clear button next to the search input so
  // the user can reset the field without reaching for the keyboard.
  const searchBox = document.getElementById('search-wrap');
  const searchInput = document.getElementById('search-input');
  if (searchInput) {
    // Inject clear button
    const clearBtn = document.createElement('button');
    clearBtn.type = 'button';
    clearBtn.style.cssText = [
      'display:none',
      'background:none',
      'border:none',
      'cursor:pointer',
      'color:var(--muted)',
      'font-size:15px',
      'line-height:1',
      'padding:0 2px',
      'flex-shrink:0',
    ].join(';');
    clearBtn.setAttribute('aria-label', 'Hapus pencarian');
    clearBtn.textContent = '×';
    if (searchBox) searchBox.appendChild(clearBtn);

    function syncClearBtn() {
      clearBtn.style.display = searchInput.value ? 'block' : 'none';
    }

    clearBtn.addEventListener('click', () => {
      searchInput.value = '';
      syncClearBtn();
      searchInput.focus();
    });

    let debounceTimer;

    searchInput.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        clearTimeout(debounceTimer);
        handleSearch(e.target.value.trim());
      }
    });

    searchInput.addEventListener('input', e => {
      syncClearBtn();
      clearTimeout(debounceTimer);
      const q = e.target.value.trim();
      if (q.length >= 3) {
        debounceTimer = setTimeout(() => handleSearch(q), 400);
      }
    });

    // Global "/" shortcut focuses search (ignored while typing in a field).
    document.addEventListener('keydown', e => {
      if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey) {
        return;
      }
      const tag = (document.activeElement && document.activeElement.tagName) || '';
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(tag) || document.activeElement?.isContentEditable) {
        return;
      }
      e.preventDefault();
      searchInput.focus();
    });
  }

  // ── Notification bell ───────────────────────────────────────────────────────
  const notifBtn = document.querySelector('.notif');
  if (notifBtn) {
    notifBtn.addEventListener('click', e => {
      if (e.target.closest('[data-action]')) {
        return;
      }
      if (e.target.closest('.notif-panel')) {
        return;
      }
      toggleNotifPanel();
    });
  }

  // ── Date filter inputs (change event, not click) ────────────────────────────
  document.addEventListener('change', e => {
    const inp = e.target;
    const el = e.target;

    // Date filter handlers (from erp-view.js)
    if (inp.dataset.action === 'setDateFrom') {
      const v = inp.dataset.view;
      if (dateFilters[v]) {
        dateFilters[v].from = inp.value;
        pageState[v] = 1;
        refreshActiveView();
      }
    } else if (inp.dataset.action === 'setDateTo') {
      const v = inp.dataset.view;
      if (dateFilters[v]) {
        dateFilters[v].to = inp.value;
        pageState[v] = 1;
        refreshActiveView();
      }
    } else if (inp.dataset.action === 'importBackup') {
      const file = inp.files && inp.files[0];
      if (!file) {
        return;
      }
      const reader = new FileReader();
      reader.onload = ev => {
        try {
          const parsed = JSON.parse(ev.target.result);
          if (!parsed || typeof parsed !== 'object') {
            throw new Error('Bukan file JSON yang valid');
          }
          const knownKeys = [
            'salesOrders',
            'purchaseOrders',
            'inventoryItems',
            'deliveryOrders',
            'customers',
            'suppliers',
            'accounts',
            'paymentLogs',
            'reservations',
          ];
          if (!knownKeys.some(k => k in parsed)) {
            throw new Error('File backup tidak terlihat sebagai backup ERP yang valid');
          }
          if (!confirm('Impor backup akan menggantikan seluruh data yang ada. Lanjutkan?')) {
            return;
          }
          DB = typeof normalizeImportedDB === 'function' ? normalizeImportedDB(parsed) : parsed;
          saveDB();
          navigate(activeView);
          showToast('Backup berhasil diimpor', 'success');
        } catch (err) {
          showToast('Gagal mengimpor: ' + err.message, 'danger');
        }
      };
      reader.readAsText(file);
    }

    // Inline status and checkbox handlers (from erp-patch.js) - merged to avoid duplicate listeners
    if (el.dataset && el.dataset.action) {
      const action = el.dataset.action;
      const id = el.dataset.id;

      if (action === 'inlineSOStatus') {
        if (typeof inlineSOStatus === 'function') {
          inlineSOStatus(id, el.value);
        }
      } else if (action === 'toggleSOCheck') {
        if (typeof soSelection !== 'undefined') {
          if (el.checked) {
            soSelection.add(id);
          } else {
            soSelection.delete(id);
          }
          if (typeof updateBulkBar === 'function') {
            updateBulkBar();
          }
        }
      } else if (action === 'checkAllSO') {
        if (typeof soSelection !== 'undefined') {
          const checked = el.checked;
          document.querySelectorAll('.so-check').forEach(cb => {
            const cbId = cb.dataset.id;
            if (checked) {
              soSelection.add(cbId);
            } else {
              soSelection.delete(cbId);
            }
            cb.checked = checked;
          });
          if (typeof updateBulkBar === 'function') {
            updateBulkBar();
          }
        }
      }
    }
  });

  if (typeof updateNotifDot === 'function') updateNotifDot();
})();

// ═══════════════════════════════════════════════════════════════════════════════
// MERGED FROM erp-patch.js (2026-06-10) — view-layer pieces
// renderSales (checkbox column + inline status + bulk bar) and the Hutang
// Aging section (called directly from renderFinance above, replacing the old
// monkey-patch wrapper).
// ═══════════════════════════════════════════════════════════════════════════════
// § 11  OVERRIDE: renderSales — checkbox column + inline status + bulk bar
// ════════════════════════════════════════════════════════════════════════════════

function renderSales() {
  const f = filters.sales;
  const now = new Date();
  const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const MONTH_NAMES = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'Mei',
    'Jun',
    'Jul',
    'Agu',
    'Sep',
    'Okt',
    'Nov',
    'Des',
  ];
  const monthLabel = `${MONTH_NAMES[now.getMonth()]} ${now.getFullYear()}`;

  let orders = f === 'all' ? DB.salesOrders : DB.salesOrders.filter(o => o.status === f);
  orders = applyDateFilter(orders, 'sales');
  orders = applySorted(orders, 'sales');

  const _isInvoice = o => !o._type || o._type === 'invoice';
  const invoices = DB.salesOrders.filter(o => _isInvoice(o) && o.status !== 'Draft' && o.status !== 'Cancelled');
  const thisMthOrders = invoices.filter(o => o.date && o.date.startsWith(thisMonth));
  const totalVal = invoices.reduce((s, o) => s + (o.amount || 0), 0);
  const thisMthVal = thisMthOrders.reduce((s, o) => s + (o.amount || 0), 0);
  const pendingCnt = invoices.filter(o => o.status === 'Confirmed').length;
  const unpaidVal = invoices
    .filter(o => o.status === 'Confirmed' || o.status === 'Delivered')
    .reduce((s, o) => s + (o.owing != null ? o.owing : Math.max(0, (o.amount || 0) - (o.paid || 0))), 0);

  const totalFiltered = orders.length;
  const paged = applyPage(orders, 'sales');

  // "Select all on this page" state
  const allPageChecked = paged.length > 0 && paged.every(o => soSelection.has(o.id));

  const bulkBar = `
  <div id="bulkBar" style="display:${soSelection.size > 0 ? 'flex' : 'none'};
    align-items:center;gap:8px;flex-wrap:wrap;padding:10px 14px;
    background:var(--bg);border:1.5px solid var(--primary);border-radius:10px;
    margin-bottom:10px">
    <span id="bulkCount" style="font-size:12px;font-weight:700;color:var(--primary)">
      ${soSelection.size} SO dipilih
    </span>
    <div style="flex:1"></div>
    <span style="font-size:11px;color:var(--muted)">Ubah semua ke:</span>
    ${SO_STATUSES.map(
      ([v, l]) =>
        `<button class="btn-ghost" data-action="bulkSOStatus" data-status="${v}"
         style="font-size:11px;padding:4px 10px">${escapeHtml(l)}</button>`
    ).join('')}
    <button class="btn-ghost" data-action="clearSOSelection"
      style="font-size:11px;padding:4px 10px;color:#FF3B30">✕ Batal</button>
  </div>`;

  const tableRows =
    paged.length === 0
      ? emptyRow(7, 'sales')
      : paged
          .map(o => {
            const checked = soSelection.has(o.id) ? 'checked' : '';
            return `<tr data-action="viewSO" data-id="${escapeHtml(o.id)}">
          <td style="padding:7px 8px;text-align:center;width:32px">
            <input type="checkbox" class="so-check" data-action="toggleSOCheck"
              data-id="${escapeHtml(o.id)}" ${checked} style="cursor:pointer;width:14px;height:14px">
          </td>
          <td class="td-p" style="font-size:11px;font-weight:700;color:var(--primary)">${escapeHtml(docNum(o.number, o.id))}</td>
          <td class="td-p" style="font-size:13px;font-weight:600">${escapeHtml(o.customer)}</td>
          <td class="td-p" style="font-size:11px;color:var(--muted)">${escapeHtml(o.date)}</td>
          <td class="td-p" style="font-size:13px;font-weight:800">${idr(o.amount)}</td>
          <td class="td-p" style="padding:4px 8px">
            <select class="form-select" data-action="inlineSOStatus" data-id="${escapeHtml(o.id)}"
              style="font-size:11px;padding:4px 8px;min-width:130px;cursor:pointer">
              ${SO_STATUSES.filter(
                ([v]) =>
                  v === o.status ||
                  (window.DocEngine && window.DocEngine.canTransition('SO', o.status, v))
              )
                .map(
                  ([v, l]) =>
                    `<option value="${v}"${o.status === v ? ' selected' : ''}>${escapeHtml(l)}</option>`
                )
                .join('')}
            </select>
          </td>
          <td class="td-p">${actionBtns('SO', o.id)}</td>
        </tr>`;
          })
          .join('');

  return `
  ${secHdr('Penjualan', 'Kelola sales order, invoice, dan piutang', 'Buat SO Baru', 'addSO')}
  ${statRow([
    { label: 'SO Bulan Ini', value: String(thisMthOrders.length), sub: monthLabel },
    { label: 'Nilai Bulan Ini', value: idr(thisMthVal), sub: `Total all-time: ${idr(totalVal)}` },
    {
      label: 'Menunggu Pengiriman',
      value: `${pendingCnt} SO`,
      sub: 'Status Confirmed',
      color: '#FF9F0A',
    },
    {
      label: 'Piutang Belum Lunas',
      value: idr(unpaidVal),
      sub: 'Confirmed + Delivered',
      color: '#FF3B30',
    },
  ])}
  <div class="card">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
      <div style="font-size:14px;font-weight:700">Daftar Sales Order</div>
      <div style="display:flex;align-items:center;gap:8px">
        ${summaryBtn('sales')}
        ${importBtn('sales')}
        ${exportBtn('sales')}
        ${filterBtn('sales')}
      </div>
    </div>
    <div style="margin-bottom:12px">${dateFilterBar('sales')}</div>
    ${bulkBar}
    <div class="table-wrap">
      <table>
        <thead><tr>
          <th style="width:32px;padding:8px;text-align:center">
            <input type="checkbox" id="checkAllSO" data-action="checkAllSO"
              ${allPageChecked ? 'checked' : ''}
              style="cursor:pointer;width:14px;height:14px"
              title="Pilih/batalkan semua di halaman ini">
          </th>
          ${sortTh('No. SO', 'sales', 'id')}
          ${sortTh('Pelanggan', 'sales', 'customer')}
          ${sortTh('Tanggal', 'sales', 'date')}
          ${sortTh('Total', 'sales', 'amount')}
          <th>Status</th>
          <th>Aksi</th>
        </tr></thead>
        <tbody>${tableRows}</tbody>
      </table>
    </div>
    ${pagerHTML(totalFiltered, 'sales')}
  </div>`;
}

// ════════════════════════════════════════════════════════════════════════════════
// § 12  HUTANG AGING — append to Finance view
// ════════════════════════════════════════════════════════════════════════════════

function _hutangAgingSection() {
  const hutangList = DB.purchaseOrders.filter(o => o.status === 'Confirmed');
  const hutangTotal = hutangList.reduce((s, o) => s + (o.amount || 0), 0);
  const todayMs = Date.now();
  const buckets = { b0: [], b30: [], b60: [] };
  hutangList.forEach(o => {
    const days = Math.floor((todayMs - new Date(o.date).getTime()) / 86400000);
    if (days <= 30) {
      buckets.b0.push({ ...o, days });
    } else if (days <= 60) {
      buckets.b30.push({ ...o, days });
    } else {
      buckets.b60.push({ ...o, days });
    }
  });

  const bucketCards = [
    { label: '0–30 Hari', list: buckets.b0, color: '#34C759' },
    { label: '31–60 Hari', list: buckets.b30, color: '#FF9F0A' },
    { label: '>60 Hari (Prioritas)', list: buckets.b60, color: '#FF3B30' },
  ];

  const agingGrid = `
  <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:16px">
    ${bucketCards
      .map(b => {
        const val = b.list.reduce((s, o) => s + (o.amount || 0), 0);
        const active = b.list.length > 0;
        return `<div style="background:var(--bg);border-radius:8px;padding:12px;
                border:1.5px solid ${active ? b.color : 'var(--border)'}">
        <div style="font-size:11px;font-weight:700;color:${b.color};margin-bottom:6px">${escapeHtml(b.label)}</div>
        <div style="font-size:22px;font-weight:800;color:${active ? b.color : 'var(--muted)'}">${b.list.length}<span style="font-size:13px;font-weight:500"> PO</span></div>
        <div style="font-size:11px;color:var(--muted);margin-top:3px">${idr(val)}</div>
      </div>`;
      })
      .join('')}
  </div>`;

  const tableHtml =
    hutangList.length === 0
      ? `<div style="text-align:center;font-size:13px;color:var(--muted);padding:20px 0">
         ✓ Semua PO ke supplier sudah lunas
       </div>`
      : `<div class="table-wrap"><table>
        <thead><tr>
          <th>No. PO</th>
          <th>Supplier</th>
          <th>Tanggal</th>
          <th style="text-align:right">Total</th>
          <th style="text-align:center">Umur</th>
          <th>Aksi</th>
        </tr></thead>
        <tbody>
          ${[...buckets.b60, ...buckets.b30, ...buckets.b0]
            .map(o => {
              const ageColor = o.days > 60 ? '#FF3B30' : o.days > 30 ? '#FF9F0A' : '#34C759';
              return `<tr data-action="viewPO" data-id="${escapeHtml(o.id)}">
              <td class="td-p" style="font-size:11px;font-weight:700;color:var(--primary)">${escapeHtml(docNum(o.number, o.id))}</td>
              <td class="td-p" style="font-size:13px;font-weight:600">${escapeHtml(o.supplier)}</td>
              <td class="td-p" style="font-size:11px;color:var(--muted)">${escapeHtml(o.date)}</td>
              <td class="td-p" style="font-size:13px;font-weight:800;text-align:right">${idr(o.amount)}</td>
              <td class="td-p" style="text-align:center">
                <span style="font-weight:700;color:${ageColor};font-size:12px">${o.days}h</span>
              </td>
              <td class="td-p">${actionBtns('PO', o.id)}</td>
            </tr>`;
            })
            .join('')}
        </tbody>
      </table></div>`;

  return `
  <div class="card" style="margin-top:0">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:14px">
      <div>
        <div style="font-size:14px;font-weight:700">Hutang ke Supplier — Aging Analysis</div>
        <div style="font-size:11px;color:var(--muted);margin-top:2px">
          ${hutangList.length} PO status <em>Confirmed</em> belum dilunasi · Total hutang: ${idr(hutangTotal)}
        </div>
      </div>
      ${
        hutangTotal > 0
          ? `<div style="font-size:16px;font-weight:800;color:#FF9F0A">${idr(hutangTotal)}</div>`
          : ''
      }
    </div>
    ${agingGrid}
    ${tableHtml}
  </div>`;
}

// ════════════════════════════════════════════════════════════════════════════════
// § 12b  PIUTANG AGING (AR) — receivables by age, the counterpart to hutang aging
// ────────────────────────────────────────────────────────────────────────────────
// Based on Faktur Penjualan (salesInvoices) that aren't yet fully paid, netting any
// receipts (salesReceipts) and using the grand total (DPP + PPN). Bucketed by the
// faktur's age into 0–30 / 31–60 / 61–90 / >90 days.
// ════════════════════════════════════════════════════════════════════════════════

function _piutangAgingSection() {
  const PAID = new Set(['Paid', 'Lunas', 'Cancelled', 'Void']);
  const receipts = DB.salesReceipts || [];
  const grand = i => {
    const amt = Number(i.amount) || 0;
    return i.taxInclusive ? amt : amt + (Number(i.tax) || 0);
  };
  const paidOf = i =>
    receipts
      .filter(r => r.invoiceId === i.id && (r.status === 'Posted' || !r.status))
      .reduce((s, r) => s + (Number(r.amount) || 0), 0);

  const todayMs = Date.now();
  const rows = (DB.salesInvoices || [])
    .filter(i => !PAID.has(i.status))
    .map(i => {
      const bal = Math.max(0, grand(i) - paidOf(i));
      const days = Math.floor((todayMs - new Date(i.date).getTime()) / 86400000);
      return { ...i, bal, days };
    })
    .filter(r => r.bal > 0.5);

  const piutangTotal = rows.reduce((s, r) => s + r.bal, 0);
  const buckets = { b0: [], b30: [], b60: [], b90: [] };
  rows.forEach(r => {
    if (r.days <= 30) {
      buckets.b0.push(r);
    } else if (r.days <= 60) {
      buckets.b30.push(r);
    } else if (r.days <= 90) {
      buckets.b60.push(r);
    } else {
      buckets.b90.push(r);
    }
  });

  const bucketCards = [
    { label: '0–30 Hari', list: buckets.b0, color: '#34C759' },
    { label: '31–60 Hari', list: buckets.b30, color: '#FFCC00' },
    { label: '61–90 Hari', list: buckets.b60, color: '#FF9F0A' },
    { label: '>90 Hari (Prioritas)', list: buckets.b90, color: '#FF3B30' },
  ];

  const agingGrid = `
  <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:16px">
    ${bucketCards
      .map(b => {
        const val = b.list.reduce((s, r) => s + r.bal, 0);
        const active = b.list.length > 0;
        return `<div style="background:var(--bg);border-radius:8px;padding:12px;
                border:1.5px solid ${active ? b.color : 'var(--border)'}">
        <div style="font-size:11px;font-weight:700;color:${b.color};margin-bottom:6px">${escapeHtml(b.label)}</div>
        <div style="font-size:22px;font-weight:800;color:${active ? b.color : 'var(--muted)'}">${b.list.length}<span style="font-size:13px;font-weight:500"> Faktur</span></div>
        <div style="font-size:11px;color:var(--muted);margin-top:3px">${idr(val)}</div>
      </div>`;
      })
      .join('')}
  </div>`;

  const tableHtml =
    rows.length === 0
      ? `<div style="text-align:center;font-size:13px;color:var(--muted);padding:20px 0">
         ✓ Tidak ada piutang Faktur Penjualan yang belum lunas
       </div>`
      : `<div class="table-wrap"><table>
        <thead><tr>
          <th>No. Faktur</th>
          <th>Pelanggan</th>
          <th>Tanggal</th>
          <th style="text-align:right">Sisa Tagihan</th>
          <th style="text-align:center">Umur</th>
          <th>Aksi</th>
        </tr></thead>
        <tbody>
          ${[...buckets.b90, ...buckets.b60, ...buckets.b30, ...buckets.b0]
            .map(r => {
              const ageColor =
                r.days > 90
                  ? '#FF3B30'
                  : r.days > 60
                    ? '#FF9F0A'
                    : r.days > 30
                      ? '#FFCC00'
                      : '#34C759';
              const viewBtn =
                typeof window.rowActionBtn === 'function'
                  ? window.rowActionBtn('view', 'invView', r.id, 'SI')
                  : '';
              return `<tr data-action="invView" data-id="${escapeHtml(r.id)}" data-type="SI" style="cursor:pointer">
              <td class="td-p" style="font-size:11px;font-weight:700;color:var(--primary)">${escapeHtml(docNum(r.number, r.id))}</td>
              <td class="td-p" style="font-size:13px;font-weight:600">${escapeHtml(r.customer || '—')}</td>
              <td class="td-p" style="font-size:11px;color:var(--muted)">${escapeHtml(r.date)}</td>
              <td class="td-p" style="font-size:13px;font-weight:800;text-align:right">${idr(r.bal)}</td>
              <td class="td-p" style="text-align:center">
                <span style="font-weight:700;color:${ageColor};font-size:12px">${r.days}h</span>
              </td>
              <td class="td-p">${viewBtn}</td>
            </tr>`;
            })
            .join('')}
        </tbody>
      </table></div>`;

  return `
  <div class="card" style="margin-top:0">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:14px">
      <div>
        <div style="font-size:14px;font-weight:700">Piutang Pelanggan — Aging Analysis</div>
        <div style="font-size:11px;color:var(--muted);margin-top:2px">
          ${rows.length} Faktur Penjualan belum lunas · Total piutang: ${idr(piutangTotal)}
        </div>
      </div>
      ${piutangTotal > 0 ? `<div style="font-size:16px;font-weight:800;color:#0A84FF">${idr(piutangTotal)}</div>` : ''}
    </div>
    ${agingGrid}
    ${tableHtml}
  </div>`;
}

// Wrap the original renderFinance to inject the hutang aging section at the end.
