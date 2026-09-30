// ══════════════════════════════════════════════════════════════════════════════
//  INVENTORY EXTRAS  — Item Unit, Item Category, Item Brand,
//                      Item Requisition, Job Costing
//  Pattern: NSAMenu routes these labels here via window._inventoryExtras.
// ══════════════════════════════════════════════════════════════════════════════
(function () {
  'use strict';

  function db() {
    return window.DB || {};
  }
  function save() {
    window.saveDB && window.saveDB();
  }
  function toast(msg, type) {
    window.showToast && window.showToast(msg, type || 'success');
  }
  function esc(s) {
    return window.escapeHtml ? window.escapeHtml(s) : String(s == null ? '' : s);
  }
  function money(v) {
    return window.idrFull ? window.idrFull(v) : 'Rp ' + (v || 0);
  }
  function uid(p) {
    return (p || 'X') + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }
  function today() {
    return new Date().toISOString().slice(0, 10);
  }
  function modal(title, body, footer, wide) {
    window.openModal && window.openModal(title, body, footer || '', wide);
  }
  function closeM() {
    window.closeModal && window.closeModal();
  }
  function ensureSettings(key, def) {
    if (!db().settings) window.DB.settings = {};
    if (db().settings[key] == null) db().settings[key] = def;
    return db().settings[key];
  }
  function ensureArr(key) {
    if (!window.DB[key]) window.DB[key] = [];
    return window.DB[key];
  }

  function injectView(hostView, html) {
    window.invalidateView && window.invalidateView(hostView);
    window.navigate && window.navigate(hostView);
    setTimeout(function () {
      var el = document.getElementById('view-' + hostView);
      if (el) el.innerHTML = html;
    }, 0);
  }

  var TH =
    'text-align:left;padding:10px 14px;font-size:11px;color:var(--muted);font-weight:700;border-bottom:1px solid var(--border)';

  // ══════════════════════════════════════════════════════════════════════════
  // § 1  ITEM UNIT  (DB.settings.units — string array)
  // ══════════════════════════════════════════════════════════════════════════
  function openItemUnit() {
    var units = ensureSettings('units', ['Pcs', 'Ton', 'Kg', 'm²', 'm³', 'Liter', 'Set']);

    var rows = units
      .map(function (u, i) {
        return (
          '<tr>' +
          '<td class="td-p" style="font-weight:700">' +
          esc(u) +
          '</td>' +
          '<td class="td-p" style="text-align:center">' +
          (db().inventoryItems || []).filter(function (it) {
            return it.unit === u;
          }).length +
          ' item</td>' +
          '<td class="td-p" style="text-align:center">' +
          '<button class="btn-ghost" style="font-size:11px;padding:3px 8px;color:var(--danger)" data-action="delUnit" data-idx="' +
          i +
          '">Hapus</button>' +
          '</td></tr>'
        );
      })
      .join('');

    injectView(
      'inventory',
      '<div class="sec-hdr"><div><h1>Item Unit</h1><p>Satuan ukuran yang digunakan pada item inventaris</p></div>' +
        '<button class="btn" data-action="addUnit">+ Tambah</button></div>' +
        '<div class="card" style="overflow-x:auto">' +
        '<table style="width:100%;border-collapse:collapse">' +
        '<thead><tr><th style="' +
        TH +
        '">Nama Satuan</th><th style="' +
        TH +
        'text-align:center">Digunakan</th><th style="' +
        TH +
        '"></th></tr></thead>' +
        '<tbody>' +
        rows +
        '</tbody></table></div>'
    );
  }

  function addUnitModal() {
    modal(
      'Tambah Satuan',
      '<div class="form-group"><label class="form-label">Nama Satuan</label>' +
        '<input class="form-input" id="unit-name" placeholder="Ton, Pcs, m², Liter, Set..."></div>',
      '<button class="btn" id="saveUnit">Tambah</button><button class="btn-ghost" data-action="closeModal">Batal</button>'
    );
    setTimeout(function () {
      var btn = document.getElementById('saveUnit');
      if (!btn) return;
      btn.addEventListener('click', function () {
        var name = (document.getElementById('unit-name').value || '').trim();
        if (!name) {
          toast('Nama wajib diisi', 'warning');
          return;
        }
        var units = ensureSettings('units', []);
        if (units.indexOf(name) >= 0) {
          toast('Satuan sudah ada', 'warning');
          return;
        }
        units.push(name);
        save();
        closeM();
        toast('Satuan ditambahkan', 'success');
        openItemUnit();
      });
    }, 60);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // § 2  ITEM CATEGORY  (DB.settings.itemCategories — string array)
  // ══════════════════════════════════════════════════════════════════════════
  function openItemCategory() {
    var cats = ensureSettings('itemCategories', [
      'Agregat',
      'Batu Alam',
      'Pasir',
      'Jasa',
      'Lainnya',
    ]);

    var rows = cats
      .map(function (c, i) {
        var count = (db().inventoryItems || []).filter(function (it) {
          return it.category === c;
        }).length;
        return (
          '<tr>' +
          '<td class="td-p" style="font-weight:700">' +
          esc(c) +
          '</td>' +
          '<td class="td-p" style="text-align:center">' +
          count +
          ' item</td>' +
          '<td class="td-p" style="text-align:center">' +
          '<button class="btn-ghost" style="font-size:11px;padding:3px 8px;color:var(--danger)" data-action="delItemCat" data-idx="' +
          i +
          '">Hapus</button>' +
          '</td></tr>'
        );
      })
      .join('');

    injectView(
      'inventory',
      '<div class="sec-hdr"><div><h1>Item Category</h1><p>Kategori pengelompokan item inventaris</p></div>' +
        '<button class="btn" data-action="addItemCat">+ Tambah</button></div>' +
        '<div class="card" style="overflow-x:auto">' +
        '<table style="width:100%;border-collapse:collapse">' +
        '<thead><tr><th style="' +
        TH +
        '">Nama Kategori</th><th style="' +
        TH +
        'text-align:center">Jumlah Item</th><th style="' +
        TH +
        '"></th></tr></thead>' +
        '<tbody>' +
        rows +
        '</tbody></table></div>'
    );
  }

  function addItemCatModal() {
    modal(
      'Tambah Kategori',
      '<div class="form-group"><label class="form-label">Nama Kategori</label>' +
        '<input class="form-input" id="icat-name" placeholder="Agregat, Batu Alam, Jasa..."></div>',
      '<button class="btn" id="saveItemCat">Tambah</button><button class="btn-ghost" data-action="closeModal">Batal</button>'
    );
    setTimeout(function () {
      var btn = document.getElementById('saveItemCat');
      if (!btn) return;
      btn.addEventListener('click', function () {
        var name = (document.getElementById('icat-name').value || '').trim();
        if (!name) {
          toast('Nama wajib diisi', 'warning');
          return;
        }
        var cats = ensureSettings('itemCategories', []);
        if (cats.indexOf(name) >= 0) {
          toast('Kategori sudah ada', 'warning');
          return;
        }
        cats.push(name);
        save();
        closeM();
        toast('Kategori ditambahkan', 'success');
        openItemCategory();
      });
    }, 60);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // § 3  ITEM BRAND  (DB.settings.itemBrands — string array)
  // ══════════════════════════════════════════════════════════════════════════
  function openItemBrand() {
    var brands = ensureSettings('itemBrands', []);

    var rows = brands.length
      ? brands
          .map(function (b, i) {
            var count = (db().inventoryItems || []).filter(function (it) {
              return it.brand === b;
            }).length;
            return (
              '<tr>' +
              '<td class="td-p" style="font-weight:700">' +
              esc(b) +
              '</td>' +
              '<td class="td-p" style="text-align:center">' +
              count +
              ' item</td>' +
              '<td class="td-p" style="text-align:center">' +
              '<button class="btn-ghost" style="font-size:11px;padding:3px 8px;color:var(--danger)" data-action="delItemBrand" data-idx="' +
              i +
              '">Hapus</button>' +
              '</td></tr>'
            );
          })
          .join('')
      : '<tr><td colspan="3" style="text-align:center;padding:24px;color:var(--muted)">Belum ada brand/merek ditambahkan.</td></tr>';

    injectView(
      'inventory',
      '<div class="sec-hdr"><div><h1>Item Brand</h1><p>Merek / brand item inventaris</p></div>' +
        '<button class="btn" data-action="addItemBrand">+ Tambah</button></div>' +
        '<div class="card" style="overflow-x:auto">' +
        '<table style="width:100%;border-collapse:collapse">' +
        '<thead><tr><th style="' +
        TH +
        '">Nama Brand</th><th style="' +
        TH +
        'text-align:center">Jumlah Item</th><th style="' +
        TH +
        '"></th></tr></thead>' +
        '<tbody>' +
        rows +
        '</tbody></table></div>'
    );
  }

  function addItemBrandModal() {
    modal(
      'Tambah Brand',
      '<div class="form-group"><label class="form-label">Nama Brand / Merek</label>' +
        '<input class="form-input" id="brand-name" placeholder="Quarry, Stone Master, dll."></div>',
      '<button class="btn" id="saveItemBrand">Tambah</button><button class="btn-ghost" data-action="closeModal">Batal</button>'
    );
    setTimeout(function () {
      var btn = document.getElementById('saveItemBrand');
      if (!btn) return;
      btn.addEventListener('click', function () {
        var name = (document.getElementById('brand-name').value || '').trim();
        if (!name) {
          toast('Nama wajib diisi', 'warning');
          return;
        }
        var brands = ensureSettings('itemBrands', []);
        if (brands.indexOf(name) >= 0) {
          toast('Brand sudah ada', 'warning');
          return;
        }
        brands.push(name);
        save();
        closeM();
        toast('Brand ditambahkan', 'success');
        openItemBrand();
      });
    }, 60);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // § 4  ITEM REQUISITION
  // ══════════════════════════════════════════════════════════════════════════
  var IR_STATUSES = [
    ['Draft', 'Draft'],
    ['Pending', 'Menunggu Approval'],
    ['Approved', 'Disetujui'],
    ['Rejected', 'Ditolak'],
    ['Fulfilled', 'Terpenuhi'],
  ];

  function openItemRequisition() {
    var reqs = ensureArr('itemRequisitions').slice().reverse();

    var rows = reqs.length
      ? reqs
          .map(function (r) {
            var itemCount = (r.items || []).length;
            var actions = '';
            if (r.status === 'Draft' || r.status === 'Pending') {
              actions +=
                '<button class="btn-ghost" style="font-size:11px;padding:3px 8px" data-action="approveIR" data-id="' +
                esc(r.id) +
                '">Setujui</button> ' +
                '<button class="btn-ghost" style="font-size:11px;padding:3px 8px;color:var(--danger)" data-action="rejectIR" data-id="' +
                esc(r.id) +
                '">Tolak</button> ';
            } else if (r.status === 'Approved') {
              actions +=
                '<button class="btn" style="font-size:11px;padding:3px 10px;background:var(--primary)" data-action="createPOFromIR" data-id="' +
                esc(r.id) +
                '">Buat PO</button> ';
            } else if (r.status === 'PO Dibuat' && r.poId) {
              actions +=
                '<button class="btn-ghost" style="font-size:11px;padding:3px 8px;color:var(--primary)" data-action="viewPOFromIR" data-id="' +
                esc(r.poId) +
                '">Lihat PO</button> ';
            }
            actions +=
              '<button class="btn-ghost" style="font-size:11px;padding:3px 8px;color:var(--danger)" data-action="delIR" data-id="' +
              esc(r.id) +
              '">Hapus</button>';
            return (
              '<tr>' +
              '<td class="td-p" style="font-weight:700;font-size:12px">' +
              esc(r.id) +
              '</td>' +
              '<td class="td-p" style="font-size:12px">' +
              esc(r.requestedBy || '—') +
              '</td>' +
              '<td class="td-p" style="font-size:12px">' +
              esc(r.date || '') +
              '</td>' +
              '<td class="td-p" style="font-size:12px">' +
              itemCount +
              ' item</td>' +
              '<td class="td-p">' +
              window.badge(r.status || 'Draft') +
              '</td>' +
              '<td class="td-p" style="font-size:11px;color:var(--muted)">' +
              esc(r.notes || '') +
              (r.poId ? ' <span style="font-size:10px;color:var(--primary)">→ ' + esc(r.poId) + '</span>' : '') +
              '</td>' +
              '<td class="td-p" style="text-align:center;white-space:nowrap">' +
              actions +
              '</td></tr>'
            );
          })
          .join('')
      : '<tr><td colspan="7" style="text-align:center;padding:24px;color:var(--muted)">Belum ada permintaan barang.</td></tr>';

    injectView(
      'inventory',
      '<div class="sec-hdr"><div><h1>Item Requisition</h1><p>Permintaan barang internal</p></div>' +
        '<button class="btn" data-action="addIR">+ Buat Permintaan</button></div>' +
        '<div class="card" style="overflow-x:auto">' +
        '<table style="width:100%;border-collapse:collapse">' +
        '<thead><tr>' +
        '<th style="' +
        TH +
        '">No. IR</th><th style="' +
        TH +
        '">Pemohon</th><th style="' +
        TH +
        '">Tanggal</th>' +
        '<th style="' +
        TH +
        '">Item</th><th style="' +
        TH +
        '">Status</th><th style="' +
        TH +
        '">Catatan</th><th style="' +
        TH +
        '"></th>' +
        '</tr></thead><tbody>' +
        rows +
        '</tbody></table></div>'
    );
  }

  function createPOFromIRModal(irId) {
    var req = ensureArr('itemRequisitions').find(function (x) { return x.id === irId; });
    if (!req) return;

    var suppliers = db().suppliers || [];
    var suppOpts = suppliers
      .map(function (s) { return '<option value="' + esc(s.name) + '">' + esc(s.name) + '</option>'; })
      .join('');

    var itemRows = (req.items || [])
      .map(function (it) {
        return (
          '<tr>' +
          '<td style="padding:6px 10px;font-size:12px">' + esc(it.itemName || it.itemId) + '</td>' +
          '<td style="padding:6px 10px;font-size:12px;text-align:center">' + esc(it.qty) + '</td>' +
          '<td style="padding:6px 10px"><input class="form-input ir-price" type="number" min="0" value="0" ' +
          'data-item-id="' + esc(it.itemId) + '" data-item-name="' + esc(it.itemName || it.itemId) + '" ' +
          'data-qty="' + esc(it.qty) + '" style="width:120px;font-size:12px" placeholder="Harga satuan"></td>' +
          '</tr>'
        );
      })
      .join('');

    modal(
      'Buat PO dari IR — ' + esc(irId),
      '<div class="form-row">' +
        '<div class="form-group"><label class="form-label">Supplier</label>' +
        '<input class="form-input" id="ir-po-supplier" list="ir-po-supp-list" placeholder="Nama supplier" autocomplete="off">' +
        '<datalist id="ir-po-supp-list">' + suppOpts + '</datalist></div>' +
        '<div class="form-group"><label class="form-label">Tanggal PO</label>' +
        '<input class="form-input" id="ir-po-date" type="date" value="' + today() + '"></div></div>' +
        '<div style="font-size:12px;font-weight:700;margin:10px 0 6px">Item dari IR <span style="color:var(--muted);font-weight:400">(isi harga satuan)</span></div>' +
        '<table style="width:100%;border-collapse:collapse;margin-bottom:4px">' +
        '<thead><tr>' +
        '<th style="' + TH + '">Item</th>' +
        '<th style="' + TH + ';text-align:center">Qty</th>' +
        '<th style="' + TH + '">Harga Satuan (Rp)</th>' +
        '</tr></thead><tbody>' + itemRows + '</tbody></table>',
      '<button class="btn" id="saveIRtoPO">Buat PO</button>' +
        '<button class="btn-ghost" data-action="closeModal">Batal</button>',
      true
    );

    setTimeout(function () {
      var btn = document.getElementById('saveIRtoPO');
      if (!btn) return;
      btn.addEventListener('click', function () {
        var supplier = (document.getElementById('ir-po-supplier').value || '').trim();
        var date = document.getElementById('ir-po-date').value;
        if (!supplier) { toast('Nama supplier wajib diisi', 'warning'); return; }
        if (!date) { toast('Tanggal PO wajib diisi', 'warning'); return; }

        var lines = [];
        document.querySelectorAll('.ir-price').forEach(function (inp) {
          var price = parseFloat(inp.value) || 0;
          var qty = parseInt(inp.dataset.qty) || 1;
          lines.push({
            itemId: inp.dataset.itemId,
            description: inp.dataset.itemName,
            qty: qty,
            unitPrice: price,
            subtotal: qty * price,
          });
        });
        if (lines.length === 0) { toast('Tidak ada item', 'warning'); return; }

        var amount = lines.reduce(function (s, l) { return s + l.subtotal; }, 0);
        var poArr = window.DB.purchaseOrders || (window.DB.purchaseOrders = []);
        var poNumber = window.DocEngine
          ? window.DocEngine.nextNumber('PO', date, { commit: true })
          : null;
        var poId = 'PO' + Date.now().toString(36).toUpperCase();
        var newPO = {
          id: poId,
          number: poNumber || undefined,
          supplier: supplier,
          supplierId: window.DocEngine ? window.DocEngine.resolvePartyId('PO', supplier) : null,
          date: date,
          amount: amount,
          status: 'Draft',
          lines: lines,
          stockMutated: false,
          fromIR: irId,
        };
        poArr.unshift(newPO);

        req.status = 'PO Dibuat';
        req.poId = poId;
        save();
        closeM();
        toast(
          'PO ' + (poNumber || poId) + ' berhasil dibuat dari ' + irId,
          'success'
        );
        openItemRequisition();
      });
    }, 60);
  }

  function addIRModal() {
    var items = db().inventoryItems || [];
    var itemOpts = items
      .map(function (i) {
        return (
          '<option value="' +
          esc(i.id) +
          '">' +
          esc(i.name) +
          (i.unit ? ' (' + i.unit + ')' : '') +
          '</option>'
        );
      })
      .join('');

    modal(
      'Permintaan Barang Baru',
      '<div class="form-row">' +
        '<div class="form-group"><label class="form-label">Pemohon</label>' +
        '<input class="form-input" id="ir-by" placeholder="Nama / divisi pemohon"></div>' +
        '<div class="form-group"><label class="form-label">Tanggal</label>' +
        '<input class="form-input" id="ir-date" type="date" value="' +
        today() +
        '"></div></div>' +
        '<div class="form-group"><label class="form-label">Item yang Diminta</label>' +
        '<div id="ir-lines-wrap">' +
        '<div style="display:flex;gap:8px;margin-bottom:6px;align-items:center">' +
        '<select class="form-select ir-item-sel" style="flex:1;font-size:12px"><option value="">— Pilih Item —</option>' +
        itemOpts +
        '</select>' +
        '<input class="form-input ir-item-qty" type="number" min="1" value="1" style="width:80px;font-size:12px" placeholder="Qty">' +
        '<button type="button" class="btn-ghost" data-action="addIRLine" style="white-space:nowrap;font-size:12px">+ Baris</button>' +
        '</div></div></div>' +
        '<div class="form-group"><label class="form-label">Catatan</label>' +
        '<input class="form-input" id="ir-notes" placeholder="Keperluan / keterangan (opsional)"></div>',
      '<button class="btn" id="saveIR">Simpan</button><button class="btn-ghost" data-action="closeModal">Batal</button>',
      true
    );
    setTimeout(function () {
      var btn = document.getElementById('saveIR');
      if (!btn) return;
      btn.addEventListener('click', function () {
        var by = (document.getElementById('ir-by').value || '').trim();
        var date = document.getElementById('ir-date').value;
        var notes = (document.getElementById('ir-notes').value || '').trim();
        if (!by) {
          toast('Pemohon wajib diisi', 'warning');
          return;
        }
        var lineItems = [];
        document.querySelectorAll('#ir-lines-wrap .ir-item-sel').forEach(function (sel, i) {
          if (!sel.value) return;
          var opt = sel.querySelector('option[value="' + sel.value + '"]');
          var qtyEl = document.querySelectorAll('#ir-lines-wrap .ir-item-qty')[i];
          var qty = parseInt(qtyEl ? qtyEl.value : 1) || 1;
          lineItems.push({
            itemId: sel.value,
            itemName: opt ? opt.textContent.split(' (')[0] : sel.value,
            qty: qty,
          });
        });
        if (lineItems.length === 0) {
          toast('Tambahkan minimal 1 item', 'warning');
          return;
        }
        var arr = ensureArr('itemRequisitions');
        var num = 'IR.' + new Date().getFullYear() + '.' + String(arr.length + 1).padStart(4, '0');
        arr.push({
          id: num,
          requestedBy: by,
          date: date,
          items: lineItems,
          notes: notes,
          status: 'Pending',
          createdAt: today(),
        });
        save();
        closeM();
        toast('Permintaan barang dibuat', 'success');
        openItemRequisition();
      });
    }, 60);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // § 5  JOB COSTING
  // ══════════════════════════════════════════════════════════════════════════
  function openJobCosting() {
    var jobs = ensureArr('jobCostings').slice().reverse();

    var rows = jobs.length
      ? jobs
          .map(function (j) {
            var totalCost = (j.costs || []).reduce(function (s, c) {
              return s + (c.amount || 0);
            }, 0);
            return (
              '<tr>' +
              '<td class="td-p" style="font-weight:700;font-size:12px">' +
              esc(j.id) +
              '</td>' +
              '<td class="td-p" style="font-weight:600">' +
              esc(j.name) +
              '</td>' +
              '<td class="td-p" style="font-size:12px">' +
              esc(j.customer || '—') +
              '</td>' +
              '<td class="td-p" style="font-size:12px">' +
              esc(j.startDate || '') +
              '</td>' +
              '<td class="td-p" style="font-size:12px">' +
              esc(j.endDate || '—') +
              '</td>' +
              '<td class="td-p" style="text-align:right;font-weight:700">' +
              money(totalCost) +
              '</td>' +
              '<td class="td-p">' +
              window.badge(j.status || 'Open') +
              '</td>' +
              '<td class="td-p" style="text-align:center;white-space:nowrap">' +
              '<button class="btn-ghost" style="font-size:11px;padding:3px 8px" data-action="viewJC" data-id="' +
              esc(j.id) +
              '">Detail</button>' +
              ' <button class="btn-ghost" style="font-size:11px;padding:3px 8px;color:var(--danger)" data-action="delJC" data-id="' +
              esc(j.id) +
              '">Hapus</button>' +
              '</td></tr>'
            );
          })
          .join('')
      : '<tr><td colspan="8" style="text-align:center;padding:24px;color:var(--muted)">Belum ada job costing.</td></tr>';

    injectView(
      'inventory',
      '<div class="sec-hdr"><div><h1>Job Costing</h1><p>Alokasi biaya per pekerjaan / proyek</p></div>' +
        '<button class="btn" data-action="addJC">+ Buat Job</button></div>' +
        '<div class="card" style="overflow-x:auto">' +
        '<table style="width:100%;border-collapse:collapse">' +
        '<thead><tr>' +
        '<th style="' +
        TH +
        '">Job ID</th><th style="' +
        TH +
        '">Nama Pekerjaan</th><th style="' +
        TH +
        '">Customer</th>' +
        '<th style="' +
        TH +
        '">Mulai</th><th style="' +
        TH +
        '">Selesai</th>' +
        '<th style="' +
        TH +
        'text-align:right">Total Biaya</th><th style="' +
        TH +
        '">Status</th><th style="' +
        TH +
        '"></th>' +
        '</tr></thead><tbody>' +
        rows +
        '</tbody></table></div>'
    );
  }

  function addJCModal() {
    var custs = db().customers || [];
    var custOpts = custs
      .map(function (c) {
        return '<option value="' + esc(c.name) + '">' + esc(c.name) + '</option>';
      })
      .join('');

    modal(
      'Buat Job Costing',
      '<div class="form-group"><label class="form-label">Nama Pekerjaan</label>' +
        '<input class="form-input" id="jc-name" placeholder="Proyek pembangunan, order produksi, dll."></div>' +
        '<div class="form-row">' +
        '<div class="form-group"><label class="form-label">Customer (opsional)</label>' +
        '<input class="form-input" id="jc-customer" list="jc-cust-list" placeholder="Nama customer">' +
        '<datalist id="jc-cust-list">' +
        custOpts +
        '</datalist></div>' +
        '<div class="form-group"><label class="form-label">SO Referensi</label>' +
        '<input class="form-input" id="jc-soref" placeholder="SO.2026.01.00001 (opsional)"></div></div>' +
        '<div class="form-row">' +
        '<div class="form-group"><label class="form-label">Tanggal Mulai</label>' +
        '<input class="form-input" id="jc-start" type="date" value="' +
        today() +
        '"></div>' +
        '<div class="form-group"><label class="form-label">Target Selesai</label>' +
        '<input class="form-input" id="jc-end" type="date"></div></div>' +
        '<div class="form-group"><label class="form-label">Keterangan</label>' +
        '<input class="form-input" id="jc-notes" placeholder="Opsional"></div>',
      '<button class="btn" id="saveJC">Buat</button><button class="btn-ghost" data-action="closeModal">Batal</button>'
    );
    setTimeout(function () {
      var btn = document.getElementById('saveJC');
      if (!btn) return;
      btn.addEventListener('click', function () {
        var name = (document.getElementById('jc-name').value || '').trim();
        if (!name) {
          toast('Nama pekerjaan wajib diisi', 'warning');
          return;
        }
        var arr = ensureArr('jobCostings');
        var num = 'JC.' + new Date().getFullYear() + '.' + String(arr.length + 1).padStart(4, '0');
        arr.push({
          id: num,
          name: name,
          customer: document.getElementById('jc-customer').value.trim(),
          soRef: document.getElementById('jc-soref').value.trim(),
          startDate: document.getElementById('jc-start').value,
          endDate: document.getElementById('jc-end').value,
          notes: document.getElementById('jc-notes').value.trim(),
          costs: [],
          status: 'Open',
          createdAt: today(),
        });
        save();
        closeM();
        toast('Job costing dibuat', 'success');
        openJobCosting();
      });
    }, 60);
  }

  function viewJCModal(id) {
    var j = ensureArr('jobCostings').find(function (x) {
      return x.id === id;
    });
    if (!j) return;
    var totalCost = (j.costs || []).reduce(function (s, c) {
      return s + (c.amount || 0);
    }, 0);
    var costRows =
      (j.costs || [])
        .map(function (c, i) {
          return (
            '<tr><td class="td-p" style="font-size:12px">' +
            esc(c.date) +
            '</td>' +
            '<td class="td-p" style="font-size:12px">' +
            esc(c.category || '—') +
            '</td>' +
            '<td class="td-p">' +
            esc(c.description) +
            '</td>' +
            '<td class="td-p" style="text-align:right;font-weight:700">' +
            money(c.amount) +
            '</td>' +
            '<td class="td-p" style="text-align:center">' +
            '<button class="btn-ghost" style="font-size:11px;padding:2px 6px;color:var(--danger)" data-action="delJCCost" data-jcid="' +
            esc(id) +
            '" data-idx="' +
            i +
            '">×</button>' +
            '</td></tr>'
          );
        })
        .join('') ||
      '<tr><td colspan="5" style="text-align:center;padding:16px;color:var(--muted);font-size:12px">Belum ada entri biaya.</td></tr>';

    modal(
      'Job Costing — ' + j.id,
      '<div style="display:flex;gap:16px;flex-wrap:wrap;margin-bottom:16px;font-size:12px">' +
        '<div><span style="color:var(--muted)">Pekerjaan:</span> <strong>' +
        esc(j.name) +
        '</strong></div>' +
        '<div><span style="color:var(--muted)">Customer:</span> ' +
        esc(j.customer || '—') +
        '</div>' +
        '<div><span style="color:var(--muted)">Periode:</span> ' +
        esc(j.startDate || '') +
        ' s/d ' +
        esc(j.endDate || '—') +
        '</div>' +
        '<div><span style="color:var(--muted)">Total:</span> <strong>' +
        money(totalCost) +
        '</strong></div></div>' +
        '<div style="font-size:12px;font-weight:700;margin-bottom:8px">Tambah Biaya</div>' +
        '<div class="form-row" style="margin-bottom:12px">' +
        '<div class="form-group"><label class="form-label">Tanggal</label><input class="form-input" id="jcc-date" type="date" value="' +
        today() +
        '"></div>' +
        '<div class="form-group"><label class="form-label">Kategori</label>' +
        '<input class="form-input" id="jcc-cat" list="jcc-cat-list" placeholder="Material, Upah, Transport...">' +
        '<datalist id="jcc-cat-list"><option>Material</option><option>Upah</option><option>Transport</option><option>Overhead</option></datalist></div>' +
        '<div class="form-group"><label class="form-label">Keterangan</label><input class="form-input" id="jcc-desc" placeholder="Uraian biaya"></div>' +
        '<div class="form-group"><label class="form-label">Jumlah</label><input class="form-input" id="jcc-amount" type="number" min="0" placeholder="0"></div>' +
        '<div class="form-group" style="justify-content:flex-end;display:flex;align-items:flex-end">' +
        '<button class="btn" id="addJCCost" data-jcid="' +
        esc(id) +
        '">+ Tambah</button></div></div>' +
        '<table style="width:100%;border-collapse:collapse">' +
        '<thead><tr><th style="text-align:left;padding:8px;font-size:11px;color:var(--muted)">Tgl</th>' +
        '<th style="text-align:left;padding:8px;font-size:11px;color:var(--muted)">Kategori</th>' +
        '<th style="text-align:left;padding:8px;font-size:11px;color:var(--muted)">Keterangan</th>' +
        '<th style="text-align:right;padding:8px;font-size:11px;color:var(--muted)">Jumlah</th><th></th></tr></thead>' +
        '<tbody id="jcc-rows">' +
        costRows +
        '</tbody></table>',
      '<button class="btn-ghost" data-action="closeModal">Tutup</button>',
      true
    );

    setTimeout(function () {
      var addBtn = document.getElementById('addJCCost');
      if (!addBtn) return;
      addBtn.addEventListener('click', function () {
        var date = document.getElementById('jcc-date').value;
        var cat = document.getElementById('jcc-cat').value.trim();
        var desc = document.getElementById('jcc-desc').value.trim();
        var amount = parseFloat(document.getElementById('jcc-amount').value) || 0;
        if (!desc || amount <= 0) {
          toast('Uraian dan jumlah wajib diisi', 'warning');
          return;
        }
        if (!j.costs) j.costs = [];
        j.costs.push({ date: date, category: cat, description: desc, amount: amount });
        save();
        toast('Biaya ditambahkan', 'success');
        closeM();
        viewJCModal(id);
      });
    }, 60);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // EVENT DELEGATION
  // ══════════════════════════════════════════════════════════════════════════
  document.addEventListener('click', function (e) {
    var btn = e.target.closest('[data-action]');
    if (!btn) return;
    var action = btn.dataset.action;
    var id = btn.dataset.id;

    switch (action) {
      // Item Unit
      case 'addUnit':
        addUnitModal();
        break;
      case 'delUnit': {
        var ui = parseInt(btn.dataset.idx);
        var units = ensureSettings('units', []);
        if (!isNaN(ui)) {
          units.splice(ui, 1);
          save();
          toast('Satuan dihapus', 'success');
          openItemUnit();
        }
        break;
      }
      // Item Category
      case 'addItemCat':
        addItemCatModal();
        break;
      case 'delItemCat': {
        var ci = parseInt(btn.dataset.idx);
        var cats = ensureSettings('itemCategories', []);
        if (!isNaN(ci)) {
          cats.splice(ci, 1);
          save();
          toast('Kategori dihapus', 'success');
          openItemCategory();
        }
        break;
      }
      // Item Brand
      case 'addItemBrand':
        addItemBrandModal();
        break;
      case 'delItemBrand': {
        var bi = parseInt(btn.dataset.idx);
        var brands = ensureSettings('itemBrands', []);
        if (!isNaN(bi)) {
          brands.splice(bi, 1);
          save();
          toast('Brand dihapus', 'success');
          openItemBrand();
        }
        break;
      }
      // IR add line
      case 'addIRLine': {
        var wrap = document.getElementById('ir-lines-wrap');
        if (!wrap) break;
        var items = db().inventoryItems || [];
        var opts = items
          .map(function (i) {
            return (
              '<option value="' +
              esc(i.id) +
              '">' +
              esc(i.name) +
              (i.unit ? ' (' + i.unit + ')' : '') +
              '</option>'
            );
          })
          .join('');
        var row = document.createElement('div');
        row.style.cssText = 'display:flex;gap:8px;margin-bottom:6px;align-items:center';
        row.innerHTML =
          '<select class="form-select ir-item-sel" style="flex:1;font-size:12px"><option value="">— Pilih Item —</option>' +
          opts +
          '</select>' +
          '<input class="form-input ir-item-qty" type="number" min="1" value="1" style="width:80px;font-size:12px">' +
          '<button type="button" class="btn-ghost" data-action="removeIRLine" style="font-size:18px;padding:0 6px;line-height:1">×</button>';
        wrap.appendChild(row);
        break;
      }
      case 'removeIRLine': {
        var lineRow = btn.parentElement;
        if (lineRow) lineRow.remove();
        break;
      }
      // Item Requisition
      case 'addIR':
        addIRModal();
        break;
      case 'approveIR': {
        var r = ensureArr('itemRequisitions').find(function (x) {
          return x.id === id;
        });
        if (r) {
          r.status = 'Approved';
          save();
          toast('Permintaan disetujui — klik "Buat PO" untuk lanjut', 'success');
          openItemRequisition();
        }
        break;
      }
      case 'createPOFromIR':
        createPOFromIRModal(id);
        break;
      case 'viewPOFromIR':
        window.invalidateView && window.invalidateView('purchase');
        window.navigate && window.navigate('purchase');
        setTimeout(function () {
          window.viewPO && window.viewPO(id);
        }, 120);
        break;
      case 'rejectIR': {
        var rr = ensureArr('itemRequisitions').find(function (x) {
          return x.id === id;
        });
        if (rr) {
          rr.status = 'Rejected';
          save();
          toast('Permintaan ditolak', 'warning');
          openItemRequisition();
        }
        break;
      }
      case 'delIR': {
        if (!confirm('Hapus permintaan barang ini?')) return;
        var ia = ensureArr('itemRequisitions');
        var ii = ia.findIndex(function (x) {
          return x.id === id;
        });
        if (ii >= 0) {
          ia.splice(ii, 1);
          save();
          toast('Permintaan dihapus', 'success');
          openItemRequisition();
        }
        break;
      }
      // Job Costing
      case 'addJC':
        addJCModal();
        break;
      case 'viewJC':
        viewJCModal(id);
        break;
      case 'delJC': {
        if (!confirm('Hapus job costing ini?')) return;
        var ja = ensureArr('jobCostings');
        var ji = ja.findIndex(function (x) {
          return x.id === id;
        });
        if (ji >= 0) {
          ja.splice(ji, 1);
          save();
          toast('Job costing dihapus', 'success');
          openJobCosting();
        }
        break;
      }
      case 'delJCCost': {
        var jcid = btn.dataset.jcid;
        var cidx = parseInt(btn.dataset.idx);
        var jj = ensureArr('jobCostings').find(function (x) {
          return x.id === jcid;
        });
        if (jj && jj.costs && !isNaN(cidx)) {
          jj.costs.splice(cidx, 1);
          save();
          toast('Biaya dihapus', 'success');
          closeM();
          viewJCModal(jcid);
        }
        break;
      }
    }
  });

  window._inventoryExtras = {
    openItemUnit: openItemUnit,
    openItemCategory: openItemCategory,
    openItemBrand: openItemBrand,
    openItemRequisition: openItemRequisition,
    openJobCosting: openJobCosting,
  };
  console.log('[InventoryExtras] Inventory extras ready');
})();
