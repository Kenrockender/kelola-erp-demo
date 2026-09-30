// ═══════════════════════════════════════════════════════════════════════════════
// KELOLA ERP (DEMO) — Sales & Purchase Extras  (sales-purchase-extras.js)
// Implements: Sales Down Payment, Sales Target, Receive Item,
//             Purchase Down Payment, Supplier Price
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
  function db() {
    return window.DB || {};
  }
  function save() {
    if (typeof window.saveDB === 'function') window.saveDB();
  }
  function toast(m, t) {
    if (typeof window.showToast === 'function') window.showToast(m, t);
  }
  function modal(t, b, f, w) {
    if (typeof window.openModal === 'function') window.openModal(t, b, f, w);
  }
  function closeM() {
    if (typeof window.closeModal === 'function') window.closeModal();
  }
  function nav(v) {
    if (typeof window.navigate === 'function') window.navigate(v);
  }
  function today() {
    var d = new Date();
    return (
      d.getFullYear() +
      '-' +
      String(d.getMonth() + 1).padStart(2, '0') +
      '-' +
      String(d.getDate()).padStart(2, '0')
    );
  }
  function uid(prefix) {
    return (
      prefix +
      '-' +
      Date.now().toString(36).toUpperCase() +
      Math.random().toString(36).substr(2, 4).toUpperCase()
    );
  }
  function thisMonth() {
    var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
  }

  function ensureArr(key) {
    if (!Array.isArray(db()[key])) db()[key] = [];
    return db()[key];
  }

  function injectView(hostView, html) {
    if (window.activeView !== hostView) nav(hostView);
    var el = document.getElementById('view-' + hostView);
    if (!el) {
      nav(hostView);
      el = document.getElementById('view-' + hostView);
    }
    if (el) el.innerHTML = html;
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // § 1  SALES DOWN PAYMENT
  // ══════════════════════════════════════════════════════════════════════════════
  function openSalesDP() {
    var dps = ensureArr('salesDownPayments');
    var sos = db().salesOrders || [];

    var rows = dps
      .slice()
      .reverse()
      .map(function (d) {
        var so = sos.find(function (o) {
          return o.id === d.orderId;
        });
        var statusBadge =
          d.status === 'Applied'
            ? '<span class="badge" style="background:#DCFCE7;color:#166534">Diterapkan</span>'
            : '<span class="badge" style="background:#FEF3C7;color:#92400E">Diterima</span>';
        var orderTotal = so ? (so.amount || 0) : 0;
        var allDPForOrder = dps.filter(function (x) { return x.orderId === d.orderId; })
          .reduce(function (s, x) { return s + (x.amount || 0); }, 0);
        var remaining = orderTotal - allDPForOrder;
        return (
          '<tr>' +
          '<td class="td-p" style="font-size:11px;font-weight:700">' +
          esc(d.id) +
          '</td>' +
          '<td class="td-p" style="font-size:11px">' +
          esc(d.date) +
          '</td>' +
          '<td class="td-p" style="font-weight:600;color:var(--primary)">' +
          esc(d.orderId) +
          '</td>' +
          '<td class="td-p">' +
          esc(so ? so.customer : d.customerName || '—') +
          '</td>' +
          '<td class="td-p" style="text-align:right;font-weight:700">' +
          money(d.amount) +
          '</td>' +
          '<td class="td-p" style="text-align:right;font-size:11px">' +
          money(orderTotal) +
          '</td>' +
          '<td class="td-p" style="text-align:right;font-size:11px;font-weight:700;color:' +
          (remaining > 0 ? '#EF4444' : '#10B981') + '">' +
          money(remaining) +
          '</td>' +
          '<td class="td-p">' +
          statusBadge +
          '</td>' +
          '<td class="td-p">' +
          (d.status !== 'Applied'
            ? '<button class="action-primary" data-action="applySalesDP" data-id="' +
              esc(d.id) +
              '">Terapkan</button> '
            : '') +
          '<button class="action-ghost" data-action="delSalesDP" data-id="' +
          esc(d.id) +
          '" style="color:#EF4444">Hapus</button>' +
          '</td>' +
          '</tr>'
        );
      })
      .join('');

    var totalDP = dps.reduce(function (s, d) {
      return s + (d.amount || 0);
    }, 0);
    var pendingDP = dps
      .filter(function (d) {
        return d.status !== 'Applied';
      })
      .reduce(function (s, d) {
        return s + (d.amount || 0);
      }, 0);

    var header =
      typeof window.secHdr === 'function'
        ? window.secHdr(
            'Uang Muka Penjualan',
            'Down payment dari pelanggan',
            'Terima DP',
            'addSalesDP'
          )
        : '<h1>Sales Down Payment</h1>';

    var stats =
      typeof window.statRow === 'function'
        ? window.statRow([
            { label: 'Total DP', value: String(dps.length), sub: 'Transaksi DP' },
            { label: 'Total Diterima', value: money(totalDP), sub: 'Seluruh DP', color: '#10B981' },
            {
              label: 'Belum Diterapkan',
              value: money(pendingDP),
              sub: 'Pending application',
              color: '#F59E0B',
            },
          ])
        : '';

    var html =
      header +
      stats +
      '<div class="card"><div class="table-wrap"><table style="width:100%">' +
      '<thead><tr><th>ID</th><th>Tanggal</th><th>No. SO</th><th>Pelanggan</th><th style="text-align:right">Jumlah DP</th><th style="text-align:right">Total SO</th><th style="text-align:right">Sisa</th><th>Status</th><th>Aksi</th></tr></thead>' +
      '<tbody>' +
      (rows || '<tr><td colspan="9" class="td-empty">Belum ada uang muka penjualan.</td></tr>') +
      '</tbody>' +
      '</table></div></div>';

    injectView('sales', html);
  }

  function addSalesDPModal() {
    var sos = (db().salesOrders || []).filter(function (o) {
      return o.status !== 'Paid';
    });
    var opts = sos
      .map(function (o) {
        return (
          '<option value="' +
          esc(o.id) +
          '" data-customer="' +
          esc(o.customer || '') +
          '" data-amount="' +
          (o.amount || 0) +
          '">' +
          esc(o.id) +
          ' — ' +
          esc(o.customer || '?') +
          ' (' +
          money(o.amount || 0) +
          ')</option>'
        );
      })
      .join('');

    var body =
      '<div style="display:flex;flex-direction:column;gap:12px">' +
      '<label style="font-size:12px;font-weight:700">Sales Order<select id="sdp-so" class="form-select" style="width:100%;margin-top:4px">' +
      (opts || '<option value="">Tidak ada SO aktif</option>') +
      '</select></label>' +
      '<label style="font-size:12px;font-weight:700">Tanggal<input id="sdp-date" class="form-input" type="date" value="' +
      today() +
      '" style="width:100%;margin-top:4px"></label>' +
      '<label style="font-size:12px;font-weight:700">Jumlah DP<input id="sdp-amount" class="form-input" type="number" min="0" value="0" style="width:100%;margin-top:4px"></label>' +
      '<label style="font-size:12px;font-weight:700">Catatan<input id="sdp-notes" class="form-input" style="width:100%;margin-top:4px"></label>' +
      '</div>';

    modal(
      'Terima Uang Muka Penjualan',
      body,
      '<button class="btn-ghost" data-action="closeModal">Batal</button>' +
        '<button class="btn" id="sdp-save">Simpan</button>',
      false
    );

    setTimeout(function () {
      document.getElementById('sdp-save').addEventListener('click', function () {
        var sel = document.getElementById('sdp-so');
        var orderId = sel.value;
        if (!orderId) {
          toast('Pilih Sales Order', 'warning');
          return;
        }
        var opt = sel.options[sel.selectedIndex];
        var customer = opt ? opt.dataset.customer : '';
        var date = document.getElementById('sdp-date').value;
        var amount = parseFloat(document.getElementById('sdp-amount').value) || 0;
        var notes = document.getElementById('sdp-notes').value.trim();
        if (amount <= 0) {
          toast('Jumlah DP harus lebih dari 0', 'warning');
          return;
        }

        ensureArr('salesDownPayments').push({
          id: uid('SDP'),
          orderId: orderId,
          customerName: customer,
          date: date,
          amount: amount,
          notes: notes,
          status: 'Received',
          createdAt: today(),
        });
        save();
        closeM();
        toast('Uang muka penjualan dicatat', 'success');
        openSalesDP();
      });
    }, 60);
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // § 2  PURCHASE DOWN PAYMENT
  // ══════════════════════════════════════════════════════════════════════════════
  function openPurchaseDP() {
    var dps = ensureArr('purchaseDownPayments');
    var pos = db().purchaseOrders || [];

    var rows = dps
      .slice()
      .reverse()
      .map(function (d) {
        var po = pos.find(function (o) {
          return o.id === d.orderId;
        });
        var statusBadge =
          d.status === 'Applied'
            ? '<span class="badge" style="background:#DCFCE7;color:#166534">Diterapkan</span>'
            : '<span class="badge" style="background:#FEF3C7;color:#92400E">Dibayar</span>';
        var orderTotal = po ? (po.amount || 0) : 0;
        var allDPForOrder = dps.filter(function (x) { return x.orderId === d.orderId; })
          .reduce(function (s, x) { return s + (x.amount || 0); }, 0);
        var remaining = orderTotal - allDPForOrder;
        return (
          '<tr>' +
          '<td class="td-p" style="font-size:11px;font-weight:700">' +
          esc(d.id) +
          '</td>' +
          '<td class="td-p" style="font-size:11px">' +
          esc(d.date) +
          '</td>' +
          '<td class="td-p" style="font-weight:600;color:var(--primary)">' +
          esc(d.orderId) +
          '</td>' +
          '<td class="td-p">' +
          esc(po ? po.supplier : d.supplierName || '—') +
          '</td>' +
          '<td class="td-p" style="text-align:right;font-weight:700">' +
          money(d.amount) +
          '</td>' +
          '<td class="td-p" style="text-align:right;font-size:11px">' +
          money(orderTotal) +
          '</td>' +
          '<td class="td-p" style="text-align:right;font-size:11px;font-weight:700;color:' +
          (remaining > 0 ? '#EF4444' : '#10B981') + '">' +
          money(remaining) +
          '</td>' +
          '<td class="td-p">' +
          statusBadge +
          '</td>' +
          '<td class="td-p">' +
          (d.status !== 'Applied'
            ? '<button class="action-primary" data-action="applyPurchaseDP" data-id="' +
              esc(d.id) +
              '">Terapkan</button> '
            : '') +
          '<button class="action-ghost" data-action="delPurchaseDP" data-id="' +
          esc(d.id) +
          '" style="color:#EF4444">Hapus</button>' +
          '</td>' +
          '</tr>'
        );
      })
      .join('');

    var totalDP = dps.reduce(function (s, d) {
      return s + (d.amount || 0);
    }, 0);
    var pendingDP = dps
      .filter(function (d) { return d.status !== 'Applied'; })
      .reduce(function (s, d) { return s + (d.amount || 0); }, 0);

    var header =
      typeof window.secHdr === 'function'
        ? window.secHdr(
            'Uang Muka Pembelian',
            'Down payment ke supplier',
            'Bayar DP',
            'addPurchaseDP'
          )
        : '<h1>Purchase Down Payment</h1>';

    var stats =
      typeof window.statRow === 'function'
        ? window.statRow([
            { label: 'Total DP', value: String(dps.length), sub: 'Transaksi DP' },
            { label: 'Total Dibayar', value: money(totalDP), sub: 'Seluruh DP', color: '#F59E0B' },
            { label: 'Belum Diterapkan', value: money(pendingDP), sub: 'Pending application', color: '#EF4444' },
          ])
        : '';

    var html =
      header +
      stats +
      '<div class="card"><div class="table-wrap"><table style="width:100%">' +
      '<thead><tr><th>ID</th><th>Tanggal</th><th>No. PO</th><th>Supplier</th><th style="text-align:right">Jumlah DP</th><th style="text-align:right">Total PO</th><th style="text-align:right">Sisa</th><th>Status</th><th>Aksi</th></tr></thead>' +
      '<tbody>' +
      (rows || '<tr><td colspan="9" class="td-empty">Belum ada uang muka pembelian.</td></tr>') +
      '</tbody>' +
      '</table></div></div>';

    injectView('purchase', html);
  }

  function addPurchaseDPModal() {
    var pos = (db().purchaseOrders || []).filter(function (o) {
      return o.status !== 'Paid' && o.status !== 'Received';
    });
    var opts = pos
      .map(function (o) {
        return (
          '<option value="' +
          esc(o.id) +
          '" data-supplier="' +
          esc(o.supplier || '') +
          '">' +
          esc(o.id) +
          ' — ' +
          esc(o.supplier || '?') +
          ' (' +
          money(o.amount || 0) +
          ')</option>'
        );
      })
      .join('');

    var body =
      '<div style="display:flex;flex-direction:column;gap:12px">' +
      '<label style="font-size:12px;font-weight:700">Purchase Order<select id="pdp-po" class="form-select" style="width:100%;margin-top:4px">' +
      (opts || '<option value="">Tidak ada PO aktif</option>') +
      '</select></label>' +
      '<label style="font-size:12px;font-weight:700">Tanggal<input id="pdp-date" class="form-input" type="date" value="' +
      today() +
      '" style="width:100%;margin-top:4px"></label>' +
      '<label style="font-size:12px;font-weight:700">Jumlah DP<input id="pdp-amount" class="form-input" type="number" min="0" value="0" style="width:100%;margin-top:4px"></label>' +
      '<label style="font-size:12px;font-weight:700">Catatan<input id="pdp-notes" class="form-input" style="width:100%;margin-top:4px"></label>' +
      '</div>';

    modal(
      'Bayar Uang Muka Pembelian',
      body,
      '<button class="btn-ghost" data-action="closeModal">Batal</button>' +
        '<button class="btn" id="pdp-save">Simpan</button>',
      false
    );

    setTimeout(function () {
      document.getElementById('pdp-save').addEventListener('click', function () {
        var sel = document.getElementById('pdp-po');
        var orderId = sel.value;
        if (!orderId) {
          toast('Pilih Purchase Order', 'warning');
          return;
        }
        var opt = sel.options[sel.selectedIndex];
        var supplier = opt ? opt.dataset.supplier : '';
        var date = document.getElementById('pdp-date').value;
        var amount = parseFloat(document.getElementById('pdp-amount').value) || 0;
        var notes = document.getElementById('pdp-notes').value.trim();
        if (amount <= 0) {
          toast('Jumlah DP harus lebih dari 0', 'warning');
          return;
        }

        ensureArr('purchaseDownPayments').push({
          id: uid('PDP'),
          orderId: orderId,
          supplierName: supplier,
          date: date,
          amount: amount,
          notes: notes,
          status: 'Paid',
          createdAt: today(),
        });
        save();
        closeM();
        toast('Uang muka pembelian dicatat', 'success');
        openPurchaseDP();
      });
    }, 60);
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // § 3  SALES TARGET
  // ══════════════════════════════════════════════════════════════════════════════
  function openSalesTarget() {
    var targets = ensureArr('salesTargets');
    var sos = db().salesOrders || [];

    var rows = targets
      .slice()
      .reverse()
      .map(function (t) {
        var actual = sos
          .filter(function (o) {
            return o.date && o.date.startsWith(t.period) && o.status !== 'Draft';
          })
          .reduce(function (s, o) {
            return s + (o.amount || 0);
          }, 0);
        var pct = t.target > 0 ? Math.round((actual / t.target) * 100) : 0;
        var color = pct >= 100 ? '#10B981' : pct >= 70 ? '#F59E0B' : '#EF4444';

        return (
          '<tr>' +
          '<td class="td-p">' +
          esc(t.period) +
          '</td>' +
          '<td class="td-p">' +
          esc(t.category || 'Semua') +
          '</td>' +
          '<td class="td-p" style="text-align:right;font-weight:700">' +
          money(t.target) +
          '</td>' +
          '<td class="td-p" style="text-align:right;font-weight:700">' +
          money(actual) +
          '</td>' +
          '<td class="td-p"><div style="display:flex;align-items:center;gap:8px"><div style="flex:1;height:8px;background:#f1f5f9;border-radius:4px;overflow:hidden"><div style="height:100%;width:' +
          Math.min(pct, 100) +
          '%;background:' +
          color +
          ';border-radius:4px"></div></div><span style="font-size:11px;font-weight:700;color:' +
          color +
          '">' +
          pct +
          '%</span></div></td>' +
          '<td class="td-p" style="font-size:11px;color:var(--muted)">' +
          esc(t.notes || '—') +
          '</td>' +
          '<td class="td-p">' +
          '<button class="action-ghost" data-action="editTarget" data-id="' +
          esc(t.id) +
          '">Edit</button> ' +
          '<button class="action-ghost" data-action="delTarget" data-id="' +
          esc(t.id) +
          '" style="color:#EF4444">Hapus</button>' +
          '</td>' +
          '</tr>'
        );
      })
      .join('');

    var header =
      typeof window.secHdr === 'function'
        ? window.secHdr(
            'Target Penjualan',
            'Penetapan & pelacakan target penjualan',
            'Tambah Target',
            'addTarget'
          )
        : '<h1>Sales Target</h1>';

    var html =
      header +
      '<div class="card"><div class="table-wrap"><table style="width:100%">' +
      '<thead><tr><th>Periode</th><th>Kategori</th><th style="text-align:right">Target</th><th style="text-align:right">Realisasi</th><th>Pencapaian</th><th>Catatan</th><th>Aksi</th></tr></thead>' +
      '<tbody>' +
      (rows || '<tr><td colspan="7" class="td-empty">Belum ada target penjualan.</td></tr>') +
      '</tbody>' +
      '</table></div></div>';

    injectView('sales', html);
  }

  function addTargetModal(existing) {
    var t = existing || {};
    var body =
      '<div style="display:flex;flex-direction:column;gap:12px">' +
      '<label style="font-size:12px;font-weight:700">Periode<input id="st-period" class="form-input" type="month" value="' +
      esc(t.period || thisMonth()) +
      '" style="width:100%;margin-top:4px"></label>' +
      '<label style="font-size:12px;font-weight:700">Kategori (opsional)<input id="st-cat" class="form-input" value="' +
      esc(t.category || '') +
      '" placeholder="Semua" style="width:100%;margin-top:4px"></label>' +
      '<label style="font-size:12px;font-weight:700">Target Penjualan (Rp)<input id="st-target" class="form-input" type="number" min="0" value="' +
      (t.target || 0) +
      '" style="width:100%;margin-top:4px"></label>' +
      '<label style="font-size:12px;font-weight:700">Catatan<input id="st-notes" class="form-input" value="' +
      esc(t.notes || '') +
      '" style="width:100%;margin-top:4px"></label>' +
      '</div>';

    modal(
      existing ? 'Edit Target' : 'Tambah Target',
      body,
      '<button class="btn-ghost" data-action="closeModal">Batal</button>' +
        '<button class="btn" id="st-save">Simpan</button>',
      false
    );

    setTimeout(function () {
      document.getElementById('st-save').addEventListener('click', function () {
        var period = document.getElementById('st-period').value;
        var category = document.getElementById('st-cat').value.trim();
        var target = parseFloat(document.getElementById('st-target').value) || 0;
        var notes = document.getElementById('st-notes').value.trim();
        if (!period || target <= 0) {
          toast('Periode dan target wajib diisi', 'warning');
          return;
        }

        var arr = ensureArr('salesTargets');
        if (existing) {
          var idx = arr.findIndex(function (x) {
            return x.id === existing.id;
          });
          if (idx >= 0)
            Object.assign(arr[idx], {
              period: period,
              category: category,
              target: target,
              notes: notes,
            });
        } else {
          arr.push({
            id: uid('TGT'),
            period: period,
            category: category,
            target: target,
            notes: notes,
            createdAt: today(),
          });
        }
        save();
        closeM();
        toast(existing ? 'Target diperbarui' : 'Target ditambahkan', 'success');
        openSalesTarget();
      });
    }, 60);
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // § 4  RECEIVE ITEM (Goods Receipt from PO)
  // ══════════════════════════════════════════════════════════════════════════════
  function openReceiveItem() {
    var receipts = ensureArr('goodsReceipts');
    var pos = db().purchaseOrders || [];

    var rows = receipts
      .slice()
      .reverse()
      .map(function (r) {
        return (
          '<tr data-action="viewReceipt" data-id="' +
          esc(r.id) +
          '">' +
          '<td class="td-p" style="font-size:11px;font-weight:700">' +
          esc(r.id) +
          '</td>' +
          '<td class="td-p" style="font-size:11px">' +
          esc(r.date) +
          '</td>' +
          '<td class="td-p" style="font-weight:600;color:var(--primary)">' +
          esc(r.poId) +
          '</td>' +
          '<td class="td-p">' +
          esc(r.supplierName || '—') +
          '</td>' +
          '<td class="td-p">' +
          (r.items || []).length +
          ' item</td>' +
          '<td class="td-p">' +
          (r.posted
            ? '<span class="badge" style="background:#DCFCE7;color:#166534">Diterima</span>'
            : '<span class="badge" style="background:#FEF3C7;color:#92400E">Draft</span>') +
          '</td>' +
          '<td class="td-p">' +
          (!r.posted
            ? '<button class="action-primary" data-action="postReceipt" data-id="' +
              esc(r.id) +
              '" style="font-size:11px;padding:4px 10px;border-radius:6px;border:none;background:var(--primary);color:#fff;cursor:pointer">Terima & Stok</button> '
            : '') +
          '<button class="action-edit" data-action="delReceipt" data-id="' +
          esc(r.id) +
          '" title="Hapus" style="color:#EF4444;border-color:#EF4444">' +
          '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>' +
          '</button>' +
          '</td>' +
          '</tr>'
        );
      })
      .join('');

    var pendingPO = pos.filter(function (o) {
      return o.status === 'Confirmed';
    }).length;

    var header =
      typeof window.secHdr === 'function'
        ? window.secHdr(
            'Penerimaan Barang',
            'Dokumen penerimaan barang dari Purchase Order',
            'Terima Barang',
            'addReceipt'
          )
        : '<h1>Receive Item</h1>';

    var stats =
      typeof window.statRow === 'function'
        ? window.statRow([
            { label: 'Total Penerimaan', value: String(receipts.length), sub: 'Dokumen' },
            {
              label: 'PO Pending',
              value: String(pendingPO),
              sub: 'Menunggu penerimaan',
              color: '#F59E0B',
            },
          ])
        : '';

    var html =
      header +
      stats +
      '<div class="card"><div class="table-wrap"><table style="width:100%">' +
      '<thead><tr><th>ID</th><th>Tanggal</th><th>No. PO</th><th>Supplier</th><th>Item</th><th>Status</th><th>Aksi</th></tr></thead>' +
      '<tbody>' +
      (rows || '<tr><td colspan="7" class="td-empty">Belum ada penerimaan barang.</td></tr>') +
      '</tbody>' +
      '</table></div></div>';

    injectView('purchase', html);
  }

  function addReceiptModal() {
    var pos = (db().purchaseOrders || []).filter(function (o) {
      return o.status === 'Confirmed' || o.status === 'Draft';
    });
    var opts = pos
      .map(function (o) {
        return (
          '<option value="' +
          esc(o.id) +
          '" data-supplier="' +
          esc(o.supplier || '') +
          '">' +
          esc(o.id) +
          ' — ' +
          esc(o.supplier || '?') +
          ' (' +
          (o.lines || []).length +
          ' item)</option>'
        );
      })
      .join('');

    var body =
      '<div style="display:flex;flex-direction:column;gap:12px">' +
      '<label style="font-size:12px;font-weight:700">Purchase Order<select id="ri-po" class="form-select" style="width:100%;margin-top:4px" data-action="riSelectPO">' +
      (opts || '<option value="">Tidak ada PO aktif</option>') +
      '</select></label>' +
      '<label style="font-size:12px;font-weight:700">Tanggal Terima<input id="ri-date" class="form-input" type="date" value="' +
      today() +
      '" style="width:100%;margin-top:4px"></label>' +
      '<label style="font-size:12px;font-weight:700">Catatan<input id="ri-notes" class="form-input" style="width:100%;margin-top:4px"></label>' +
      '<div id="ri-lines" style="background:var(--bg);border-radius:8px;padding:12px">' +
      '<div style="font-size:12px;font-weight:700;margin-bottom:8px">Item dari PO</div>' +
      '<div style="font-size:11px;color:var(--muted)">Pilih PO untuk melihat daftar item</div>' +
      '</div>' +
      '<label style="font-size:12px"><input type="checkbox" id="ri-post" checked> Langsung update stok</label>' +
      '</div>';

    modal(
      'Penerimaan Barang',
      body,
      '<button class="btn-ghost" data-action="closeModal">Batal</button>' +
        '<button class="btn" id="ri-save">Simpan</button>',
      true
    );

    // Load PO lines on select
    setTimeout(function () {
      var poSel = document.getElementById('ri-po');
      if (poSel) {
        poSel.addEventListener('change', function () {
          loadPOLines(poSel.value);
        });
        if (poSel.value) loadPOLines(poSel.value);
      }

      document.getElementById('ri-save').addEventListener('click', function () {
        var poId = document.getElementById('ri-po').value;
        if (!poId) {
          toast('Pilih PO', 'warning');
          return;
        }
        var po = (db().purchaseOrders || []).find(function (o) {
          return o.id === poId;
        });
        if (!po) return;

        var lineEls = document.querySelectorAll('.ri-line-qty');
        var items = [];
        lineEls.forEach(function (el) {
          var qty = parseFloat(el.value) || 0;
          if (qty > 0) {
            items.push({ itemId: el.dataset.itemid, itemName: el.dataset.itemname, qty: qty });
          }
        });

        if (items.length === 0) {
          toast('Minimal 1 item harus diterima', 'warning');
          return;
        }

        var doPost = document.getElementById('ri-post').checked;
        var receipt = {
          id: uid('GR'),
          poId: poId,
          supplierName: po.supplier || '',
          date: document.getElementById('ri-date').value,
          notes: document.getElementById('ri-notes').value.trim(),
          items: items,
          posted: doPost,
          createdAt: today(),
        };
        ensureArr('goodsReceipts').push(receipt);

        if (doPost) {
          var invItems = db().inventoryItems || [];
          items.forEach(function (ri) {
            var inv = invItems.find(function (i) { return i.id === ri.itemId; });
            if (!inv && ri.itemName) inv = invItems.find(function (i) { return i.name === ri.itemName; });
            if (inv) {
              inv.stock = (inv.stock || 0) + ri.qty;
              if (inv.warehouseStock) {
                inv.warehouseStock['WH-DEFAULT'] = (inv.warehouseStock['WH-DEFAULT'] || 0) + ri.qty;
              }
            }
          });
        }

        save();
        closeM();
        toast('Penerimaan barang dicatat' + (doPost ? ' & stok diupdate' : ''), 'success');
        openReceiveItem();
      });
    }, 60);
  }

  function loadPOLines(poId) {
    var po = (db().purchaseOrders || []).find(function (o) {
      return o.id === poId;
    });
    var container = document.getElementById('ri-lines');
    if (!container || !po) return;

    var lines = po.lines && po.lines.length ? po.lines : po.items || [];
    if (lines.length === 0) {
      container.innerHTML =
        '<div style="font-size:12px;color:var(--muted)">PO tidak memiliki item.</div>';
      return;
    }

    var html =
      '<div style="font-size:12px;font-weight:700;margin-bottom:8px">Item dari PO ' +
      esc(poId) +
      '</div>' +
      '<table style="width:100%;border-collapse:collapse">' +
      '<thead><tr><th style="text-align:left;font-size:11px;padding:4px 6px">Item</th><th style="text-align:right;font-size:11px;padding:4px 6px">Qty PO</th><th style="text-align:right;font-size:11px;padding:4px 6px">Qty Terima</th></tr></thead>' +
      '<tbody>';
    lines.forEach(function (l) {
      html +=
        '<tr><td style="padding:4px 6px;font-size:12px">' +
        esc(l.itemName || l.itemId) +
        '</td>' +
        '<td style="padding:4px 6px;text-align:right;font-size:12px">' +
        (l.qty || 0) +
        '</td>' +
        '<td style="padding:4px 6px"><input class="form-input ri-line-qty" type="number" min="0" max="' +
        (l.qty || 0) +
        '" value="' +
        (l.qty || 0) +
        '" data-itemid="' +
        esc(l.itemId || '') +
        '" data-itemname="' +
        esc(l.itemName || '') +
        '" style="width:80px;font-size:12px;padding:4px 6px;text-align:right"></td>' +
        '</tr>';
    });
    html += '</tbody></table>';
    container.innerHTML = html;
  }

  function postReceipt(id) {
    var arr = ensureArr('goodsReceipts');
    var r = arr.find(function (x) {
      return x.id === id;
    });
    if (!r || r.posted) return;

    var invItems = db().inventoryItems || [];
    (r.items || []).forEach(function (ri) {
      var inv = invItems.find(function (i) {
        return i.id === ri.itemId || i.name === ri.itemName;
      });
      if (inv) {
        inv.stock = (inv.stock || 0) + ri.qty;
        if (inv.warehouseStock) {
          inv.warehouseStock['WH-DEFAULT'] = (inv.warehouseStock['WH-DEFAULT'] || 0) + ri.qty;
        }
      }
    });
    r.posted = true;
    save();
    toast('Stok diupdate dari penerimaan barang', 'success');
    openReceiveItem();
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // § 5  SUPPLIER PRICE
  // ══════════════════════════════════════════════════════════════════════════════
  function openSupplierPrice() {
    var prices = ensureArr('supplierPrices');
    var suppliers = db().suppliers || [];

    var rows = prices
      .slice()
      .reverse()
      .map(function (p) {
        return (
          '<tr>' +
          '<td class="td-p" style="font-weight:600">' +
          esc(p.supplierName) +
          '</td>' +
          '<td class="td-p">' +
          esc(p.itemName) +
          '</td>' +
          '<td class="td-p" style="font-size:11px">' +
          esc(p.itemCode || '—') +
          '</td>' +
          '<td class="td-p" style="text-align:right;font-weight:700">' +
          money(p.price) +
          '</td>' +
          '<td class="td-p" style="font-size:11px">' +
          esc(p.unit || '—') +
          '</td>' +
          '<td class="td-p" style="font-size:11px">' +
          esc(p.effectiveDate || '—') +
          '</td>' +
          '<td class="td-p">' +
          '<button class="action-ghost" data-action="editSupPrice" data-id="' +
          esc(p.id) +
          '">Edit</button> ' +
          '<button class="action-ghost" data-action="delSupPrice" data-id="' +
          esc(p.id) +
          '" style="color:#EF4444">Hapus</button>' +
          '</td>' +
          '</tr>'
        );
      })
      .join('');

    var header =
      typeof window.secHdr === 'function'
        ? window.secHdr(
            'Harga Supplier',
            'Daftar harga per supplier per item',
            'Tambah Harga',
            'addSupPrice'
          )
        : '<h1>Supplier Price</h1>';

    var stats =
      typeof window.statRow === 'function'
        ? window.statRow([
            { label: 'Total Harga', value: String(prices.length), sub: 'Daftar harga tercatat' },
            {
              label: 'Supplier',
              value: String(
                new Set(
                  prices.map(function (p) {
                    return p.supplierName;
                  })
                ).size
              ),
              sub: 'Supplier unik',
            },
          ])
        : '';

    var html =
      header +
      stats +
      '<div class="card"><div class="table-wrap"><table style="width:100%">' +
      '<thead><tr><th>Supplier</th><th>Item</th><th>Kode</th><th style="text-align:right">Harga</th><th>Satuan</th><th>Berlaku</th><th>Aksi</th></tr></thead>' +
      '<tbody>' +
      (rows || '<tr><td colspan="7" class="td-empty">Belum ada daftar harga supplier.</td></tr>') +
      '</tbody>' +
      '</table></div></div>';

    injectView('purchase', html);
  }

  function addSupPriceModal(existing) {
    var p = existing || {};
    var suppliers = db().suppliers || [];
    var items = db().inventoryItems || [];

    var supOpts = suppliers
      .map(function (s) {
        return (
          '<option value="' +
          esc(s.id) +
          '" data-name="' +
          esc(s.name) +
          '"' +
          (p.supplierId === s.id ? ' selected' : '') +
          '>' +
          esc(s.name) +
          '</option>'
        );
      })
      .join('');

    var itemOpts = items
      .map(function (i) {
        return (
          '<option value="' +
          esc(i.id) +
          '" data-name="' +
          esc(i.name) +
          '" data-code="' +
          esc(i.sku || '') +
          '" data-unit="' +
          esc(i.unit || '') +
          '"' +
          (p.itemId === i.id ? ' selected' : '') +
          '>' +
          esc(i.name) +
          ' (' +
          esc(i.sku || i.id) +
          ')</option>'
        );
      })
      .join('');

    var body =
      '<div style="display:flex;flex-direction:column;gap:12px">' +
      '<label style="font-size:12px;font-weight:700">Supplier<select id="sp-sup" class="form-select" style="width:100%;margin-top:4px">' +
      supOpts +
      '</select></label>' +
      '<label style="font-size:12px;font-weight:700">Item<select id="sp-item" class="form-select" style="width:100%;margin-top:4px">' +
      itemOpts +
      '</select></label>' +
      '<label style="font-size:12px;font-weight:700">Harga<input id="sp-price" class="form-input" type="number" min="0" value="' +
      (p.price || 0) +
      '" style="width:100%;margin-top:4px"></label>' +
      '<label style="font-size:12px;font-weight:700">Berlaku Sejak<input id="sp-date" class="form-input" type="date" value="' +
      esc(p.effectiveDate || today()) +
      '" style="width:100%;margin-top:4px"></label>' +
      '</div>';

    modal(
      existing ? 'Edit Harga Supplier' : 'Tambah Harga Supplier',
      body,
      '<button class="btn-ghost" data-action="closeModal">Batal</button>' +
        '<button class="btn" id="sp-save">Simpan</button>',
      false
    );

    setTimeout(function () {
      document.getElementById('sp-save').addEventListener('click', function () {
        var supSel = document.getElementById('sp-sup');
        var supplierId = supSel.value;
        var supplierName = supSel.options[supSel.selectedIndex]
          ? supSel.options[supSel.selectedIndex].dataset.name
          : '';
        var itemSel = document.getElementById('sp-item');
        var itemId = itemSel.value;
        var itemOpt = itemSel.options[itemSel.selectedIndex];
        var itemName = itemOpt ? itemOpt.dataset.name : '';
        var itemCode = itemOpt ? itemOpt.dataset.code : '';
        var unit = itemOpt ? itemOpt.dataset.unit : '';
        var price = parseFloat(document.getElementById('sp-price').value) || 0;
        var effectiveDate = document.getElementById('sp-date').value;

        if (!supplierId || !itemId || price <= 0) {
          toast('Supplier, item, dan harga wajib diisi', 'warning');
          return;
        }

        var arr = ensureArr('supplierPrices');
        if (existing) {
          var idx = arr.findIndex(function (x) {
            return x.id === existing.id;
          });
          if (idx >= 0)
            Object.assign(arr[idx], {
              supplierId: supplierId,
              supplierName: supplierName,
              itemId: itemId,
              itemName: itemName,
              itemCode: itemCode,
              unit: unit,
              price: price,
              effectiveDate: effectiveDate,
            });
        } else {
          arr.push({
            id: uid('SPR'),
            supplierId: supplierId,
            supplierName: supplierName,
            itemId: itemId,
            itemName: itemName,
            itemCode: itemCode,
            unit: unit,
            price: price,
            effectiveDate: effectiveDate,
            createdAt: today(),
          });
        }
        save();
        closeM();
        toast(existing ? 'Harga diperbarui' : 'Harga ditambahkan', 'success');
        openSupplierPrice();
      });
    }, 60);
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // EVENT DELEGATION
  // ══════════════════════════════════════════════════════════════════════════════
  document.addEventListener('click', function (e) {
    var btn = e.target.closest('[data-action]');
    if (!btn) return;
    var action = btn.dataset.action;
    var id = btn.dataset.id;

    switch (action) {
      // Sales DP
      case 'addSalesDP':
        addSalesDPModal();
        break;
      case 'applySalesDP': {
        var dp = ensureArr('salesDownPayments').find(function (x) {
          return x.id === id;
        });
        if (dp && dp.status !== 'Applied') {
          if (!window.DB.paymentLogs) window.DB.paymentLogs = [];
          var maxPL = window.DB.paymentLogs.reduce(function (m, p) {
            return Math.max(m, Number(p.id) || 0);
          }, 0);
          window.DB.paymentLogs.push({
            id: maxPL + 1,
            type: 'SO',
            orderId: dp.orderId,
            date: dp.date,
            amount: dp.amount,
            method: 'Down Payment',
            note: 'DP: ' + dp.id,
          });
          var dpSO = (window.DB.salesOrders || []).find(function (o) {
            return o.id === dp.orderId;
          });
          if (dpSO && dpSO.status !== 'Paid') {
            var paidSO = window.DB.paymentLogs
              .filter(function (p) {
                return p.type === 'SO' && p.orderId === dp.orderId;
              })
              .reduce(function (s, p) {
                return s + (p.amount || 0);
              }, 0);
            if (paidSO >= (dpSO.amount || 0) && (dpSO.amount || 0) > 0) dpSO.status = 'Paid';
          }
          dp.status = 'Applied';
          save();
          toast('DP diterapkan ke SO', 'success');
          openSalesDP();
        }
        break;
      }
      case 'delSalesDP': {
        if (!confirm('Hapus DP ini?')) return;
        var arr = ensureArr('salesDownPayments');
        var idx = arr.findIndex(function (x) {
          return x.id === id;
        });
        if (idx >= 0) arr.splice(idx, 1);
        save();
        toast('DP dihapus', 'success');
        openSalesDP();
        break;
      }
      // Purchase DP
      case 'addPurchaseDP':
        addPurchaseDPModal();
        break;
      case 'applyPurchaseDP': {
        var dp2 = ensureArr('purchaseDownPayments').find(function (x) {
          return x.id === id;
        });
        if (dp2 && dp2.status !== 'Applied') {
          if (!window.DB.paymentLogs) window.DB.paymentLogs = [];
          var maxPL2 = window.DB.paymentLogs.reduce(function (m, p) {
            return Math.max(m, Number(p.id) || 0);
          }, 0);
          window.DB.paymentLogs.push({
            id: maxPL2 + 1,
            type: 'PO',
            orderId: dp2.orderId,
            date: dp2.date,
            amount: dp2.amount,
            method: 'Down Payment',
            note: 'DP: ' + dp2.id,
          });
          var dpPO = (window.DB.purchaseOrders || []).find(function (o) {
            return o.id === dp2.orderId;
          });
          if (dpPO && dpPO.status !== 'Paid') {
            var paidPO = window.DB.paymentLogs
              .filter(function (p) {
                return p.type === 'PO' && p.orderId === dp2.orderId;
              })
              .reduce(function (s, p) {
                return s + (p.amount || 0);
              }, 0);
            if (paidPO >= (dpPO.amount || 0) && (dpPO.amount || 0) > 0) dpPO.status = 'Paid';
          }
          dp2.status = 'Applied';
          save();
          toast('DP diterapkan ke PO', 'success');
          openPurchaseDP();
        }
        break;
      }
      case 'delPurchaseDP': {
        if (!confirm('Hapus DP ini?')) return;
        var arr2 = ensureArr('purchaseDownPayments');
        var idx2 = arr2.findIndex(function (x) {
          return x.id === id;
        });
        if (idx2 >= 0) arr2.splice(idx2, 1);
        save();
        toast('DP dihapus', 'success');
        openPurchaseDP();
        break;
      }
      // Sales Target
      case 'addTarget':
        addTargetModal();
        break;
      case 'editTarget': {
        var t = ensureArr('salesTargets').find(function (x) {
          return x.id === id;
        });
        if (t) addTargetModal(t);
        break;
      }
      case 'delTarget': {
        if (!confirm('Hapus target ini?')) return;
        var arr3 = ensureArr('salesTargets');
        var idx3 = arr3.findIndex(function (x) {
          return x.id === id;
        });
        if (idx3 >= 0) arr3.splice(idx3, 1);
        save();
        toast('Target dihapus', 'success');
        openSalesTarget();
        break;
      }
      // Receive Item
      case 'addReceipt':
        addReceiptModal();
        break;
      case 'postReceipt':
        postReceipt(id);
        break;
      case 'viewReceipt': {
        var r = ensureArr('goodsReceipts').find(function (x) {
          return x.id === id;
        });
        if (r) {
          var itemList = (r.items || [])
            .map(function (i) {
              return (
                '<div style="padding:4px 0;border-bottom:1px solid var(--border);font-size:12px">' +
                esc(i.itemName) +
                ' — Qty: <strong>' +
                i.qty +
                '</strong></div>'
              );
            })
            .join('');
          modal(
            'Detail Penerimaan ' + r.id,
            '<div style="display:flex;flex-direction:column;gap:8px">' +
              '<div>PO: <strong>' +
              esc(r.poId) +
              '</strong></div>' +
              '<div>Supplier: <strong>' +
              esc(r.supplierName) +
              '</strong></div>' +
              '<div>Tanggal: <strong>' +
              esc(r.date) +
              '</strong></div>' +
              '<div style="margin-top:8px;font-weight:700">Item Diterima:</div>' +
              itemList +
              '</div>',
            '<button class="btn-ghost" data-action="closeModal">Tutup</button>',
            false
          );
        }
        break;
      }
      case 'delReceipt': {
        if (!confirm('Hapus penerimaan barang ini?')) return;
        var arr4 = ensureArr('goodsReceipts');
        var idx4 = arr4.findIndex(function (x) {
          return x.id === id;
        });
        if (idx4 >= 0) arr4.splice(idx4, 1);
        save();
        toast('Penerimaan dihapus', 'success');
        openReceiveItem();
        break;
      }
      // Supplier Price
      case 'addSupPrice':
        addSupPriceModal();
        break;
      case 'editSupPrice': {
        var sp = ensureArr('supplierPrices').find(function (x) {
          return x.id === id;
        });
        if (sp) addSupPriceModal(sp);
        break;
      }
      case 'delSupPrice': {
        if (!confirm('Hapus harga supplier ini?')) return;
        var arr5 = ensureArr('supplierPrices');
        var idx5 = arr5.findIndex(function (x) {
          return x.id === id;
        });
        if (idx5 >= 0) arr5.splice(idx5, 1);
        save();
        toast('Harga dihapus', 'success');
        openSupplierPrice();
        break;
      }
    }
  });

  // ══════════════════════════════════════════════════════════════════════════════
  // EXPOSE TO MENU-COVERAGE
  // ══════════════════════════════════════════════════════════════════════════════
  window._salesPurchaseExtras = {
    openSalesDP: openSalesDP,
    openPurchaseDP: openPurchaseDP,
    openSalesTarget: openSalesTarget,
    openReceiveItem: openReceiveItem,
    openSupplierPrice: openSupplierPrice,
  };

  console.log('[SalesPurchaseExtras] Sales & Purchase extras ready');
})();
