// ═══════════════════════════════════════════════════════════════════════════════
// KELOLA ERP (DEMO) — Quotation View  (quotation-view.js)
// Phase 5: Sales Quotation (SQ) and Purchase Quotation (PQ).
//
// Two-tab view at #view-quotations. Each quotation can be converted to SO/PO
// via the "Convert" action, which copies lines into a new Draft SO/PO.
//
// Global-scope rule: classic <script>, IIFE-wrapped, exposes only
// window.renderQuotations (+ ERP action registrations).
// ═══════════════════════════════════════════════════════════════════════════════
(function () {
  'use strict';

  let activeTab = 'SQ'; // 'SQ' | 'PQ'

  function esc(s) {
    return typeof window.escapeHtml === 'function'
      ? window.escapeHtml(s)
      : String(s == null ? '' : s);
  }
  function money(v) {
    return typeof window.idrFull === 'function' ? window.idrFull(v) : 'Rp ' + v;
  }
  function db() {
    return window.DB || {};
  }

  var TAB_LABELS = { SQ: 'Penawaran Penjualan', PQ: 'Penawaran Pembelian' };

  function statusBadge(s) {
    return typeof window.badge === 'function' ? window.badge(s) : esc(s);
  }

  function collFor(t) {
    return t === 'PQ' ? 'purchaseQuotations' : 'salesQuotations';
  }
  function partyField(t) {
    return t === 'PQ' ? 'supplier' : 'customer';
  }
  function partyIdField(t) {
    return t === 'PQ' ? 'supplierId' : 'customerId';
  }
  function partyColl(t) {
    return t === 'PQ' ? 'suppliers' : 'customers';
  }
  function partyLabel(t) {
    return t === 'PQ' ? 'Supplier' : 'Pelanggan';
  }

  // ── List rendering ──────────────────────────────────────────────────────────
  function listTab(type) {
    var coll = collFor(type);
    var docs = (db()[coll] || []).slice().reverse();
    if (docs.length === 0) {
      return (
        '<div class="card"><div style="padding:20px;text-align:center;color:var(--muted);font-size:13px">' +
        'Belum ada ' +
        TAB_LABELS[type].toLowerCase() +
        '. Klik <strong>Buat Quotation</strong>.' +
        '</div></div>'
      );
    }
    var pf = partyField(type);
    var rows = docs
      .map(function (d) {
        var canConvert = d.status === 'Accepted';
        return (
          '<tr style="border-bottom:1px solid var(--border)">' +
          '<td class="td-p" style="font-size:11px;font-weight:700;color:var(--primary)">' +
          esc(d.number || d.id) +
          '</td>' +
          '<td class="td-p" style="font-size:13px;font-weight:600">' +
          esc(d[pf] || '—') +
          '</td>' +
          '<td class="td-p" style="font-size:11px;color:var(--muted)">' +
          esc(d.date) +
          '</td>' +
          '<td class="td-p" style="font-size:11px;color:var(--muted)">' +
          esc(d.validUntil || '—') +
          '</td>' +
          '<td class="td-p" style="font-size:13px;font-weight:800;text-align:right">' +
          money(d.amount || 0) +
          '</td>' +
          '<td class="td-p">' +
          statusBadge(d.status) +
          '</td>' +
          '<td class="td-p">' +
          '<button class="action-ghost" data-action="qtView" data-id="' +
          esc(d.id) +
          '" data-type="' +
          type +
          '">Lihat</button>' +
          (d.status === 'Draft'
            ? ' <button class="action-primary" data-action="qtSend" data-id="' +
              esc(d.id) +
              '" data-type="' +
              type +
              '">Kirim</button>'
            : '') +
          (canConvert
            ? ' <button class="action-primary" data-action="qtConvert" data-id="' +
              esc(d.id) +
              '" data-type="' +
              type +
              '" style="background:#34C759">Convert → ' +
              (type === 'SQ' ? 'SO' : 'PO') +
              '</button>'
            : '') +
          '</td>' +
          '</tr>'
        );
      })
      .join('');

    return (
      '<div class="card">' +
      '<div style="font-size:14px;font-weight:700;margin-bottom:10px">' +
      TAB_LABELS[type] +
      ' (' +
      docs.length +
      ')</div>' +
      '<div class="table-wrap"><table style="width:100%;border-collapse:collapse">' +
      '<thead><tr>' +
      '<th style="padding:8px 10px;font-size:11px;font-weight:700;text-align:left">No.</th>' +
      '<th style="padding:8px 10px;font-size:11px;font-weight:700;text-align:left">' +
      partyLabel(type) +
      '</th>' +
      '<th style="padding:8px 10px;font-size:11px;font-weight:700;text-align:left">Tanggal</th>' +
      '<th style="padding:8px 10px;font-size:11px;font-weight:700;text-align:left">Berlaku s/d</th>' +
      '<th style="padding:8px 10px;font-size:11px;font-weight:700;text-align:right">Jumlah</th>' +
      '<th style="padding:8px 10px;font-size:11px;font-weight:700;text-align:left">Status</th>' +
      '<th style="padding:8px 10px;font-size:11px;font-weight:700;text-align:left">Aksi</th>' +
      '</tr></thead>' +
      '<tbody>' +
      rows +
      '</tbody>' +
      '</table></div></div>'
    );
  }

  // ── Main renderer ─────────────────────────────────────────────────────────
  // Sales and purchase quotations are separate pages. They used to share one
  // tabbed view, so picking either from the menu landed on a screen titled
  // "Quotation" with the other tab sitting next to it.
  var TAB_VIEW = { SQ: 'salesQuotations', PQ: 'purchaseQuotations' };
  var TAB_SUB = {
    SQ: 'Penawaran harga yang dikirim ke pelanggan',
    PQ: 'Permintaan penawaran ke supplier',
  };

  /** Render one quotation type as a standalone page (no tab bar). */
  function renderOne(tab) {
    activeTab = tab;
    var header =
      typeof window.secHdr === 'function'
        ? window.secHdr(TAB_LABELS[tab], TAB_SUB[tab], 'Buat Penawaran', 'qtNew')
        : '<h1>' + esc(TAB_LABELS[tab]) + '</h1>';
    return header + listTab(tab);
  }

  // Legacy `quotations` view id — kept for older links and doc-flow "Jejak".
  function renderQuotations() {
    return renderOne(activeTab);
  }

  function refresh() {
    var el =
      document.getElementById('view-' + TAB_VIEW[activeTab]) ||
      document.getElementById('view-quotations');
    if (el) el.innerHTML = renderOne(activeTab);
  }

  // ── Create modal ──────────────────────────────────────────────────────────
  function itemOptions(type) {
    var priceField = type === 'PQ' ? 'cost' : 'sell';
    return (db().inventoryItems || [])
      .map(function (i) {
        return (
          '<option value="' +
          esc(i.id) +
          '" data-price="' +
          (i[priceField] || 0) +
          '" data-name="' +
          esc(i.name) +
          '">' +
          esc(i.name) +
          ' (' +
          esc(i.unit) +
          ')</option>'
        );
      })
      .join('');
  }

  function lineRowHTML(type) {
    return (
      '<tr class="qt-line">' +
      '<td style="padding:4px 6px"><select class="form-select qt-item" style="font-size:12px;padding:5px 8px;width:100%">' +
      '<option value="custom">— Item manual —</option>' +
      itemOptions(type) +
      '</select></td>' +
      '<td style="padding:4px 6px"><input class="form-input qt-qty" type="number" min="1" value="1" style="font-size:12px;padding:5px 8px;width:70px"></td>' +
      '<td style="padding:4px 6px"><input class="form-input qt-price" type="number" min="0" value="0" style="font-size:12px;padding:5px 8px;width:120px"></td>' +
      '<td style="padding:4px 6px;font-size:12px;font-weight:700;text-align:right" class="qt-sub">Rp 0</td>' +
      '<td style="padding:4px 6px;text-align:center"><button type="button" class="qt-del" title="Hapus" style="background:none;border:none;cursor:pointer;color:var(--muted);font-size:18px;line-height:1">×</button></td>' +
      '</tr>'
    );
  }

  function openNewModal(type) {
    if (!window.openModal) return;
    var today =
      typeof window.today === 'function' ? window.today() : new Date().toISOString().slice(0, 10);
    var parties = (db()[partyColl(type)] || [])
      .map(function (p) {
        return '<option value="' + esc(p.name) + '">';
      })
      .join('');

    window.openModal(
      'Buat ' + TAB_LABELS[type],
      '<div class="form-row">' +
        '<div class="form-group"><label class="form-label">' +
        partyLabel(type) +
        '</label>' +
        '<input class="form-input" id="qt-party" type="text" list="qt-parties" placeholder="Nama ' +
        partyLabel(type).toLowerCase() +
        '">' +
        '<datalist id="qt-parties">' +
        parties +
        '</datalist></div>' +
        '<div class="form-group"><label class="form-label">Tanggal</label>' +
        '<input class="form-input" id="qt-date" type="date" value="' +
        today +
        '"></div>' +
        '<div class="form-group"><label class="form-label">Berlaku s/d</label>' +
        '<input class="form-input" id="qt-valid" type="date"></div>' +
        '</div>' +
        '<div style="margin-top:10px">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">' +
        '<span class="form-label" style="margin:0;font-size:13px;font-weight:700">Item</span>' +
        '<button type="button" class="btn-ghost" id="qt-add-line" style="font-size:11px;padding:4px 10px">+ Tambah Item</button>' +
        '</div>' +
        '<table style="width:100%;border-collapse:collapse"><thead><tr style="background:var(--bg)">' +
        '<th style="padding:6px 8px;font-size:11px;font-weight:700;text-align:left">Item</th>' +
        '<th style="padding:6px 8px;font-size:11px;font-weight:700;text-align:left;width:80px">Qty</th>' +
        '<th style="padding:6px 8px;font-size:11px;font-weight:700;text-align:left;width:130px">Harga</th>' +
        '<th style="padding:6px 8px;font-size:11px;font-weight:700;text-align:right;width:130px">Subtotal</th>' +
        '<th style="width:30px"></th>' +
        '</tr></thead><tbody id="qt-lines">' +
        lineRowHTML(type) +
        '</tbody></table>' +
        '<div style="display:flex;justify-content:flex-end;margin-top:8px;font-size:13px;font-weight:800">Total: <span id="qt-total" style="margin-left:6px">Rp 0</span></div>' +
        '</div>' +
        '<div class="form-row" style="margin-top:10px"><div class="form-group"><label class="form-label">Catatan</label>' +
        '<input class="form-input" id="qt-note" type="text" placeholder="Syarat & ketentuan (opsional)"></div></div>',
      '<button class="btn-ghost" data-action="closeModal">Batal</button>' +
        ' <button class="btn" id="qt-save">Simpan</button>',
      true
    );

    setTimeout(function () {
      var body = document.getElementById('qt-lines');
      var totalEl = document.getElementById('qt-total');

      function recalcLine(tr) {
        var qty = parseFloat(tr.querySelector('.qt-qty').value) || 0;
        var price = parseFloat(tr.querySelector('.qt-price').value) || 0;
        var sub = Math.round(qty * price);
        tr.querySelector('.qt-sub').textContent = money(sub);
      }
      function recalcTotal() {
        var total = 0;
        body.querySelectorAll('tr').forEach(function (tr) {
          var qty = parseFloat(tr.querySelector('.qt-qty').value) || 0;
          var price = parseFloat(tr.querySelector('.qt-price').value) || 0;
          total += Math.round(qty * price);
        });
        totalEl.textContent = money(total);
      }
      function wireRow(tr) {
        var itemSel = tr.querySelector('.qt-item');
        var priceInp = tr.querySelector('.qt-price');
        itemSel.addEventListener('change', function () {
          var opt = itemSel.options[itemSel.selectedIndex];
          if (opt && opt.dataset.price) priceInp.value = opt.dataset.price;
          recalcLine(tr);
          recalcTotal();
        });
        tr.querySelector('.qt-qty').addEventListener('input', function () {
          recalcLine(tr);
          recalcTotal();
        });
        priceInp.addEventListener('input', function () {
          recalcLine(tr);
          recalcTotal();
        });
        tr.querySelector('.qt-del').addEventListener('click', function () {
          tr.remove();
          recalcTotal();
        });
      }
      body.querySelectorAll('tr').forEach(wireRow);

      document.getElementById('qt-add-line').addEventListener('click', function () {
        var tmp = document.createElement('tbody');
        tmp.innerHTML = lineRowHTML(type);
        var tr = tmp.firstElementChild;
        body.appendChild(tr);
        wireRow(tr);
      });

      document.getElementById('qt-save').addEventListener('click', function () {
        var partyName = (document.getElementById('qt-party').value || '').trim();
        if (!partyName) {
          window.showToast(partyLabel(type) + ' harus diisi', 'warning');
          return;
        }
        var date = document.getElementById('qt-date').value;
        var validUntil = document.getElementById('qt-valid').value || '';
        var note = (document.getElementById('qt-note').value || '').trim();
        var lines = [];
        body.querySelectorAll('tr').forEach(function (tr) {
          var itemSel = tr.querySelector('.qt-item');
          var itemId = itemSel.value;
          var itemName =
            itemId === 'custom'
              ? 'Custom Item'
              : itemSel.options[itemSel.selectedIndex].dataset.name || '';
          var qty = parseFloat(tr.querySelector('.qt-qty').value) || 0;
          var price = parseFloat(tr.querySelector('.qt-price').value) || 0;
          if (qty > 0 && price > 0) {
            lines.push({
              itemId: itemId,
              itemName: itemName,
              qty: qty,
              price: price,
              subtotal: Math.round(qty * price),
            });
          }
        });
        if (lines.length === 0) {
          window.showToast('Tambahkan minimal 1 item', 'warning');
          return;
        }

        var data = db();
        var coll = collFor(type);
        if (!Array.isArray(data[coll])) data[coll] = [];
        var number = window.DocEngine
          ? window.DocEngine.nextNumber(type, date, {
              sequences: data.numberSequences,
              commit: true,
            })
          : type + '-' + Date.now();
        var id = type + '-' + Date.now();
        var amount = lines.reduce(function (s, l) {
          return s + l.subtotal;
        }, 0);

        // Resolve party ID
        var partyId = window.DocEngine ? window.DocEngine.resolvePartyId(type, partyName) : null;

        var doc = {
          id: id,
          number: number,
          date: date,
          validUntil: validUntil,
          status: 'Draft',
          amount: amount,
          lines: lines,
          note: note,
        };
        doc[partyField(type)] = partyName;
        doc[partyIdField(type)] = partyId;

        data[coll].push(doc);
        if (window.saveDB) window.saveDB();
        if (window.closeModal) window.closeModal();
        refresh();
        window.showToast(number + ' berhasil dibuat', 'success');
      });
    }, 50);
  }

  // ── Send (Draft → Sent) ───────────────────────────────────────────────────
  function sendQuotation(type, id) {
    var coll = collFor(type);
    var doc = (db()[coll] || []).find(function (d) {
      return d.id === id;
    });
    if (!doc || doc.status !== 'Draft') return;
    doc.status = 'Sent';
    if (window.saveDB) window.saveDB();
    refresh();
    window.showToast((doc.number || doc.id) + ' → Dikirim', 'success');
  }

  // ── Convert to SO/PO ─────────────────────────────────────────────────────
  function convertQuotation(type, id) {
    var coll = collFor(type);
    var doc = (db()[coll] || []).find(function (d) {
      return d.id === id;
    });
    if (!doc || doc.status !== 'Accepted') return;

    var data = db();
    var targetType = type === 'SQ' ? 'SO' : 'PO';
    var targetColl = type === 'SQ' ? 'salesOrders' : 'purchaseOrders';
    if (!Array.isArray(data[targetColl])) data[targetColl] = [];

    // Generate next ID using the existing pattern
    var nextId =
      typeof window.nextId === 'function'
        ? window.nextId(targetType, data[targetColl])
        : targetType + '-' + Date.now();

    var newDoc = {
      id: nextId,
      date:
        typeof window.today === 'function' ? window.today() : new Date().toISOString().slice(0, 10),
      status: 'Draft',
      amount: doc.amount || 0,
      lines: (doc.lines || []).map(function (l) {
        return Object.assign({}, l);
      }),
      sourceQuotation: doc.number || doc.id,
    };

    if (type === 'SQ') {
      newDoc.customer = doc.customer || '';
      newDoc.customerId = doc.customerId || null;
    } else {
      newDoc.supplier = doc.supplier || '';
      newDoc.supplierId = doc.supplierId || null;
    }

    data[targetColl].push(newDoc);
    if (window.saveDB) window.saveDB();
    refresh();
    window.showToast(
      (doc.number || doc.id) + ' → ' + nextId + ' (' + targetType + ' Draft)',
      'success'
    );
  }

  // ── View detail ───────────────────────────────────────────────────────────
  function viewQuotation(type, id) {
    var coll = collFor(type);
    var doc = (db()[coll] || []).find(function (d) {
      return d.id === id;
    });
    if (!doc || !window.openModal) return;

    var pf = partyField(type);
    var detailRow =
      typeof window.detailRow === 'function'
        ? window.detailRow
        : function (l, v) {
            return '<div><strong>' + l + ':</strong> ' + v + '</div>';
          };

    var linesHtml = '';
    if (doc.lines && doc.lines.length > 0) {
      linesHtml =
        '<div style="margin-top:12px"><div style="font-size:12px;font-weight:700;margin-bottom:6px">Item (' +
        doc.lines.length +
        ')</div>' +
        '<table style="width:100%;border-collapse:collapse;font-size:12px"><thead><tr style="background:var(--bg)">' +
        '<th style="padding:6px 8px;text-align:left">Item</th><th style="padding:6px 8px;text-align:right">Qty</th>' +
        '<th style="padding:6px 8px;text-align:right">Harga</th><th style="padding:6px 8px;text-align:right">Subtotal</th>' +
        '</tr></thead><tbody>';
      doc.lines.forEach(function (l) {
        var name = l.itemName || l.itemId;
        linesHtml +=
          '<tr style="border-bottom:1px solid var(--border)">' +
          '<td style="padding:5px 8px">' +
          esc(name) +
          '</td>' +
          '<td style="padding:5px 8px;text-align:right">' +
          (l.qty || 0) +
          '</td>' +
          '<td style="padding:5px 8px;text-align:right">' +
          money(l.price || 0) +
          '</td>' +
          '<td style="padding:5px 8px;text-align:right;font-weight:700">' +
          money(l.subtotal || 0) +
          '</td></tr>';
      });
      linesHtml += '</tbody></table></div>';
    }

    // Status action buttons
    var actions = '';
    if (doc.status === 'Sent') {
      actions =
        '<button class="btn" data-action="closeModal" onclick="(function(){var d=(window.DB[\'' +
        collFor(type) +
        "']||[]).find(function(x){return x.id==='" +
        id +
        "'});if(d){d.status='Accepted';window.saveDB&&window.saveDB();window.closeModal&&window.closeModal();var el=document.getElementById('view-quotations');if(el&&window.renderQuotations)el.innerHTML=window.renderQuotations();window.showToast&&window.showToast('Status → Diterima','success')}})()\" style=\"background:#34C759;margin-right:6px\">Terima</button>" +
        '<button class="btn" data-action="closeModal" onclick="(function(){var d=(window.DB[\'' +
        collFor(type) +
        "']||[]).find(function(x){return x.id==='" +
        id +
        "'});if(d){d.status='Rejected';window.saveDB&&window.saveDB();window.closeModal&&window.closeModal();var el=document.getElementById('view-quotations');if(el&&window.renderQuotations)el.innerHTML=window.renderQuotations();window.showToast&&window.showToast('Status → Ditolak','warning')}})()\" style=\"background:#FF3B30;margin-right:6px\">Tolak</button>";
    }

    window.openModal(
      TAB_LABELS[type] + ' — ' + esc(doc.number || doc.id),
      '<div class="detail-grid">' +
        detailRow('Nomor', esc(doc.number || doc.id)) +
        detailRow('Status', statusBadge(doc.status)) +
        '<div class="detail-divider"></div>' +
        detailRow(partyLabel(type), esc(doc[pf] || '—')) +
        detailRow('Tanggal', esc(doc.date)) +
        detailRow('Berlaku s/d', esc(doc.validUntil || '—')) +
        detailRow('Jumlah', '<strong>' + money(doc.amount || 0) + '</strong>') +
        (doc.note ? detailRow('Catatan', esc(doc.note)) : '') +
        '</div>' +
        linesHtml,
      actions +
        (window.DocFlow ? window.DocFlow.button(type, id) : '') +
        '<button class="btn-ghost" data-action="closeModal">Tutup</button>'
    );
  }

  // ── Wire up ───────────────────────────────────────────────────────────────
  window.renderQuotations = renderQuotations;
  window.renderSalesQuotations = function () { return renderOne('SQ'); };
  window.renderPurchaseQuotations = function () { return renderOne('PQ'); };
  window.viewQuotation = viewQuotation; // used by doc-flow.js "Jejak" navigation

  function _navToTab(tab) {
    activeTab = tab;
    var view = TAB_VIEW[tab];
    if (typeof window.invalidateView === 'function') window.invalidateView(view);
    if (typeof window.navigate === 'function') window.navigate(view);
  }
  window._quotationExtras = {
    openSalesQuotation:    function () { _navToTab('SQ'); },
    openPurchaseQuotation: function () { _navToTab('PQ'); },
  };

  if (window.ERP && typeof window.ERP.registerAction === 'function') {
    // Tab bar is gone; the action survives so stale markup still routes.
    window.ERP.registerAction('qtTab', function (_id, _type, val) {
      if (val && TAB_LABELS[val]) {
        _navToTab(val);
      }
      return true;
    });
    window.ERP.registerAction('qtNew', function () {
      openNewModal(activeTab);
      return true;
    });
    window.ERP.registerAction('qtView', function (id, type) {
      if (id && type) viewQuotation(type, id);
      return true;
    });
    window.ERP.registerAction('qtSend', function (id, type) {
      if (id && type) sendQuotation(type, id);
      return true;
    });
    window.ERP.registerAction('qtConvert', function (id, type) {
      if (id && type) convertQuotation(type, id);
      return true;
    });
  }
})();
