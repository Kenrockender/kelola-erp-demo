// ══════════════════════════════════════════════════════════════════════════════
//  TAX EXTRAS  — e-Faktur CTAS, Tax Invoice Email, e-Faktur Legacy
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
  function today() {
    return new Date().toISOString().slice(0, 10);
  }
  function modal(t, b, f, w) {
    window.openModal && window.openModal(t, b, f || '', w);
  }
  function closeM() {
    window.closeModal && window.closeModal();
  }

  var TH =
    'text-align:left;padding:10px 14px;font-size:11px;color:var(--muted);font-weight:700;border-bottom:1px solid var(--border)';
  var VAT_RATE = 0.11; // PPN 11%

  function injectView(html) {
    window.invalidateView && window.invalidateView('tax');
    window.navigate && window.navigate('tax');
    setTimeout(function () {
      var el = document.getElementById('view-tax');
      if (el) el.innerHTML = html;
    }, 0);
  }

  // ── Get all invoices with VAT info ────────────────────────────────────────
  function getVatInvoices() {
    var sis = db().salesInvoices || [];
    var sos = db().salesOrders || [];
    var customers = db().customers || [];

    var result = [];

    sis.forEach(function (si) {
      var so = sos.find(function (o) {
        return o.id === si.orderId;
      });
      var cust = customers.find(function (c) {
        return c.id === (so ? so.customerId : si.customerId);
      });
      var dpp = si.amount || (so ? so.amount : 0) || 0;
      var ppn = Math.round(dpp * VAT_RATE);
      result.push({
        id: si.id || si.invoiceId,
        date: si.date || si.invoiceDate || '',
        orderId: si.orderId || '',
        customerName: cust ? cust.name || cust.companyName : so ? so.customerName : '—',
        npwp: cust ? cust.npwp || '—' : '—',
        dpp: dpp,
        ppn: ppn,
        total: dpp + ppn,
        status: si.status || 'Issued',
        efakturNo: si.efakturNo || '',
        emailSent: si.emailSent || false,
      });
    });

    sos.forEach(function (so) {
      if (
        sis.find(function (si) {
          return si.orderId === so.id;
        })
      )
        return;
      if (so.status === 'Paid' || so.status === 'Completed') {
        var cust = customers.find(function (c) {
          return c.id === so.customerId;
        });
        var dpp = so.amount || 0;
        var ppn = Math.round(dpp * VAT_RATE);
        result.push({
          id: 'SO-' + so.id,
          date: so.date || '',
          orderId: so.id,
          customerName: so.customerName || (cust ? cust.name || cust.companyName : '—'),
          npwp: cust ? cust.npwp || '—' : '—',
          dpp: dpp,
          ppn: ppn,
          total: dpp + ppn,
          status: so.status,
          efakturNo: so.efakturNo || '',
          emailSent: so.emailSent || false,
        });
      }
    });

    return result.sort(function (a, b) {
      return a.date > b.date ? -1 : a.date < b.date ? 1 : 0;
    });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // § 1  e-FAKTUR CTAS (format upload ke DJP)
  // ══════════════════════════════════════════════════════════════════════════
  function openEFakturCTAS() {
    var invoices = getVatInvoices();
    var cfg = (db().settings && db().settings.efakturCfg) || {};
    var totalDPP = invoices.reduce(function (s, i) {
      return s + i.dpp;
    }, 0);
    var totalPPN = invoices.reduce(function (s, i) {
      return s + i.ppn;
    }, 0);

    var rows =
      invoices
        .slice(0, 100)
        .map(function (inv) {
          return (
            '<tr>' +
            '<td class="td-p" style="font-size:11px;white-space:nowrap">' +
            esc(inv.date) +
            '</td>' +
            '<td class="td-p" style="font-size:11px">' +
            esc(inv.id) +
            '</td>' +
            '<td class="td-p">' +
            esc(inv.customerName) +
            '</td>' +
            '<td class="td-p" style="font-size:11px;color:var(--muted)">' +
            esc(inv.npwp) +
            '</td>' +
            '<td class="td-p" style="text-align:right">' +
            money(inv.dpp) +
            '</td>' +
            '<td class="td-p" style="text-align:right;color:#2563EB">' +
            money(inv.ppn) +
            '</td>' +
            '<td class="td-p" style="font-size:11px">' +
            esc(inv.efakturNo || '—') +
            '</td>' +
            '<td class="td-p" style="text-align:center">' +
            '<button class="btn-ghost" style="font-size:11px;padding:3px 8px" data-action="setEfakturNo" data-id="' +
            esc(inv.orderId) +
            '">Set No.</button>' +
            '</td></tr>'
          );
        })
        .join('') ||
      '<tr><td colspan="8" style="text-align:center;padding:24px;color:var(--muted)">Tidak ada faktur PPN.</td></tr>';

    injectView(
      '<div class="sec-hdr"><div><h1>e-Faktur CTAS</h1><p>Laporan faktur pajak — format upload ke aplikasi e-Faktur DJP</p></div>' +
        '<div style="display:flex;gap:8px">' +
        '<button class="btn-ghost" data-action="cfgEfaktur">Konfigurasi</button>' +
        '<button class="btn" data-action="exportCTAS">Export CSV</button></div></div>' +
        '<div class="card" style="background:#EFF6FF;border:1px solid #BFDBFE;padding:14px 18px;margin-bottom:16px">' +
        '<div style="display:flex;gap:24px;flex-wrap:wrap;font-size:13px">' +
        '<div><span style="color:#1D4ED8;font-weight:700">' +
        invoices.length.toLocaleString('id-ID') +
        '</span><span style="color:var(--muted)"> faktur</span></div>' +
        '<div><span style="font-weight:700">DPP:</span> ' +
        money(totalDPP) +
        '</div>' +
        '<div><span style="font-weight:700;color:#2563EB">PPN (11%):</span> ' +
        money(totalPPN) +
        '</div>' +
        '<div style="margin-left:auto;font-size:11px;color:var(--muted)">NPWP Perusahaan: <strong>' +
        esc(cfg.npwp || 'Belum diatur') +
        '</strong></div>' +
        '</div></div>' +
        '<div class="card" style="overflow-x:auto"><table style="width:100%;border-collapse:collapse">' +
        '<thead><tr>' +
        '<th style="' +
        TH +
        '">Tanggal</th><th style="' +
        TH +
        '">No. Faktur</th><th style="' +
        TH +
        '">Nama Lawan Transaksi</th>' +
        '<th style="' +
        TH +
        '">NPWP</th><th style="' +
        TH +
        'text-align:right">DPP</th><th style="' +
        TH +
        'text-align:right">PPN</th>' +
        '<th style="' +
        TH +
        '">No. e-Faktur</th><th style="' +
        TH +
        '"></th>' +
        '</tr></thead><tbody>' +
        rows +
        '</tbody></table>' +
        (invoices.length > 100
          ? '<div style="text-align:center;padding:10px;font-size:11px;color:var(--muted)">Menampilkan 100 dari ' +
            invoices.length +
            ' faktur</div>'
          : '') +
        '</div>'
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // § 2  TAX INVOICE EMAIL
  // ══════════════════════════════════════════════════════════════════════════
  function openTaxInvoiceEmail() {
    var invoices = getVatInvoices();
    var sent = invoices.filter(function (i) {
      return i.emailSent;
    });
    var pending = invoices.filter(function (i) {
      return !i.emailSent;
    });
    var emailLog = (db().taxEmailLog || []).slice().reverse();

    var pendingRows =
      pending
        .slice(0, 50)
        .map(function (inv) {
          var cust = (db().customers || []).find(function (c) {
            return c.id === (inv.orderId || inv.id);
          });
          var email = cust ? cust.email || '—' : '—';
          return (
            '<tr>' +
            '<td class="td-p" style="font-size:11px;white-space:nowrap">' +
            esc(inv.date) +
            '</td>' +
            '<td class="td-p" style="font-size:11px">' +
            esc(inv.id) +
            '</td>' +
            '<td class="td-p">' +
            esc(inv.customerName) +
            '</td>' +
            '<td class="td-p" style="font-size:11px;color:var(--muted)">' +
            esc(email) +
            '</td>' +
            '<td class="td-p" style="text-align:right">' +
            money(inv.ppn) +
            '</td>' +
            '<td class="td-p" style="text-align:center">' +
            '<button class="btn" style="font-size:11px;padding:4px 10px" data-action="sendTaxEmail" data-id="' +
            esc(inv.orderId) +
            '" data-invid="' +
            esc(inv.id) +
            '" data-cust="' +
            esc(inv.customerName) +
            '" data-ppn="' +
            inv.ppn +
            '">Kirim</button>' +
            '</td></tr>'
          );
        })
        .join('') ||
      '<tr><td colspan="6" style="text-align:center;padding:16px;color:var(--muted)">Semua faktur sudah dikirimkan 🎉</td></tr>';

    var logRows =
      emailLog
        .slice(0, 30)
        .map(function (l) {
          return (
            '<tr>' +
            '<td class="td-p" style="font-size:11px">' +
            esc(l.sentAt || '') +
            '</td>' +
            '<td class="td-p" style="font-size:11px">' +
            esc(l.invoiceId) +
            '</td>' +
            '<td class="td-p">' +
            esc(l.customerName) +
            '</td>' +
            '<td class="td-p" style="font-size:11px">' +
            esc(l.to) +
            '</td>' +
            '<td class="td-p" style="text-align:center"><span style="font-size:10px;padding:2px 6px;border-radius:4px;background:#DCFCE7;color:#166534;font-weight:700">Terkirim</span></td>' +
            '</tr>'
          );
        })
        .join('') ||
      '<tr><td colspan="5" style="text-align:center;padding:12px;color:var(--muted)">Belum ada email dikirim.</td></tr>';

    injectView(
      '<div class="sec-hdr"><div><h1>Tax Invoice Email</h1><p>Kirim faktur pajak via email ke pelanggan</p></div>' +
        '<button class="btn" data-action="sendAllTaxEmail">Kirim Semua</button></div>' +
        '<div class="stat-row" style="grid-template-columns:repeat(3,1fr);margin-bottom:16px">' +
        '<div class="card stat-card"><div class="stat-label">Total Faktur</div><div class="stat-val">' +
        invoices.length +
        '</div></div>' +
        '<div class="card stat-card"><div class="stat-label">Sudah Dikirim</div><div class="stat-val" style="color:#15803D">' +
        sent.length +
        '</div></div>' +
        '<div class="card stat-card"><div class="stat-label">Belum Dikirim</div><div class="stat-val" style="color:#DC2626">' +
        pending.length +
        '</div></div>' +
        '</div>' +
        '<div class="card" style="margin-bottom:16px">' +
        '<div style="font-size:12px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:10px">Antrian Pengiriman (' +
        pending.length +
        ')</div>' +
        '<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse">' +
        '<thead><tr><th style="' +
        TH +
        '">Tanggal</th><th style="' +
        TH +
        '">No. Faktur</th><th style="' +
        TH +
        '">Pelanggan</th>' +
        '<th style="' +
        TH +
        '">Email</th><th style="' +
        TH +
        'text-align:right">PPN</th><th style="' +
        TH +
        '"></th></tr></thead>' +
        '<tbody>' +
        pendingRows +
        '</tbody></table></div></div>' +
        '<div class="card">' +
        '<div style="font-size:12px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:10px">Log Pengiriman</div>' +
        '<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse">' +
        '<thead><tr><th style="' +
        TH +
        '">Waktu</th><th style="' +
        TH +
        '">Faktur</th><th style="' +
        TH +
        '">Pelanggan</th>' +
        '<th style="' +
        TH +
        '">Email Tujuan</th><th style="' +
        TH +
        'text-align:center">Status</th></tr></thead>' +
        '<tbody>' +
        logRows +
        '</tbody></table></div></div>'
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // § 3  e-FAKTUR LEGACY (format lama CSV/txt)
  // ══════════════════════════════════════════════════════════════════════════
  function openEFakturLegacy() {
    var invoices = getVatInvoices();
    var cfg = (db().settings && db().settings.efakturCfg) || {};

    // Periode filter
    var months = {};
    invoices.forEach(function (i) {
      if (i.date) months[i.date.slice(0, 7)] = true;
    });
    var monthList = Object.keys(months).sort().reverse();
    var monthOpts = monthList
      .map(function (m) {
        return '<option value="' + m + '">' + m + '</option>';
      })
      .join('');

    var rows =
      invoices
        .slice(0, 100)
        .map(function (inv, idx) {
          return (
            '<tr>' +
            '<td class="td-p" style="font-size:11px;text-align:center">' +
            (idx + 1) +
            '</td>' +
            '<td class="td-p" style="font-size:11px">' +
            esc(inv.date.replace(/-/g, '')) +
            '</td>' +
            '<td class="td-p" style="font-size:11px">' +
            esc(inv.efakturNo || '0') +
            '</td>' +
            '<td class="td-p">' +
            esc(inv.customerName) +
            '</td>' +
            '<td class="td-p" style="font-size:11px">' +
            esc(inv.npwp.replace(/\D/g, '') || '000000000000000') +
            '</td>' +
            '<td class="td-p" style="text-align:right">' +
            inv.dpp +
            '</td>' +
            '<td class="td-p" style="text-align:right;color:#2563EB">' +
            inv.ppn +
            '</td>' +
            '</tr>'
          );
        })
        .join('') ||
      '<tr><td colspan="7" style="text-align:center;padding:24px;color:var(--muted)">Tidak ada faktur.</td></tr>';

    injectView(
      '<div class="sec-hdr"><div><h1>e-Faktur Legacy</h1><p>Format lama e-Faktur (CSV) — kompatibel aplikasi versi sebelum 4.x</p></div>' +
        '<div style="display:flex;gap:8px">' +
        (monthOpts
          ? '<select class="form-select" id="legacy-month" style="font-size:13px">' +
            monthOpts +
            '</select>'
          : '') +
        '<button class="btn" data-action="exportLegacyCSV">Export CSV Legacy</button></div></div>' +
        '<div class="card" style="background:#FEF9C3;border:1px solid #FDE047;padding:12px 18px;margin-bottom:16px;font-size:12px">' +
        '⚠️ <strong>Format Legacy:</strong> Gunakan format ini hanya jika aplikasi e-Faktur Anda masih versi lama (sebelum 4.0). ' +
        'Untuk versi terbaru, gunakan menu <strong>e-Faktur CTAS</strong>.' +
        '</div>' +
        '<div class="card">' +
        '<div style="font-size:12px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:10px">Preview Data Faktur</div>' +
        '<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse">' +
        '<thead><tr><th style="' +
        TH +
        '">#</th><th style="' +
        TH +
        '">Tgl (YYYYMMDD)</th>' +
        '<th style="' +
        TH +
        '">No. Faktur</th><th style="' +
        TH +
        '">Nama Pembeli</th>' +
        '<th style="' +
        TH +
        '">NPWP Pembeli</th><th style="' +
        TH +
        'text-align:right">DPP</th>' +
        '<th style="' +
        TH +
        'text-align:right">PPN</th></tr></thead>' +
        '<tbody>' +
        rows +
        '</tbody></table></div>' +
        (invoices.length > 100
          ? '<div style="text-align:center;padding:8px;font-size:11px;color:var(--muted)">Menampilkan 100 dari ' +
            invoices.length +
            ' baris</div>'
          : '') +
        '</div>'
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // HELPERS
  // ══════════════════════════════════════════════════════════════════════════
  function exportCTAScsv() {
    var invoices = getVatInvoices();
    var cfg = (db().settings && db().settings.efakturCfg) || {};
    var header =
      'FK,KD_JENIS_TRANSAKSI,FG_PENGGANTI,NOMOR_FAKTUR,MASA_PAJAK,TAHUN_PAJAK,TANGGAL_FAKTUR,NPWP,NAMA,ALAMAT_LENGKAP,JUMLAH_DPP,JUMLAH_PPN,JUMLAH_PPNBM,ID_KETERANGAN_TAMBAHAN,FG_UANG_MUKA,UANG_MUKA_DPP,UANG_MUKA_PPN,UANG_MUKA_PPNBM,REFERENSI';
    var lines = [header];
    invoices.forEach(function (inv) {
      var d = inv.date || today();
      var masa = d.slice(5, 7);
      var tahun = d.slice(0, 4);
      var tgl = d.replace(/-/g, '');
      lines.push(
        [
          'FK',
          '01',
          '0',
          inv.efakturNo || '000.' + tahun + '-' + String(lines.length).padStart(8, '0'),
          masa,
          tahun,
          tgl,
          inv.npwp.replace(/\D/g, '') || '000000000000000',
          '"' + inv.customerName.replace(/"/g, '""') + '"',
          '""',
          inv.dpp,
          inv.ppn,
          0,
          '',
          '0',
          0,
          0,
          0,
          '"' + inv.id + '"',
        ].join(',')
      );
    });
    downloadCSV(lines.join('\r\n'), 'efaktur_ctas_' + today().replace(/-/g, '') + '.csv');
  }

  function exportLegacyCSV() {
    var invoices = getVatInvoices();
    var header = 'NOMOR_FAKTUR,TANGGAL,NPWP_PEMBELI,NAMA_PEMBELI,DPP,PPN';
    var lines = [header];
    invoices.forEach(function (inv, idx) {
      lines.push(
        [
          inv.efakturNo || '0' + String(idx + 1).padStart(12, '0'),
          inv.date.replace(/-/g, ''),
          inv.npwp.replace(/\D/g, '') || '000000000000000',
          '"' + inv.customerName.replace(/"/g, '""') + '"',
          inv.dpp,
          inv.ppn,
        ].join(',')
      );
    });
    downloadCSV(lines.join('\r\n'), 'efaktur_legacy_' + today().replace(/-/g, '') + '.csv');
  }

  function downloadCSV(content, filename) {
    var blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast('File ' + filename + ' diunduh', 'success');
  }

  function cfgEfakturModal() {
    if (!db().settings) window.DB.settings = {};
    var cfg = db().settings.efakturCfg || {};
    modal(
      'Konfigurasi e-Faktur',
      '<div class="form-group"><label class="form-label">NPWP Perusahaan (15 digit)</label><input class="form-input" id="ef-npwp" value="' +
        esc(cfg.npwp || '') +
        '" placeholder="00.000.000.0-000.000" maxlength="20"></div>' +
        '<div class="form-group"><label class="form-label">Nama Perusahaan PKP</label><input class="form-input" id="ef-name" value="' +
        esc(cfg.companyName || '') +
        '" placeholder="PT. ..."></div>' +
        '<div class="form-group"><label class="form-label">KPP Terdaftar</label><input class="form-input" id="ef-kpp" value="' +
        esc(cfg.kpp || '') +
        '" placeholder="KPP Pratama ..."></div>',
      '<button class="btn" id="saveEfakturCfg">Simpan</button><button class="btn-ghost" data-action="closeModal">Batal</button>'
    );
    setTimeout(function () {
      var btn = document.getElementById('saveEfakturCfg');
      if (!btn) return;
      btn.addEventListener('click', function () {
        db().settings.efakturCfg = {
          npwp: document.getElementById('ef-npwp').value.trim(),
          companyName: document.getElementById('ef-name').value.trim(),
          kpp: document.getElementById('ef-kpp').value.trim(),
        };
        save();
        closeM();
        toast('Konfigurasi e-Faktur disimpan', 'success');
      });
    }, 60);
  }

  function sendTaxEmailModal(orderId, invoiceId, custName, ppnAmount) {
    var customers = db().customers || [];
    var cust = customers.find(function (c) {
      return c.id === orderId;
    });
    var defEmail = cust ? cust.email || '' : '';
    modal(
      'Kirim Tax Invoice',
      '<div class="form-group"><label class="form-label">Faktur</label><input class="form-input" value="' +
        esc(invoiceId) +
        '" disabled></div>' +
        '<div class="form-group"><label class="form-label">Pelanggan</label><input class="form-input" value="' +
        esc(custName) +
        '" disabled></div>' +
        '<div class="form-group"><label class="form-label">Nilai PPN</label><input class="form-input" value="' +
        money(ppnAmount) +
        '" disabled></div>' +
        '<div class="form-group"><label class="form-label">Email Tujuan</label><input class="form-input" id="tax-email" value="' +
        esc(defEmail) +
        '" type="email" placeholder="email@domain.com"></div>' +
        '<div class="form-group"><label class="form-label">Catatan (opsional)</label><input class="form-input" id="tax-note" placeholder="Terlampir faktur pajak ..."></div>',
      '<button class="btn" id="doSendTaxEmail">Kirim</button><button class="btn-ghost" data-action="closeModal">Batal</button>'
    );
    setTimeout(function () {
      var btn = document.getElementById('doSendTaxEmail');
      if (!btn) return;
      btn.addEventListener('click', function () {
        var email = document.getElementById('tax-email').value.trim();
        if (!email || !email.includes('@')) {
          toast('Email tidak valid', 'warning');
          return;
        }
        if (!window.DB.taxEmailLog) window.DB.taxEmailLog = [];
        window.DB.taxEmailLog.push({
          invoiceId: invoiceId,
          customerName: custName,
          to: email,
          sentAt: new Date().toISOString().slice(0, 19).replace('T', ' '),
          note: document.getElementById('tax-note').value.trim(),
        });
        // Mark SO or invoice as email sent
        var sos = db().salesOrders || [];
        var so = sos.find(function (o) {
          return o.id === orderId;
        });
        if (so) so.emailSent = true;
        var sis = db().salesInvoices || [];
        var si = sis.find(function (i) {
          return i.orderId === orderId;
        });
        if (si) si.emailSent = true;
        save();
        closeM();
        toast('Tax invoice dikirim ke ' + email, 'success');
        openTaxInvoiceEmail();
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

    switch (action) {
      case 'exportCTAS':
        exportCTAScsv();
        break;
      case 'exportLegacyCSV':
        exportLegacyCSV();
        break;
      case 'cfgEfaktur':
        cfgEfakturModal();
        break;
      case 'sendTaxEmail': {
        sendTaxEmailModal(
          btn.dataset.id,
          btn.dataset.invid,
          btn.dataset.cust,
          parseFloat(btn.dataset.ppn) || 0
        );
        break;
      }
      case 'sendAllTaxEmail': {
        toast('Fitur kirim massal memerlukan konfigurasi SMTP server', 'warning');
        break;
      }
      case 'setEfakturNo': {
        var orderId = btn.dataset.id;
        modal(
          'Set Nomor e-Faktur',
          '<div class="form-group"><label class="form-label">No. e-Faktur (13 digit)</label>' +
            '<input class="form-input" id="efno-input" placeholder="000.00-00.00000000" maxlength="20"></div>',
          '<button class="btn" id="saveEFNo">Simpan</button><button class="btn-ghost" data-action="closeModal">Batal</button>'
        );
        setTimeout(function () {
          var sb = document.getElementById('saveEFNo');
          if (!sb) return;
          sb.addEventListener('click', function () {
            var val = document.getElementById('efno-input').value.trim();
            if (!val) {
              toast('No. e-Faktur wajib diisi', 'warning');
              return;
            }
            var so = (db().salesOrders || []).find(function (o) {
              return o.id === orderId;
            });
            if (so) so.efakturNo = val;
            var si = (db().salesInvoices || []).find(function (i) {
              return i.orderId === orderId;
            });
            if (si) si.efakturNo = val;
            save();
            closeM();
            toast('No. e-Faktur disimpan', 'success');
            openEFakturCTAS();
          });
        }, 60);
        break;
      }
    }
  });

  window._taxExtras = {
    openEFakturCTAS: openEFakturCTAS,
    openTaxInvoiceEmail: openTaxInvoiceEmail,
    openEFakturLegacy: openEFakturLegacy,
  };
  console.log('[TaxExtras] Tax extras ready');
})();
