// ══════════════════════════════════════════════════════════════════════════════
//  BANK EXTRAS  — Other Payment, Other Deposit, Bank Transfer, SmartLink,
//                 Bank Statement, Bank History, Bank Reconcile
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
  function modal(t, b, f, w) {
    window.openModal && window.openModal(t, b, f || '', w);
  }
  function closeM() {
    window.closeModal && window.closeModal();
  }
  function ensureArr(key) {
    if (!window.DB[key]) window.DB[key] = [];
    return window.DB[key];
  }
  function ensureSettings(key, def) {
    if (!db().settings) window.DB.settings = {};
    if (db().settings[key] == null) db().settings[key] = def;
    return db().settings[key];
  }
  function injectView(html) {
    window.invalidateView && window.invalidateView('finance');
    window.navigate && window.navigate('finance');
    setTimeout(function () {
      var el = document.getElementById('view-finance');
      if (el) el.innerHTML = html;
    }, 0);
  }

  var TH =
    'text-align:left;padding:10px 14px;font-size:11px;color:var(--muted);font-weight:700;border-bottom:1px solid var(--border)';
  var PAY_CATS = [
    'Utilities',
    'Sewa',
    'Gaji',
    'Transportasi',
    'Pemeliharaan',
    'Asuransi',
    'Pajak',
    'Lainnya',
  ];
  var DEP_CATS = ['Penjualan', 'Penerimaan Lainnya', 'Refund', 'Bunga Bank', 'Lainnya'];
  var PAY_METHODS = ['Transfer Bank', 'Tunai', 'Cek', 'Giro', 'QRIS'];

  // ── Bank Accounts (seed) ──────────────────────────────────────────────────
  function getBankAccounts() {
    return ensureSettings('bankAccounts', [
      {
        id: 'BA001',
        name: 'BCA - Rekening Utama',
        bank: 'BCA',
        accountNumber: '***-***-****',
        currency: 'IDR',
      },
      {
        id: 'BA002',
        name: 'Mandiri - Operasional',
        bank: 'Mandiri',
        accountNumber: '***-***-****',
        currency: 'IDR',
      },
    ]);
  }

  function bankAccountOpts(selected) {
    return getBankAccounts()
      .map(function (a) {
        return (
          '<option value="' +
          esc(a.id) +
          '"' +
          (a.id === selected ? ' selected' : '') +
          '>' +
          esc(a.name) +
          '</option>'
        );
      })
      .join('');
  }

  // ══════════════════════════════════════════════════════════════════════════
  // § 1  OTHER PAYMENT (pengeluaran non-PO)
  // ══════════════════════════════════════════════════════════════════════════
  function openOtherPayment() {
    var payments = ensureArr('otherPayments').slice().reverse();
    var total = payments.reduce(function (s, p) {
      return s + (p.amount || 0);
    }, 0);

    var rows = payments.length
      ? payments
          .map(function (p) {
            return (
              '<tr>' +
              '<td class="td-p" style="font-size:11px;white-space:nowrap">' +
              esc(p.date) +
              '</td>' +
              '<td class="td-p" style="font-weight:700;font-size:12px">' +
              esc(p.id) +
              '</td>' +
              '<td class="td-p">' +
              esc(p.payee || '—') +
              '</td>' +
              '<td class="td-p"><span style="font-size:10px;font-weight:700;padding:2px 7px;background:var(--bg);border-radius:4px">' +
              esc(p.category || '—') +
              '</span></td>' +
              '<td class="td-p" style="font-size:11px">' +
              esc(p.method || '—') +
              '</td>' +
              '<td class="td-p" style="text-align:right;font-weight:700;color:#DC2626">' +
              money(p.amount) +
              '</td>' +
              '<td class="td-p" style="font-size:11px;color:var(--muted)">' +
              esc(p.notes || '') +
              '</td>' +
              '<td class="td-p" style="text-align:center">' +
              '<button class="btn-ghost" style="font-size:11px;padding:3px 8px;color:var(--danger)" data-action="delOP" data-id="' +
              esc(p.id) +
              '">Hapus</button>' +
              '</td></tr>'
            );
          })
          .join('')
      : '<tr><td colspan="8" style="text-align:center;padding:24px;color:var(--muted)">Belum ada pengeluaran dicatat.</td></tr>';

    injectView(
      '<div class="sec-hdr"><div><h1>Other Payment</h1><p>Pengeluaran kas/bank di luar Purchase Order</p></div>' +
        '<button class="btn" data-action="addOP">+ Catat Pengeluaran</button></div>' +
        '<div class="stat-row" style="grid-template-columns:repeat(2,1fr);margin-bottom:16px">' +
        '<div class="card stat-card"><div class="stat-label">Total Pengeluaran</div><div class="stat-val" style="color:#DC2626">' +
        money(total) +
        '</div><div class="stat-sub">' +
        payments.length +
        ' transaksi</div></div>' +
        '<div class="card stat-card"><div class="stat-label">Bulan Ini</div><div class="stat-val" style="color:#DC2626">' +
        money(
          payments
            .filter(function (p) {
              return p.date && p.date.slice(0, 7) === today().slice(0, 7);
            })
            .reduce(function (s, p) {
              return s + (p.amount || 0);
            }, 0)
        ) +
        '</div><div class="stat-sub">Pengeluaran berjalan</div></div>' +
        '</div>' +
        '<div class="card" style="overflow-x:auto"><table style="width:100%;border-collapse:collapse">' +
        '<thead><tr><th style="' +
        TH +
        '">Tanggal</th><th style="' +
        TH +
        '">No.</th><th style="' +
        TH +
        '">Penerima</th>' +
        '<th style="' +
        TH +
        '">Kategori</th><th style="' +
        TH +
        '">Metode</th><th style="' +
        TH +
        'text-align:right">Jumlah</th>' +
        '<th style="' +
        TH +
        '">Keterangan</th><th style="' +
        TH +
        '"></th></tr></thead>' +
        '<tbody>' +
        rows +
        '</tbody></table></div>'
    );
  }

  function addOPModal() {
    var catOpts = PAY_CATS.map(function (c) {
      return '<option>' + esc(c) + '</option>';
    }).join('');
    var methOpts = PAY_METHODS.map(function (m) {
      return '<option>' + esc(m) + '</option>';
    }).join('');
    modal(
      'Catat Pengeluaran',
      '<div class="form-row">' +
        '<div class="form-group"><label class="form-label">Tanggal</label><input class="form-input" id="op-date" type="date" value="' +
        today() +
        '"></div>' +
        '<div class="form-group"><label class="form-label">Rekening Bank</label><select class="form-select" id="op-bank">' +
        bankAccountOpts() +
        '</select></div>' +
        '</div>' +
        '<div class="form-row">' +
        '<div class="form-group"><label class="form-label">Penerima / Payee</label><input class="form-input" id="op-payee" placeholder="Nama vendor, pihak penerima..."></div>' +
        '<div class="form-group"><label class="form-label">Kategori</label><select class="form-select" id="op-cat">' +
        catOpts +
        '</select></div>' +
        '</div>' +
        '<div class="form-row">' +
        '<div class="form-group"><label class="form-label">Jumlah (Rp)</label><input class="form-input" id="op-amount" type="number" min="0" placeholder="0"></div>' +
        '<div class="form-group"><label class="form-label">Metode</label><select class="form-select" id="op-method">' +
        methOpts +
        '</select></div>' +
        '</div>' +
        '<div class="form-group"><label class="form-label">No. Referensi</label><input class="form-input" id="op-ref" placeholder="No. kwitansi, bukti transfer (opsional)"></div>' +
        '<div class="form-group"><label class="form-label">Keterangan</label><input class="form-input" id="op-notes" placeholder="Uraian pengeluaran"></div>',
      '<button class="btn" id="saveOP">Simpan</button><button class="btn-ghost" data-action="closeModal">Batal</button>'
    );
    setTimeout(function () {
      var btn = document.getElementById('saveOP');
      if (!btn) return;
      btn.addEventListener('click', function () {
        var amount = parseFloat(document.getElementById('op-amount').value) || 0;
        var payee = document.getElementById('op-payee').value.trim();
        if (!payee || amount <= 0) {
          toast('Penerima dan jumlah wajib diisi', 'warning');
          return;
        }
        var arr = ensureArr('otherPayments');
        var num = 'OP.' + new Date().getFullYear() + '.' + String(arr.length + 1).padStart(4, '0');
        arr.push({
          id: num,
          date: document.getElementById('op-date').value,
          bankAccountId: document.getElementById('op-bank').value,
          payee: payee,
          category: document.getElementById('op-cat').value,
          amount: amount,
          method: document.getElementById('op-method').value,
          reference: document.getElementById('op-ref').value.trim(),
          notes: document.getElementById('op-notes').value.trim(),
          createdAt: today(),
        });
        save();
        closeM();
        toast('Pengeluaran dicatat', 'success');
        openOtherPayment();
      });
    }, 60);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // § 2  OTHER DEPOSIT (penerimaan non-SO)
  // ══════════════════════════════════════════════════════════════════════════
  function openOtherDeposit() {
    var deposits = ensureArr('otherDeposits').slice().reverse();
    var total = deposits.reduce(function (s, d) {
      return s + (d.amount || 0);
    }, 0);

    var rows = deposits.length
      ? deposits
          .map(function (d) {
            return (
              '<tr>' +
              '<td class="td-p" style="font-size:11px;white-space:nowrap">' +
              esc(d.date) +
              '</td>' +
              '<td class="td-p" style="font-weight:700;font-size:12px">' +
              esc(d.id) +
              '</td>' +
              '<td class="td-p">' +
              esc(d.payer || '—') +
              '</td>' +
              '<td class="td-p"><span style="font-size:10px;font-weight:700;padding:2px 7px;background:var(--bg);border-radius:4px">' +
              esc(d.category || '—') +
              '</span></td>' +
              '<td class="td-p" style="font-size:11px">' +
              esc(d.method || '—') +
              '</td>' +
              '<td class="td-p" style="text-align:right;font-weight:700;color:#15803D">' +
              money(d.amount) +
              '</td>' +
              '<td class="td-p" style="font-size:11px;color:var(--muted)">' +
              esc(d.notes || '') +
              '</td>' +
              '<td class="td-p" style="text-align:center">' +
              '<button class="btn-ghost" style="font-size:11px;padding:3px 8px;color:var(--danger)" data-action="delOD" data-id="' +
              esc(d.id) +
              '">Hapus</button>' +
              '</td></tr>'
            );
          })
          .join('')
      : '<tr><td colspan="8" style="text-align:center;padding:24px;color:var(--muted)">Belum ada penerimaan dicatat.</td></tr>';

    injectView(
      '<div class="sec-hdr"><div><h1>Other Deposit</h1><p>Penerimaan kas/bank di luar Sales Order</p></div>' +
        '<button class="btn" data-action="addOD">+ Catat Penerimaan</button></div>' +
        '<div class="stat-row" style="grid-template-columns:repeat(2,1fr);margin-bottom:16px">' +
        '<div class="card stat-card"><div class="stat-label">Total Penerimaan</div><div class="stat-val" style="color:#15803D">' +
        money(total) +
        '</div><div class="stat-sub">' +
        deposits.length +
        ' transaksi</div></div>' +
        '<div class="card stat-card"><div class="stat-label">Bulan Ini</div><div class="stat-val" style="color:#15803D">' +
        money(
          deposits
            .filter(function (d) {
              return d.date && d.date.slice(0, 7) === today().slice(0, 7);
            })
            .reduce(function (s, d) {
              return s + (d.amount || 0);
            }, 0)
        ) +
        '</div><div class="stat-sub">Penerimaan berjalan</div></div>' +
        '</div>' +
        '<div class="card" style="overflow-x:auto"><table style="width:100%;border-collapse:collapse">' +
        '<thead><tr><th style="' +
        TH +
        '">Tanggal</th><th style="' +
        TH +
        '">No.</th><th style="' +
        TH +
        '">Dari</th>' +
        '<th style="' +
        TH +
        '">Kategori</th><th style="' +
        TH +
        '">Metode</th><th style="' +
        TH +
        'text-align:right">Jumlah</th>' +
        '<th style="' +
        TH +
        '">Keterangan</th><th style="' +
        TH +
        '"></th></tr></thead>' +
        '<tbody>' +
        rows +
        '</tbody></table></div>'
    );
  }

  function addODModal() {
    var catOpts = DEP_CATS.map(function (c) {
      return '<option>' + esc(c) + '</option>';
    }).join('');
    var methOpts = PAY_METHODS.map(function (m) {
      return '<option>' + esc(m) + '</option>';
    }).join('');
    modal(
      'Catat Penerimaan',
      '<div class="form-row">' +
        '<div class="form-group"><label class="form-label">Tanggal</label><input class="form-input" id="od-date" type="date" value="' +
        today() +
        '"></div>' +
        '<div class="form-group"><label class="form-label">Rekening Bank</label><select class="form-select" id="od-bank">' +
        bankAccountOpts() +
        '</select></div>' +
        '</div>' +
        '<div class="form-row">' +
        '<div class="form-group"><label class="form-label">Dari / Pembayar</label><input class="form-input" id="od-payer" placeholder="Nama pengirim..."></div>' +
        '<div class="form-group"><label class="form-label">Kategori</label><select class="form-select" id="od-cat">' +
        catOpts +
        '</select></div>' +
        '</div>' +
        '<div class="form-row">' +
        '<div class="form-group"><label class="form-label">Jumlah (Rp)</label><input class="form-input" id="od-amount" type="number" min="0" placeholder="0"></div>' +
        '<div class="form-group"><label class="form-label">Metode</label><select class="form-select" id="od-method">' +
        methOpts +
        '</select></div>' +
        '</div>' +
        '<div class="form-group"><label class="form-label">Keterangan</label><input class="form-input" id="od-notes" placeholder="Uraian penerimaan"></div>',
      '<button class="btn" id="saveOD">Simpan</button><button class="btn-ghost" data-action="closeModal">Batal</button>'
    );
    setTimeout(function () {
      var btn = document.getElementById('saveOD');
      if (!btn) return;
      btn.addEventListener('click', function () {
        var amount = parseFloat(document.getElementById('od-amount').value) || 0;
        var payer = document.getElementById('od-payer').value.trim();
        if (!payer || amount <= 0) {
          toast('Pengirim dan jumlah wajib diisi', 'warning');
          return;
        }
        var arr = ensureArr('otherDeposits');
        var num = 'OD.' + new Date().getFullYear() + '.' + String(arr.length + 1).padStart(4, '0');
        arr.push({
          id: num,
          date: document.getElementById('od-date').value,
          bankAccountId: document.getElementById('od-bank').value,
          payer: payer,
          category: document.getElementById('od-cat').value,
          amount: amount,
          method: document.getElementById('od-method').value,
          notes: document.getElementById('od-notes').value.trim(),
          createdAt: today(),
        });
        save();
        closeM();
        toast('Penerimaan dicatat', 'success');
        openOtherDeposit();
      });
    }, 60);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // § 3  BANK TRANSFER
  // ══════════════════════════════════════════════════════════════════════════
  function openBankTransfer() {
    var transfers = ensureArr('bankTransfers').slice().reverse();

    var rows = transfers.length
      ? transfers
          .map(function (t) {
            var accounts = getBankAccounts();
            var fromAcc = accounts.find(function (a) {
              return a.id === t.fromAccountId;
            });
            var toAcc = accounts.find(function (a) {
              return a.id === t.toAccountId;
            });
            return (
              '<tr>' +
              '<td class="td-p" style="font-size:11px;white-space:nowrap">' +
              esc(t.date) +
              '</td>' +
              '<td class="td-p" style="font-weight:700;font-size:12px">' +
              esc(t.id) +
              '</td>' +
              '<td class="td-p" style="font-size:12px">' +
              esc(fromAcc ? fromAcc.name : t.fromAccountId) +
              '</td>' +
              '<td class="td-p" style="color:var(--muted)">→</td>' +
              '<td class="td-p" style="font-size:12px">' +
              esc(toAcc ? toAcc.name : t.toAccountId) +
              '</td>' +
              '<td class="td-p" style="text-align:right;font-weight:700">' +
              money(t.amount) +
              '</td>' +
              '<td class="td-p" style="text-align:right;font-size:11px;color:#DC2626">' +
              (t.fee ? money(t.fee) : '—') +
              '</td>' +
              '<td class="td-p" style="font-size:11px;color:var(--muted)">' +
              esc(t.notes || '') +
              '</td>' +
              '<td class="td-p" style="text-align:center">' +
              '<button class="btn-ghost" style="font-size:11px;padding:3px 8px;color:var(--danger)" data-action="delBT" data-id="' +
              esc(t.id) +
              '">Hapus</button>' +
              '</td></tr>'
            );
          })
          .join('')
      : '<tr><td colspan="9" style="text-align:center;padding:24px;color:var(--muted)">Belum ada transfer antar rekening.</td></tr>';

    injectView(
      '<div class="sec-hdr"><div><h1>Bank Transfer</h1><p>Transfer antar rekening perusahaan</p></div>' +
        '<button class="btn" data-action="addBT">+ Buat Transfer</button></div>' +
        '<div class="card" style="overflow-x:auto"><table style="width:100%;border-collapse:collapse">' +
        '<thead><tr><th style="' +
        TH +
        '">Tanggal</th><th style="' +
        TH +
        '">No.</th><th style="' +
        TH +
        '">Dari</th><th style="' +
        TH +
        '"></th>' +
        '<th style="' +
        TH +
        '">Ke</th><th style="' +
        TH +
        'text-align:right">Jumlah</th><th style="' +
        TH +
        'text-align:right">Biaya</th>' +
        '<th style="' +
        TH +
        '">Keterangan</th><th style="' +
        TH +
        '"></th></tr></thead>' +
        '<tbody>' +
        rows +
        '</tbody></table></div>'
    );
  }

  function addBTModal() {
    var accounts = getBankAccounts();
    var accOpts1 = accounts
      .map(function (a) {
        return '<option value="' + esc(a.id) + '">' + esc(a.name) + '</option>';
      })
      .join('');
    var accOpts2 = accOpts1;
    modal(
      'Transfer Antar Rekening',
      '<div class="form-row">' +
        '<div class="form-group"><label class="form-label">Tanggal</label><input class="form-input" id="bt-date" type="date" value="' +
        today() +
        '"></div>' +
        '<div class="form-group"><label class="form-label">Referensi</label><input class="form-input" id="bt-ref" placeholder="No. transfer (opsional)"></div>' +
        '</div>' +
        '<div class="form-row">' +
        '<div class="form-group"><label class="form-label">Dari Rekening</label><select class="form-select" id="bt-from">' +
        accOpts1 +
        '</select></div>' +
        '<div class="form-group"><label class="form-label">Ke Rekening</label><select class="form-select" id="bt-to">' +
        accOpts2 +
        '</select></div>' +
        '</div>' +
        '<div class="form-row">' +
        '<div class="form-group"><label class="form-label">Jumlah (Rp)</label><input class="form-input" id="bt-amount" type="number" min="0" placeholder="0"></div>' +
        '<div class="form-group"><label class="form-label">Biaya Transfer (Rp)</label><input class="form-input" id="bt-fee" type="number" min="0" value="0"></div>' +
        '</div>' +
        '<div class="form-group"><label class="form-label">Keterangan</label><input class="form-input" id="bt-notes" placeholder="Opsional"></div>',
      '<button class="btn" id="saveBT">Simpan</button><button class="btn-ghost" data-action="closeModal">Batal</button>'
    );
    setTimeout(function () {
      var btn = document.getElementById('saveBT');
      if (!btn) return;
      btn.addEventListener('click', function () {
        var amount = parseFloat(document.getElementById('bt-amount').value) || 0;
        var from = document.getElementById('bt-from').value;
        var to = document.getElementById('bt-to').value;
        if (from === to) {
          toast('Rekening asal dan tujuan tidak boleh sama', 'warning');
          return;
        }
        if (amount <= 0) {
          toast('Jumlah wajib diisi', 'warning');
          return;
        }
        var arr = ensureArr('bankTransfers');
        var num = 'BT.' + new Date().getFullYear() + '.' + String(arr.length + 1).padStart(4, '0');
        arr.push({
          id: num,
          date: document.getElementById('bt-date').value,
          fromAccountId: from,
          toAccountId: to,
          amount: amount,
          fee: parseFloat(document.getElementById('bt-fee').value) || 0,
          reference: document.getElementById('bt-ref').value.trim(),
          notes: document.getElementById('bt-notes').value.trim(),
          createdAt: today(),
        });
        save();
        closeM();
        toast('Transfer dicatat', 'success');
        openBankTransfer();
      });
    }, 60);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // § 4  SMARTLINK e-BANKING
  // ══════════════════════════════════════════════════════════════════════════
  function openSmartLink() {
    var cfg = ensureSettings('smartlink', {
      enabled: false,
      bankCode: '',
      apiKey: '',
      webhookUrl: '',
    });
    var accounts = getBankAccounts();
    var accRows = accounts
      .map(function (a) {
        return (
          '<tr><td class="td-p" style="font-weight:700">' +
          esc(a.name) +
          '</td>' +
          '<td class="td-p">' +
          esc(a.bank) +
          '</td>' +
          '<td class="td-p" style="font-size:11px">' +
          esc(a.accountNumber) +
          '</td>' +
          '<td class="td-p"><span style="font-size:10px;font-weight:700;padding:2px 8px;border-radius:4px;background:#FEF9C3;color:#854D0E">Manual</span></td>' +
          '</tr>'
        );
      })
      .join('');

    injectView(
      '<div class="sec-hdr"><div><h1>SmartLink e-Banking</h1><p>Integrasi perbankan elektronik</p></div></div>' +
        '<div class="card" style="margin-bottom:16px">' +
        '<div style="display:flex;align-items:center;gap:12px;margin-bottom:16px">' +
        '<div style="width:44px;height:44px;border-radius:10px;background:#DBEAFE;display:flex;align-items:center;justify-content:center">' +
        '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#1D4ED8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg></div>' +
        '<div><div style="font-weight:700">Status Koneksi</div>' +
        '<div style="font-size:12px;color:var(--muted)">Koneksi API perbankan</div></div>' +
        '<span style="margin-left:auto;font-size:11px;font-weight:700;padding:4px 12px;background:#FEF9C3;color:#854D0E;border-radius:6px">Belum Terhubung</span>' +
        '</div>' +
        '<div style="padding:16px;background:var(--bg);border-radius:8px;font-size:12px;color:var(--muted);line-height:1.6">' +
        '<strong>Untuk mengaktifkan SmartLink e-Banking:</strong><br>' +
        '1. Daftarkan perusahaan Anda ke program corporate banking bank terpilih<br>' +
        '2. Dapatkan API Key dan Webhook URL dari portal developer bank<br>' +
        '3. Masukkan kredensial di bawah ini dan klik Simpan<br>' +
        '<em style="color:#DC2626">Catatan: Integrasi langsung memerlukan kontrak bisnis dengan bank.</em>' +
        '</div></div>' +
        '<div class="card" style="margin-bottom:16px">' +
        '<div style="font-size:12px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:12px">Konfigurasi API</div>' +
        '<div class="form-row">' +
        '<div class="form-group"><label class="form-label">Kode Bank</label>' +
        '<input class="form-input" id="sl-bank" value="' +
        esc(cfg.bankCode) +
        '" placeholder="BCA, Mandiri, BNI, BRI..."></div>' +
        '<div class="form-group"><label class="form-label">API Key</label>' +
        '<input class="form-input" id="sl-apikey" type="password" value="' +
        esc(cfg.apiKey) +
        '" placeholder="••••••••••••••••"></div>' +
        '</div>' +
        '<div class="form-group"><label class="form-label">Webhook URL (opsional)</label>' +
        '<input class="form-input" id="sl-webhook" value="' +
        esc(cfg.webhookUrl) +
        '" placeholder="https://..."></div>' +
        '<div style="display:flex;gap:10px;margin-top:12px">' +
        '<button class="btn" id="saveSmartLink">Simpan Konfigurasi</button>' +
        '<button class="btn-ghost" id="testSmartLink">Test Koneksi</button></div></div>' +
        '<div class="card"><div style="font-size:12px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:12px">Rekening Terdaftar</div>' +
        '<table style="width:100%;border-collapse:collapse"><thead><tr>' +
        '<th style="' +
        TH +
        '">Nama Rekening</th><th style="' +
        TH +
        '">Bank</th>' +
        '<th style="' +
        TH +
        '">No. Rekening</th><th style="' +
        TH +
        '">Status</th>' +
        '</tr></thead><tbody>' +
        accRows +
        '</tbody></table></div>'
    );

    setTimeout(function () {
      var saveBtn = document.getElementById('saveSmartLink');
      var testBtn = document.getElementById('testSmartLink');
      if (saveBtn)
        saveBtn.addEventListener('click', function () {
          cfg.bankCode = document.getElementById('sl-bank').value.trim();
          cfg.apiKey = document.getElementById('sl-apikey').value.trim();
          cfg.webhookUrl = document.getElementById('sl-webhook').value.trim();
          save();
          toast('Konfigurasi disimpan', 'success');
        });
      if (testBtn)
        testBtn.addEventListener('click', function () {
          toast('Koneksi API belum tersedia (mode demo)', 'warning');
        });
    }, 60);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // § 5  BANK STATEMENT
  // ══════════════════════════════════════════════════════════════════════════
  function openBankStatement() {
    var statements = ensureArr('bankStatements').slice().reverse();
    var accounts = getBankAccounts();

    var rows = statements.length
      ? statements
          .map(function (s) {
            var acc = accounts.find(function (a) {
              return a.id === s.accountId;
            });
            var entryCount = (s.entries || []).length;
            var totalDebit = (s.entries || []).reduce(function (x, e) {
              return x + (e.debit || 0);
            }, 0);
            var totalCredit = (s.entries || []).reduce(function (x, e) {
              return x + (e.credit || 0);
            }, 0);
            return (
              '<tr>' +
              '<td class="td-p" style="font-weight:700;font-size:12px">' +
              esc(s.id) +
              '</td>' +
              '<td class="td-p">' +
              esc(acc ? acc.name : s.accountId) +
              '</td>' +
              '<td class="td-p" style="font-size:12px">' +
              esc(s.period) +
              '</td>' +
              '<td class="td-p" style="text-align:center">' +
              entryCount +
              ' baris</td>' +
              '<td class="td-p" style="text-align:right;color:#DC2626">' +
              money(totalDebit) +
              '</td>' +
              '<td class="td-p" style="text-align:right;color:#15803D">' +
              money(totalCredit) +
              '</td>' +
              '<td class="td-p" style="text-align:center">' +
              '<button class="btn-ghost" style="font-size:11px;padding:3px 8px" data-action="viewBS" data-id="' +
              esc(s.id) +
              '">Detail</button> ' +
              '<button class="btn-ghost" style="font-size:11px;padding:3px 8px;color:var(--danger)" data-action="delBS" data-id="' +
              esc(s.id) +
              '">Hapus</button>' +
              '</td></tr>'
            );
          })
          .join('')
      : '<tr><td colspan="7" style="text-align:center;padding:24px;color:var(--muted)">Belum ada rekening koran diinput.</td></tr>';

    injectView(
      '<div class="sec-hdr"><div><h1>Bank Statement</h1><p>Rekening koran per rekening dan periode</p></div>' +
        '<button class="btn" data-action="addBS">+ Input Rekening Koran</button></div>' +
        '<div class="card" style="overflow-x:auto"><table style="width:100%;border-collapse:collapse">' +
        '<thead><tr><th style="' +
        TH +
        '">ID</th><th style="' +
        TH +
        '">Rekening</th><th style="' +
        TH +
        '">Periode</th>' +
        '<th style="' +
        TH +
        'text-align:center">Baris</th><th style="' +
        TH +
        'text-align:right">Total Debit</th>' +
        '<th style="' +
        TH +
        'text-align:right">Total Kredit</th><th style="' +
        TH +
        '"></th></tr></thead>' +
        '<tbody>' +
        rows +
        '</tbody></table></div>'
    );
  }

  function addBSModal() {
    modal(
      'Input Rekening Koran',
      '<div class="form-row">' +
        '<div class="form-group"><label class="form-label">Rekening Bank</label><select class="form-select" id="bs-acc">' +
        bankAccountOpts() +
        '</select></div>' +
        '<div class="form-group"><label class="form-label">Periode (YYYY-MM)</label><input class="form-input" id="bs-period" type="month" value="' +
        today().slice(0, 7) +
        '"></div>' +
        '</div>' +
        '<div style="font-size:12px;font-weight:700;margin:12px 0 8px;color:var(--muted)">Entri Transaksi</div>' +
        '<div id="bs-lines-wrap">' +
        _bsLineHTML() +
        '</div>' +
        '<button type="button" class="btn-ghost" data-action="addBSLine" style="font-size:12px;margin-top:6px">+ Tambah Baris</button>',
      '<button class="btn" id="saveBS">Simpan</button><button class="btn-ghost" data-action="closeModal">Batal</button>',
      true
    );
    setTimeout(function () {
      var btn = document.getElementById('saveBS');
      if (!btn) return;
      btn.addEventListener('click', function () {
        var accId = document.getElementById('bs-acc').value;
        var period = document.getElementById('bs-period').value;
        var entries = [];
        document.querySelectorAll('#bs-lines-wrap .bs-row').forEach(function (row) {
          var date = row.querySelector('.bs-date').value;
          var desc = row.querySelector('.bs-desc').value.trim();
          var debit = parseFloat(row.querySelector('.bs-debit').value) || 0;
          var credit = parseFloat(row.querySelector('.bs-credit').value) || 0;
          if (desc) entries.push({ date: date, description: desc, debit: debit, credit: credit });
        });
        if (!entries.length) {
          toast('Minimal 1 baris transaksi', 'warning');
          return;
        }
        var arr = ensureArr('bankStatements');
        var num = 'BS.' + period.replace('-', '.') + '.' + String(arr.length + 1).padStart(3, '0');
        arr.push({
          id: num,
          accountId: accId,
          period: period,
          uploadDate: today(),
          entries: entries,
        });
        save();
        closeM();
        toast('Rekening koran disimpan', 'success');
        openBankStatement();
      });
    }, 60);
  }

  function _bsLineHTML() {
    return (
      '<div class="bs-row" style="display:flex;gap:6px;margin-bottom:6px;align-items:center">' +
      '<input class="form-input bs-date" type="date" value="' +
      today() +
      '" style="width:130px;font-size:12px">' +
      '<input class="form-input bs-desc" placeholder="Keterangan" style="flex:1;font-size:12px">' +
      '<input class="form-input bs-debit" type="number" min="0" placeholder="Debit" style="width:110px;font-size:12px">' +
      '<input class="form-input bs-credit" type="number" min="0" placeholder="Kredit" style="width:110px;font-size:12px">' +
      '<button type="button" class="btn-ghost" data-action="delBSLine" style="font-size:18px;padding:0 6px;line-height:1;flex:none">×</button></div>'
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // § 6  BANK HISTORY
  // ══════════════════════════════════════════════════════════════════════════
  function openBankHistory() {
    var entries = [];
    var accounts = getBankAccounts();
    var accMap = {};
    accounts.forEach(function (a) {
      accMap[a.id] = a.name;
    });

    (db().paymentLogs || []).forEach(function (p) {
      entries.push({
        date: p.date || '',
        type: p.type === 'SO' ? 'Penerimaan SO' : 'Pembayaran PO',
        ref: p.orderId || '',
        amount: p.amount || 0,
        flow: p.type === 'SO' ? 'in' : 'out',
        method: p.method || '',
        note: p.note || '',
      });
    });
    (db().otherPayments || []).forEach(function (p) {
      entries.push({
        date: p.date || '',
        type: 'Other Payment',
        ref: p.id,
        amount: p.amount || 0,
        flow: 'out',
        method: p.method || '',
        note: p.payee + (p.notes ? ' — ' + p.notes : ''),
      });
    });
    (db().otherDeposits || []).forEach(function (d) {
      entries.push({
        date: d.date || '',
        type: 'Other Deposit',
        ref: d.id,
        amount: d.amount || 0,
        flow: 'in',
        method: d.method || '',
        note: d.payer + (d.notes ? ' — ' + d.notes : ''),
      });
    });
    (db().bankTransfers || []).forEach(function (t) {
      entries.push({
        date: t.date || '',
        type: 'Bank Transfer',
        ref: t.id,
        amount: t.amount || 0,
        flow: 'transfer',
        method: 'Transfer',
        note:
          (accMap[t.fromAccountId] || t.fromAccountId) +
          ' → ' +
          (accMap[t.toAccountId] || t.toAccountId),
      });
    });

    entries.sort(function (a, b) {
      return a.date > b.date ? -1 : a.date < b.date ? 1 : 0;
    });

    var totalIn = entries
      .filter(function (e) {
        return e.flow === 'in';
      })
      .reduce(function (s, e) {
        return s + e.amount;
      }, 0);
    var totalOut = entries
      .filter(function (e) {
        return e.flow === 'out';
      })
      .reduce(function (s, e) {
        return s + e.amount;
      }, 0);

    var rows =
      entries
        .slice(0, 200)
        .map(function (e) {
          var flowColor = e.flow === 'in' ? '#15803D' : e.flow === 'out' ? '#DC2626' : '#6B7280';
          var prefix = e.flow === 'in' ? '+' : e.flow === 'out' ? '−' : '⇄';
          return (
            '<tr>' +
            '<td class="td-p" style="font-size:11px;white-space:nowrap">' +
            esc(e.date) +
            '</td>' +
            '<td class="td-p"><span style="font-size:10px;font-weight:700;padding:2px 7px;background:var(--bg);border-radius:4px">' +
            esc(e.type) +
            '</span></td>' +
            '<td class="td-p" style="font-size:11px">' +
            esc(e.ref) +
            '</td>' +
            '<td class="td-p" style="font-size:11px;color:var(--muted)">' +
            esc(e.method) +
            '</td>' +
            '<td class="td-p" style="text-align:right;font-weight:700;color:' +
            flowColor +
            '">' +
            prefix +
            ' ' +
            money(e.amount) +
            '</td>' +
            '<td class="td-p" style="font-size:11px;color:var(--muted)">' +
            esc(e.note) +
            '</td>' +
            '</tr>'
          );
        })
        .join('') ||
      '<tr><td colspan="6" style="text-align:center;padding:24px;color:var(--muted)">Belum ada riwayat transaksi bank.</td></tr>';

    injectView(
      '<div class="sec-hdr"><div><h1>Bank History</h1><p>Riwayat seluruh transaksi kas &amp; bank (' +
        entries.length.toLocaleString('id-ID') +
        ' total)</p></div></div>' +
        '<div class="stat-row" style="grid-template-columns:repeat(3,1fr);margin-bottom:16px">' +
        '<div class="card stat-card"><div class="stat-label">Total Masuk</div><div class="stat-val" style="color:#15803D">' +
        money(totalIn) +
        '</div><div class="stat-sub">SO + Other Deposit</div></div>' +
        '<div class="card stat-card"><div class="stat-label">Total Keluar</div><div class="stat-val" style="color:#DC2626">' +
        money(totalOut) +
        '</div><div class="stat-sub">PO + Other Payment</div></div>' +
        '<div class="card stat-card"><div class="stat-label">Net Posisi</div><div class="stat-val" style="color:' +
        (totalIn - totalOut >= 0 ? '#15803D' : '#DC2626') +
        '">' +
        money(Math.abs(totalIn - totalOut)) +
        '</div><div class="stat-sub">' +
        (totalIn - totalOut >= 0 ? 'Surplus' : 'Defisit') +
        '</div></div>' +
        '</div>' +
        '<div class="card" style="overflow-x:auto"><table style="width:100%;border-collapse:collapse">' +
        '<thead><tr><th style="' +
        TH +
        '">Tanggal</th><th style="' +
        TH +
        '">Tipe</th><th style="' +
        TH +
        '">Referensi</th>' +
        '<th style="' +
        TH +
        '">Metode</th><th style="' +
        TH +
        'text-align:right">Jumlah</th><th style="' +
        TH +
        '">Keterangan</th></tr></thead>' +
        '<tbody>' +
        rows +
        '</tbody></table>' +
        (entries.length > 200
          ? '<div style="text-align:center;padding:10px;font-size:11px;color:var(--muted)">Menampilkan 200 dari ' +
            entries.length +
            ' transaksi</div>'
          : '') +
        '</div>'
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // § 7  BANK RECONCILE
  // ══════════════════════════════════════════════════════════════════════════
  function openBankReconcile() {
    var statements = ensureArr('bankStatements');
    var accounts = getBankAccounts();

    if (!statements.length) {
      injectView(
        '<div class="sec-hdr"><div><h1>Bank Reconcile</h1><p>Pencocokan rekening koran dengan buku besar</p></div></div>' +
          '<div class="card" style="text-align:center;padding:40px">' +
          '<div style="font-size:32px;margin-bottom:12px">🏦</div>' +
          '<div style="font-size:15px;font-weight:700;margin-bottom:6px">Belum ada rekening koran</div>' +
          '<div style="font-size:13px;color:var(--muted);margin-bottom:16px">Input rekening koran terlebih dahulu melalui menu Bank Statement</div>' +
          '<button class="btn" data-action="goToBankStatement">Buka Bank Statement</button></div>'
      );
      return;
    }

    var latestBS = statements[statements.length - 1];
    var acc = accounts.find(function (a) {
      return a.id === latestBS.accountId;
    });
    var bsEntries = latestBS.entries || [];
    var reconciled = latestBS.reconciled || {};

    var payLogs = (db().paymentLogs || []).filter(function (p) {
      return p.date && p.date.slice(0, 7) === latestBS.period;
    });

    var bsRows =
      bsEntries
        .map(function (e, i) {
          var isRec = reconciled[i];
          return (
            '<tr style="' +
            (isRec ? 'opacity:.55' : '') +
            '">' +
            '<td class="td-p" style="font-size:11px">' +
            esc(e.date) +
            '</td>' +
            '<td class="td-p" style="font-size:12px">' +
            esc(e.description) +
            '</td>' +
            '<td class="td-p" style="text-align:right;color:#DC2626">' +
            (e.debit ? money(e.debit) : '—') +
            '</td>' +
            '<td class="td-p" style="text-align:right;color:#15803D">' +
            (e.credit ? money(e.credit) : '—') +
            '</td>' +
            '<td class="td-p" style="text-align:center">' +
            '<input type="checkbox" data-action="reconcileToggle" data-bsid="' +
            esc(latestBS.id) +
            '" data-idx="' +
            i +
            '"' +
            (isRec ? ' checked' : '') +
            '>' +
            '</td></tr>'
          );
        })
        .join('') ||
      '<tr><td colspan="5" style="text-align:center;padding:16px;color:var(--muted)">Tidak ada baris.</td></tr>';

    var reconciledCount = Object.keys(reconciled).filter(function (k) {
      return reconciled[k];
    }).length;
    var pct = bsEntries.length ? Math.round((reconciledCount / bsEntries.length) * 100) : 0;

    injectView(
      '<div class="sec-hdr"><div><h1>Bank Reconcile</h1><p>Pencocokan rekening koran dengan transaksi sistem</p></div></div>' +
        '<div class="card" style="margin-bottom:16px">' +
        '<div style="display:flex;gap:16px;align-items:center;flex-wrap:wrap">' +
        '<div><div style="font-size:12px;color:var(--muted)">Rekening</div><div style="font-weight:700">' +
        esc(acc ? acc.name : latestBS.accountId) +
        '</div></div>' +
        '<div><div style="font-size:12px;color:var(--muted)">Periode</div><div style="font-weight:700">' +
        esc(latestBS.period) +
        '</div></div>' +
        '<div><div style="font-size:12px;color:var(--muted)">Progress</div><div style="font-weight:700">' +
        reconciledCount +
        '/' +
        bsEntries.length +
        ' (' +
        pct +
        '%)</div></div>' +
        '<div style="flex:1;min-width:160px"><div style="height:8px;background:var(--border);border-radius:4px;overflow:hidden"><div style="height:100%;background:#15803D;width:' +
        pct +
        '%"></div></div></div>' +
        '</div></div>' +
        '<div class="card" style="overflow-x:auto"><table style="width:100%;border-collapse:collapse">' +
        '<thead><tr><th style="' +
        TH +
        '">Tanggal</th><th style="' +
        TH +
        '">Keterangan Bank</th>' +
        '<th style="' +
        TH +
        'text-align:right">Debit</th><th style="' +
        TH +
        'text-align:right">Kredit</th>' +
        '<th style="' +
        TH +
        'text-align:center">Cocok ✓</th></tr></thead>' +
        '<tbody>' +
        bsRows +
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
      case 'addOP':
        addOPModal();
        break;
      case 'delOP': {
        if (!confirm('Hapus pengeluaran ini?')) return;
        var a1 = ensureArr('otherPayments');
        a1.splice(
          a1.findIndex(function (x) {
            return x.id === id;
          }),
          1
        );
        save();
        toast('Dihapus', 'success');
        openOtherPayment();
        break;
      }
      case 'addOD':
        addODModal();
        break;
      case 'delOD': {
        if (!confirm('Hapus penerimaan ini?')) return;
        var a2 = ensureArr('otherDeposits');
        a2.splice(
          a2.findIndex(function (x) {
            return x.id === id;
          }),
          1
        );
        save();
        toast('Dihapus', 'success');
        openOtherDeposit();
        break;
      }
      case 'addBT':
        addBTModal();
        break;
      case 'delBT': {
        if (!confirm('Hapus transfer ini?')) return;
        var a3 = ensureArr('bankTransfers');
        a3.splice(
          a3.findIndex(function (x) {
            return x.id === id;
          }),
          1
        );
        save();
        toast('Dihapus', 'success');
        openBankTransfer();
        break;
      }
      case 'addBS':
        addBSModal();
        break;
      case 'addBSLine': {
        var wrap = document.getElementById('bs-lines-wrap');
        if (wrap) {
          var d = document.createElement('div');
          d.innerHTML = _bsLineHTML();
          wrap.appendChild(d.firstChild);
        }
        break;
      }
      case 'delBSLine': {
        var row = btn.closest('.bs-row');
        if (row) row.remove();
        break;
      }
      case 'viewBS': {
        var s = ensureArr('bankStatements').find(function (x) {
          return x.id === id;
        });
        if (!s) break;
        var eRows = (s.entries || [])
          .map(function (e) {
            return (
              '<tr><td class="td-p" style="font-size:11px">' +
              esc(e.date) +
              '</td><td class="td-p">' +
              esc(e.description) +
              '</td><td class="td-p" style="text-align:right;color:#DC2626">' +
              (e.debit ? money(e.debit) : '—') +
              '</td><td class="td-p" style="text-align:right;color:#15803D">' +
              (e.credit ? money(e.credit) : '—') +
              '</td></tr>'
            );
          })
          .join('');
        modal(
          'Rekening Koran — ' + s.id,
          '<table style="width:100%;border-collapse:collapse"><thead><tr><th style="' +
            TH +
            '">Tanggal</th><th style="' +
            TH +
            '">Keterangan</th><th style="' +
            TH +
            'text-align:right">Debit</th><th style="' +
            TH +
            'text-align:right">Kredit</th></tr></thead><tbody>' +
            eRows +
            '</tbody></table>',
          '<button class="btn-ghost" data-action="closeModal">Tutup</button>',
          true
        );
        break;
      }
      case 'delBS': {
        if (!confirm('Hapus rekening koran ini?')) return;
        var a4 = ensureArr('bankStatements');
        a4.splice(
          a4.findIndex(function (x) {
            return x.id === id;
          }),
          1
        );
        save();
        toast('Dihapus', 'success');
        openBankStatement();
        break;
      }
      case 'goToBankStatement':
        openBankStatement();
        break;
      case 'reconcileToggle': {
        var bsId = btn.dataset.bsid;
        var idx = parseInt(btn.dataset.idx);
        var bs = ensureArr('bankStatements').find(function (x) {
          return x.id === bsId;
        });
        if (bs) {
          if (!bs.reconciled) bs.reconciled = {};
          bs.reconciled[idx] = btn.checked;
          save();
        }
        break;
      }
    }
  });

  window._bankExtras = {
    openOtherPayment: openOtherPayment,
    openOtherDeposit: openOtherDeposit,
    openBankTransfer: openBankTransfer,
    openSmartLink: openSmartLink,
    openBankStatement: openBankStatement,
    openBankHistory: openBankHistory,
    openBankReconcile: openBankReconcile,
  };
  console.log('[BankExtras] Bank extras ready');
})();
