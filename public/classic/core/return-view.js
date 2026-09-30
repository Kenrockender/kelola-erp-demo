// ═══════════════════════════════════════════════════════════════════════════════
// KELOLA ERP (DEMO) — Returns View  (return-view.js)
// Phase 5: Sales Return (SRN) and Purchase Return (PRN).
//
// Two-tab view at #view-returns. Each return is created from a source SO
// (for SRN) or PO/PI (for PRN). Posting reverses inventory and GL entries.
// Stock adjustment on post: returned qty is added back (SRN) or subtracted
// (PRN) from inventory.
//
// Global-scope rule: classic <script>, IIFE-wrapped, exposes only
// window.renderReturns (+ ERP action registrations).
// ═══════════════════════════════════════════════════════════════════════════════
(function () {
  'use strict';

  let activeTab = 'SRN'; // 'SRN' | 'PRN'

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

  var TAB_LABELS = { SRN: 'Retur Penjualan', PRN: 'Retur Pembelian' };

  function statusBadge(s) {
    return typeof window.badge === 'function' ? window.badge(s) : esc(s);
  }

  function collFor(t) {
    return t === 'PRN' ? 'purchaseReturns' : 'salesReturns';
  }
  function partyField(t) {
    return t === 'PRN' ? 'supplier' : 'customer';
  }
  function partyIdField(t) {
    return t === 'PRN' ? 'supplierId' : 'customerId';
  }
  function partyLabel(t) {
    return t === 'PRN' ? 'Supplier' : 'Pelanggan';
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
        '. Klik <strong>Buat Retur</strong>.' +
        '</div></div>'
      );
    }
    var pf = partyField(type);
    var rows = docs
      .map(function (d) {
        return (
          '<tr style="border-bottom:1px solid var(--border)">' +
          '<td class="td-p" style="font-size:11px;font-weight:700;color:var(--primary)">' +
          esc(d.number || d.id) +
          '</td>' +
          '<td class="td-p" style="font-size:13px;font-weight:600">' +
          esc(d[pf] || '—') +
          '</td>' +
          '<td class="td-p" style="font-size:11px;color:var(--muted)">' +
          esc(d.sourceId || '—') +
          '</td>' +
          '<td class="td-p" style="font-size:11px;color:var(--muted)">' +
          esc(d.date) +
          '</td>' +
          '<td class="td-p" style="font-size:13px;font-weight:800;text-align:right">' +
          money(d.amount || 0) +
          '</td>' +
          '<td class="td-p">' +
          statusBadge(d.status) +
          '</td>' +
          '<td class="td-p">' +
          '<button class="action-ghost" data-action="rtView" data-id="' +
          esc(d.id) +
          '" data-type="' +
          type +
          '">Lihat</button>' +
          (d.status === 'Draft'
            ? ' <button class="action-primary" data-action="rtPost" data-id="' +
              esc(d.id) +
              '" data-type="' +
              type +
              '">Post</button>'
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
      '<th style="padding:8px 10px;font-size:11px;font-weight:700;text-align:left">Sumber</th>' +
      '<th style="padding:8px 10px;font-size:11px;font-weight:700;text-align:left">Tanggal</th>' +
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
  // Sales and purchase returns are separate pages — the two reverse opposite
  // sides of the ledger and were only ever sharing a screen for convenience.
  var TAB_VIEW = { SRN: 'salesReturns', PRN: 'purchaseReturns' };
  var TAB_SUB = {
    SRN: 'Barang dikembalikan pelanggan — membalik stok & GL',
    PRN: 'Barang dikembalikan ke supplier — membalik stok & GL',
  };

  /** Render one return type as a standalone page (no tab bar). */
  function renderOne(tab) {
    activeTab = tab;
    var header =
      typeof window.secHdr === 'function'
        ? window.secHdr(TAB_LABELS[tab], TAB_SUB[tab], 'Buat Retur', 'rtNew')
        : '<h1>' + esc(TAB_LABELS[tab]) + '</h1>';
    return header + listTab(tab);
  }

  // Legacy `returns` view id — kept for older links and doc-flow "Jejak".
  function renderReturns() {
    return renderOne(activeTab);
  }

  function refresh() {
    var el =
      document.getElementById('view-' + TAB_VIEW[activeTab]) ||
      document.getElementById('view-returns');
    if (el) el.innerHTML = renderOne(activeTab);
  }

  // ── Source options ────────────────────────────────────────────────────────
  function sourceOptions(type) {
    if (type === 'SRN') {
      // Can return from Delivered SOs or Outstanding/Paid SIs
      var opts = '';
      (db().salesOrders || [])
        .filter(function (o) {
          return o.status === 'Delivered';
        })
        .forEach(function (o) {
          opts +=
            '<option value="' +
            esc(o.id) +
            '" data-party="' +
            esc(o.customer) +
            '" data-partyid="' +
            (o.customerId || '') +
            '" data-type="SO">' +
            esc(o.id) +
            ' (SO) · ' +
            esc(o.customer) +
            ' · ' +
            money(o.amount || 0) +
            '</option>';
        });
      (db().salesInvoices || [])
        .filter(function (i) {
          return i.status === 'Outstanding' || i.status === 'Paid';
        })
        .forEach(function (i) {
          opts +=
            '<option value="' +
            esc(i.id) +
            '" data-party="' +
            esc(i.customer) +
            '" data-partyid="' +
            (i.customerId || '') +
            '" data-type="SO">' +
            esc(i.number || i.id) +
            ' (SO) · ' +
            esc(i.customer) +
            ' · ' +
            money(i.amount || 0) +
            '</option>';
        });
      return opts;
    }
    if (type === 'PRN') {
      var opts2 = '';
      (db().purchaseOrders || [])
        .filter(function (o) {
          return o.status === 'Received';
        })
        .forEach(function (o) {
          opts2 +=
            '<option value="' +
            esc(o.id) +
            '" data-party="' +
            esc(o.supplier) +
            '" data-partyid="' +
            (o.supplierId || '') +
            '" data-type="PO">' +
            esc(o.id) +
            ' (PO) · ' +
            esc(o.supplier) +
            ' · ' +
            money(o.amount || 0) +
            '</option>';
        });
      (db().purchaseInvoices || [])
        .filter(function (i) {
          return i.status === 'Outstanding' || i.status === 'Paid';
        })
        .forEach(function (i) {
          opts2 +=
            '<option value="' +
            esc(i.id) +
            '" data-party="' +
            esc(i.supplier) +
            '" data-partyid="' +
            (i.supplierId || '') +
            '" data-type="PI">' +
            esc(i.number || i.id) +
            ' (PI) · ' +
            esc(i.supplier) +
            ' · ' +
            money(i.amount || 0) +
            '</option>';
        });
      return opts2;
    }
    return '';
  }

  // ── Create modal ──────────────────────────────────────────────────────────
  function openNewModal(type) {
    if (!window.openModal) return;
    var today =
      typeof window.today === 'function' ? window.today() : new Date().toISOString().slice(0, 10);
    var srcLabel = type === 'SRN' ? 'SO/Faktur Penjualan' : 'PO/Faktur Pembelian';

    window.openModal(
      'Buat ' + TAB_LABELS[type],
      '<div class="form-row">' +
        '<div class="form-group" style="grid-column:1/-1"><label class="form-label">Ambil dari ' +
        srcLabel +
        '</label>' +
        '<select class="form-select" id="rt-src"><option value="">— Pilih —</option>' +
        sourceOptions(type) +
        '</select></div>' +
        '</div>' +
        '<div class="form-row">' +
        '<div class="form-group"><label class="form-label">' +
        partyLabel(type) +
        '</label>' +
        '<input class="form-input" id="rt-party" type="text" readonly style="background:var(--bg)"></div>' +
        '<div class="form-group"><label class="form-label">Tanggal Retur</label>' +
        '<input class="form-input" id="rt-date" type="date" value="' +
        today +
        '"></div>' +
        '</div>' +
        '<div style="margin-top:10px"><div style="font-size:13px;font-weight:700;margin-bottom:6px">Item yang diretur</div>' +
        '<div id="rt-lines-wrap" style="font-size:12px;color:var(--muted)">Pilih dokumen sumber di atas</div></div>' +
        '<div class="form-row" style="margin-top:10px"><div class="form-group"><label class="form-label">Alasan Retur</label>' +
        '<input class="form-input" id="rt-reason" type="text" placeholder="Barang rusak / tidak sesuai"></div></div>',
      '<button class="btn-ghost" data-action="closeModal">Batal</button>' +
        ' <button class="btn" id="rt-save">Simpan Retur</button>',
      true
    );

    setTimeout(function () {
      var srcSel = document.getElementById('rt-src');
      var partyInp = document.getElementById('rt-party');
      var linesWrap = document.getElementById('rt-lines-wrap');
      var _srcId = null;
      var _srcType = null;
      var _partyId = null;
      var _srcLines = [];

      srcSel.addEventListener('change', function () {
        var opt = srcSel.options[srcSel.selectedIndex];
        _srcId = opt.value || null;
        _srcType = opt.dataset ? opt.dataset.type : null;
        _partyId = opt.dataset ? Number(opt.dataset.partyid) || null : null;
        partyInp.value = opt.dataset ? opt.dataset.party || '' : '';

        // Load lines from source
        _srcLines = [];
        if (_srcId && _srcType) {
          var collMap = {
            SO: 'salesOrders',
            PO: 'purchaseOrders',
            SI: 'salesInvoices',
            PI: 'purchaseInvoices',
          };
          var srcDoc = (db()[collMap[_srcType]] || []).find(function (d) {
            return d.id === _srcId;
          });
          if (srcDoc && srcDoc.lines) {
            _srcLines = srcDoc.lines.map(function (l) {
              return Object.assign({}, l, { returnQty: l.qty || 0 });
            });
          }
        }

        // Render editable return lines
        if (_srcLines.length > 0) {
          var html =
            '<table style="width:100%;border-collapse:collapse;font-size:12px"><thead><tr style="background:var(--bg)">' +
            '<th style="padding:6px 8px;text-align:left">Item</th>' +
            '<th style="padding:6px 8px;text-align:right">Qty Asli</th>' +
            '<th style="padding:6px 8px;text-align:right">Qty Retur</th>' +
            '<th style="padding:6px 8px;text-align:right">Harga</th>' +
            '<th style="padding:6px 8px;text-align:right">Subtotal</th>' +
            '</tr></thead><tbody>';
          _srcLines.forEach(function (l, i) {
            var name = l.itemName || l.itemId || 'Item';
            html +=
              '<tr style="border-bottom:1px solid var(--border)">' +
              '<td style="padding:5px 8px">' +
              esc(name) +
              '</td>' +
              '<td style="padding:5px 8px;text-align:right">' +
              (l.qty || 0) +
              '</td>' +
              '<td style="padding:5px 8px;text-align:right"><input class="form-input rt-rqty" data-idx="' +
              i +
              '" type="number" min="0" max="' +
              (l.qty || 0) +
              '" value="' +
              (l.qty || 0) +
              '" style="width:70px;font-size:12px;padding:3px 6px;text-align:right"></td>' +
              '<td style="padding:5px 8px;text-align:right">' +
              money(l.price || 0) +
              '</td>' +
              '<td style="padding:5px 8px;text-align:right;font-weight:700" class="rt-sub" data-idx="' +
              i +
              '">' +
              money((l.qty || 0) * (l.price || 0)) +
              '</td>' +
              '</tr>';
          });
          html +=
            '</tbody><tfoot><tr style="border-top:2px solid var(--border)">' +
            '<td colspan="4" style="padding:6px 8px;text-align:right;font-weight:800">Total Retur</td>' +
            '<td style="padding:6px 8px;text-align:right;font-weight:800" id="rt-total">' +
            money(
              _srcLines.reduce(function (s, l) {
                return s + (l.qty || 0) * (l.price || 0);
              }, 0)
            ) +
            '</td>' +
            '</tr></tfoot></table>';
          linesWrap.innerHTML = html;

          // Wire qty change
          linesWrap.querySelectorAll('.rt-rqty').forEach(function (inp) {
            inp.addEventListener('input', function () {
              var idx = parseInt(inp.dataset.idx);
              var q = Math.max(0, Math.min(parseFloat(inp.value) || 0, _srcLines[idx].qty || 0));
              _srcLines[idx].returnQty = q;
              var sub = Math.round(q * (_srcLines[idx].price || 0));
              var subEl = linesWrap.querySelector('.rt-sub[data-idx="' + idx + '"]');
              if (subEl) subEl.textContent = money(sub);
              var total = _srcLines.reduce(function (s, l) {
                return s + Math.round((l.returnQty || 0) * (l.price || 0));
              }, 0);
              var totalEl = document.getElementById('rt-total');
              if (totalEl) totalEl.textContent = money(total);
            });
          });
        } else {
          linesWrap.innerHTML =
            '<div style="color:var(--muted)">Tidak ada item pada dokumen sumber.</div>';
        }
      });

      document.getElementById('rt-save').addEventListener('click', function () {
        if (!_srcId) {
          window.showToast('Pilih dokumen sumber', 'warning');
          return;
        }

        var returnLines = _srcLines
          .filter(function (l) {
            return (l.returnQty || 0) > 0;
          })
          .map(function (l) {
            return {
              itemId: l.itemId,
              itemName: l.itemName || l.itemId,
              qty: l.returnQty,
              price: l.price,
              subtotal: Math.round((l.returnQty || 0) * (l.price || 0)),
            };
          });
        if (returnLines.length === 0) {
          window.showToast('Tidak ada item yang diretur', 'warning');
          return;
        }

        var data = db();
        var coll = collFor(type);
        if (!Array.isArray(data[coll])) data[coll] = [];
        var date = document.getElementById('rt-date').value;
        var reason = (document.getElementById('rt-reason').value || '').trim();
        var number = window.DocEngine
          ? window.DocEngine.nextNumber(type, date, {
              sequences: data.numberSequences,
              commit: true,
            })
          : type + '-' + Date.now();
        var id = type + '-' + Date.now();
        var amount = returnLines.reduce(function (s, l) {
          return s + l.subtotal;
        }, 0);

        var doc = {
          id: id,
          number: number,
          date: date,
          status: 'Draft',
          sourceId: _srcId,
          sourceType: _srcType,
          amount: amount,
          lines: returnLines,
          reason: reason,
        };
        doc[partyField(type)] = partyInp.value;
        doc[partyIdField(type)] = _partyId;

        data[coll].push(doc);
        if (window.saveDB) window.saveDB();
        if (window.closeModal) window.closeModal();
        refresh();
        window.showToast(number + ' berhasil dibuat (Draft)', 'success');
      });
    }, 50);
  }

  // ── Post return (Draft → Posted) — reverse inventory + GL ─────────────────
  function postReturn(type, id) {
    var coll = collFor(type);
    var doc = (db()[coll] || []).find(function (d) {
      return d.id === id;
    });
    if (!doc || (doc.status !== 'Posted' && doc.status !== 'Draft')) return;
    if (doc.status === 'Posted') return; // already posted

    doc.status = 'Posted';

    // Reverse inventory: SRN adds stock back, PRN subtracts stock
    var items = db().inventoryItems || [];
    (doc.lines || []).forEach(function (l) {
      if (l.itemId === 'custom') return;
      var item = items.find(function (i) {
        return String(i.id) === String(l.itemId);
      });
      if (!item) return;
      var qty = Number(l.qty) || 0;
      if (type === 'SRN') {
        item.stock = (item.stock || 0) + qty; // returned from customer → add back
      } else {
        item.stock = Math.max(0, (item.stock || 0) - qty); // returned to supplier → subtract
      }
    });

    // GL posting happens via reconcileAll in the saveDB hook
    if (window.saveDB) window.saveDB();
    refresh();
    window.showToast((doc.number || doc.id) + ' → Diposting (stok & GL updated)', 'success');
  }

  // ── View detail ───────────────────────────────────────────────────────────
  function viewReturn(type, id) {
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
        '<div style="margin-top:12px"><div style="font-size:12px;font-weight:700;margin-bottom:6px">Item Diretur (' +
        doc.lines.length +
        ')</div>' +
        '<table style="width:100%;border-collapse:collapse;font-size:12px"><thead><tr style="background:var(--bg)">' +
        '<th style="padding:6px 8px;text-align:left">Item</th><th style="padding:6px 8px;text-align:right">Qty</th>' +
        '<th style="padding:6px 8px;text-align:right">Harga</th><th style="padding:6px 8px;text-align:right">Subtotal</th>' +
        '</tr></thead><tbody>';
      doc.lines.forEach(function (l) {
        linesHtml +=
          '<tr style="border-bottom:1px solid var(--border)">' +
          '<td style="padding:5px 8px">' +
          esc(l.itemName || l.itemId) +
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

    window.openModal(
      TAB_LABELS[type] + ' — ' + esc(doc.number || doc.id),
      '<div class="detail-grid">' +
        detailRow('Nomor', esc(doc.number || doc.id)) +
        detailRow('Status', statusBadge(doc.status)) +
        '<div class="detail-divider"></div>' +
        detailRow(partyLabel(type), esc(doc[pf] || '—')) +
        detailRow('Tanggal', esc(doc.date)) +
        detailRow('Sumber', esc((doc.sourceType || '') + ' ' + (doc.sourceId || '—'))) +
        detailRow('Jumlah', '<strong>' + money(doc.amount || 0) + '</strong>') +
        (doc.reason ? detailRow('Alasan', esc(doc.reason)) : '') +
        '</div>' +
        linesHtml,
      '<button class="btn-ghost" data-action="closeModal">Tutup</button>'
    );
  }

  // ── Wire up ───────────────────────────────────────────────────────────────
  window.renderReturns = renderReturns;
  window.renderSalesReturns = function () { return renderOne('SRN'); };
  window.renderPurchaseReturns = function () { return renderOne('PRN'); };

  function _navToTab(tab) {
    activeTab = tab;
    var view = TAB_VIEW[tab];
    if (typeof window.invalidateView === 'function') window.invalidateView(view);
    if (typeof window.navigate === 'function') window.navigate(view);
  }
  window._returnExtras = {
    openSalesReturn:    function () { _navToTab('SRN'); },
    openPurchaseReturn: function () { _navToTab('PRN'); },
  };

  if (window.ERP && typeof window.ERP.registerAction === 'function') {
    // Tab bar is gone; the action survives so stale markup still routes.
    window.ERP.registerAction('rtTab', function (_id, _type, val) {
      if (val && TAB_LABELS[val]) {
        _navToTab(val);
      }
      return true;
    });
    window.ERP.registerAction('rtNew', function () {
      openNewModal(activeTab);
      return true;
    });
    window.ERP.registerAction('rtView', function (id, type) {
      if (id && type) viewReturn(type, id);
      return true;
    });
    window.ERP.registerAction('rtPost', function (id, type) {
      if (id && type) postReturn(type, id);
      return true;
    });
  }
})();
