// ═══════════════════════════════════════════════════════════════════════════════
// KELOLA ERP (DEMO) — Warehouse & Item Transfer View  (warehouse-view.js)
// Phase 3b: Warehouse management + Item Transfer (IT) document type.
//
// Three-tab view at #view-warehouse:
//   1. Gudang (Warehouse list + CRUD)
//   2. Stok per Gudang (per-warehouse stock overview)
//   3. Transfer Item (IT document list + create)
//
// Global-scope rule: classic <script>, IIFE-wrapped, exposes only
// window.renderWarehouse (+ ERP action registrations).
// ═══════════════════════════════════════════════════════════════════════════════
(function () {
  'use strict';

  var activeTab = 'warehouses'; // 'warehouses' | 'stock' | 'transfers'

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
  function WH() {
    return window.Warehouse;
  }

  function tabBtn(id, label) {
    var on = activeTab === id;
    return (
      '<button class="btn-ghost" data-action="whTab" data-val="' +
      id +
      '"' +
      ' style="font-size:12px;padding:6px 14px;border-radius:8px;font-weight:700;' +
      (on ? 'background:var(--primary);color:#fff' : 'color:var(--muted)') +
      '">' +
      esc(label) +
      '</button>'
    );
  }

  function statusBadge(s) {
    return typeof window.badge === 'function' ? window.badge(s) : esc(s);
  }

  // ── Tab 1: Warehouse list ─────────────────────────────────────────────────
  function warehousesTab() {
    var wh = WH();
    if (!wh)
      return '<div class="card"><div style="padding:20px;text-align:center;color:var(--muted)">Warehouse module not loaded.</div></div>';
    var warehouses = wh.ensureWarehouses();

    var rows = warehouses
      .map(function (w) {
        // Count items in this warehouse
        var items = db().inventoryItems || [];
        var itemCount = 0;
        var totalQty = 0;
        items.forEach(function (item) {
          var q = wh.stockAt(item, w.id);
          if (q > 0) {
            itemCount++;
            totalQty += q;
          }
        });

        return (
          '<tr style="border-bottom:1px solid var(--border)">' +
          '<td class="td-p" style="font-size:12px;font-weight:700;font-family:monospace;color:var(--primary)">' +
          esc(w.id) +
          '</td>' +
          '<td class="td-p" style="font-size:13px;font-weight:700">' +
          esc(w.name) +
          '</td>' +
          '<td class="td-p" style="font-size:12px;color:var(--muted)">' +
          esc(w.location || '—') +
          '</td>' +
          '<td class="td-p" style="font-size:12px;text-align:right">' +
          itemCount +
          ' item</td>' +
          '<td class="td-p" style="font-size:12px;text-align:right;font-weight:700">' +
          totalQty +
          '</td>' +
          '<td class="td-p">' +
          (w.active !== false ? statusBadge('OK') : statusBadge('Nonaktif')) +
          '</td>' +
          '<td class="td-p">' +
          (w.id !== wh.DEFAULT_WH_ID
            ? '<button class="action-ghost" data-action="whEdit" data-id="' +
              esc(w.id) +
              '">Edit</button>'
            : '<span style="font-size:11px;color:var(--muted)">Default</span>') +
          '</td>' +
          '</tr>'
        );
      })
      .join('');

    return (
      '<div class="card">' +
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">' +
      '<div style="font-size:14px;font-weight:700">Daftar Gudang (' +
      warehouses.length +
      ')</div>' +
      '<button class="btn" data-action="whAdd" style="font-size:12px">+ Tambah Gudang</button>' +
      '</div>' +
      '<div class="table-wrap"><table style="width:100%;border-collapse:collapse">' +
      '<thead><tr>' +
      '<th style="padding:8px 10px;font-size:11px;font-weight:700;text-align:left">ID</th>' +
      '<th style="padding:8px 10px;font-size:11px;font-weight:700;text-align:left">Nama</th>' +
      '<th style="padding:8px 10px;font-size:11px;font-weight:700;text-align:left">Lokasi</th>' +
      '<th style="padding:8px 10px;font-size:11px;font-weight:700;text-align:right">Jenis Item</th>' +
      '<th style="padding:8px 10px;font-size:11px;font-weight:700;text-align:right">Total Qty</th>' +
      '<th style="padding:8px 10px;font-size:11px;font-weight:700;text-align:left">Status</th>' +
      '<th style="padding:8px 10px;font-size:11px;font-weight:700;text-align:left">Aksi</th>' +
      '</tr></thead>' +
      '<tbody>' +
      rows +
      '</tbody>' +
      '</table></div></div>'
    );
  }

  // ── Tab 2: Stock per warehouse ────────────────────────────────────────────
  function stockTab() {
    var wh = WH();
    if (!wh) return '';
    var warehouses = wh.getWarehouses();
    var items = db().inventoryItems || [];

    if (items.length === 0) {
      return '<div class="card"><div style="padding:20px;text-align:center;color:var(--muted);font-size:13px">Belum ada item inventori.</div></div>';
    }

    // Build warehouse columns
    var whCols = warehouses
      .map(function (w) {
        return (
          '<th style="padding:8px 10px;font-size:11px;font-weight:700;text-align:right;min-width:90px">' +
          esc(w.name) +
          '</th>'
        );
      })
      .join('');

    var rows = items
      .map(function (item) {
        wh.ensureItemWH(item);
        var isLow = item.stock < item.min;
        var whCells = warehouses
          .map(function (w) {
            var q = wh.stockAt(item, w.id);
            return (
              '<td style="padding:7px 10px;font-size:12px;text-align:right;font-weight:' +
              (q > 0 ? '700' : '400') +
              ';color:' +
              (q > 0 ? 'var(--text)' : 'var(--muted)') +
              '">' +
              q +
              '</td>'
            );
          })
          .join('');

        return (
          '<tr style="border-bottom:1px solid var(--border)">' +
          '<td class="td-p" style="font-size:13px;font-weight:700">' +
          esc(item.name) +
          '</td>' +
          '<td class="td-p"><span class="cat">' +
          esc(item.category || '—') +
          '</span></td>' +
          '<td class="td-p" style="font-size:11px;color:var(--muted)">' +
          esc(item.unit) +
          '</td>' +
          whCells +
          '<td class="td-p" style="font-size:13px;font-weight:800;text-align:right;color:' +
          (isLow ? '#FF3B30' : 'var(--text)') +
          '">' +
          (item.stock || 0) +
          '</td>' +
          '<td class="td-p" style="font-size:12px;text-align:right">' +
          (item.min || 0) +
          '</td>' +
          '</tr>'
        );
      })
      .join('');

    return (
      '<div class="card">' +
      '<div style="font-size:14px;font-weight:700;margin-bottom:12px">Stok per Gudang</div>' +
      '<div class="table-wrap"><table style="width:100%;border-collapse:collapse">' +
      '<thead><tr>' +
      '<th style="padding:8px 10px;font-size:11px;font-weight:700;text-align:left">Item</th>' +
      '<th style="padding:8px 10px;font-size:11px;font-weight:700;text-align:left">Kategori</th>' +
      '<th style="padding:8px 10px;font-size:11px;font-weight:700;text-align:left">Satuan</th>' +
      whCols +
      '<th style="padding:8px 10px;font-size:11px;font-weight:700;text-align:right">Total</th>' +
      '<th style="padding:8px 10px;font-size:11px;font-weight:700;text-align:right">Min</th>' +
      '</tr></thead>' +
      '<tbody>' +
      rows +
      '</tbody>' +
      '</table></div></div>'
    );
  }

  // ── Tab 3: Item Transfers ─────────────────────────────────────────────────
  function transfersTab() {
    var transfers = (db().itemTransfers || []).slice().reverse();

    if (transfers.length === 0) {
      return (
        '<div class="card"><div style="padding:20px;text-align:center;color:var(--muted);font-size:13px">' +
        'Belum ada transfer item. Klik <strong>Transfer Item</strong>.' +
        '</div></div>'
      );
    }

    var rows = transfers
      .map(function (t) {
        var wh = WH();
        return (
          '<tr style="border-bottom:1px solid var(--border)">' +
          '<td class="td-p" style="font-size:11px;font-weight:700;color:var(--primary)">' +
          esc(t.number || t.id) +
          '</td>' +
          '<td class="td-p" style="font-size:11px;color:var(--muted)">' +
          esc(t.date) +
          '</td>' +
          '<td class="td-p" style="font-size:12px">' +
          esc(wh ? wh.warehouseName(t.fromWarehouse) : t.fromWarehouse) +
          '</td>' +
          '<td class="td-p" style="font-size:12px">→</td>' +
          '<td class="td-p" style="font-size:12px">' +
          esc(wh ? wh.warehouseName(t.toWarehouse) : t.toWarehouse) +
          '</td>' +
          '<td class="td-p" style="font-size:12px;text-align:right">' +
          (t.lines || []).length +
          ' item</td>' +
          '<td class="td-p">' +
          statusBadge(t.status) +
          '</td>' +
          '<td class="td-p"><button class="action-ghost" data-action="whViewIT" data-id="' +
          esc(t.id) +
          '">Lihat</button></td>' +
          '</tr>'
        );
      })
      .join('');

    return (
      '<div class="card">' +
      '<div style="font-size:14px;font-weight:700;margin-bottom:10px">Transfer Item (' +
      transfers.length +
      ')</div>' +
      '<div class="table-wrap"><table style="width:100%;border-collapse:collapse">' +
      '<thead><tr>' +
      '<th style="padding:8px 10px;font-size:11px;font-weight:700;text-align:left">No.</th>' +
      '<th style="padding:8px 10px;font-size:11px;font-weight:700;text-align:left">Tanggal</th>' +
      '<th style="padding:8px 10px;font-size:11px;font-weight:700;text-align:left">Dari</th>' +
      '<th style="padding:8px 10px;font-size:11px;font-weight:700;text-align:left"></th>' +
      '<th style="padding:8px 10px;font-size:11px;font-weight:700;text-align:left">Ke</th>' +
      '<th style="padding:8px 10px;font-size:11px;font-weight:700;text-align:right">Item</th>' +
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
  function renderWarehouse() {
    // Ensure migration on first render
    if (WH()) WH().migrateAll();

    var header =
      typeof window.secHdr === 'function'
        ? window.secHdr(
            'Gudang & Transfer',
            'Manajemen gudang, stok per lokasi, dan transfer item',
            'Transfer Item',
            'whNewIT'
          )
        : '<h1>Gudang & Transfer</h1>';

    var body = '';
    if (activeTab === 'stock') body = stockTab();
    else if (activeTab === 'transfers') body = transfersTab();
    else body = warehousesTab();

    return (
      header +
      '<div style="display:flex;gap:6px;margin-bottom:14px">' +
      tabBtn('warehouses', 'Gudang') +
      tabBtn('stock', 'Stok per Gudang') +
      tabBtn('transfers', 'Transfer Item') +
      '</div>' +
      body
    );
  }

  function refresh() {
    var el = document.getElementById('view-warehouse');
    if (el) el.innerHTML = renderWarehouse();
  }

  // ── Add Warehouse modal ───────────────────────────────────────────────────
  function openAddWH() {
    if (!window.openModal) return;
    window.openModal(
      'Tambah Gudang',
      '<div class="form-row">' +
        '<div class="form-group"><label class="form-label">Nama Gudang</label>' +
        '<input class="form-input" id="wh-name" type="text" placeholder="Gudang Cabang Jakarta"></div>' +
        '<div class="form-group"><label class="form-label">Lokasi</label>' +
        '<input class="form-input" id="wh-loc" type="text" placeholder="Jl. Contoh No. 1"></div>' +
        '</div>',
      '<button class="btn-ghost" data-action="closeModal">Batal</button>' +
        ' <button class="btn" id="wh-save">Simpan</button>',
      false
    );
    setTimeout(function () {
      document.getElementById('wh-save').addEventListener('click', function () {
        var name = (document.getElementById('wh-name').value || '').trim();
        if (!name) {
          window.showToast('Nama gudang harus diisi', 'warning');
          return;
        }
        var loc = (document.getElementById('wh-loc').value || '').trim();
        WH().addWarehouse(name, loc);
        if (window.saveDB) window.saveDB();
        if (window.closeModal) window.closeModal();
        refresh();
        window.showToast('Gudang "' + name + '" berhasil ditambahkan', 'success');
      });
    }, 50);
  }

  // ── Edit Warehouse modal ──────────────────────────────────────────────────
  function openEditWH(id) {
    if (!window.openModal) return;
    var wh = WH().getWarehouse(id);
    if (!wh) return;
    window.openModal(
      'Edit Gudang — ' + esc(wh.name),
      '<div class="form-row">' +
        '<div class="form-group"><label class="form-label">Nama Gudang</label>' +
        '<input class="form-input" id="wh-name" type="text" value="' +
        esc(wh.name) +
        '"></div>' +
        '<div class="form-group"><label class="form-label">Lokasi</label>' +
        '<input class="form-input" id="wh-loc" type="text" value="' +
        esc(wh.location || '') +
        '"></div>' +
        '</div>',
      '<button class="btn-ghost" data-action="closeModal">Batal</button>' +
        ' <button class="btn" id="wh-save">Simpan</button>',
      false
    );
    setTimeout(function () {
      document.getElementById('wh-save').addEventListener('click', function () {
        var name = (document.getElementById('wh-name').value || '').trim();
        if (!name) {
          window.showToast('Nama gudang harus diisi', 'warning');
          return;
        }
        var loc = (document.getElementById('wh-loc').value || '').trim();
        WH().updateWarehouse(id, { name: name, location: loc });
        if (window.saveDB) window.saveDB();
        if (window.closeModal) window.closeModal();
        refresh();
        window.showToast('Gudang berhasil diperbarui', 'success');
      });
    }, 50);
  }

  // ── Item Transfer modal ───────────────────────────────────────────────────
  function openNewIT() {
    if (!window.openModal || !WH()) return;
    var today =
      typeof window.today === 'function' ? window.today() : new Date().toISOString().slice(0, 10);
    var warehouses = WH().getWarehouses();
    var whOpts = warehouses
      .map(function (w) {
        return '<option value="' + esc(w.id) + '">' + esc(w.name) + '</option>';
      })
      .join('');

    var items = db().inventoryItems || [];
    var itemOpts = items
      .map(function (i) {
        return (
          '<option value="' +
          esc(i.id) +
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

    function lineRow() {
      return (
        '<tr class="it-line">' +
        '<td style="padding:4px 6px"><select class="form-select it-item" style="font-size:12px;padding:5px 8px;width:100%">' +
        '<option value="">— Pilih Item —</option>' +
        itemOpts +
        '</select></td>' +
        '<td style="padding:4px 6px"><span class="it-avail" style="font-size:11px;color:var(--muted)">—</span></td>' +
        '<td style="padding:4px 6px"><input class="form-input it-qty" type="number" min="1" value="1" style="font-size:12px;padding:5px 8px;width:80px"></td>' +
        '<td style="padding:4px 6px;text-align:center"><button type="button" class="it-del" title="Hapus" style="background:none;border:none;cursor:pointer;color:var(--muted);font-size:18px;line-height:1">×</button></td>' +
        '</tr>'
      );
    }

    window.openModal(
      'Transfer Item',
      '<div class="form-row">' +
        '<div class="form-group"><label class="form-label">Dari Gudang</label>' +
        '<select class="form-select" id="it-from">' +
        whOpts +
        '</select></div>' +
        '<div class="form-group"><label class="form-label">Ke Gudang</label>' +
        '<select class="form-select" id="it-to">' +
        (warehouses.length > 1 ? warehouses.slice(1).concat(warehouses.slice(0, 1)) : warehouses)
          .map(function (w) {
            return '<option value="' + esc(w.id) + '">' + esc(w.name) + '</option>';
          })
          .join('') +
        '</select></div>' +
        '<div class="form-group"><label class="form-label">Tanggal</label>' +
        '<input class="form-input" id="it-date" type="date" value="' +
        today +
        '"></div>' +
        '</div>' +
        '<div style="margin-top:10px">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">' +
        '<span class="form-label" style="margin:0;font-size:13px;font-weight:700">Item Transfer</span>' +
        '<button type="button" class="btn-ghost" id="it-add" style="font-size:11px;padding:4px 10px">+ Tambah Item</button>' +
        '</div>' +
        '<table style="width:100%;border-collapse:collapse"><thead><tr style="background:var(--bg)">' +
        '<th style="padding:6px 8px;font-size:11px;font-weight:700;text-align:left">Item</th>' +
        '<th style="padding:6px 8px;font-size:11px;font-weight:700;text-align:left;width:80px">Tersedia</th>' +
        '<th style="padding:6px 8px;font-size:11px;font-weight:700;text-align:left;width:90px">Qty Transfer</th>' +
        '<th style="width:30px"></th>' +
        '</tr></thead><tbody id="it-lines">' +
        lineRow() +
        '</tbody></table></div>' +
        '<div class="form-row" style="margin-top:10px"><div class="form-group"><label class="form-label">Catatan</label>' +
        '<input class="form-input" id="it-note" type="text" placeholder="Alasan transfer (opsional)"></div></div>',
      '<button class="btn-ghost" data-action="closeModal">Batal</button>' +
        ' <button class="btn" id="it-save">Simpan & Proses</button>',
      true
    );

    setTimeout(function () {
      var body = document.getElementById('it-lines');
      var fromSel = document.getElementById('it-from');

      function updateAvail() {
        var fromWh = fromSel.value;
        body.querySelectorAll('tr').forEach(function (tr) {
          var itemSel = tr.querySelector('.it-item');
          var availEl = tr.querySelector('.it-avail');
          if (!itemSel || !availEl) return;
          var itemId = itemSel.value;
          if (!itemId) {
            availEl.textContent = '—';
            return;
          }
          var item = (db().inventoryItems || []).find(function (i) {
            return i.id === itemId;
          });
          var avail = item ? WH().stockAt(item, fromWh) : 0;
          availEl.textContent = avail;
        });
      }

      function wireRow(tr) {
        tr.querySelector('.it-item').addEventListener('change', updateAvail);
        tr.querySelector('.it-del').addEventListener('click', function () {
          tr.remove();
        });
      }
      body.querySelectorAll('tr').forEach(wireRow);
      fromSel.addEventListener('change', updateAvail);

      document.getElementById('it-add').addEventListener('click', function () {
        var tmp = document.createElement('tbody');
        tmp.innerHTML = lineRow();
        var tr = tmp.firstElementChild;
        body.appendChild(tr);
        wireRow(tr);
      });

      document.getElementById('it-save').addEventListener('click', function () {
        var fromWh = fromSel.value;
        var toWh = document.getElementById('it-to').value;
        if (fromWh === toWh) {
          window.showToast('Gudang asal dan tujuan harus berbeda', 'warning');
          return;
        }

        var date = document.getElementById('it-date').value;
        var note = (document.getElementById('it-note').value || '').trim();
        var lines = [];
        var problems = [];

        body.querySelectorAll('tr').forEach(function (tr) {
          var itemSel = tr.querySelector('.it-item');
          var itemId = itemSel.value;
          if (!itemId) return;
          var qty = Math.max(0, parseInt(tr.querySelector('.it-qty').value) || 0);
          if (qty <= 0) return;
          var item = (db().inventoryItems || []).find(function (i) {
            return i.id === itemId;
          });
          if (!item) return;
          var avail = WH().stockAt(item, fromWh);
          if (qty > avail) {
            problems.push(item.name + ': tersedia ' + avail + ', diminta ' + qty);
          }
          var name = itemSel.options[itemSel.selectedIndex].dataset.name || item.name;
          lines.push({ itemId: itemId, itemName: name, qty: qty });
        });

        if (lines.length === 0) {
          window.showToast('Tambahkan minimal 1 item', 'warning');
          return;
        }
        if (problems.length > 0) {
          window.showToast('Stok tidak cukup: ' + problems.join('; '), 'danger');
          return;
        }

        // Execute transfer
        var data = db();
        if (!Array.isArray(data.itemTransfers)) data.itemTransfers = [];
        var number = window.DocEngine
          ? window.DocEngine.nextNumber('IT', date, {
              sequences: data.numberSequences,
              commit: true,
            })
          : 'IT-' + Date.now();
        var id = 'IT-' + Date.now();

        lines.forEach(function (l) {
          var item = (data.inventoryItems || []).find(function (i) {
            return i.id === l.itemId;
          });
          if (item) WH().transferStock(item, fromWh, toWh, l.qty);
        });

        var doc = {
          id: id,
          number: number,
          date: date,
          status: 'Posted',
          fromWarehouse: fromWh,
          toWarehouse: toWh,
          lines: lines,
          note: note,
        };
        data.itemTransfers.push(doc);

        if (window.saveDB) window.saveDB();
        if (window.closeModal) window.closeModal();
        activeTab = 'transfers';
        refresh();
        window.showToast(number + ' — transfer berhasil diproses', 'success');
      });
    }, 50);
  }

  // ── View Transfer detail ──────────────────────────────────────────────────
  function viewIT(id) {
    var doc = (db().itemTransfers || []).find(function (d) {
      return d.id === id;
    });
    if (!doc || !window.openModal) return;
    var wh = WH();
    var detailRow =
      typeof window.detailRow === 'function'
        ? window.detailRow
        : function (l, v) {
            return '<div><strong>' + l + ':</strong> ' + v + '</div>';
          };

    var linesHtml = '';
    if (doc.lines && doc.lines.length > 0) {
      linesHtml =
        '<div style="margin-top:12px"><div style="font-size:12px;font-weight:700;margin-bottom:6px">Item Ditransfer (' +
        doc.lines.length +
        ')</div>' +
        '<table style="width:100%;border-collapse:collapse;font-size:12px"><thead><tr style="background:var(--bg)">' +
        '<th style="padding:6px 8px;text-align:left">Item</th>' +
        '<th style="padding:6px 8px;text-align:right">Qty</th>' +
        '</tr></thead><tbody>';
      doc.lines.forEach(function (l) {
        linesHtml +=
          '<tr style="border-bottom:1px solid var(--border)">' +
          '<td style="padding:5px 8px">' +
          esc(l.itemName || l.itemId) +
          '</td>' +
          '<td style="padding:5px 8px;text-align:right;font-weight:700">' +
          (l.qty || 0) +
          '</td></tr>';
      });
      linesHtml += '</tbody></table></div>';
    }

    window.openModal(
      'Transfer Item — ' + esc(doc.number || doc.id),
      '<div class="detail-grid">' +
        detailRow('Nomor', esc(doc.number || doc.id)) +
        detailRow('Status', statusBadge(doc.status)) +
        '<div class="detail-divider"></div>' +
        detailRow('Tanggal', esc(doc.date)) +
        detailRow(
          'Dari Gudang',
          esc(wh ? wh.warehouseName(doc.fromWarehouse) : doc.fromWarehouse)
        ) +
        detailRow('Ke Gudang', esc(wh ? wh.warehouseName(doc.toWarehouse) : doc.toWarehouse)) +
        (doc.note ? detailRow('Catatan', esc(doc.note)) : '') +
        '</div>' +
        linesHtml,
      '<button class="btn-ghost" data-action="closeModal">Tutup</button>'
    );
  }

  // ── Wire up ───────────────────────────────────────────────────────────────
  window.renderWarehouse = renderWarehouse;

  if (window.ERP && typeof window.ERP.registerAction === 'function') {
    window.ERP.registerAction('whTab', function (_id, _type, val) {
      if (val) {
        activeTab = val;
        refresh();
      }
      return true;
    });
    window.ERP.registerAction('whAdd', function () {
      openAddWH();
      return true;
    });
    window.ERP.registerAction('whEdit', function (id) {
      if (id) openEditWH(id);
      return true;
    });
    window.ERP.registerAction('whNewIT', function () {
      openNewIT();
      return true;
    });
    window.ERP.registerAction('whViewIT', function (id) {
      if (id) viewIT(id);
      return true;
    });
  }
})();
