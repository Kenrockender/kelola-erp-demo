// ── Dashboard state ──────────────────────────────────────────────────────────
var _dashMonthOffset = 0;
var _dashActiveTab = 'dashboard';

// ── Widget catalog ("+ Widget" add / hide) ───────────────────────────────────
// The dashboard widgets are toggleable. The enabled set is persisted in
// localStorage; order here is the default dashboard order. `wide` widgets take
// half a row (2-col), the rest flow 3 per row — matching the original layout.
var DASH_WIDGETS_KEY = 'nsa_dash_widgets_v1';
var DASH_WIDGET_CATALOG = [
  { id: 'activity', label: 'Aktivitas Terbaru' },
  { id: 'jatuhTempo', label: 'Jatuh Tempo' },
  { id: 'tren', label: 'Tren Bulanan' },
  { id: 'labaRugi', label: 'Laba/Rugi Tahun Ini' },
  { id: 'arusKas', label: 'Arus Kas' },
  { id: 'beban', label: 'Beban Perusahaan' },
  { id: 'penjualan', label: 'Penjualan', wide: true },
  { id: 'pembelian', label: 'Pembelian', wide: true },
];

// Returns the ordered list of enabled widget ids. Defaults to all widgets when
// nothing is saved; an explicitly-saved empty list means "all hidden".
function _getDashWidgets() {
  var all = DASH_WIDGET_CATALOG.map(function (w) {
    return w.id;
  });
  var saved = null;
  try {
    saved = JSON.parse(localStorage.getItem(DASH_WIDGETS_KEY));
  } catch (_) {
    saved = null;
  }
  if (!Array.isArray(saved)) return all.slice();
  return saved.filter(function (id) {
    return all.indexOf(id) !== -1;
  });
}

function _setDashWidgets(ids) {
  try {
    localStorage.setItem(DASH_WIDGETS_KEY, JSON.stringify(ids));
  } catch (_) {}
}

function _chunk(arr, n) {
  var out = [];
  for (var i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

// Shared tab-bar markup (Dashboard / Company Data Preparation + "+ Widget").
function _dashTabsHtml(active) {
  // The onboarding tab disappears once company data is fully prepared.
  var showPrep = !_companyPrepComplete();
  return (
    '<div class="dash-tabs">' +
    '<button class="dash-tab' +
    (active === 'dashboard' ? ' active' : '') +
    '" data-action="dashTab" data-id="dashboard">Dashboard</button>' +
    (showPrep
      ? '<button class="dash-tab' +
        (active === 'company-prep' ? ' active' : '') +
        '" data-action="dashTab" data-id="company-prep">Company Data Preparation</button>'
      : '') +
    '<div class="dash-tab-right">' +
    '<button class="widget-add-btn" data-action="addWidget">+ Widget</button>' +
    '</div>' +
    '</div>'
  );
}

function _refreshDashboard() {
  if (typeof window.invalidateView === 'function') {
    window.invalidateView('dashboard');
  }
  navigate('dashboard');
}

function destroyCharts() {
  if (typeof _chartInitTimer !== 'undefined' && _chartInitTimer !== null) {
    clearTimeout(_chartInitTimer);
    _chartInitTimer = null;
  }

  Object.values(charts).forEach(c => {
    try {
      c.destroy();
    } catch (_) {}
  });
  charts = {};
}

function initCharts() {
  if (typeof _chartInitTimer !== 'undefined' && _chartInitTimer !== null) {
    clearTimeout(_chartInitTimer);
  }
  _chartInitTimer = setTimeout(_initChartsImpl, 100);
}

function _initChartsImpl() {
  if (typeof Chart === 'undefined') {
    return;
  }
  const rc = document.getElementById('revenueChart');
  const sc = document.getElementById('stockChart');
  if (!rc || !sc || !document.body.contains(rc)) {
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
  const now = new Date();

  const hasAnyData = DB.salesOrders.length > 0 || DB.purchaseOrders.length > 0;
  const soBucket = new Map();
  const poBucket = new Map();

  if (hasAnyData) {
    for (const o of DB.salesOrders) {
      if (!o.date || o.status === 'Draft' || o.status === 'Cancelled') continue;
      if (o._type && o._type !== 'invoice') continue;
      const key = o.date.slice(0, 7);
      soBucket.set(key, (soBucket.get(key) || 0) + (o.amount || 0));
    }
    for (const o of DB.purchaseOrders) {
      if (!o.date || o.status === 'Draft' || o.status === 'Cancelled') continue;
      if (o._type && o._type !== 'invoice') continue;
      const key = o.date.slice(0, 7);
      poBucket.set(key, (poBucket.get(key) || 0) + (o.amount || 0));
    }
  }

  const revenueLabels = [];
  const revenuePenjualan = [];
  const revenuePengeluaran = [];

  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    revenueLabels.push(MONTH_NAMES_SHORT[d.getMonth()]);

    if (hasAnyData) {
      revenuePenjualan.push(Math.round((soBucket.get(key) || 0) / 1_000_000));
      revenuePengeluaran.push(Math.round((poBucket.get(key) || 0) / 1_000_000));
    } else {
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

  const stockItems = DB.inventoryItems.slice(0, 8);
  charts.stock = new Chart(sc, {
    type: 'bar',
    data: {
      labels: stockItems.map(i => (i.name.length > 14 ? i.name.slice(0, 13) + '...' : i.name)),
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

// ── Date helpers for navigation ──────────────────────────────────────────────
function _dashPeriod(offset) {
  var now = new Date();
  var MONTH_NAMES = [
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
  var target = new Date(now.getFullYear(), now.getMonth() + offset, 1);
  var y = target.getFullYear();
  var m = target.getMonth();
  var lastDay = new Date(y, m + 1, 0).getDate();
  var isCurrentMonth = offset === 0;
  var endDay = isCurrentMonth ? now.getDate() : lastDay;
  return {
    year: y,
    month: m,
    monthName: MONTH_NAMES[m],
    startDay: 1,
    endDay: endDay,
    key: y + '-' + String(m + 1).padStart(2, '0'),
    label: '1 ' + MONTH_NAMES[m] + ' - ' + endDay + ' ' + MONTH_NAMES[m] + ' ' + y,
  };
}

function _dashYTDPeriod(offset) {
  var now = new Date();
  var MONTH_NAMES = [
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
  var targetYear = now.getFullYear() + offset;
  var isCurrentYear = offset === 0;
  var endMonth = isCurrentYear ? now.getMonth() : 11;
  var endDay = isCurrentYear ? now.getDate() : 31;
  return {
    year: targetYear,
    label: '1 Jan - ' + endDay + ' ' + MONTH_NAMES[endMonth] + ' ' + targetYear,
  };
}

// ── Company Data Preparation tab content ─────────────────────────────────────
// Shared checklist so the tab visibility and the panel stay in sync.
function _companyPrepChecks() {
  var c = (DB.settings && DB.settings.company) || {};
  var u = (DB.settings && DB.settings.user) || {};
  // ensureChart() returns the (auto-seeded) chart of accounts; fall back to the
  // raw collection. The old check read GL.accounts, which never exists.
  var chart =
    typeof GL !== 'undefined' && typeof GL.ensureChart === 'function'
      ? GL.ensureChart()
      : DB.accountsChart || [];
  return [
    { label: 'Nama Perusahaan', ok: !!c.name, action: 'editIdentity' },
    { label: 'Alamat Perusahaan', ok: !!c.address, action: 'editIdentity' },
    { label: 'Telepon Perusahaan', ok: !!c.phone, action: 'editIdentity' },
    { label: 'Nama Pengguna', ok: !!u.name, action: 'editIdentity' },
    { label: 'Jabatan / Peran', ok: !!u.role, action: 'editIdentity' },
    { label: 'Mata Uang Default', ok: true },
    { label: 'Chart of Accounts', ok: !!(chart && chart.length > 0) },
    { label: 'Data Pelanggan', ok: !!(DB.customers && DB.customers.length > 0) },
    { label: 'Data Supplier', ok: !!(DB.suppliers && DB.suppliers.length > 0) },
    { label: 'Data Produk / Item', ok: !!(DB.inventoryItems && DB.inventoryItems.length > 0) },
  ];
}

// True once every preparation item is satisfied — used to hide the onboarding tab.
function _companyPrepComplete() {
  return _companyPrepChecks().every(function (c) {
    return c.ok;
  });
}

function _renderCompanyPrep() {
  var checks = _companyPrepChecks();
  var done = checks.filter(function (c) {
    return c.ok;
  }).length;
  var pct = Math.round((done / checks.length) * 100);

  return (
    '<div class="widget-card" style="max-width:600px;margin:0 auto">' +
    '<div class="widget-header"><div class="widget-title">Kesiapan Data Perusahaan</div></div>' +
    '<div style="margin-bottom:16px">' +
    '<div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:6px">' +
    '<span style="color:var(--muted)">Progress</span><span style="font-weight:700">' +
    pct +
    '%</span>' +
    '</div>' +
    '<div class="progress-multi" style="height:8px">' +
    '<div class="progress-seg" style="width:' +
    pct +
    '%;background:#10B981"></div>' +
    '</div>' +
    '</div>' +
    '<div style="display:flex;flex-direction:column;gap:2px">' +
    checks
      .map(function (item) {
        return (
          '<div style="display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:8px;transition:background .15s"' +
          (item.action
            ? ' class="jt-item" style="cursor:pointer" data-action="' + item.action + '"'
            : '') +
          '>' +
          '<div style="width:20px;height:20px;border-radius:50%;display:flex;align-items:center;justify-content:center;' +
          'background:' +
          (item.ok ? '#10B981' : 'var(--border)') +
          ';color:white;font-size:11px">' +
          (item.ok ? '&#10003;' : '') +
          '</div>' +
          '<span style="font-size:13px;' +
          (item.ok ? 'color:var(--muted)' : 'font-weight:600') +
          '">' +
          escapeHtml(item.label) +
          '</span>' +
          (item.action && !item.ok
            ? '<span style="margin-left:auto;font-size:11px;color:var(--primary);font-weight:600">Lengkapi &rarr;</span>'
            : '') +
          '</div>'
        );
      })
      .join('') +
    '</div>' +
    '</div>'
  );
}

function renderDashboard() {
  var period = _dashPeriod(_dashMonthOffset);
  var ytd = {
    year: period.year,
    label: '1 Jan - ' + period.endDay + ' ' + period.monthName + ' ' + period.year,
  };

  // If Company Data Preparation tab is active, show that instead — unless data is
  // already complete, in which case the tab is gone and we fall back to Dashboard.
  if (_dashActiveTab === 'company-prep' && _companyPrepComplete()) {
    _dashActiveTab = 'dashboard';
  }
  if (_dashActiveTab === 'company-prep') {
    return _dashTabsHtml('company-prep') + _renderCompanyPrep();
  }

  // Filter data by selected month
  var monthKey = period.key;

  // ── Helpers shared by the cards ──
  var _isInv = function (o) {
    return !o._type || o._type === 'invoice';
  };
  var _live = function (o) {
    return _isInv(o) && o.status !== 'Draft' && o.status !== 'Cancelled';
  };
  // Accurate buckets dashboard figures by the document's posting PERIOD, which is
  // encoded in the number (e.g. PI.2026.06.00124 → 2026-06). OCR'd `date` fields are
  // sometimes a month off (esp. purchase invoices), so derive the period from the
  // number and only fall back to `date` when the number carries no period.
  var _invMonth = function (o) {
    var m = (o.number || '').match(/\.(\d{4})\.(\d{2})\./);
    if (m) return m[1] + '-' + m[2];
    return o.date ? o.date.slice(0, 7) : null;
  };
  // Pre-tax (DPP) value — Accurate's "Sales"/"Purchase" headline and its paid/unpaid
  // bar are stated net of PPN. `subtotal` carries DPP; fall back to amount for
  // untaxed/legacy rows.
  var _dpp = function (o) {
    return o.subtotal != null && o.subtotal > 0 ? o.subtotal : (o.amount || 0);
  };
  var _total = function (o) {
    return o.total || o.amount || 0;
  };
  // Settled portion expressed on the DPP basis (proportional to how much of the
  // tax-inclusive total has been paid).
  var _paidDpp = function (o) {
    var t = _total(o);
    if (!t) return 0;
    return _dpp(o) * Math.min(1, (o.paid || 0) / t);
  };
  // Amount still owed on an invoice: prefer the scraped `owing` (primeOwing), else derive.
  var _owing = function (o) {
    return o.owing != null ? o.owing : Math.max(0, (o.amount || 0) - (o.paid || 0));
  };
  var _todayStr = new Date().toISOString().slice(0, 10);

  // ── Period card: "Sales"/"Purchase" headline + paid/unpaid bar ──
  // Invoices whose posting period (from number) falls in the selected month, on the
  // pre-tax DPP basis — matches Accurate's Penjualan/Pembelian widget exactly.
  var siInPeriod = DB.salesOrders.filter(function (o) {
    return _live(o) && _invMonth(o) === monthKey;
  });
  var piInPeriod = DB.purchaseOrders.filter(function (o) {
    return _live(o) && _invMonth(o) === monthKey;
  });
  var totalPenjualan = siInPeriod.reduce(function (s, o) { return s + _dpp(o); }, 0);
  var paidSales = siInPeriod.reduce(function (s, o) { return s + _paidDpp(o); }, 0);
  var unpaidSales = Math.max(0, totalPenjualan - paidSales);
  var totalPengeluaran = piInPeriod.reduce(function (s, o) { return s + _dpp(o); }, 0);
  var paidPurchase = piInPeriod.reduce(function (s, o) { return s + _paidDpp(o); }, 0);
  var unpaidPurchase = Math.max(0, totalPengeluaran - paidPurchase);

  // ── Outstanding card: current AR/AP balance + aging bar ──
  // Running total of money still owed, NOT period-filtered, on the tax-INCLUSIVE
  // basis (real receivable/payable) — matches Accurate's "Outstanding".
  var allSI = DB.salesOrders.filter(_live);
  var allPI = DB.purchaseOrders.filter(_live);

  var piutangVal = allSI.reduce(function (s, o) {
    return s + _owing(o);
  }, 0); // total receivables
  var overdueSales = allSI
    .filter(function (o) {
      return o.dueDate && o.dueDate < _todayStr;
    })
    .reduce(function (s, o) {
      return s + _owing(o);
    }, 0);
  var notOverdueSales = Math.max(0, piutangVal - overdueSales);

  var apOutstanding = allPI.reduce(function (s, o) {
    return s + _owing(o);
  }, 0); // total payables
  var overduePurchase = allPI
    .filter(function (o) {
      return o.dueDate && o.dueDate < _todayStr;
    })
    .reduce(function (s, o) {
      return s + _owing(o);
    }, 0);
  var notOverduePurchase = Math.max(0, apOutstanding - overduePurchase);

  // ── YTD Laba/Rugi — computed from Accurate journal vouchers ──────────────
  // This is the ONLY reliable P&L source: the JVs carry the exact same
  // revenue/COGS/expense postings Accurate uses for its own Laba Rugi report.
  //
  // Date handling: JV.transactionDate falls back to TODAY during scrape (the raw
  // API returns a locale-formatted string that toDate() can't always parse), so we
  // extract year-month from the ref number (e.g. "JV.2026.05.00318" → 2026-05).
  // This matches the posting period Accurate itself uses.
  //
  // Account matching: every journal line has an account *name* that maps 1:1 to
  // DB.accountsChart (confirmed 28/28 match, 0 misses). We look up the type from
  // the chart and classify into Revenue/COGS/Expense/Other.
  var _ytdYear = String(ytd.year);
  var _chartType = {};
  (DB.accountsChart || []).forEach(function (a) {
    _chartType[a.name] = a.type;
  });

  var _REVENUE = { REVENUE: 1, OTHER_INCOME: 1 };
  var _COGS = { COGS: 1 };
  var _EXPENSE = { EXPENSE: 1, OTHER_EXPENSE: 1 };

  // Extract YYYY-MM from JV ref (e.g. "JV.2026.05.00318" → "2026-05").
  var _refMonth = function (ref) {
    var m = (ref || '').match(/^[A-Z]+\.(\d{4})\.(\d{2})\.\d+$/);
    return m ? m[1] + '-' + m[2] : null;
  };

  var incomeValue = 0;
  var cogsValue = 0;
  var expValueYtd = 0;
  var expValue = 0; // period-only (for Beban Perusahaan card)

  (DB.journals || []).forEach(function (j) {
    var rm = _refMonth(j.ref);
    if (!rm) return;
    var inYtd = rm.slice(0, 4) === _ytdYear && rm <= period.key;
    var inPeriod = rm === monthKey;
    if (!inYtd) return;

    (j.lines || []).forEach(function (l) {
      var t = _chartType[l.account] || '';
      var dr = Number(l.debit) || 0;
      var cr = Number(l.credit) || 0;

      if (_REVENUE[t]) {
        incomeValue += cr - dr; // revenue: normal credit balance
      } else if (_COGS[t]) {
        cogsValue += dr - cr; // COGS: normal debit balance
      } else if (_EXPENSE[t]) {
        expValueYtd += dr - cr; // expense: normal debit balance
        if (inPeriod) expValue += dr - cr;
      }
    });
  });

  // Laba/Rugi: Profit = Pendapatan − HPP − Beban (net profit, matches Accurate).
  var grossProfit = incomeValue - cogsValue;
  var netProfit = grossProfit - expValueYtd;

  // Build activity timeline from recent orders
  var activities = [];
  // Use docNum() so the activity feed shows the Accurate-style document number
  // (SO/PO/DO.YYYY.MM.NNNNN) and not the legacy raw id (e.g. SI-prefixed ids or
  // random ids), matching the list views.
  var _docNum = function (o) {
    return typeof docNum === 'function' ? docNum(o.number, o.id) : o.number || o.id;
  };
  DB.salesOrders.filter(function(o){ return o.date; }).sort(function(a,b){ return b.date.localeCompare(a.date); }).slice(0, 4).forEach(function (o) {
    activities.push({ text: 'Insert Sales Order ' + _docNum(o), time: o.date, type: 'primary' });
  });
  DB.purchaseOrders.filter(function(o){ return o.date; }).sort(function(a,b){ return b.date.localeCompare(a.date); }).slice(0, 2).forEach(function (o) {
    activities.push({ text: 'Insert Purchase Order ' + _docNum(o), time: o.date, type: 'primary' });
  });
  if (DB.deliveryOrders) {
    DB.deliveryOrders.filter(function(o){ return o.date; }).sort(function(a,b){ return b.date.localeCompare(a.date); }).slice(0, 2).forEach(function (o) {
      activities.push({
        text: 'Insert Delivery Order ' + _docNum(o),
        time: o.date,
        type: 'warning',
      });
    });
  }
  activities.sort(function (a, b) {
    return String(b.time || '').localeCompare(String(a.time || ''));
  });

  // Jatuh tempo items — unpaid invoices, soonest due first
  var jtItems = allSI
    .filter(function (o) {
      return _owing(o) > 0;
    })
    .sort(function (a, b) {
      return String(a.dueDate || '').localeCompare(String(b.dueDate || ''));
    })
    .slice(0, 5)
    .map(function (o) {
      var overdue = o.dueDate && o.dueDate < _todayStr;
      return {
        id: docNum(o.number, o.id),
        label: 'Jatuh Tempo Piutang, ' + (o.customerName || o.customer || ''),
        color: overdue ? '#EF4444' : '#F59E0B',
      };
    });

  // Progress bar percentages. Two independent bars per widget, mirroring Accurate:
  //  • Period bar  — this month's invoices split into paid / unpaid (DPP basis).
  //  • Outstanding bar — running AR/AP split into not-overdue / overdue (owing basis).
  var salesBase = totalPenjualan || 1;
  var paidPct = Math.round((paidSales / salesBase) * 100);
  var unpaidPct = Math.round((unpaidSales / salesBase) * 100);
  var arBase = piutangVal || 1;
  var notOverduePct = Math.round((notOverdueSales / arBase) * 100);
  var overduePct = Math.round((overdueSales / arBase) * 100);

  var purchBase = totalPengeluaran || 1;
  var paidPurchPct = Math.round((paidPurchase / purchBase) * 100);
  var unpaidPurchPct = Math.round((unpaidPurchase / purchBase) * 100);
  var apBase = apOutstanding || 1;
  var notOverduePurchPct = Math.round((notOverduePurchase / apBase) * 100);
  var overduePurchPct = Math.round((overduePurchase / apBase) * 100);

  var now = new Date();
  var MONTH_NAMES = [
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
  var todayDate = now.getDate();
  var todayMonth = MONTH_NAMES[now.getMonth()];

  var _hour = now.getHours();
  var _greeting =
    _hour < 11
      ? 'Selamat pagi'
      : _hour < 15
        ? 'Selamat siang'
        : _hour < 19
          ? 'Selamat sore'
          : 'Selamat malam';

  // ── Mobile-friendly tuning (≤768px): compact currency + chart summaries.
  //    Spec: docs/superpowers/specs/2026-06-03-mobile-friendly-dashboard-design.md
  var _isMobileViewport = typeof window !== 'undefined' && window.innerWidth <= 768;
  var money = _isMobileViewport && typeof idrShort === 'function' ? idrShort : idr;

  // Tren Bulanan summary: this month vs last month penjualan total.
  var _trenThisKey = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
  var _trenLastD = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  var _trenLastKey =
    _trenLastD.getFullYear() + '-' + String(_trenLastD.getMonth() + 1).padStart(2, '0');
  var _trenThisSales = 0,
    _trenLastSales = 0;
  (DB.salesOrders || []).forEach(function (o) {
    if (!o.date || o.status === 'Draft') return;
    var k = o.date.slice(0, 7);
    if (k === _trenThisKey) _trenThisSales += o.amount || 0;
    else if (k === _trenLastKey) _trenLastSales += o.amount || 0;
  });
  var _trenDeltaPct =
    _trenLastSales > 0
      ? Math.round(((_trenThisSales - _trenLastSales) / _trenLastSales) * 100)
      : null;
  var _trenDeltaClass = _trenDeltaPct == null ? '' : _trenDeltaPct >= 0 ? 'up' : 'down';
  var _trenDeltaText =
    _trenDeltaPct == null
      ? 'Belum ada data bulan lalu'
      : (_trenDeltaPct >= 0 ? '↑ ' : '↓ ') + Math.abs(_trenDeltaPct) + '% vs bulan lalu';

  // Arus Kas (stock chart) summary: count of top-8 items below minimum.
  var _stockTop8 = (DB.inventoryItems || []).slice(0, 8);
  var _stockLow = _stockTop8.filter(function (i) {
    return (i.stock || 0) < (i.min || 0);
  }).length;
  var _stockTotal = _stockTop8.length;
  var _stockSummaryValue = _stockLow > 0 ? _stockLow + ' / ' + _stockTotal + ' item' : 'Aman';
  var _stockSummaryDelta = _stockLow > 0 ? 'Di bawah stok minimum' : 'Semua stok cukup';
  var _stockSummaryClass = _stockLow > 0 ? 'down' : 'up';

  // ── Widget registry: id → inner card markup ───────────────────────────────
  // The renderer wraps each entry with the card shell + a hide (×) button, and
  // only emits widgets enabled in the catalog (see _getDashWidgets). `wide`
  // widgets take half a row; the rest flow 3 per row (original layout).
  var _wdef = {
    activity: {
      inner: `
      <div class="activity-list">
        <div style="display:flex;align-items:flex-end;gap:10px;margin-bottom:12px">
          <div>
            <div class="activity-date">Today</div>
            <div class="activity-date-big">${todayDate}</div>
            <div class="activity-date-month">${todayMonth}</div>
          </div>
        </div>
        ${activities
          .slice(0, 6)
          .map(
            a => `
        <div class="activity-item ${a.type}">
          <div class="activity-time">${a.time ? a.time.slice(5) : ''}</div>
          <div class="activity-text">${escapeHtml(a.text)}</div>
        </div>`
          )
          .join('')}
      </div>`,
    },
    jatuhTempo: {
      inner: `
      <div style="display:flex;align-items:flex-end;gap:10px;margin-bottom:14px">
        <div>
          <div class="activity-date">Upcoming</div>
          <div class="activity-date-big">${todayDate + 1}</div>
          <div class="activity-date-month">${todayMonth}</div>
        </div>
      </div>
      ${
        jtItems.length > 0
          ? jtItems
              .map(
                jt => `
      <div class="jt-item">
        <div class="jt-dot" style="background:${jt.color}"></div>
        <div>
          <div class="jt-id">${escapeHtml(jt.id)}</div>
          <div class="jt-label">${escapeHtml(jt.label)}</div>
        </div>
      </div>`
              )
              .join('')
          : '<div style="text-align:center;padding:20px;color:var(--muted);font-size:12px">Tidak ada jatuh tempo</div>'
      }`,
    },
    tren: {
      cls: 'chart-widget',
      attrs: ' data-chart-id="revenue"',
      inner: `
      <div class="widget-header">
        <div class="widget-title">Tren Bulanan (12 bulan)</div>
        <div style="display:flex;gap:12px;align-items:center">
          <div class="donut-label"><div class="donut-label-dot" style="background:#3B82F6"></div> Penjualan</div>
          <div class="donut-label"><div class="donut-label-dot" style="background:#FF9F0A"></div> Pengeluaran</div>
        </div>
      </div>
      <button class="chart-summary" data-action="toggleChart" type="button">
        <div class="chart-summary-value">${money(_trenThisSales)}</div>
        <div class="chart-summary-delta ${_trenDeltaClass}">${_trenDeltaText}</div>
        <div class="chart-summary-hint">Tap untuk lihat grafik</div>
      </button>
      <div class="chart-wrap"><canvas id="revenueChart"></canvas></div>`,
    },
    labaRugi: {
      inner: `
      <div class="widget-header">
        <div class="widget-title">Laba/Rugi Tahun Ini</div>
        <div class="widget-actions">
          <button class="widget-action-btn" data-action="dashRefresh" title="Refresh">↻</button>
        </div>
      </div>
      <div class="date-nav">
        <button data-action="dashDateNav" data-dir="prev">‹</button>
        <span>${ytd.label}</span>
        <button data-action="dashDateNav" data-dir="next">›</button>
      </div>
      <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:14px">
        <div style="display:flex;justify-content:space-between;align-items:center">
          <div class="donut-label"><div class="donut-label-dot" style="background:#10B981"></div> Income</div>
          <div style="font-size:13px;font-weight:700">${money(incomeValue)}</div>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center">
          <div class="donut-label"><div class="donut-label-dot" style="background:#3B82F6"></div> COGS Value</div>
          <div style="font-size:13px;font-weight:700">${money(cogsValue)}</div>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center">
          <div class="donut-label"><div class="donut-label-dot" style="background:#F59E0B"></div> Expenditure</div>
          <div style="font-size:13px;font-weight:700">${money(expValueYtd)}</div>
        </div>
      </div>
      <div style="border-top:1px solid var(--border);padding-top:12px;display:flex;justify-content:space-between;align-items:center">
        <div style="font-size:14px;font-weight:800">Profit</div>
        <div style="font-size:16px;font-weight:800;color:${netProfit >= 0 ? '#10B981' : '#EF4444'}">${money(netProfit)}</div>
      </div>`,
    },
    arusKas: {
      cls: 'chart-widget',
      attrs: ' data-chart-id="stock"',
      inner: `
      <div class="widget-header">
        <div class="widget-title">Arus Kas</div>
        <div class="widget-actions">
          <button class="widget-action-btn" data-action="dashRefresh" title="Refresh">↻</button>
        </div>
      </div>
      <button class="chart-summary" data-action="toggleChart" type="button">
        <div class="chart-summary-value">${_stockSummaryValue}</div>
        <div class="chart-summary-delta ${_stockSummaryClass}">${_stockSummaryDelta}</div>
        <div class="chart-summary-hint">Tap untuk lihat grafik</div>
      </button>
      <div class="chart-wrap"><canvas id="stockChart"></canvas></div>`,
    },
    beban: {
      inner: `
      <div class="widget-header">
        <div class="widget-title">Beban Perusahaan</div>
        <div class="widget-actions">
          <button class="widget-action-btn" data-action="dashRefresh" title="Refresh">↻</button>
        </div>
      </div>
      <div class="date-nav">
        <button data-action="dashDateNav" data-dir="prev">‹</button>
        <span>${period.label}</span>
        <button data-action="dashDateNav" data-dir="next">›</button>
      </div>
      <div style="text-align:right;margin-bottom:12px">
        <div style="font-size:12px;color:var(--muted)">Expense</div>
        <div style="font-size:20px;font-weight:800">${money(expValue)}</div>
      </div>
      <div style="display:flex;flex-direction:column;gap:6px">
        <div style="display:flex;justify-content:space-between;align-items:center">
          <div class="donut-label"><div class="donut-label-dot" style="background:#10B981"></div> Beban Operasional</div>
          <div style="font-size:12px;font-weight:700">${money(expValue)}</div>
        </div>
      </div>`,
    },
    penjualan: {
      wide: true,
      inner: `
      <div class="widget-header">
        <div class="widget-title">Penjualan</div>
        <div class="widget-actions">
          <button class="widget-action-btn" data-action="dashRefresh" title="Refresh">↻</button>
        </div>
      </div>
      <div class="date-nav">
        <button data-action="dashDateNav" data-dir="prev">‹</button>
        <span>${period.label}</span>
        <button data-action="dashDateNav" data-dir="next">›</button>
        <span data-action="dashToday" style="margin-left:auto;color:var(--primary);cursor:pointer;font-weight:700">Today</span>
      </div>
      <div style="display:flex;justify-content:space-between;margin-bottom:16px">
        <div>
          <div class="summary-label">Sales</div>
          <div class="summary-value">${money(totalPenjualan)}</div>
        </div>
        <div style="text-align:right">
          <div class="summary-label">Outstanding</div>
          <div class="summary-value danger">${money(piutangVal)}</div>
        </div>
      </div>
      <div style="display:flex;gap:16px">
        <div style="flex:1">
          <div class="progress-multi">
            <div class="progress-seg" style="width:${paidPct}%;background:#10B981"></div>
            <div class="progress-seg" style="width:${unpaidPct}%;background:#F59E0B"></div>
          </div>
          <div class="progress-legend">
            <div class="progress-legend-item"><div class="progress-legend-dot" style="background:#10B981"></div>Paid Invoices<br><span class="progress-legend-val">${money(paidSales)}</span></div>
            <div class="progress-legend-item"><div class="progress-legend-dot" style="background:#F59E0B"></div>Unpaid Invoices<br><span class="progress-legend-val">${money(unpaidSales)}</span></div>
          </div>
        </div>
        <div style="flex:1">
          <div class="progress-multi">
            <div class="progress-seg" style="width:${notOverduePct}%;background:#F59E0B"></div>
            <div class="progress-seg" style="width:${overduePct}%;background:#EF4444"></div>
          </div>
          <div class="progress-legend">
            <div class="progress-legend-item"><div class="progress-legend-dot" style="background:#F59E0B"></div>Not overdue yet<br><span class="progress-legend-val">${money(notOverdueSales)}</span></div>
            <div class="progress-legend-item"><div class="progress-legend-dot" style="background:#EF4444"></div>Overdue<br><span class="progress-legend-val">${money(overdueSales)}</span></div>
          </div>
        </div>
      </div>`,
    },
    pembelian: {
      wide: true,
      inner: `
      <div class="widget-header">
        <div class="widget-title">Pembelian</div>
        <div class="widget-actions">
          <button class="widget-action-btn" data-action="dashRefresh" title="Refresh">↻</button>
        </div>
      </div>
      <div class="date-nav">
        <button data-action="dashDateNav" data-dir="prev">‹</button>
        <span>${period.label}</span>
        <button data-action="dashDateNav" data-dir="next">›</button>
        <span data-action="dashToday" style="margin-left:auto;color:var(--primary);cursor:pointer;font-weight:700">Today</span>
      </div>
      <div style="display:flex;justify-content:space-between;margin-bottom:16px">
        <div>
          <div class="summary-label">Purchase</div>
          <div class="summary-value">${money(totalPengeluaran)}</div>
        </div>
        <div style="text-align:right">
          <div class="summary-label">Outstanding</div>
          <div class="summary-value danger">${money(apOutstanding)}</div>
        </div>
      </div>
      <div style="display:flex;gap:16px">
        <div style="flex:1">
          <div class="progress-multi">
            <div class="progress-seg" style="width:${paidPurchPct}%;background:#10B981"></div>
            <div class="progress-seg" style="width:${unpaidPurchPct}%;background:#F59E0B"></div>
          </div>
          <div class="progress-legend">
            <div class="progress-legend-item"><div class="progress-legend-dot" style="background:#10B981"></div>Paid Invoices<br><span class="progress-legend-val">${money(paidPurchase)}</span></div>
            <div class="progress-legend-item"><div class="progress-legend-dot" style="background:#F59E0B"></div>Unpaid Invoices<br><span class="progress-legend-val">${money(unpaidPurchase)}</span></div>
          </div>
        </div>
        <div style="flex:1">
          <div class="progress-multi">
            <div class="progress-seg" style="width:${notOverduePurchPct}%;background:#F59E0B"></div>
            <div class="progress-seg" style="width:${overduePurchPct}%;background:#EF4444"></div>
          </div>
          <div class="progress-legend">
            <div class="progress-legend-item"><div class="progress-legend-dot" style="background:#F59E0B"></div>Not overdue yet<br><span class="progress-legend-val">${money(notOverduePurchase)}</span></div>
            <div class="progress-legend-item"><div class="progress-legend-dot" style="background:#EF4444"></div>Overdue<br><span class="progress-legend-val">${money(overduePurchase)}</span></div>
          </div>
        </div>
      </div>`,
    },
  };

  // Assemble enabled widgets into the original row layout.
  var _enabled = _getDashWidgets();
  var _normalCards = [];
  var _wideCards = [];
  _enabled.forEach(function (id) {
    var d = _wdef[id];
    if (!d) return;
    var card =
      '<div class="widget-card' +
      (d.cls ? ' ' + d.cls : '') +
      '" data-widget-id="' +
      id +
      '"' +
      (d.attrs || '') +
      '>' +
      '<button class="widget-hide-btn" data-action="hideWidget" data-id="' +
      id +
      '" title="Sembunyikan widget" aria-label="Sembunyikan widget">&times;</button>' +
      d.inner +
      '</div>';
    (d.wide ? _wideCards : _normalCards).push(card);
  });
  var _rowsHtml =
    _chunk(_normalCards, 3)
      .map(function (r) {
        return '<div class="dash-grid-3">' + r.join('') + '</div>';
      })
      .join('') +
    _chunk(_wideCards, 2)
      .map(function (r) {
        return '<div class="dash-grid-2">' + r.join('') + '</div>';
      })
      .join('');
  if (!_enabled.length) {
    _rowsHtml =
      '<div class="widget-card" style="text-align:center;padding:40px;color:var(--muted)">' +
      'Semua widget disembunyikan. Klik <strong>+ Widget</strong> di atas untuk menampilkannya kembali.</div>';
  }

  return (
    _dashTabsHtml('dashboard') +
    `
  <!-- Dashboard Header -->
  <div class="dash-header">
    <div class="dash-header-text">
      <div class="dash-greeting">${_greeting}</div>
      <h1 class="dash-title">Ringkasan Keuangan</h1>
    </div>
    <div class="dash-header-meta">
      <span class="dash-date">${todayDate} ${todayMonth} ${now.getFullYear()}</span>
    </div>
  </div>
  ` +
    _rowsHtml
  );
}

// ── Register dashboard actions (via ERP.registerAction delegation) ────────────
(function _registerDashActions() {
  function _reg() {
    // Tab switching
    ERP.registerAction('dashTab', function (id) {
      _dashActiveTab = id || 'dashboard';
      _dashMonthOffset = 0;
      _refreshDashboard();
      return true;
    });

    // Refresh all widgets
    ERP.registerAction('dashRefresh', function () {
      _refreshDashboard();
      showToast('Dashboard diperbarui', 'success');
      return true;
    });

    // Date navigation ‹ ›
    ERP.registerAction('dashDateNav', function (_id, _type, _val, e) {
      var btn = e && e.target.closest('[data-action="dashDateNav"]');
      var dir = btn && btn.dataset.dir;
      if (dir === 'prev') {
        _dashMonthOffset--;
      } else if (dir === 'next' && _dashMonthOffset < 0) {
        _dashMonthOffset++;
      }
      _refreshDashboard();
      return true;
    });

    // "Today" link
    ERP.registerAction('dashToday', function () {
      _dashMonthOffset = 0;
      _refreshDashboard();
      return true;
    });

    // "+ Widget" button → open the widget catalog modal
    ERP.registerAction('addWidget', function () {
      var enabled = _getDashWidgets();
      var body =
        '<p style="margin:0 0 14px;font-size:13px;color:var(--muted)">Pilih widget yang ingin ditampilkan di dashboard.</p>' +
        '<div style="display:flex;flex-direction:column;gap:8px">' +
        DASH_WIDGET_CATALOG.map(function (w) {
          var on = enabled.indexOf(w.id) !== -1;
          return (
            '<label style="display:flex;align-items:center;gap:12px;padding:12px 14px;border:1px solid var(--border);border-radius:10px;cursor:pointer">' +
            '<input type="checkbox" class="dash-wopt" value="' +
            w.id +
            '"' +
            (on ? ' checked' : '') +
            ' style="width:18px;height:18px;cursor:pointer;accent-color:var(--primary)">' +
            '<span style="font-size:14px;font-weight:600">' +
            escapeHtml(w.label) +
            '</span>' +
            '</label>'
          );
        }).join('') +
        '</div>';
      var footer =
        '<button class="btn-ghost" data-action="closeModal">Batal</button>' +
        '<button class="btn-primary" data-action="saveDashWidgets">Simpan</button>';
      if (typeof openModal === 'function') {
        openModal('Kelola Widget Dashboard', body, footer);
      }
      return true;
    });

    // Save catalog selection (stored in catalog order for a stable layout)
    ERP.registerAction('saveDashWidgets', function () {
      var picked = [];
      var boxes = document.querySelectorAll('#modalOverlay .dash-wopt');
      boxes.forEach(function (b) {
        if (b.checked) picked.push(b.value);
      });
      var ordered = DASH_WIDGET_CATALOG.map(function (w) {
        return w.id;
      }).filter(function (id) {
        return picked.indexOf(id) !== -1;
      });
      _setDashWidgets(ordered);
      if (typeof closeModal === 'function') closeModal();
      _refreshDashboard();
      showToast('Widget dashboard diperbarui', 'success');
      return true;
    });

    // Per-card hide (×) button
    ERP.registerAction('hideWidget', function (_id, _type, _val, e) {
      var btn = e && e.target && e.target.closest('[data-action="hideWidget"]');
      var wid = btn && btn.dataset.id;
      if (!wid) return true;
      var cur = _getDashWidgets().filter(function (id) {
        return id !== wid;
      });
      _setDashWidgets(cur);
      _refreshDashboard();
      showToast('Widget disembunyikan — klik "+ Widget" untuk menampilkan lagi', 'info');
      return true;
    });

    // Toggle chart-summary ↔ canvas on mobile (no-op on desktop since CSS hides summary).
    ERP.registerAction('toggleChart', function (_id, _type, _val, e) {
      var btn = e && e.target && e.target.closest('[data-action="toggleChart"]');
      var card = btn && btn.closest('.chart-widget');
      if (!card) return true;
      var wasExpanded = card.classList.contains('expanded');
      card.classList.toggle('expanded');
      if (!wasExpanded) {
        // First expand: canvas was display:none, Chart.js needs to relayout.
        var chartId = card.dataset.chartId;
        if (chartId && typeof charts !== 'undefined' && charts[chartId]) {
          setTimeout(function () {
            try {
              charts[chartId].resize();
            } catch (_) {}
          }, 50);
        }
      }
      return true;
    });
  }

  if (typeof ERP !== 'undefined' && ERP.registerAction) {
    _reg();
  } else {
    document.addEventListener('DOMContentLoaded', function () {
      if (typeof ERP !== 'undefined' && ERP.registerAction) {
        _reg();
      }
    });
  }

  // Dashboard layout select — listen for changes
  document.addEventListener('change', function (e) {
    if (e.target && e.target.id === 'dash-layout-select') {
      showToast('Layout: ' + e.target.value, 'info');
    }
  });
})();
