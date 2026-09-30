// ═══════════════════════════════════════════════════════════════════════════════
// KELOLA ERP (DEMO) — Document Flow / "Jejak Dokumen"  (doc-flow.js)
//
// Visualises the FULL related-document chain for any document in one clickable
// timeline:  SQ → SO → { DO, SI → SR }   and   PQ → PO → { DO, PI → PP }.
//
// All links already exist in the data; this module only reads them (no DB writes):
//   SO.sourceQuotation → SQ.number|id      PO.sourceQuotation → PQ.number|id
//   DO.soId → SO.id   DO.poId → PO.id
//   SI.sourceId → SO.id                    PI.sourceId → PO.id
//   SR.invoiceId → SI.id                   PP.invoiceId → PI.id
//
// Entry point: a `data-action="docFlow"` button (with data-type / data-id) anywhere
// opens the timeline. Clicking a node opens that document's existing detail view.
//
// Global-scope rule: classic <script>, IIFE-wrapped, exposes only window.DocFlow.
// ═══════════════════════════════════════════════════════════════════════════════
(function () {
  'use strict';

  function esc(s) {
    return typeof window.escapeHtml === 'function'
      ? window.escapeHtml(s)
      : String(s == null ? '' : s);
  }
  function money(v) {
    return typeof window.idrFull === 'function' ? window.idrFull(v) : 'Rp ' + (v || 0);
  }
  function badge(s) {
    return typeof window.badge === 'function' ? window.badge(s) : esc(s);
  }
  function dn(o) {
    return typeof window.docNum === 'function' ? window.docNum(o.number, o.id) : o.number || o.id;
  }
  function DB() {
    return window.DB || {};
  }

  // Per-type metadata. `stage` drives the vertical ordering of the timeline.
  var META = {
    SQ: { coll: 'salesQuotations', label: 'Penawaran Jual', party: 'customer', stage: 0 },
    PQ: { coll: 'purchaseQuotations', label: 'Penawaran Beli', party: 'supplier', stage: 0 },
    SO: { coll: 'salesOrders', label: 'Sales Order', party: 'customer', stage: 1 },
    PO: { coll: 'purchaseOrders', label: 'Purchase Order', party: 'supplier', stage: 1 },
    DO: { coll: 'deliveryOrders', label: 'Surat Jalan / DO', party: 'customer', stage: 2 },
    SI: { coll: 'salesInvoices', label: 'Faktur Jual', party: 'customer', stage: 3 },
    PI: { coll: 'purchaseInvoices', label: 'Faktur Beli', party: 'supplier', stage: 3 },
    SR: { coll: 'salesReceipts', label: 'Penerimaan', party: 'customer', stage: 4 },
    PP: { coll: 'purchasePayments', label: 'Pembayaran', party: 'supplier', stage: 4 },
  };

  function find(type, id) {
    var m = META[type];
    if (!m) return null;
    return (
      (DB()[m.coll] || []).find(function (d) {
        return d.id === id;
      }) || null
    );
  }

  function parents(type, o) {
    var res = [];
    if (type === 'SO' && o.sourceQuotation) {
      var sq = (DB().salesQuotations || []).find(function (q) {
        return q.number === o.sourceQuotation || q.id === o.sourceQuotation;
      });
      if (sq) res.push({ type: 'SQ', id: sq.id });
    }
    if (type === 'PO' && o.sourceQuotation) {
      var pq = (DB().purchaseQuotations || []).find(function (q) {
        return q.number === o.sourceQuotation || q.id === o.sourceQuotation;
      });
      if (pq) res.push({ type: 'PQ', id: pq.id });
    }
    if (type === 'DO') {
      if (o.soId) res.push({ type: 'SO', id: o.soId });
      if (o.poId) res.push({ type: 'PO', id: o.poId });
    }
    if (type === 'SI' && o.sourceId) res.push({ type: 'SO', id: o.sourceId });
    if (type === 'PI' && o.sourceId) res.push({ type: 'PO', id: o.sourceId });
    if (type === 'SR' && o.invoiceId) res.push({ type: 'SI', id: o.invoiceId });
    if (type === 'PP' && o.invoiceId) res.push({ type: 'PI', id: o.invoiceId });
    return res;
  }

  function children(type, o) {
    var res = [];
    if (type === 'SQ') {
      (DB().salesOrders || []).forEach(function (s) {
        if (s.sourceQuotation === o.number || s.sourceQuotation === o.id)
          res.push({ type: 'SO', id: s.id });
      });
    }
    if (type === 'PQ') {
      (DB().purchaseOrders || []).forEach(function (s) {
        if (s.sourceQuotation === o.number || s.sourceQuotation === o.id)
          res.push({ type: 'PO', id: s.id });
      });
    }
    if (type === 'SO') {
      (DB().deliveryOrders || []).forEach(function (d) {
        if (d.soId === o.id) res.push({ type: 'DO', id: d.id });
      });
      (DB().salesInvoices || []).forEach(function (d) {
        if (d.sourceId === o.id) res.push({ type: 'SI', id: d.id });
      });
    }
    if (type === 'PO') {
      (DB().deliveryOrders || []).forEach(function (d) {
        if (d.poId === o.id) res.push({ type: 'DO', id: d.id });
      });
      (DB().purchaseInvoices || []).forEach(function (d) {
        if (d.sourceId === o.id) res.push({ type: 'PI', id: d.id });
      });
    }
    if (type === 'SI') {
      (DB().salesReceipts || []).forEach(function (d) {
        if (d.invoiceId === o.id) res.push({ type: 'SR', id: d.id });
      });
    }
    if (type === 'PI') {
      (DB().purchasePayments || []).forEach(function (d) {
        if (d.invoiceId === o.id) res.push({ type: 'PP', id: d.id });
      });
    }
    return res;
  }

  // BFS the connected component, then order by stage then date.
  function chain(type, id) {
    var seen = {};
    var queue = [{ type: type, id: id }];
    var nodes = [];
    while (queue.length) {
      var n = queue.shift();
      var k = n.type + ':' + n.id;
      if (seen[k]) continue;
      seen[k] = true;
      var o = find(n.type, n.id);
      if (!o) continue;
      nodes.push({ type: n.type, id: n.id, o: o });
      parents(n.type, o)
        .concat(children(n.type, o))
        .forEach(function (e) {
          if (!seen[e.type + ':' + e.id]) queue.push(e);
        });
    }
    nodes.sort(function (a, b) {
      var sa = META[a.type].stage,
        sb = META[b.type].stage;
      if (sa !== sb) return sa - sb;
      var da = a.o.date || '',
        db2 = b.o.date || '';
      return da < db2 ? -1 : da > db2 ? 1 : 0;
    });
    return nodes;
  }

  function nodeCard(n, currentKey) {
    var m = META[n.type],
      o = n.o;
    var isCur = n.type + ':' + n.id === currentKey;
    var party = o[m.party] || o.customer || o.supplier || '';
    var doLines = n.type === 'DO' ? (o.lines && o.lines.length ? o.lines : o.items) : null;
    var qty = doLines
      ? doLines.reduce(function (s, l) {
          return s + (Number(l.qty) || 0);
        }, 0)
      : null;
    var amt = n.type === 'DO' ? '' : money(o.amount || 0);
    return (
      '<div data-action="docFlowGo" data-type="' +
      n.type +
      '" data-id="' +
      esc(n.id) +
      '" ' +
      'style="cursor:pointer;border:1px solid ' +
      (isCur ? 'var(--primary)' : 'var(--border)') +
      ';' +
      'background:' +
      (isCur ? 'rgba(0,122,255,.08)' : 'var(--card,#fff)') +
      ';border-radius:10px;padding:10px 12px">' +
      '<div style="display:flex;justify-content:space-between;gap:8px;align-items:center">' +
      '<span style="font-size:10px;font-weight:800;letter-spacing:.4px;text-transform:uppercase;color:var(--muted)">' +
      esc(m.label) +
      '</span>' +
      badge(o.status || '') +
      '</div>' +
      '<div style="font-weight:800;font-size:13px;margin-top:2px">' +
      esc(dn(o)) +
      (isCur ? ' <span style="font-size:10px;color:var(--primary)">• dibuka</span>' : '') +
      '</div>' +
      '<div style="font-size:11px;color:var(--muted);margin-top:2px">' +
      esc(party) +
      (o.date ? ' · ' + esc(o.date) : '') +
      '</div>' +
      (amt ? '<div style="font-size:12px;font-weight:700;margin-top:3px">' + amt + '</div>' : '') +
      (qty != null
        ? '<div style="font-size:12px;font-weight:700;margin-top:3px">' +
          qty.toLocaleString('id-ID') +
          ' qty</div>'
        : '') +
      '</div>'
    );
  }

  function show(type, id) {
    if (typeof window.openModal !== 'function') return;
    var nodes = chain(type, id);
    if (!nodes.length) {
      window.openModal(
        'Jejak Dokumen',
        '<div style="padding:20px;color:var(--muted)">Dokumen tidak ditemukan.</div>',
        '<button class="btn-ghost" data-action="closeModal">Tutup</button>'
      );
      return;
    }
    var currentKey = type + ':' + id;
    var head =
      '<div style="font-size:12px;color:var(--muted);margin-bottom:14px">Rantai <strong>' +
      nodes.length +
      '</strong> dokumen terkait. Klik kartu untuk membuka detailnya.</div>';
    var body = '<div style="display:flex;flex-direction:column">';
    nodes.forEach(function (n, i) {
      var last = i === nodes.length - 1;
      body +=
        '<div style="display:flex;gap:10px;align-items:stretch">' +
        '<div style="display:flex;flex-direction:column;align-items:center;width:16px">' +
        '<div style="width:11px;height:11px;border-radius:50%;background:var(--primary);margin-top:14px;flex:none"></div>' +
        (last
          ? ''
          : '<div style="flex:1;width:2px;background:var(--border);min-height:14px"></div>') +
        '</div>' +
        '<div style="flex:1;min-width:0;padding-bottom:' +
        (last ? '0' : '12px') +
        '">' +
        nodeCard(n, currentKey) +
        '</div>' +
        '</div>';
    });
    body += '</div>';
    window.openModal(
      'Jejak Dokumen',
      head + body,
      '<button class="btn-ghost" data-action="closeModal">Tutup</button>',
      true
    );
  }

  function navTo(type, id) {
    try {
      window.closeModal && window.closeModal();
    } catch (_) {
      /* noop */
    }
    setTimeout(function () {
      if (type === 'SO' && window.viewSO) return window.viewSO(id);
      if (type === 'PO' && window.viewPO) return window.viewPO(id);
      if (type === 'DO' && window.viewDO) return window.viewDO(id);
      if ((type === 'SQ' || type === 'PQ') && window.viewQuotation)
        return window.viewQuotation(type, id);
      if (
        (type === 'SI' || type === 'PI' || type === 'SR' || type === 'PP') &&
        window.viewInvoiceDoc
      )
        return window.viewInvoiceDoc(type, id);
      window.showToast && window.showToast('Detail ' + type + ' tidak tersedia', 'warning');
    }, 220);
  }

  // Delegated handler for both the entry button and the timeline node cards.
  document.addEventListener('click', function (e) {
    if (!e.target || !e.target.closest) return;
    var go = e.target.closest('[data-action="docFlowGo"]');
    if (go) {
      navTo(go.dataset.type, go.dataset.id);
      return;
    }
    var open = e.target.closest('[data-action="docFlow"]');
    if (open) {
      show(open.dataset.type, open.dataset.id);
    }
  });

  // Reusable footer-button HTML for detail modals.
  function button(type, id) {
    return (
      '<button class="btn-ghost" data-action="docFlow" data-type="' +
      type +
      '" data-id="' +
      esc(id) +
      '" ' +
      'style="display:flex;align-items:center;gap:5px">' +
      '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
      'stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/>' +
      '<circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/>' +
      '<line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>Jejak</button>'
    );
  }

  window.DocFlow = { show: show, chain: chain, button: button, _meta: META };
})();
