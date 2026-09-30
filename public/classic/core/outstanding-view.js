// KELOLA ERP (DEMO) — Outstanding (Piutang & Hutang)  (outstanding-view.js)
// ─────────────────────────────────────────────────────────────────────────────
// Answers the client's standing question — "PO mana saja yang belum dibayar dan
// berapa jumlahnya?" — for BOTH directions on one screen, because for a trading
// business the two only make sense side by side:
//
//   • PIUTANG  — sales orders / invoices the customer has not settled.
//   • HUTANG   — purchase orders TMA has not paid the supplier for.
//
// The owing basis matches the dashboard's Outstanding card (dashboard.js):
// tax-INCLUSIVE, `owing` when the record carries one, otherwise amount − paid,
// and Draft/Cancelled documents are excluded.
//
// Global-scope rule: classic <script>, IIFE-wrapped, exposes only
// window.renderOutstanding (+ window.OutstandingView for the sort/filter hooks).
(function () {
  'use strict';

  const esc =
    window.escapeHtml ||
    (s =>
      String(s == null ? '' : s).replace(
        /[&<>"']/g,
        m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[m]
      ));
  const money = v => (typeof window.idrFull === 'function' ? window.idrFull(v) : `Rp ${v}`);
  const db = () => window.DB || {};

  // View state, kept across re-renders.
  let _showSettled = false;
  let _sortBy = 'age'; // 'age' | 'amount' | 'party'

  const todayStr = () => new Date().toISOString().slice(0, 10);

  /** Draft and cancelled documents are not yet money owed. */
  function _live(o) {
    return o.status !== 'Draft' && o.status !== 'Cancelled';
  }

  /** Amount still owed, tax-inclusive. Mirrors dashboard.js `_owing`. */
  function _owing(o) {
    return o.owing != null ? o.owing : Math.max(0, (o.amount || 0) - (o.paid || 0));
  }

  /** Days past the due date; negative means not due yet, null when undated. */
  function _ageDays(o) {
    if (!o.dueDate) return null;
    const due = new Date(o.dueDate + 'T00:00:00');
    const now = new Date(todayStr() + 'T00:00:00');
    return Math.round((now - due) / 86400000);
  }

  function _rows(coll, partyField) {
    const rows = (db()[coll] || [])
      .filter(o => _live(o) && (_showSettled || _owing(o) > 0))
      .map(o => ({
        id: o.id,
        number: o.number || o.id,
        party: o[partyField] || '—',
        date: o.date || '',
        dueDate: o.dueDate || '',
        total: o.amount || 0,
        paid: o.paid || 0,
        owing: _owing(o),
        age: _ageDays(o),
      }));

    rows.sort((a, b) => {
      if (_sortBy === 'amount') return b.owing - a.owing;
      if (_sortBy === 'party') return String(a.party).localeCompare(String(b.party));
      // 'age': most overdue first, undated last.
      const aa = a.age == null ? -1e9 : a.age;
      const bb = b.age == null ? -1e9 : b.age;
      return bb - aa;
    });
    return rows;
  }

  function _ageBadge(age) {
    if (age == null) {
      return '<span style="font-size:10px;color:var(--muted)">tanpa jatuh tempo</span>';
    }
    if (age > 0) {
      const sev = age > 30 ? '#DC2626' : '#EA580C';
      return `<span style="display:inline-block;font-size:10px;font-weight:800;color:#fff;background:${sev};border-radius:99px;padding:1px 7px">telat ${age} hr</span>`;
    }
    if (age === 0) {
      return '<span style="display:inline-block;font-size:10px;font-weight:800;color:#92400E;background:#FEF3C7;border-radius:99px;padding:1px 7px">jatuh tempo hari ini</span>';
    }
    return `<span style="font-size:10px;color:var(--muted)">${-age} hr lagi</span>`;
  }

  function _table(rows, side) {
    if (!rows.length) {
      return `<div style="font-size:12px;color:var(--muted);text-align:center;padding:24px">
        Tidak ada ${side === 'ar' ? 'piutang' : 'hutang'} yang belum lunas.
      </div>`;
    }
    const action = side === 'ar' ? 'viewSO' : 'viewPO';
    return `
      <div class="table-wrap" style="overflow:auto;max-height:520px">
        <table style="width:100%">
          <thead><tr>
            <th style="text-align:left">No.</th>
            <th style="text-align:left">${side === 'ar' ? 'Pelanggan' : 'Supplier'}</th>
            <th style="text-align:right">Nilai</th>
            <th style="text-align:right">Dibayar</th>
            <th style="text-align:right">Sisa</th>
            <th style="text-align:left">Jatuh Tempo</th>
          </tr></thead>
          <tbody>
            ${rows
              .map(
                r => `<tr data-action="${action}" data-id="${esc(r.id)}" style="cursor:pointer">
              <td style="font-family:monospace;font-size:11px">${esc(r.number)}</td>
              <td>${esc(r.party)}</td>
              <td style="text-align:right">${money(r.total)}</td>
              <td style="text-align:right;color:var(--muted)">${money(r.paid)}</td>
              <td style="text-align:right;font-weight:800;${r.owing > 0 ? 'color:var(--danger)' : 'color:var(--success)'}">${money(r.owing)}</td>
              <td>${esc(r.dueDate || '—')} ${_ageBadge(r.age)}</td>
            </tr>`
              )
              .join('')}
          </tbody>
        </table>
      </div>`;
  }

  function _panel(title, subtitle, rows, side, accent) {
    const total = rows.reduce((s, r) => s + r.owing, 0);
    const overdue = rows.filter(r => r.age != null && r.age > 0).reduce((s, r) => s + r.owing, 0);
    return `
      <div class="card">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;margin-bottom:12px">
          <div>
            <div style="font-size:14px;font-weight:800">${esc(title)}</div>
            <div style="font-size:11px;color:var(--muted)">${esc(subtitle)}</div>
          </div>
          <div style="text-align:right">
            <div style="font-size:18px;font-weight:800;color:${accent}">${money(total)}</div>
            <div style="font-size:11px;color:var(--muted)">${rows.length} dokumen</div>
          </div>
        </div>
        <div style="display:flex;gap:12px;font-size:11px;margin-bottom:10px">
          <div>Lewat jatuh tempo: <strong style="color:var(--danger)">${money(overdue)}</strong></div>
          <div>Belum jatuh tempo: <strong>${money(Math.max(0, total - overdue))}</strong></div>
        </div>
        ${_table(rows, side)}
      </div>`;
  }

  window.renderOutstanding = function renderOutstanding() {
    const ar = _rows('salesOrders', 'customer');
    const ap = _rows('purchaseOrders', 'supplier');
    const arTotal = ar.reduce((s, r) => s + r.owing, 0);
    const apTotal = ap.reduce((s, r) => s + r.owing, 0);
    const net = arTotal - apTotal;

    const sortOpt = (v, label) =>
      `<option value="${v}" ${_sortBy === v ? 'selected' : ''}>${label}</option>`;

    return `
      <div class="sec-hdr" style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap">
        <div>
          <h1>Outstanding</h1>
          <p class="sec-sub">Piutang dari pelanggan dan hutang ke supplier — mana yang belum dibayar dan berapa sisanya.</p>
        </div>
        <div style="display:flex;align-items:center;gap:10px">
          <label style="display:flex;align-items:center;gap:5px;font-size:12px;cursor:pointer">
            <input type="checkbox" id="os-show-settled" ${_showSettled ? 'checked' : ''}> Tampilkan yang lunas
          </label>
          <select class="form-select" id="os-sort" style="width:auto;font-size:12px;padding:5px 10px">
            ${sortOpt('age', 'Urut: paling telat')}
            ${sortOpt('amount', 'Urut: nilai terbesar')}
            ${sortOpt('party', 'Urut: nama')}
          </select>
        </div>
      </div>

      <div class="stat-row" style="grid-template-columns:repeat(3,1fr);margin-bottom:16px">
        <div class="stat-card">
          <div class="stat-label">Piutang (belum diterima)</div>
          <div class="stat-value" style="color:#059669">${money(arTotal)}</div>
          <div class="stat-sub">${ar.length} dokumen</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Hutang (belum dibayar)</div>
          <div class="stat-value" style="color:#DC2626">${money(apTotal)}</div>
          <div class="stat-sub">${ap.length} dokumen</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Selisih Bersih</div>
          <div class="stat-value" style="color:${net >= 0 ? '#059669' : '#DC2626'}">${money(net)}</div>
          <div class="stat-sub">${net >= 0 ? 'akan diterima lebih banyak' : 'akan dibayar lebih banyak'}</div>
        </div>
      </div>

      <div class="log-2col">
        ${_panel('Piutang — dari Pelanggan', 'Pesanan penjualan yang belum lunas', ar, 'ar', '#059669')}
        ${_panel('Hutang — ke Supplier', 'Pesanan pembelian yang belum dibayar', ap, 'ap', '#DC2626')}
      </div>`;
  };

  // Controls live inside the rendered view, so wire them by delegation once.
  document.addEventListener('change', ev => {
    const t = ev.target;
    if (!t) return;
    if (t.id === 'os-show-settled') {
      _showSettled = t.checked;
    } else if (t.id === 'os-sort') {
      _sortBy = t.value;
    } else {
      return;
    }
    if (typeof window.invalidateView === 'function') window.invalidateView('outstanding');
    if (typeof window.navigate === 'function') window.navigate('outstanding');
  });

  window.OutstandingView = {
    // exported for tests
    _rows,
    _owing,
    _ageDays,
    setState: s => {
      if (s && 'showSettled' in s) _showSettled = s.showSettled;
      if (s && 'sortBy' in s) _sortBy = s.sortBy;
    },
  };
})();
