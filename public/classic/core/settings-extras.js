// ══════════════════════════════════════════════════════════════════════════════
//  SETTINGS EXTRAS  — Currency, Payment Term, Shipment, Calendar, Activity Log,
//                     Favorite Transaction
//  Pattern: NSAMenu routes these labels here via window._settingsExtras.
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
  function uid(p) {
    return (p || 'X') + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
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
  // § 1  CURRENCY
  // ══════════════════════════════════════════════════════════════════════════
  function openCurrency() {
    var arr = ensureSettings('currencies', [
      { code: 'IDR', name: 'Rupiah Indonesia', symbol: 'Rp', rate: 1 },
      { code: 'USD', name: 'US Dollar', symbol: '$', rate: 16500 },
    ]);

    var rows = arr
      .map(function (c) {
        var isBase = c.code === 'IDR';
        return (
          '<tr>' +
          '<td class="td-p" style="font-weight:800">' +
          esc(c.code) +
          '</td>' +
          '<td class="td-p">' +
          esc(c.name) +
          '</td>' +
          '<td class="td-p" style="text-align:center">' +
          esc(c.symbol) +
          '</td>' +
          '<td class="td-p" style="text-align:right;font-weight:700">' +
          Number(c.rate || 1).toLocaleString('id-ID') +
          '</td>' +
          '<td class="td-p" style="text-align:center">' +
          (isBase
            ? '<span style="font-size:10px;color:var(--muted)">Base</span>'
            : '<button class="btn-ghost" style="font-size:11px;padding:3px 8px" data-action="editCurrency" data-id="' +
              esc(c.code) +
              '">Edit</button> ' +
              '<button class="btn-ghost" style="font-size:11px;padding:3px 8px;color:var(--danger)" data-action="delCurrency" data-id="' +
              esc(c.code) +
              '">Hapus</button>') +
          '</td></tr>'
        );
      })
      .join('');

    injectView(
      'settings',
      '<div class="sec-hdr"><div><h1>Currency</h1><p>Mata uang dan kurs terhadap IDR</p></div>' +
        '<button class="btn" data-action="addCurrency">+ Tambah</button></div>' +
        '<div class="card" style="overflow-x:auto">' +
        '<table style="width:100%;border-collapse:collapse">' +
        '<thead><tr><th style="' +
        TH +
        '">Kode</th><th style="' +
        TH +
        '">Nama</th>' +
        '<th style="' +
        TH +
        'text-align:center">Simbol</th>' +
        '<th style="' +
        TH +
        'text-align:right">Kurs (vs IDR)</th>' +
        '<th style="' +
        TH +
        '"></th></tr></thead>' +
        '<tbody>' +
        rows +
        '</tbody></table></div>'
    );
  }

  function addCurrencyModal(existing) {
    existing = existing || {};
    modal(
      'Currency',
      '<div class="form-group"><label class="form-label">Kode (ISO, maks 5 karakter)</label>' +
        '<input class="form-input" id="cur-code" value="' +
        esc(existing.code || '') +
        '" placeholder="USD / EUR / SGD" maxlength="5"' +
        (existing.code ? ' readonly' : '') +
        '></div>' +
        '<div class="form-group"><label class="form-label">Nama</label>' +
        '<input class="form-input" id="cur-name" value="' +
        esc(existing.name || '') +
        '" placeholder="US Dollar"></div>' +
        '<div class="form-group"><label class="form-label">Simbol</label>' +
        '<input class="form-input" id="cur-symbol" value="' +
        esc(existing.symbol || '') +
        '" placeholder="$" maxlength="5"></div>' +
        '<div class="form-group"><label class="form-label">Kurs terhadap IDR</label>' +
        '<input class="form-input" id="cur-rate" type="number" min="0" step="0.01" value="' +
        (existing.rate || '') +
        '"></div>',
      '<button class="btn" id="saveCurrency">Simpan</button><button class="btn-ghost" data-action="closeModal">Batal</button>'
    );
    setTimeout(function () {
      var btn = document.getElementById('saveCurrency');
      if (!btn) return;
      btn.addEventListener('click', function () {
        var code = (document.getElementById('cur-code').value || '').toUpperCase().trim();
        var name = (document.getElementById('cur-name').value || '').trim();
        var symbol = (document.getElementById('cur-symbol').value || '').trim();
        var rate = parseFloat(document.getElementById('cur-rate').value) || 0;
        if (!code || !name) {
          toast('Kode dan nama wajib diisi', 'warning');
          return;
        }
        var arr = ensureSettings('currencies', []);
        var idx = arr.findIndex(function (c) {
          return c.code === code;
        });
        if (idx >= 0) arr[idx] = { code: code, name: name, symbol: symbol, rate: rate };
        else arr.push({ code: code, name: name, symbol: symbol, rate: rate });
        save();
        closeM();
        toast(existing.code ? 'Kurs diperbarui' : 'Currency ditambahkan', 'success');
        openCurrency();
      });
    }, 60);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // § 2  PAYMENT TERM
  // ══════════════════════════════════════════════════════════════════════════
  function openPaymentTerm() {
    var arr = ensureSettings('paymentTerms', [
      { id: 'PT001', name: 'Cash on Delivery', days: 0 },
      { id: 'PT002', name: 'Net 14', days: 14 },
      { id: 'PT003', name: 'Net 30', days: 30 },
      { id: 'PT004', name: 'Net 60', days: 60 },
    ]);

    var rows = arr
      .map(function (t) {
        return (
          '<tr>' +
          '<td class="td-p" style="font-weight:700">' +
          esc(t.name) +
          '</td>' +
          '<td class="td-p" style="text-align:center">' +
          t.days +
          ' hari</td>' +
          '<td class="td-p" style="text-align:center">' +
          '<button class="btn-ghost" style="font-size:11px;padding:3px 8px" data-action="editPT" data-id="' +
          esc(t.id) +
          '">Edit</button> ' +
          '<button class="btn-ghost" style="font-size:11px;padding:3px 8px;color:var(--danger)" data-action="delPT" data-id="' +
          esc(t.id) +
          '">Hapus</button>' +
          '</td></tr>'
        );
      })
      .join('');

    injectView(
      'settings',
      '<div class="sec-hdr"><div><h1>Payment Term</h1><p>Syarat pembayaran standar</p></div>' +
        '<button class="btn" data-action="addPT">+ Tambah</button></div>' +
        '<div class="card" style="overflow-x:auto">' +
        '<table style="width:100%;border-collapse:collapse">' +
        '<thead><tr><th style="' +
        TH +
        '">Nama Term</th><th style="' +
        TH +
        'text-align:center">Jatuh Tempo</th><th style="' +
        TH +
        '"></th></tr></thead>' +
        '<tbody>' +
        rows +
        '</tbody></table></div>'
    );
  }

  function addPTModal(existing) {
    existing = existing || {};
    modal(
      'Payment Term',
      '<div class="form-group"><label class="form-label">Nama</label>' +
        '<input class="form-input" id="pt-name" value="' +
        esc(existing.name || '') +
        '" placeholder="Net 30, COD, Tempo 45 hari..."></div>' +
        '<div class="form-group"><label class="form-label">Jatuh Tempo (hari setelah tanggal faktur)</label>' +
        '<input class="form-input" id="pt-days" type="number" min="0" value="' +
        (existing.days != null ? existing.days : '') +
        '"></div>',
      '<button class="btn" id="savePT">Simpan</button><button class="btn-ghost" data-action="closeModal">Batal</button>'
    );
    setTimeout(function () {
      var btn = document.getElementById('savePT');
      if (!btn) return;
      btn.addEventListener('click', function () {
        var name = (document.getElementById('pt-name').value || '').trim();
        var days = parseInt(document.getElementById('pt-days').value) || 0;
        if (!name) {
          toast('Nama wajib diisi', 'warning');
          return;
        }
        var arr = ensureSettings('paymentTerms', []);
        if (existing.id) {
          var idx = arr.findIndex(function (t) {
            return t.id === existing.id;
          });
          if (idx >= 0) arr[idx] = { id: existing.id, name: name, days: days };
        } else {
          arr.push({ id: uid('PT'), name: name, days: days });
        }
        save();
        closeM();
        toast('Payment term disimpan', 'success');
        openPaymentTerm();
      });
    }, 60);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // § 3  SHIPMENT
  // ══════════════════════════════════════════════════════════════════════════
  function openShipment() {
    var arr = ensureSettings('shipmentMethods', [
      { id: 'SH001', name: 'Pengiriman Sendiri', carrier: 'Armada Internal', notes: '' },
      { id: 'SH002', name: 'Ekspedisi', carrier: 'JNE / TIKI / Sicepat', notes: '' },
      { id: 'SH003', name: 'Ambil Sendiri', carrier: 'Customer', notes: 'FOB Origin' },
    ]);

    var rows = arr
      .map(function (m) {
        return (
          '<tr>' +
          '<td class="td-p" style="font-weight:700">' +
          esc(m.name) +
          '</td>' +
          '<td class="td-p">' +
          esc(m.carrier) +
          '</td>' +
          '<td class="td-p" style="font-size:11px;color:var(--muted)">' +
          esc(m.notes || '—') +
          '</td>' +
          '<td class="td-p" style="text-align:center">' +
          '<button class="btn-ghost" style="font-size:11px;padding:3px 8px" data-action="editShip" data-id="' +
          esc(m.id) +
          '">Edit</button> ' +
          '<button class="btn-ghost" style="font-size:11px;padding:3px 8px;color:var(--danger)" data-action="delShip" data-id="' +
          esc(m.id) +
          '">Hapus</button>' +
          '</td></tr>'
        );
      })
      .join('');

    injectView(
      'settings',
      '<div class="sec-hdr"><div><h1>Shipment</h1><p>Metode pengiriman barang</p></div>' +
        '<button class="btn" data-action="addShip">+ Tambah</button></div>' +
        '<div class="card" style="overflow-x:auto">' +
        '<table style="width:100%;border-collapse:collapse">' +
        '<thead><tr><th style="' +
        TH +
        '">Nama Metode</th><th style="' +
        TH +
        '">Kurir / Armada</th><th style="' +
        TH +
        '">Keterangan</th><th style="' +
        TH +
        '"></th></tr></thead>' +
        '<tbody>' +
        rows +
        '</tbody></table></div>'
    );
  }

  function addShipModal(existing) {
    existing = existing || {};
    modal(
      'Metode Pengiriman',
      '<div class="form-group"><label class="form-label">Nama Metode</label>' +
        '<input class="form-input" id="sh-name" value="' +
        esc(existing.name || '') +
        '" placeholder="Pengiriman Sendiri"></div>' +
        '<div class="form-group"><label class="form-label">Kurir / Armada</label>' +
        '<input class="form-input" id="sh-carrier" value="' +
        esc(existing.carrier || '') +
        '" placeholder="Internal / JNE / TIKI"></div>' +
        '<div class="form-group"><label class="form-label">Keterangan (opsional)</label>' +
        '<input class="form-input" id="sh-notes" value="' +
        esc(existing.notes || '') +
        '" placeholder="FOB, DDP, dll."></div>',
      '<button class="btn" id="saveShip">Simpan</button><button class="btn-ghost" data-action="closeModal">Batal</button>'
    );
    setTimeout(function () {
      var btn = document.getElementById('saveShip');
      if (!btn) return;
      btn.addEventListener('click', function () {
        var name = (document.getElementById('sh-name').value || '').trim();
        var carrier = (document.getElementById('sh-carrier').value || '').trim();
        var notes = (document.getElementById('sh-notes').value || '').trim();
        if (!name) {
          toast('Nama wajib diisi', 'warning');
          return;
        }
        var arr = ensureSettings('shipmentMethods', []);
        if (existing.id) {
          var idx = arr.findIndex(function (m) {
            return m.id === existing.id;
          });
          if (idx >= 0) arr[idx] = { id: existing.id, name: name, carrier: carrier, notes: notes };
        } else {
          arr.push({ id: uid('SH'), name: name, carrier: carrier, notes: notes });
        }
        save();
        closeM();
        toast('Metode pengiriman disimpan', 'success');
        openShipment();
      });
    }, 60);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // § 4  CALENDAR
  // ══════════════════════════════════════════════════════════════════════════
  var MONTH_NAMES = [
    'Januari',
    'Februari',
    'Maret',
    'April',
    'Mei',
    'Juni',
    'Juli',
    'Agustus',
    'September',
    'Oktober',
    'November',
    'Desember',
  ];

  function openCalendar() {
    var cal = ensureSettings('calendar', { fiscalStart: '01', holidays: [] });
    var holidays = cal.holidays || [];

    var hRows = holidays.length
      ? holidays
          .map(function (h, i) {
            return (
              '<tr><td class="td-p" style="white-space:nowrap">' +
              esc(h.date) +
              '</td>' +
              '<td class="td-p">' +
              esc(h.name) +
              '</td>' +
              '<td class="td-p" style="text-align:center">' +
              '<button class="btn-ghost" style="font-size:11px;padding:3px 8px;color:var(--danger)" data-action="delHoliday" data-idx="' +
              i +
              '">Hapus</button>' +
              '</td></tr>'
            );
          })
          .join('')
      : '<tr><td colspan="3" style="text-align:center;padding:20px;color:var(--muted);font-size:12px">Belum ada hari libur ditambahkan.</td></tr>';

    var fsOpts = MONTH_NAMES.map(function (name, i) {
      var v = String(i + 1).padStart(2, '0');
      return (
        '<option value="' +
        v +
        '"' +
        (cal.fiscalStart === v ? ' selected' : '') +
        '>' +
        name +
        '</option>'
      );
    }).join('');

    injectView(
      'settings',
      '<div class="sec-hdr"><div><h1>Calendar</h1><p>Periode fiskal dan hari libur nasional</p></div></div>' +
        '<div class="card" style="margin-bottom:16px">' +
        '<div style="font-size:12px;font-weight:700;margin-bottom:12px;color:var(--muted);text-transform:uppercase;letter-spacing:.5px">Tahun Fiskal</div>' +
        '<div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">' +
        '<span style="font-size:13px">Bulan awal tahun fiskal:</span>' +
        '<select class="form-select" id="cal-fiscal-start" style="width:160px">' +
        fsOpts +
        '</select>' +
        '<button class="btn" id="saveFiscal">Simpan</button></div></div>' +
        '<div class="card"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">' +
        '<div style="font-size:12px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.5px">Hari Libur Nasional (' +
        holidays.length +
        ')</div>' +
        '<button class="btn" data-action="addHoliday">+ Tambah</button></div>' +
        '<table style="width:100%;border-collapse:collapse">' +
        '<thead><tr><th style="' +
        TH +
        '">Tanggal</th><th style="' +
        TH +
        '">Nama</th><th style="' +
        TH +
        '"></th></tr></thead>' +
        '<tbody>' +
        hRows +
        '</tbody></table></div>'
    );

    setTimeout(function () {
      var btn = document.getElementById('saveFiscal');
      if (btn)
        btn.addEventListener('click', function () {
          ensureSettings('calendar', {}).fiscalStart =
            document.getElementById('cal-fiscal-start').value;
          save();
          toast('Periode fiskal disimpan', 'success');
        });
    }, 60);
  }

  function addHolidayModal() {
    modal(
      'Tambah Hari Libur',
      '<div class="form-group"><label class="form-label">Tanggal</label>' +
        '<input class="form-input" id="hol-date" type="date"></div>' +
        '<div class="form-group"><label class="form-label">Nama Hari Libur</label>' +
        '<input class="form-input" id="hol-name" placeholder="Idul Fitri, Natal, Hari Kemerdekaan..."></div>',
      '<button class="btn" id="saveHoliday">Tambah</button><button class="btn-ghost" data-action="closeModal">Batal</button>'
    );
    setTimeout(function () {
      var btn = document.getElementById('saveHoliday');
      if (!btn) return;
      btn.addEventListener('click', function () {
        var date = document.getElementById('hol-date').value;
        var name = (document.getElementById('hol-name').value || '').trim();
        if (!date || !name) {
          toast('Tanggal dan nama wajib diisi', 'warning');
          return;
        }
        var cal = ensureSettings('calendar', { fiscalStart: '01', holidays: [] });
        if (!cal.holidays) cal.holidays = [];
        cal.holidays.push({ date: date, name: name });
        cal.holidays.sort(function (a, b) {
          return a.date < b.date ? -1 : 1;
        });
        save();
        closeM();
        toast('Hari libur ditambahkan', 'success');
        openCalendar();
      });
    }, 60);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // § 5  ACTIVITY LOG
  // ══════════════════════════════════════════════════════════════════════════
  function openActivityLog() {
    var entries = [];

    (window.DB.auditLog || []).forEach(function (e) {
      entries.push({
        ts: e.ts || e.date || '',
        type: 'Audit',
        action: e.action || e.type || '',
        detail: e.detail || e.note || '',
        user: e.user || '—',
      });
    });

    (window.DB.paymentLogs || []).slice(-80).forEach(function (p) {
      var amt = p.amount ? ' — Rp ' + Number(p.amount).toLocaleString('id-ID') : '';
      entries.push({
        ts: p.date || '',
        type: 'Bayar',
        action: 'Pembayaran ' + (p.type || ''),
        detail: (p.orderId || '') + (p.method ? ' via ' + p.method : '') + amt,
        user: '—',
      });
    });

    entries.sort(function (a, b) {
      return a.ts > b.ts ? -1 : a.ts < b.ts ? 1 : 0;
    });
    entries = entries.slice(0, 150);

    var rows = entries.length
      ? entries
          .map(function (e) {
            return (
              '<tr>' +
              '<td class="td-p" style="font-size:11px;color:var(--muted);white-space:nowrap">' +
              esc(e.ts) +
              '</td>' +
              '<td class="td-p"><span style="font-size:10px;font-weight:700;text-transform:uppercase;padding:2px 7px;background:var(--bg);border-radius:4px;white-space:nowrap">' +
              esc(e.type) +
              '</span></td>' +
              '<td class="td-p" style="font-weight:600;font-size:12px">' +
              esc(e.action) +
              '</td>' +
              '<td class="td-p" style="font-size:11px;color:var(--muted)">' +
              esc(e.detail) +
              '</td>' +
              '<td class="td-p" style="font-size:11px">' +
              esc(e.user) +
              '</td>' +
              '</tr>'
            );
          })
          .join('')
      : '<tr><td colspan="5" style="text-align:center;padding:24px;color:var(--muted)">Belum ada log aktivitas.</td></tr>';

    injectView(
      'settings',
      '<div class="sec-hdr"><div><h1>Activity Log</h1><p>Riwayat aktivitas dan transaksi keuangan (150 entri terbaru)</p></div></div>' +
        '<div class="card" style="overflow-x:auto">' +
        '<table style="width:100%;border-collapse:collapse">' +
        '<thead><tr>' +
        '<th style="' +
        TH +
        '">Waktu</th><th style="' +
        TH +
        '">Tipe</th>' +
        '<th style="' +
        TH +
        '">Aksi</th><th style="' +
        TH +
        '">Detail</th><th style="' +
        TH +
        '">User</th>' +
        '</tr></thead><tbody>' +
        rows +
        '</tbody></table></div>'
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // § 6  SALES CATEGORY
  // ══════════════════════════════════════════════════════════════════════════
  function openSalesCategory() {
    var arr = ensureSettings('salesCategories', [
      'Retail',
      'Wholesale',
      'Export',
      'E-Commerce',
      'Project',
      'Others',
    ]);

    var items =
      arr
        .map(function (cat, i) {
          return (
            '<div style="display:flex;align-items:center;gap:10px;padding:10px 14px;border-bottom:1px solid var(--border)">' +
            '<span style="flex:1;font-size:13px">' +
            esc(cat) +
            '</span>' +
            '<button class="btn-ghost" style="font-size:11px;padding:3px 8px;color:var(--danger)" data-action="delSaleCat" data-idx="' +
            i +
            '">Hapus</button>' +
            '</div>'
          );
        })
        .join('') ||
      '<div style="padding:20px;text-align:center;color:var(--muted)">Belum ada kategori.</div>';

    injectView(
      'settings',
      '<div class="sec-hdr"><div><h1>Sales Category</h1><p>Kategori untuk pengelompokan penjualan</p></div>' +
        '<button class="btn" data-action="addSaleCat">+ Tambah</button></div>' +
        '<div class="card">' +
        items +
        '</div>'
    );
  }

  function addSaleCatModal() {
    modal(
      'Tambah Sales Category',
      '<div class="form-group"><label class="form-label">Nama Kategori</label>' +
        '<input class="form-input" id="sc-name" placeholder="Retail, Proyek, Export..."></div>',
      '<button class="btn" id="saveSaleCat">Simpan</button><button class="btn-ghost" data-action="closeModal">Batal</button>'
    );
    setTimeout(function () {
      var btn = document.getElementById('saveSaleCat');
      if (!btn) return;
      btn.addEventListener('click', function () {
        var name = (document.getElementById('sc-name').value || '').trim();
        if (!name) {
          toast('Nama kategori wajib diisi', 'warning');
          return;
        }
        var arr = ensureSettings('salesCategories', []);
        if (arr.includes(name)) {
          toast('Kategori sudah ada', 'warning');
          return;
        }
        arr.push(name);
        save();
        closeM();
        toast('Kategori ditambahkan', 'success');
        openSalesCategory();
      });
    }, 60);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // § 7  FAVORITE TRANSACTION
  // ══════════════════════════════════════════════════════════════════════════
  function openFavTransaction() {
    if (!window.DB.favoriteTransactions) window.DB.favoriteTransactions = [];
    var favs = window.DB.favoriteTransactions;

    var rows = favs.length
      ? favs
          .map(function (f) {
            return (
              '<tr>' +
              '<td class="td-p" style="font-weight:700">' +
              esc(f.name) +
              '</td>' +
              '<td class="td-p"><span style="font-size:10px;font-weight:700;padding:2px 7px;background:var(--bg);border-radius:4px">' +
              esc(f.type || '—') +
              '</span></td>' +
              '<td class="td-p" style="font-size:11px;color:var(--muted)">' +
              esc(f.description || '—') +
              '</td>' +
              '<td class="td-p" style="text-align:center">' +
              '<button class="btn-ghost" style="font-size:11px;padding:3px 8px;color:var(--danger)" data-action="delFav" data-id="' +
              esc(f.id) +
              '">Hapus</button>' +
              '</td></tr>'
            );
          })
          .join('')
      : '<tr><td colspan="4" style="text-align:center;padding:24px;color:var(--muted);font-size:12px">' +
        'Belum ada transaksi favorit.<br>Simpan SO atau PO sebagai template dari halaman detail dokumen.</td></tr>';

    injectView(
      'settings',
      '<div class="sec-hdr"><div><h1>Favorite Transaction</h1><p>Template transaksi yang sering digunakan</p></div></div>' +
        '<div class="card" style="overflow-x:auto">' +
        '<table style="width:100%;border-collapse:collapse">' +
        '<thead><tr><th style="' +
        TH +
        '">Nama Favorit</th><th style="' +
        TH +
        '">Tipe</th><th style="' +
        TH +
        '">Deskripsi</th><th style="' +
        TH +
        '"></th></tr></thead>' +
        '<tbody>' +
        rows +
        '</tbody></table></div>'
    );
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
      // Currency
      case 'addCurrency':
        addCurrencyModal();
        break;
      case 'editCurrency': {
        var cur = ensureSettings('currencies', []).find(function (x) {
          return x.code === id;
        });
        if (cur) addCurrencyModal(cur);
        break;
      }
      case 'delCurrency': {
        if (!confirm('Hapus currency ' + id + '?')) return;
        var ca = ensureSettings('currencies', []);
        var ci = ca.findIndex(function (x) {
          return x.code === id;
        });
        if (ci >= 0) ca.splice(ci, 1);
        save();
        toast('Currency dihapus', 'success');
        openCurrency();
        break;
      }
      // Payment Term
      case 'addPT':
        addPTModal();
        break;
      case 'editPT': {
        var pt = ensureSettings('paymentTerms', []).find(function (x) {
          return x.id === id;
        });
        if (pt) addPTModal(pt);
        break;
      }
      case 'delPT': {
        if (!confirm('Hapus payment term ini?')) return;
        var pa = ensureSettings('paymentTerms', []);
        var pi = pa.findIndex(function (x) {
          return x.id === id;
        });
        if (pi >= 0) pa.splice(pi, 1);
        save();
        toast('Payment term dihapus', 'success');
        openPaymentTerm();
        break;
      }
      // Shipment
      case 'addShip':
        addShipModal();
        break;
      case 'editShip': {
        var sh = ensureSettings('shipmentMethods', []).find(function (x) {
          return x.id === id;
        });
        if (sh) addShipModal(sh);
        break;
      }
      case 'delShip': {
        if (!confirm('Hapus metode pengiriman ini?')) return;
        var sa = ensureSettings('shipmentMethods', []);
        var si = sa.findIndex(function (x) {
          return x.id === id;
        });
        if (si >= 0) sa.splice(si, 1);
        save();
        toast('Metode pengiriman dihapus', 'success');
        openShipment();
        break;
      }
      // Calendar
      case 'addHoliday':
        addHolidayModal();
        break;
      case 'delHoliday': {
        var hidx = parseInt(btn.dataset.idx);
        var hcal = ensureSettings('calendar', { fiscalStart: '01', holidays: [] });
        if (!isNaN(hidx) && hcal.holidays) {
          hcal.holidays.splice(hidx, 1);
          save();
          toast('Hari libur dihapus', 'success');
          openCalendar();
        }
        break;
      }
      // Sales Category
      case 'addSaleCat':
        addSaleCatModal();
        break;
      case 'delSaleCat': {
        var sidx = parseInt(btn.dataset.idx);
        var sarr = ensureSettings('salesCategories', []);
        if (!isNaN(sidx)) {
          sarr.splice(sidx, 1);
          save();
          toast('Kategori dihapus', 'success');
          openSalesCategory();
        }
        break;
      }
      // Favorite Transaction
      case 'delFav': {
        if (!confirm('Hapus favorit ini?')) return;
        if (!window.DB.favoriteTransactions) return;
        var fi = window.DB.favoriteTransactions.findIndex(function (f) {
          return f.id === id;
        });
        if (fi >= 0) window.DB.favoriteTransactions.splice(fi, 1);
        save();
        toast('Favorit dihapus', 'success');
        openFavTransaction();
        break;
      }
    }
  });

  window._settingsExtras = {
    openCurrency: openCurrency,
    openPaymentTerm: openPaymentTerm,
    openShipment: openShipment,
    openCalendar: openCalendar,
    openActivityLog: openActivityLog,
    openFavTransaction: openFavTransaction,
    openSalesCategory: openSalesCategory,
  };
  console.log('[SettingsExtras] Settings extras ready');
})();
