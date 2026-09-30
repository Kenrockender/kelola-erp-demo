// ═══════════════════════════════════════════════════════════════════════════════
// KELOLA ERP (DEMO) — Invoice & Receipt View  (invoice-view.js)
// Phase 4 of the V4 plan (see docs/ARCHITECTURE_ERP_V4.md).
//
// One view at #view-invoices that manages ALL four Phase 4 doc types via tabs:
//   SI (Sales Invoice), PI (Purchase Invoice), SR (Sales Receipt), PP (Purchase Payment).
//
// Each doc is created with a "Get From" that pulls lines from a Delivered SO / Received PO.
// Receipts/Payments are simple amount + method entries linked to an invoice.
// GL posting happens automatically via the saveDB → reconcile hook.
//
// Global-scope rule: classic <script>, IIFE-wrapped, exposes only window.renderInvoices.
// ═══════════════════════════════════════════════════════════════════════════════
(function () {
  'use strict';

  let activeTab = 'SI'; // 'SI' | 'PI' | 'SR' | 'PP'

  function esc(s) {
    if (typeof window.escapeHtml === 'function') {
      return window.escapeHtml(s);
    }
    return String(s === null || s === undefined ? '' : s);
  }
  function money(v) {
    return typeof window.idrFull === 'function' ? window.idrFull(v) : `Rp ${v}`;
  }
  function db() {
    return window.DB || {};
  }

  const TAB_LABELS = {
    SI: 'Faktur Penjualan',
    PI: 'Faktur Pembelian',
    SR: 'Penerimaan',
    PP: 'Pembayaran',
  };
  const TAB_ADD_LABELS = {
    SI: 'Buat Faktur',
    PI: 'Buat Faktur',
    SR: 'Catat Penerimaan',
    PP: 'Catat Pembayaran',
  };

  function statusBadge(status) {
    return typeof window.badge === 'function' ? window.badge(status) : esc(status);
  }

  function collectionFor(type) {
    const map = {
      SI: 'salesInvoices',
      PI: 'purchaseInvoices',
      SR: 'salesReceipts',
      PP: 'purchasePayments',
    };
    return map[type] || 'salesInvoices';
  }

  function partyField(type) {
    return type === 'PI' || type === 'PP' ? 'supplier' : 'customer';
  }
  function partyIdField(type) {
    return type === 'PI' || type === 'PP' ? 'supplierId' : 'customerId';
  }

  // ── List rendering ──────────────────────────────────────────────────────────
  function listTab(type) {
    const coll = collectionFor(type);
    const docs = (db()[coll] || []).slice().reverse();
    const party = partyField(type);
    if (docs.length === 0) {
      return `<div class="card"><div style="padding:20px;text-align:center;color:var(--muted);font-size:13px">
        Belum ada ${TAB_LABELS[type].toLowerCase()}. Klik <strong>${TAB_ADD_LABELS[type]}</strong>.
      </div></div>`;
    }
    const rows = docs
      .map(
        d => `<tr style="border-bottom:1px solid var(--border)">
        <td class="td-p" style="font-size:11px;font-weight:700;color:var(--primary)">${esc(d.number || d.id)}</td>
        <td class="td-p" style="font-size:13px;font-weight:600">${esc(d[party] || '—')}</td>
        <td class="td-p" style="font-size:11px;color:var(--muted)">${esc(d.date)}</td>
        <td class="td-p" style="font-size:13px;font-weight:800;text-align:right">${money(d.amount || 0)}</td>
        <td class="td-p">${statusBadge(d.status)}</td>
        <td class="td-p">
          <button class="action-ghost" data-action="invView" data-id="${esc(d.id)}" data-type="${type}">Lihat</button>
          ${d.status === 'Draft' ? `<button class="action-primary" data-action="invPost" data-id="${esc(d.id)}" data-type="${type}">Post</button>` : ''}
        </td>
      </tr>`
      )
      .join('');
    return `<div class="card">
      <div style="font-size:14px;font-weight:700;margin-bottom:10px">${TAB_LABELS[type]} (${docs.length})</div>
      <div class="table-wrap"><table style="width:100%;border-collapse:collapse">
        <thead><tr>
          <th style="padding:8px 10px;font-size:11px;font-weight:700;text-align:left">No.</th>
          <th style="padding:8px 10px;font-size:11px;font-weight:700;text-align:left">${type === 'PI' || type === 'PP' ? 'Supplier' : 'Pelanggan'}</th>
          <th style="padding:8px 10px;font-size:11px;font-weight:700;text-align:left">Tanggal</th>
          <th style="padding:8px 10px;font-size:11px;font-weight:700;text-align:right">Jumlah</th>
          <th style="padding:8px 10px;font-size:11px;font-weight:700;text-align:left">Status</th>
          <th style="padding:8px 10px;font-size:11px;font-weight:700;text-align:left">Aksi</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table></div>
    </div>`;
  }

  // Each doc type is its own page. The four used to share one tabbed view, which
  // meant clicking "Faktur Penjualan" in the menu landed on a screen titled
  // "Faktur & Pembayaran" with three other tabs alongside it — correct, but it
  // read as having gone to the wrong place.
  const TAB_VIEW = {
    SI: 'salesInvoices',
    PI: 'purchaseInvoices',
    SR: 'salesReceipts',
    PP: 'purchasePayments',
  };
  const TAB_SUB = {
    SI: 'Tagihan ke pelanggan',
    PI: 'Tagihan dari supplier',
    SR: 'Pelunasan yang diterima dari pelanggan',
    PP: 'Pembayaran yang dikirim ke supplier',
  };

  /** Render one doc type as a standalone page (no tab bar). */
  function renderOne(tab) {
    activeTab = tab;
    const header =
      typeof window.secHdr === 'function'
        ? window.secHdr(TAB_LABELS[tab], TAB_SUB[tab], TAB_ADD_LABELS[tab], 'invNew')
        : `<h1>${esc(TAB_LABELS[tab])}</h1>`;
    return `${header}${listTab(tab)}`;
  }

  // Legacy `invoices` view id — still reachable from older links and from
  // doc-flow's "Jejak" — now shows whichever type was last opened.
  function renderInvoices() {
    return renderOne(activeTab);
  }

  function refresh() {
    const el =
      document.getElementById(`view-${TAB_VIEW[activeTab]}`) ||
      document.getElementById('view-invoices');
    if (el) {
      el.innerHTML = renderOne(activeTab);
    }
  }

  // ── Create modals ───────────────────────────────────────────────────────────
  function sourceOptions(type) {
    if (type === 'SI') {
      return (db().salesOrders || [])
        .filter(o => o.status === 'Delivered')
        .map(
          o =>
            `<option value="${esc(o.id)}" data-party="${esc(o.customer)}" data-partyid="${o.customerId || ''}" data-amount="${o.amount || 0}">${esc(o.id)} · ${esc(o.customer)} · ${money(o.amount || 0)}</option>`
        )
        .join('');
    }
    if (type === 'PI') {
      return (db().purchaseOrders || [])
        .filter(o => o.status === 'Received')
        .map(
          o =>
            `<option value="${esc(o.id)}" data-party="${esc(o.supplier)}" data-partyid="${o.supplierId || ''}" data-amount="${o.amount || 0}">${esc(o.id)} · ${esc(o.supplier)} · ${money(o.amount || 0)}</option>`
        )
        .join('');
    }
    if (type === 'SR') {
      return (db().salesInvoices || [])
        .filter(i => i.status === 'Outstanding')
        .map(
          i =>
            `<option value="${esc(i.id)}" data-party="${esc(i.customer)}" data-partyid="${i.customerId || ''}" data-amount="${i.amount || 0}">${esc(i.number || i.id)} · ${esc(i.customer)} · ${money(i.amount || 0)}</option>`
        )
        .join('');
    }
    if (type === 'PP') {
      return (db().purchaseInvoices || [])
        .filter(i => i.status === 'Outstanding')
        .map(
          i =>
            `<option value="${esc(i.id)}" data-party="${esc(i.supplier)}" data-partyid="${i.supplierId || ''}" data-amount="${i.amount || 0}">${esc(i.number || i.id)} · ${esc(i.supplier)} · ${money(i.amount || 0)}</option>`
        )
        .join('');
    }
    return '';
  }

  function openNewModal(type, preselectId) {
    if (!window.openModal) {
      return;
    }
    const today =
      typeof window.today === 'function' ? window.today() : new Date().toISOString().slice(0, 10);
    const isInvoice = type === 'SI' || type === 'PI';
    const srcLabel =
      type === 'SI'
        ? 'Sales Order (Terkirim)'
        : type === 'PI'
          ? 'Purchase Order (Diterima)'
          : type === 'SR'
            ? 'Faktur Penjualan (Outstanding)'
            : 'Faktur Pembelian (Outstanding)';
    const srcOpts = sourceOptions(type);

    window.openModal(
      TAB_ADD_LABELS[type],
      `
      <div class="form-row">
        <div class="form-group" style="grid-column:1/-1">
          <label class="form-label">Ambil dari ${srcLabel}</label>
          <select class="form-select" id="inv-src">
            <option value="">— Pilih —</option>${srcOpts}
          </select>
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">${type === 'PI' || type === 'PP' ? 'Supplier' : 'Pelanggan'}</label>
          <input class="form-input" id="inv-party" type="text" readonly style="background:var(--bg)">
        </div>
        <div class="form-group">
          <label class="form-label">Tanggal</label>
          <input class="form-input" id="inv-date" type="date" value="${today}">
        </div>
      </div>
      ${
        !isInvoice
          ? `<div class="form-row">
        <div class="form-group">
          <label class="form-label">Jumlah (Rp)</label>
          <input class="form-input" id="inv-amount" type="number" min="0" placeholder="0">
        </div>
        <div class="form-group">
          <label class="form-label">Metode Pembayaran</label>
          <select class="form-select" id="inv-method">
            <option value="Tunai">Tunai</option>
            <option value="Transfer BCA">Transfer BCA</option>
            <option value="Transfer Mandiri">Transfer Mandiri</option>
            <option value="Lainnya">Lainnya</option>
          </select>
        </div>
      </div>`
          : ''
      }
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Catatan</label>
          <input class="form-input" id="inv-note" type="text" placeholder="Opsional">
        </div>
      </div>`,
      `<button class="btn-ghost" data-action="closeModal">Batal</button>
       <button class="btn" id="inv-save">Simpan</button>`,
      false
    );

    setTimeout(() => {
      const srcSel = document.getElementById('inv-src');
      const partyInp = document.getElementById('inv-party');
      const amountInp = document.getElementById('inv-amount');
      let _srcId = null;
      let _partyId = null;

      srcSel?.addEventListener('change', () => {
        const opt = srcSel.options[srcSel.selectedIndex];
        _srcId = opt?.value || null;
        _partyId = opt?.dataset?.partyid ? Number(opt.dataset.partyid) || null : null;
        if (partyInp) {
          partyInp.value = opt?.dataset?.party || '';
        }
        if (amountInp && opt?.dataset?.amount) {
          amountInp.value = opt.dataset.amount;
        }
      });

      // Preselect a source document (used by "Buat Faktur" on SO/PO detail).
      // The default dropdown filters by status (Delivered/Received); when the
      // caller passes a source that isn't in that filtered list, inject it so
      // the button works regardless of the order's current status.
      if (preselectId && srcSel) {
        let opt = Array.from(srcSel.options).find(o => o.value === preselectId);
        if (!opt) {
          const srcColl = type === 'SI' ? 'salesOrders' : 'purchaseOrders';
          const src = (db()[srcColl] || []).find(d => d.id === preselectId);
          if (src) {
            const partyName = src.customer || src.supplier || '';
            opt = document.createElement('option');
            opt.value = src.id;
            opt.dataset.party = partyName;
            opt.dataset.partyid = src.customerId || src.supplierId || '';
            opt.dataset.amount = src.amount || 0;
            opt.textContent = `${esc(src.id)} · ${esc(partyName)} · ${money(src.amount || 0)}`;
            srcSel.appendChild(opt);
          }
        }
        if (opt) {
          srcSel.value = preselectId;
          srcSel.dispatchEvent(new Event('change'));
        } else {
          window.showToast?.('Dokumen sumber tidak ditemukan', 'warning');
        }
      }

      document.getElementById('inv-save')?.addEventListener('click', () => {
        if (!_srcId) {
          window.showToast?.('Pilih dokumen sumber', 'warning');
          return;
        }
        const date = document.getElementById('inv-date')?.value || today;
        const note = document.getElementById('inv-note')?.value?.trim() || '';
        const partyName = partyInp?.value || '';

        if (isInvoice) {
          saveInvoice(type, _srcId, _partyId, partyName, date, note);
        } else {
          const amount = Math.max(0, parseFloat(amountInp?.value) || 0);
          const method = document.getElementById('inv-method')?.value || 'Tunai';
          if (amount <= 0) {
            window.showToast?.('Jumlah harus > 0', 'warning');
            return;
          }
          saveReceipt(type, _srcId, _partyId, partyName, date, amount, method, note);
        }
      });
    }, 50);
  }

  function saveInvoice(type, srcId, partyId, partyName, date, note) {
    const data = db();
    const coll = collectionFor(type);
    if (!Array.isArray(data[coll])) {
      data[coll] = [];
    }
    const number =
      window.DocEngine?.nextNumber(type, date, { sequences: data.numberSequences, commit: true }) ||
      `${type}-${Date.now()}`;
    const id = `${type}-${Date.now()}`;

    // Pull lines from source doc
    const srcColl = type === 'SI' ? 'salesOrders' : 'purchaseOrders';
    const src = (data[srcColl] || []).find(d => d.id === srcId);
    const lines = src ? (src.lines || []).map(l => ({ ...l })) : [];
    const amount = lines.reduce((s, l) => s + (Number(l.subtotal) || 0), 0);

    const doc = {
      id,
      number,
      date,
      status: 'Outstanding',
      [partyField(type)]: partyName,
      [partyIdField(type)]: partyId,
      sourceId: srcId,
      sourceType: type === 'SI' ? 'SO' : 'PO',
      lines,
      amount,
      note,
    };
    data[coll].push(doc);
    window.saveDB?.();
    window.closeModal?.();
    refresh();
    window.showToast?.(`${number} berhasil dibuat`, 'success');
  }

  function saveReceipt(type, srcId, partyId, partyName, date, amount, method, note) {
    const data = db();
    const coll = collectionFor(type);
    if (!Array.isArray(data[coll])) {
      data[coll] = [];
    }
    const number =
      window.DocEngine?.nextNumber(type, date, { sequences: data.numberSequences, commit: true }) ||
      `${type}-${Date.now()}`;
    const id = `${type}-${Date.now()}`;

    const doc = {
      id,
      number,
      date,
      status: 'Posted',
      [partyField(type)]: partyName,
      [partyIdField(type)]: partyId,
      invoiceId: srcId,
      amount,
      paymentMethod: method,
      note,
    };
    data[coll].push(doc);

    // Auto-mark the source invoice as Paid if fully settled.
    const invColl = type === 'SR' ? 'salesInvoices' : 'purchaseInvoices';
    const receiptColl = coll;
    const inv = (data[invColl] || []).find(i => i.id === srcId);
    if (inv && inv.status === 'Outstanding') {
      const totalPaid = (data[receiptColl] || [])
        .filter(r => r.invoiceId === srcId && r.status === 'Posted')
        .reduce((s, r) => s + (Number(r.amount) || 0), 0);
      if (totalPaid >= (Number(inv.amount) || 0) && (Number(inv.amount) || 0) > 0) {
        inv.status = 'Paid';
      }
    }

    window.saveDB?.();
    window.closeModal?.();
    refresh();
    window.showToast?.(`${number} berhasil dicatat`, 'success');
  }

  // ── Post (Draft → Outstanding for invoices, Draft → Posted for receipts) ───
  function postDoc(type, id) {
    const coll = collectionFor(type);
    const doc = (db()[coll] || []).find(d => d.id === id);
    if (!doc || doc.status !== 'Draft') {
      return;
    }
    const isInvoice = type === 'SI' || type === 'PI';
    doc.status = isInvoice ? 'Outstanding' : 'Posted';
    window.saveDB?.();
    refresh();
    window.showToast?.(`${doc.number || doc.id} → ${doc.status}`, 'success');
  }

  // ── View detail modal ─────────────────────────────────────────────────────
  function viewDoc(type, id) {
    const coll = collectionFor(type);
    const doc = (db()[coll] || []).find(d => d.id === id);
    if (!doc || !window.openModal) {
      return;
    }
    const party = partyField(type);
    const linesHtml =
      (doc.lines || []).length > 0
        ? typeof window.linesDetailHTML === 'function'
          ? window.linesDetailHTML(doc.lines, 'Total', doc)
          : `<div style="margin-top:10px;font-size:12px">${doc.lines.length} item</div>`
        : '';

    const detailRow =
      typeof window.detailRow === 'function'
        ? window.detailRow
        : (l, v) => `<div><strong>${l}:</strong> ${v}</div>`;
    window.openModal(
      `${TAB_LABELS[type]} — ${esc(doc.number || doc.id)}`,
      `<div class="detail-grid">
        ${detailRow('Nomor', esc(doc.number || doc.id))}
        ${detailRow('Status', statusBadge(doc.status))}
        <div class="detail-divider"></div>
        ${detailRow(party === 'supplier' ? 'Supplier' : 'Pelanggan', esc(doc[party] || '—'))}
        ${detailRow('Tanggal', esc(doc.date))}
        ${detailRow('Jumlah', `<strong>${money(doc.amount || 0)}</strong>`)}
        ${doc.paymentMethod ? detailRow('Metode', esc(doc.paymentMethod)) : ''}
        ${doc.sourceId ? detailRow('Sumber', esc(doc.sourceId)) : ''}
        ${doc.invoiceId ? detailRow('Invoice', esc(doc.invoiceId)) : ''}
        ${doc.note ? detailRow('Catatan', esc(doc.note)) : ''}
      </div>
      ${linesHtml}`,
      `${type === 'SI' || type === 'PI' ? `<button class="btn-ghost" data-action="invPrint" data-id="${esc(id)}" data-type="${type}">Cetak PDF</button>` : ''}${window.DocFlow ? window.DocFlow.button(type, id) : ''}<button class="btn-ghost" data-action="closeModal">Tutup</button>`
    );
  }

  // Cetak faktur → window.printDocument (already wired with company info in
  // settings.js). Opens a print window from which the browser can "Save as PDF".
  function printDoc(type, id) {
    const coll = collectionFor(type);
    const doc = (db()[coll] || []).find(d => d.id === id);
    if (!doc) {
      return;
    }
    if (typeof window.printDocument === 'function') {
      window.printDocument(type, doc);
    } else {
      window.showToast?.('Fungsi cetak belum siap', 'warning');
    }
  }

  // ── Wire up ─────────────────────────────────────────────────────────────────
  window.renderInvoices = renderInvoices;
  window.renderSalesInvoices = () => renderOne('SI');
  window.renderPurchaseInvoices = () => renderOne('PI');
  window.renderSalesReceipts = () => renderOne('SR');
  window.renderPurchasePayments = () => renderOne('PP');
  window.viewInvoiceDoc = viewDoc; // used by doc-flow.js "Jejak" navigation

  function _navToTab(tab) {
    activeTab = tab;
    const view = TAB_VIEW[tab];
    if (typeof window.invalidateView === 'function') window.invalidateView(view);
    if (typeof window.navigate === 'function') window.navigate(view);
  }
  window._invoiceExtras = {
    openSalesInvoice:    function () { _navToTab('SI'); },
    openPurchaseInvoice: function () { _navToTab('PI'); },
    openSalesReceipt:    function () { _navToTab('SR'); },
    openPurchasePayment: function () { _navToTab('PP'); },
    // Open the new-invoice modal with a source SO/PO already selected. Used by
    // the "Buat Faktur" buttons on the SO/PO detail views (SI from SO, PI from PO).
    createFromSource: function (type, srcId) {
      if (type !== 'SI' && type !== 'PI') { return; }
      activeTab = type;
      openNewModal(type, srcId);
    },
  };

  if (window.ERP && typeof window.ERP.registerAction === 'function') {
    // The tab bar is gone (each doc type is its own page now), but the action is
    // kept so any lingering markup or deep link still lands somewhere sensible.
    window.ERP.registerAction('invTab', function (_id, _type, val) {
      if (val && TAB_LABELS[val]) {
        _navToTab(val);
      }
      return true;
    });
    window.ERP.registerAction('invNew', function () {
      openNewModal(activeTab);
      return true;
    });
    window.ERP.registerAction('invView', function (id, type) {
      if (id && type) {
        viewDoc(type, id);
      }
      return true;
    });
    window.ERP.registerAction('invPost', function (id, type) {
      if (id && type) {
        postDoc(type, id);
      }
      return true;
    });
    window.ERP.registerAction('invPrint', function (id, type) {
      if (id && type) {
        printDoc(type, id);
      }
      return true;
    });
  }
})();
