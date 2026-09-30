// ═══════════════════════════════════════════════════════════════════════════════
// KELOLA ERP (DEMO) — Budget & GL Extras  (budget-gl-extras.js)
// Implements: Budget, Budget Monitor, Budget Transfer, Account History,
//             Expense Accrual, Employee Payroll
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

  function accountOptions() {
    return (db().accountsChart || [])
      .map(function (a) {
        var code = a.no || a.code || '';
        return (
          '<option value="' + esc(code) + '">' + esc(code) + ' — ' + esc(a.name) + '</option>'
        );
      })
      .join('');
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
  // § 1  BUDGET
  // ══════════════════════════════════════════════════════════════════════════════
  function openBudget() {
    var budgets = ensureArr('budgets');
    var rows = budgets
      .slice()
      .reverse()
      .map(function (b) {
        return (
          '<tr>' +
          '<td class="td-p" style="font-size:11px;font-weight:700">' +
          esc(b.id) +
          '</td>' +
          '<td class="td-p">' +
          esc(b.accountCode) +
          ' — ' +
          esc(b.accountName) +
          '</td>' +
          '<td class="td-p">' +
          esc(b.period) +
          '</td>' +
          '<td class="td-p" style="text-align:right;font-weight:700">' +
          money(b.amount) +
          '</td>' +
          '<td class="td-p" style="font-size:11px;color:var(--muted)">' +
          esc(b.notes || '—') +
          '</td>' +
          '<td class="td-p">' +
          '<button class="action-ghost" data-action="editBudget" data-id="' +
          esc(b.id) +
          '">Edit</button> ' +
          '<button class="action-ghost" data-action="delBudget" data-id="' +
          esc(b.id) +
          '" style="color:#EF4444">Hapus</button>' +
          '</td>' +
          '</tr>'
        );
      })
      .join('');

    var total = budgets.reduce(function (s, b) {
      return s + (b.amount || 0);
    }, 0);

    var header =
      typeof window.secHdr === 'function'
        ? window.secHdr(
            'Anggaran (Budget)',
            'Penyusunan anggaran per akun & periode',
            'Tambah Budget',
            'addBudget'
          )
        : '<h1>Budget</h1>';

    var stats =
      typeof window.statRow === 'function'
        ? window.statRow([
            { label: 'Total Budget', value: budgets.length + ' item', sub: 'Anggaran terdaftar' },
            { label: 'Total Nilai', value: money(total), sub: 'Seluruh periode', color: '#3B82F6' },
          ])
        : '';

    var html =
      header +
      stats +
      '<div class="card"><div class="table-wrap"><table style="width:100%">' +
      '<thead><tr><th>ID</th><th>Akun</th><th>Periode</th><th style="text-align:right">Anggaran</th><th>Catatan</th><th>Aksi</th></tr></thead>' +
      '<tbody>' +
      (rows ||
        '<tr><td colspan="6" class="td-empty">Belum ada anggaran. Klik Tambah Budget.</td></tr>') +
      '</tbody>' +
      '</table></div></div>';

    injectView('finance', html);
  }

  function addBudgetModal(existing) {
    var b = existing || {};
    var body =
      '<div style="display:flex;flex-direction:column;gap:12px">' +
      '<label style="font-size:12px;font-weight:700">Akun<select id="bg-account" class="form-select" style="width:100%;margin-top:4px">' +
      accountOptions() +
      '</select></label>' +
      '<label style="font-size:12px;font-weight:700">Periode (YYYY-MM)<input id="bg-period" class="form-input" type="month" value="' +
      esc(b.period || thisMonth()) +
      '" style="width:100%;margin-top:4px"></label>' +
      '<label style="font-size:12px;font-weight:700">Jumlah Anggaran<input id="bg-amount" class="form-input" type="number" min="0" value="' +
      (b.amount || 0) +
      '" style="width:100%;margin-top:4px"></label>' +
      '<label style="font-size:12px;font-weight:700">Catatan<input id="bg-notes" class="form-input" value="' +
      esc(b.notes || '') +
      '" style="width:100%;margin-top:4px"></label>' +
      '</div>';

    modal(
      existing ? 'Edit Budget' : 'Tambah Budget',
      body,
      '<button class="btn-ghost" data-action="closeModal">Batal</button>' +
        '<button class="btn" id="bg-save">Simpan</button>',
      false
    );

    if (b.accountCode) {
      setTimeout(function () {
        var sel = document.getElementById('bg-account');
        if (sel) sel.value = b.accountCode;
      }, 50);
    }

    setTimeout(function () {
      var btn = document.getElementById('bg-save');
      if (btn)
        btn.addEventListener('click', function () {
          var acSel = document.getElementById('bg-account');
          var code = acSel.value;
          var acOpt = acSel.options[acSel.selectedIndex];
          var name = acOpt ? acOpt.textContent.split(' — ')[1] || '' : '';
          var period = document.getElementById('bg-period').value;
          var amount = parseFloat(document.getElementById('bg-amount').value) || 0;
          var notes = document.getElementById('bg-notes').value.trim();

          if (!code || !period) {
            toast('Akun dan periode wajib diisi', 'warning');
            return;
          }

          var arr = ensureArr('budgets');
          if (existing) {
            var idx = arr.findIndex(function (x) {
              return x.id === existing.id;
            });
            if (idx >= 0) {
              arr[idx] = Object.assign(arr[idx], {
                accountCode: code,
                accountName: name.trim(),
                period: period,
                amount: amount,
                notes: notes,
              });
            }
          } else {
            arr.push({
              id: uid('BDG'),
              accountCode: code,
              accountName: name.trim(),
              period: period,
              amount: amount,
              notes: notes,
              createdAt: today(),
            });
          }
          save();
          closeM();
          toast(existing ? 'Budget diperbarui' : 'Budget ditambahkan', 'success');
          openBudget();
        });
    }, 60);
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // § 2  BUDGET VS ACTUAL REPORT
  // ══════════════════════════════════════════════════════════════════════════════

  function calcActualForAccount(accountCode, periodFrom, periodTo) {
    var journals = db().journals || [];
    var total = 0;
    journals.forEach(function (j) {
      if (!j.date) return;
      var jPeriod = j.date.substring(0, 7);
      if (periodFrom && jPeriod < periodFrom) return;
      if (periodTo && jPeriod > periodTo) return;
      (j.lines || []).forEach(function (l) {
        if ((l.accountNo || '') === accountCode) {
          total += (Number(l.debit) || 0) - (Number(l.credit) || 0);
        }
      });
    });
    return total;
  }

  function renderBudgetVsActual(periodFrom, periodTo) {
    var budgets = ensureArr('budgets');

    var filtered = budgets.filter(function (b) {
      if (periodFrom && b.period < periodFrom) return false;
      if (periodTo && b.period > periodTo) return false;
      return true;
    });

    var grouped = {};
    filtered.forEach(function (b) {
      var key = b.accountCode;
      if (!grouped[key]) grouped[key] = { code: b.accountCode, name: b.accountName, budgetTotal: 0, items: [] };
      grouped[key].budgetTotal += b.amount || 0;
      grouped[key].items.push(b);
    });

    var totalBudget = 0, totalActual = 0;
    var rows = Object.keys(grouped).map(function (key) {
      var g = grouped[key];
      var actual = Math.abs(calcActualForAccount(g.code, periodFrom, periodTo));
      var variance = g.budgetTotal - actual;
      var pct = g.budgetTotal > 0 ? Math.round((actual / g.budgetTotal) * 100) : 0;
      var color = pct > 100 ? '#EF4444' : pct > 80 ? '#F59E0B' : '#10B981';
      var varColor = variance < 0 ? '#EF4444' : '#10B981';
      totalBudget += g.budgetTotal;
      totalActual += actual;

      var periodList = g.items.map(function (b) { return b.period; }).join(', ');

      return (
        '<tr>' +
        '<td class="td-p" style="font-weight:600">' + esc(g.code) + '</td>' +
        '<td class="td-p">' + esc(g.name) + '</td>' +
        '<td class="td-p" style="font-size:11px;color:var(--muted)">' + esc(periodList) + '</td>' +
        '<td class="td-p" style="text-align:right;font-weight:700">' + money(g.budgetTotal) + '</td>' +
        '<td class="td-p" style="text-align:right;font-weight:700">' + money(actual) + '</td>' +
        '<td class="td-p" style="text-align:right;font-weight:700;color:' + varColor + '">' + money(variance) + '</td>' +
        '<td class="td-p"><div style="display:flex;align-items:center;gap:8px">' +
        '<div style="flex:1;height:8px;background:#f1f5f9;border-radius:4px;overflow:hidden">' +
        '<div style="height:100%;width:' + Math.min(pct, 100) + '%;background:' + color + ';border-radius:4px"></div></div>' +
        '<span style="font-size:11px;font-weight:700;color:' + color + '">' + pct + '%</span></div></td>' +
        '</tr>'
      );
    }).join('');

    var totalVariance = totalBudget - totalActual;
    var totalPct = totalBudget > 0 ? Math.round((totalActual / totalBudget) * 100) : 0;
    var totalColor = totalVariance < 0 ? '#EF4444' : '#10B981';

    var footer = rows ?
      '<tfoot><tr style="border-top:2px solid var(--border);background:var(--bg)">' +
      '<td class="td-p" colspan="3" style="font-weight:700">TOTAL</td>' +
      '<td class="td-p" style="text-align:right;font-weight:700">' + money(totalBudget) + '</td>' +
      '<td class="td-p" style="text-align:right;font-weight:700">' + money(totalActual) + '</td>' +
      '<td class="td-p" style="text-align:right;font-weight:700;color:' + totalColor + '">' + money(totalVariance) + '</td>' +
      '<td class="td-p" style="font-weight:700;font-size:11px">' + totalPct + '%</td>' +
      '</tr></tfoot>' : '';

    return { rows: rows, footer: footer, totalBudget: totalBudget, totalActual: totalActual, count: filtered.length };
  }

  function openBudgetMonitor() {
    var header =
      typeof window.secHdr === 'function'
        ? window.secHdr('Budget vs Actual', 'Laporan perbandingan anggaran vs realisasi GL')
        : '<h1>Budget vs Actual</h1>';

    var result = renderBudgetVsActual('', '');

    var overBudget = 0;
    ensureArr('budgets').forEach(function (b) {
      var actual = Math.abs(calcActualForAccount(b.accountCode, b.period, b.period));
      if (actual > b.amount && b.amount > 0) overBudget++;
    });

    var stats =
      typeof window.statRow === 'function'
        ? window.statRow([
            { label: 'Total Budget', value: money(result.totalBudget), sub: result.count + ' item anggaran' },
            { label: 'Total Realisasi', value: money(result.totalActual), sub: 'Dari jurnal GL', color: '#3B82F6' },
            { label: 'Over Budget', value: String(overBudget), sub: 'Akun melebihi anggaran', color: overBudget > 0 ? '#EF4444' : '#10B981' },
          ])
        : '';

    var filterBar =
      '<div class="card" style="margin-bottom:12px">' +
      '<div style="display:flex;gap:10px;flex-wrap:wrap;align-items:flex-end">' +
      '<div><label style="font-size:11px;color:var(--muted);display:block;margin-bottom:3px">Periode Dari</label>' +
      '<input class="form-input" id="bva-from" type="month" style="width:160px"></div>' +
      '<div><label style="font-size:11px;color:var(--muted);display:block;margin-bottom:3px">Periode Sampai</label>' +
      '<input class="form-input" id="bva-to" type="month" style="width:160px"></div>' +
      '<button class="btn" data-action="bvaFilter" style="font-size:12px">Filter</button>' +
      '</div></div>';

    var html =
      header + stats + filterBar +
      '<div class="card"><div id="bva-table" class="table-wrap"><table style="width:100%">' +
      '<thead><tr><th>Kode</th><th>Nama Akun</th><th>Periode</th><th style="text-align:right">Anggaran</th><th style="text-align:right">Realisasi</th><th style="text-align:right">Varians</th><th>Pencapaian</th></tr></thead>' +
      '<tbody>' +
      (result.rows || '<tr><td colspan="7" class="td-empty">Belum ada data budget. Buat budget terlebih dahulu.</td></tr>') +
      '</tbody>' + result.footer +
      '</table></div></div>';

    injectView('finance', html);
  }

  function filterBudgetVsActual() {
    var from = document.getElementById('bva-from');
    var to = document.getElementById('bva-to');
    var periodFrom = from ? from.value : '';
    var periodTo = to ? to.value : '';
    var result = renderBudgetVsActual(periodFrom, periodTo);

    var el = document.getElementById('bva-table');
    if (el) {
      el.innerHTML =
        '<table style="width:100%">' +
        '<thead><tr><th>Kode</th><th>Nama Akun</th><th>Periode</th><th style="text-align:right">Anggaran</th><th style="text-align:right">Realisasi</th><th style="text-align:right">Varians</th><th>Pencapaian</th></tr></thead>' +
        '<tbody>' +
        (result.rows || '<tr><td colspan="7" class="td-empty">Tidak ada budget pada periode ini.</td></tr>') +
        '</tbody>' + result.footer +
        '</table>';
    }
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // § 3  BUDGET TRANSFER
  // ══════════════════════════════════════════════════════════════════════════════
  function openBudgetTransfer() {
    var budgets = ensureArr('budgets');
    var transfers = ensureArr('budgetTransfers');

    var transferRows = transfers
      .slice()
      .reverse()
      .slice(0, 20)
      .map(function (t) {
        return (
          '<tr>' +
          '<td class="td-p" style="font-size:11px">' +
          esc(t.date) +
          '</td>' +
          '<td class="td-p">' +
          esc(t.fromAccount) +
          '</td>' +
          '<td class="td-p">' +
          esc(t.toAccount) +
          '</td>' +
          '<td class="td-p" style="text-align:right;font-weight:700">' +
          money(t.amount) +
          '</td>' +
          '<td class="td-p" style="font-size:11px;color:var(--muted)">' +
          esc(t.notes || '—') +
          '</td>' +
          '</tr>'
        );
      })
      .join('');

    var header =
      typeof window.secHdr === 'function'
        ? window.secHdr(
            'Transfer Budget',
            'Pemindahan anggaran antar akun',
            'Transfer Baru',
            'newBudgetTransfer'
          )
        : '<h1>Budget Transfer</h1>';

    var html =
      header +
      '<div class="card"><div style="font-size:14px;font-weight:700;margin-bottom:10px">Riwayat Transfer</div>' +
      '<div class="table-wrap"><table style="width:100%">' +
      '<thead><tr><th>Tanggal</th><th>Dari Akun</th><th>Ke Akun</th><th style="text-align:right">Jumlah</th><th>Catatan</th></tr></thead>' +
      '<tbody>' +
      (transferRows ||
        '<tr><td colspan="5" class="td-empty">Belum ada transfer budget.</td></tr>') +
      '</tbody>' +
      '</table></div></div>';

    injectView('finance', html);
  }

  function budgetTransferModal() {
    var budgets = ensureArr('budgets');
    var opts = budgets
      .map(function (b) {
        return (
          '<option value="' +
          esc(b.id) +
          '">' +
          esc(b.accountCode) +
          ' — ' +
          esc(b.accountName) +
          ' (' +
          esc(b.period) +
          ') — Sisa: ' +
          money(b.amount) +
          '</option>'
        );
      })
      .join('');

    if (budgets.length < 2) {
      toast('Minimal 2 budget diperlukan untuk transfer', 'warning');
      return;
    }

    var body =
      '<div style="display:flex;flex-direction:column;gap:12px">' +
      '<label style="font-size:12px;font-weight:700">Dari Budget<select id="bt-from" class="form-select" style="width:100%;margin-top:4px">' +
      opts +
      '</select></label>' +
      '<label style="font-size:12px;font-weight:700">Ke Budget<select id="bt-to" class="form-select" style="width:100%;margin-top:4px">' +
      opts +
      '</select></label>' +
      '<label style="font-size:12px;font-weight:700">Jumlah<input id="bt-amount" class="form-input" type="number" min="0" value="0" style="width:100%;margin-top:4px"></label>' +
      '<label style="font-size:12px;font-weight:700">Catatan<input id="bt-notes" class="form-input" style="width:100%;margin-top:4px"></label>' +
      '</div>';

    modal(
      'Transfer Budget',
      body,
      '<button class="btn-ghost" data-action="closeModal">Batal</button>' +
        '<button class="btn" id="bt-save">Transfer</button>',
      false
    );

    setTimeout(function () {
      document.getElementById('bt-save').addEventListener('click', function () {
        var fromId = document.getElementById('bt-from').value;
        var toId = document.getElementById('bt-to').value;
        var amount = parseFloat(document.getElementById('bt-amount').value) || 0;
        var notes = document.getElementById('bt-notes').value.trim();

        if (fromId === toId) {
          toast('Akun asal dan tujuan harus berbeda', 'warning');
          return;
        }
        if (amount <= 0) {
          toast('Jumlah harus lebih dari 0', 'warning');
          return;
        }

        var budgets = ensureArr('budgets');
        var from = budgets.find(function (b) {
          return b.id === fromId;
        });
        var to = budgets.find(function (b) {
          return b.id === toId;
        });
        if (!from || !to) {
          toast('Budget tidak ditemukan', 'danger');
          return;
        }
        if (from.amount < amount) {
          toast('Saldo budget asal tidak cukup', 'warning');
          return;
        }

        from.amount -= amount;
        to.amount += amount;

        ensureArr('budgetTransfers').push({
          id: uid('BTR'),
          fromBudgetId: fromId,
          fromAccount: from.accountCode + ' — ' + from.accountName,
          toBudgetId: toId,
          toAccount: to.accountCode + ' — ' + to.accountName,
          amount: amount,
          notes: notes,
          date: today(),
        });

        save();
        closeM();
        toast('Transfer budget berhasil', 'success');
        openBudgetTransfer();
      });
    }, 60);
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // § 4  ACCOUNT HISTORY
  // ══════════════════════════════════════════════════════════════════════════════
  function openAccountHistory() {
    var accounts = db().accountsChart || [];

    var header =
      typeof window.secHdr === 'function'
        ? window.secHdr('Riwayat Akun', 'Riwayat transaksi per akun buku besar')
        : '<h1>Account History</h1>';

    var acOptions = accounts
      .map(function (a) {
        return (
          '<option value="' + esc(a.no || a.code || '') + '">' + esc(a.no || a.code || '') + ' — ' + esc(a.name) + '</option>'
        );
      })
      .join('');

    var html =
      header +
      '<div class="card" style="margin-bottom:14px"><div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">' +
      '<label style="font-size:12px;font-weight:700">Pilih Akun</label>' +
      '<select id="ah-account" class="form-select" style="min-width:280px">' +
      acOptions +
      '</select>' +
      '<input id="ah-from" type="date" class="form-input" style="width:140px" placeholder="Dari">' +
      '<input id="ah-to" type="date" class="form-input" style="width:140px" placeholder="s/d">' +
      '<button class="btn" data-action="ahFilter" style="font-size:12px">Tampilkan</button>' +
      '</div></div>' +
      '<div id="ah-result"></div>';

    injectView('finance', html);
  }

  function filterAccountHistory() {
    var code = document.getElementById('ah-account').value;
    var fromDate = document.getElementById('ah-from').value;
    var toDate = document.getElementById('ah-to').value;
    var journals = db().journals || [];
    var result = document.getElementById('ah-result');
    if (!result) return;

    var filtered = journals.filter(function (j) {
      var lines = j.lines || j.entries || [];
      if (!lines.length) return false;
      var hasAccount = lines.some(function (l) {
        return (l.accountNo || l.accountCode || '') === code;
      });
      if (!hasAccount) return false;
      if (fromDate && j.date < fromDate) return false;
      if (toDate && j.date > toDate) return false;
      return true;
    });

    var runningBalance = 0;
    var rows = filtered
      .sort(function (a, b) {
        return (a.date || '').localeCompare(b.date || '');
      })
      .map(function (j) {
        var lines = (j.lines || j.entries || []).filter(function (l) {
          return (l.accountNo || l.accountCode || '') === code;
        });
        return lines
          .map(function (l) {
            var d = Number(l.debit) || 0;
            var c = Number(l.credit) || 0;
            runningBalance += d - c;
            return (
              '<tr>' +
              '<td class="td-p" style="font-size:11px">' +
              esc(j.date) +
              '</td>' +
              '<td class="td-p" style="font-size:11px;font-weight:700;color:var(--primary)">' +
              esc(j.number || j.id || '—') +
              '</td>' +
              '<td class="td-p" style="font-size:12px">' +
              esc(l.memo || j.memo || j.description || '—') +
              '</td>' +
              '<td class="td-p" style="text-align:right">' +
              (d ? money(d) : '—') +
              '</td>' +
              '<td class="td-p" style="text-align:right">' +
              (c ? money(c) : '—') +
              '</td>' +
              '<td class="td-p" style="text-align:right;font-weight:700">' +
              money(runningBalance) +
              '</td>' +
              '</tr>'
            );
          })
          .join('');
      })
      .join('');

    var totalDebit = 0, totalCredit = 0;
    filtered.forEach(function (j) {
      (j.lines || j.entries || []).forEach(function (l) {
        if ((l.accountNo || l.accountCode || '') === code) {
          totalDebit += Number(l.debit) || 0;
          totalCredit += Number(l.credit) || 0;
        }
      });
    });

    result.innerHTML =
      '<div class="card"><div style="display:flex;justify-content:space-between;margin-bottom:10px">' +
      '<div style="font-size:14px;font-weight:700">Riwayat Transaksi (' +
      filtered.length +
      ' jurnal)</div>' +
      '<div style="font-size:12px;color:var(--muted)">Saldo: <strong>' +
      money(runningBalance) +
      '</strong></div></div>' +
      '<div class="table-wrap"><table style="width:100%">' +
      '<thead><tr><th>Tanggal</th><th>No. Jurnal</th><th>Keterangan</th><th style="text-align:right">Debit</th><th style="text-align:right">Kredit</th><th style="text-align:right">Saldo</th></tr></thead>' +
      '<tbody>' +
      (rows ||
        '<tr><td colspan="6" class="td-empty">Tidak ada transaksi untuk akun ini.</td></tr>') +
      '</tbody>' +
      '<tfoot><tr style="font-weight:700;border-top:2px solid var(--border)"><td colspan="3">Total</td><td style="text-align:right">' +
      money(totalDebit) +
      '</td><td style="text-align:right">' +
      money(totalCredit) +
      '</td><td style="text-align:right">' +
      money(runningBalance) +
      '</td></tr></tfoot>' +
      '</table></div></div>';
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // § 5  EXPENSE ACCRUAL
  // ══════════════════════════════════════════════════════════════════════════════
  function openExpenseAccrual() {
    var accruals = ensureArr('expenseAccruals');

    var rows = accruals
      .slice()
      .reverse()
      .map(function (a) {
        var statusBadge =
          a.status === 'Posted'
            ? '<span class="badge" style="background:#DBEAFE;color:#1D4ED8">Diposting</span>'
            : '<span class="badge" style="background:#FEF3C7;color:#92400E">Draft</span>';
        return (
          '<tr>' +
          '<td class="td-p" style="font-size:11px;font-weight:700">' +
          esc(a.id) +
          '</td>' +
          '<td class="td-p" style="font-size:11px">' +
          esc(a.date) +
          '</td>' +
          '<td class="td-p">' +
          esc(a.accountCode) +
          ' — ' +
          esc(a.accountName) +
          '</td>' +
          '<td class="td-p">' +
          esc(a.description) +
          '</td>' +
          '<td class="td-p" style="text-align:right;font-weight:700">' +
          money(a.amount) +
          '</td>' +
          '<td class="td-p">' +
          statusBadge +
          '</td>' +
          '<td class="td-p">' +
          (a.status === 'Draft'
            ? '<button class="action-primary" data-action="postAccrual" data-id="' +
              esc(a.id) +
              '">Posting</button> '
            : '') +
          '<button class="action-ghost" data-action="delAccrual" data-id="' +
          esc(a.id) +
          '" style="color:#EF4444">Hapus</button>' +
          '</td>' +
          '</tr>'
        );
      })
      .join('');

    var header =
      typeof window.secHdr === 'function'
        ? window.secHdr(
            'Biaya Akrual',
            'Pencatatan biaya yang belum dibayar',
            'Tambah Akrual',
            'addAccrual'
          )
        : '<h1>Expense Accrual</h1>';

    var html =
      header +
      '<div class="card"><div class="table-wrap"><table style="width:100%">' +
      '<thead><tr><th>ID</th><th>Tanggal</th><th>Akun Biaya</th><th>Keterangan</th><th style="text-align:right">Jumlah</th><th>Status</th><th>Aksi</th></tr></thead>' +
      '<tbody>' +
      (rows || '<tr><td colspan="7" class="td-empty">Belum ada biaya akrual.</td></tr>') +
      '</tbody>' +
      '</table></div></div>';

    injectView('finance', html);
  }

  function addAccrualModal() {
    var body =
      '<div style="display:flex;flex-direction:column;gap:12px">' +
      '<label style="font-size:12px;font-weight:700">Tanggal<input id="ac-date" class="form-input" type="date" value="' +
      today() +
      '" style="width:100%;margin-top:4px"></label>' +
      '<label style="font-size:12px;font-weight:700">Akun Biaya<select id="ac-account" class="form-select" style="width:100%;margin-top:4px">' +
      accountOptions() +
      '</select></label>' +
      '<label style="font-size:12px;font-weight:700">Keterangan<input id="ac-desc" class="form-input" style="width:100%;margin-top:4px"></label>' +
      '<label style="font-size:12px;font-weight:700">Jumlah<input id="ac-amount" class="form-input" type="number" min="0" value="0" style="width:100%;margin-top:4px"></label>' +
      '<label style="font-size:12px;font-weight:700">Akun Hutang (kredit)<select id="ac-credit" class="form-select" style="width:100%;margin-top:4px">' +
      accountOptions() +
      '</select></label>' +
      '</div>';

    modal(
      'Tambah Biaya Akrual',
      body,
      '<button class="btn-ghost" data-action="closeModal">Batal</button>' +
        '<button class="btn" id="ac-save">Simpan</button>',
      false
    );

    setTimeout(function () {
      document.getElementById('ac-save').addEventListener('click', function () {
        var date = document.getElementById('ac-date').value;
        var acSel = document.getElementById('ac-account');
        var code = acSel.value;
        var name = acSel.options[acSel.selectedIndex]
          ? acSel.options[acSel.selectedIndex].textContent.split(' — ')[1] || ''
          : '';
        var desc = document.getElementById('ac-desc').value.trim();
        var amount = parseFloat(document.getElementById('ac-amount').value) || 0;
        var crSel = document.getElementById('ac-credit');
        var crCode = crSel.value;
        var crName = crSel.options[crSel.selectedIndex]
          ? crSel.options[crSel.selectedIndex].textContent.split(' — ')[1] || ''
          : '';

        if (!desc || amount <= 0) {
          toast('Keterangan dan jumlah wajib diisi', 'warning');
          return;
        }

        ensureArr('expenseAccruals').push({
          id: uid('ACR'),
          date: date,
          accountCode: code,
          accountName: name.trim(),
          creditAccountCode: crCode,
          creditAccountName: crName.trim(),
          description: desc,
          amount: amount,
          status: 'Draft',
          createdAt: today(),
        });
        save();
        closeM();
        toast('Biaya akrual ditambahkan', 'success');
        openExpenseAccrual();
      });
    }, 60);
  }

  function postAccrual(id) {
    var arr = ensureArr('expenseAccruals');
    var ac = arr.find(function (a) {
      return a.id === id;
    });
    if (!ac) return;

    if (window.GL && typeof window.GL.postJournalVoucher === 'function') {
      try {
        window.GL.postJournalVoucher(ac.date, [
          { accountNo: ac.accountCode, debit: ac.amount, memo: 'Akrual: ' + ac.description },
          { accountNo: ac.creditAccountCode, credit: ac.amount, memo: 'Akrual: ' + ac.description },
        ], 'Akrual: ' + ac.description);
      } catch (err) {
        toast('Gagal posting: ' + err.message, 'error');
        return;
      }
    }
    ac.status = 'Posted';
    save();
    toast('Akrual diposting ke jurnal', 'success');
    openExpenseAccrual();
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // § 6  EMPLOYEE PAYROLL
  // ══════════════════════════════════════════════════════════════════════════════
  function openPayroll() {
    var employees = ensureArr('employees');
    var payrollRuns = ensureArr('payrollRuns');

    var empRows = employees
      .map(function (e) {
        var gross = (e.salary || 0) + (e.transportAllowance || 0) + (e.mealAllowance || 0);
        return (
          '<tr>' +
          '<td class="td-p" style="font-size:11px;font-weight:700">' +
          esc(e.id) +
          '</td>' +
          '<td class="td-p" style="font-weight:700">' +
          esc(e.name) +
          '</td>' +
          '<td class="td-p">' +
          esc(e.position || '—') +
          '</td>' +
          '<td class="td-p" style="text-align:right">' +
          money(e.salary) +
          '</td>' +
          '<td class="td-p" style="text-align:right">' +
          money(e.transportAllowance || 0) +
          '</td>' +
          '<td class="td-p" style="text-align:right">' +
          money(e.mealAllowance || 0) +
          '</td>' +
          '<td class="td-p" style="text-align:right;font-weight:700">' +
          money(gross) +
          '</td>' +
          '<td class="td-p">' +
          '<button class="action-ghost" data-action="editEmployee" data-id="' +
          esc(e.id) +
          '">Edit</button> ' +
          '<button class="action-ghost" data-action="delEmployee" data-id="' +
          esc(e.id) +
          '" style="color:#EF4444">Hapus</button>' +
          '</td>' +
          '</tr>'
        );
      })
      .join('');

    var recentRuns = payrollRuns
      .slice()
      .reverse()
      .slice(0, 10)
      .map(function (r) {
        var statusBadge;
        if (r.paid) {
          statusBadge = '<span class="badge" style="background:#D1FAE5;color:#065F46">Dibayar</span>';
        } else if (r.posted) {
          statusBadge = '<span class="badge" style="background:#DBEAFE;color:#1D4ED8">Diposting</span>';
        } else {
          statusBadge = '<span class="badge" style="background:#F3F4F6;color:#374151">Draft</span>';
        }
        var actions = '';
        if (!r.posted) {
          actions += '<button class="action-ghost" data-action="postPayroll" data-id="' + esc(r.id) + '">Post GL</button> ';
        }
        if (r.posted && !r.paid) {
          actions += '<button class="action-ghost" data-action="payPayroll" data-id="' + esc(r.id) + '" style="color:#059669">Bayar</button> ';
        }
        return (
          '<tr>' +
          '<td class="td-p" style="font-size:11px;font-weight:700">' +
          esc(r.id) +
          '</td>' +
          '<td class="td-p">' +
          esc(r.period) +
          '</td>' +
          '<td class="td-p">' +
          r.employeeCount +
          ' karyawan</td>' +
          '<td class="td-p" style="text-align:right;font-weight:700">' +
          money(r.totalAmount) +
          '</td>' +
          '<td class="td-p" style="font-size:11px">' +
          esc(r.date) +
          '</td>' +
          '<td class="td-p">' + statusBadge + '</td>' +
          '<td class="td-p">' + actions + '</td>' +
          '</tr>'
        );
      })
      .join('');

    var totalPayroll = employees.reduce(function (s, e) {
      return s + (e.salary || 0) + (e.transportAllowance || 0) + (e.mealAllowance || 0);
    }, 0);

    var header =
      typeof window.secHdr === 'function'
        ? window.secHdr(
            'Penggajian',
            'Kelola karyawan dan proses payroll',
            'Tambah Karyawan',
            'addEmployee'
          )
        : '<h1>Payroll</h1>';

    var postedCount = payrollRuns.filter(function (r) { return r.posted; }).length;
    var paidCount = payrollRuns.filter(function (r) { return r.paid; }).length;
    var unpaidPosted = postedCount - paidCount;

    var stats =
      typeof window.statRow === 'function'
        ? window.statRow([
            { label: 'Karyawan', value: String(employees.length), sub: 'Terdaftar aktif' },
            {
              label: 'Total Gaji/bln',
              value: money(totalPayroll),
              sub: 'Gaji + tunjangan',
              color: '#3B82F6',
            },
            { label: 'Payroll Runs', value: String(payrollRuns.length), sub: postedCount + ' posted, ' + paidCount + ' dibayar' },
            { label: 'Belum Bayar', value: String(unpaidPosted), sub: 'Posted belum dibayar', color: unpaidPosted > 0 ? '#F59E0B' : '#10B981' },
          ])
        : '';

    var html =
      header +
      stats +
      '<div class="card" style="margin-bottom:14px"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">' +
      '<div style="font-size:14px;font-weight:700">Data Karyawan</div></div>' +
      '<div class="table-wrap"><table style="width:100%">' +
      '<thead><tr><th>ID</th><th>Nama</th><th>Jabatan</th><th style="text-align:right">Gaji Pokok</th><th style="text-align:right">T. Transport</th><th style="text-align:right">T. Makan</th><th style="text-align:right">Total</th><th>Aksi</th></tr></thead>' +
      '<tbody>' +
      (empRows || '<tr><td colspan="8" class="td-empty">Belum ada data karyawan.</td></tr>') +
      '</tbody>' +
      '</table></div></div>' +
      '<div class="card"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">' +
      '<div style="font-size:14px;font-weight:700">Riwayat Payroll</div>' +
      '<button class="btn" data-action="runPayroll" style="font-size:12px">Proses Payroll</button></div>' +
      '<div class="table-wrap"><table style="width:100%">' +
      '<thead><tr><th>ID</th><th>Periode</th><th>Karyawan</th><th style="text-align:right">Total</th><th>Tanggal</th><th>Status</th><th>Aksi</th></tr></thead>' +
      '<tbody>' +
      (recentRuns || '<tr><td colspan="7" class="td-empty">Belum ada payroll diproses.</td></tr>') +
      '</tbody>' +
      '</table></div></div>';

    injectView('finance', html);
  }

  function addEmployeeModal(existing) {
    var e = existing || {};
    // Departments drive access (RBAC): an employee's department maps to a role,
    // and the login account whose email matches gets that role. Options come
    // from DB.settings.departments (managed in Manajemen Pengguna).
    var depts =
      (window.DB && window.DB.settings && Array.isArray(window.DB.settings.departments)
        ? window.DB.settings.departments
        : []);
    var deptOptions =
      '<option value="">— Tanpa Departemen —</option>' +
      depts
        .map(function (d) {
          return (
            '<option value="' +
            esc(d.id) +
            '"' +
            (e.departmentId === d.id ? ' selected' : '') +
            '>' +
            esc(d.name) +
            '</option>'
          );
        })
        .join('');
    var body =
      '<div style="display:flex;flex-direction:column;gap:12px">' +
      '<label style="font-size:12px;font-weight:700">Nama Lengkap<input id="emp-name" class="form-input" value="' +
      esc(e.name || '') +
      '" style="width:100%;margin-top:4px"></label>' +
      '<label style="font-size:12px;font-weight:700">Email (untuk akses login)<input id="emp-email" class="form-input" type="email" value="' +
      esc(e.email || '') +
      '" placeholder="nama@perusahaan.com" style="width:100%;margin-top:4px"></label>' +
      '<label style="font-size:12px;font-weight:700">Departemen<select id="emp-dept" class="form-input" style="width:100%;margin-top:4px">' +
      deptOptions +
      '</select></label>' +
      '<label style="font-size:12px;font-weight:700">Jabatan<input id="emp-pos" class="form-input" value="' +
      esc(e.position || '') +
      '" style="width:100%;margin-top:4px"></label>' +
      '<label style="font-size:12px;font-weight:700">Gaji Pokok<input id="emp-salary" class="form-input" type="number" min="0" value="' +
      (e.salary || 0) +
      '" style="width:100%;margin-top:4px"></label>' +
      '<label style="font-size:12px;font-weight:700">Tunjangan Transport<input id="emp-trans" class="form-input" type="number" min="0" value="' +
      (e.transportAllowance || 0) +
      '" style="width:100%;margin-top:4px"></label>' +
      '<label style="font-size:12px;font-weight:700">Tunjangan Makan<input id="emp-meal" class="form-input" type="number" min="0" value="' +
      (e.mealAllowance || 0) +
      '" style="width:100%;margin-top:4px"></label>' +
      '</div>';

    modal(
      existing ? 'Edit Karyawan' : 'Tambah Karyawan',
      body,
      '<button class="btn-ghost" data-action="closeModal">Batal</button>' +
        '<button class="btn" id="emp-save">Simpan</button>',
      false
    );

    setTimeout(function () {
      document.getElementById('emp-save').addEventListener('click', function () {
        var name = document.getElementById('emp-name').value.trim();
        var pos = document.getElementById('emp-pos').value.trim();
        var email = (document.getElementById('emp-email').value || '').trim().toLowerCase();
        var deptId = document.getElementById('emp-dept').value || '';
        var salary = parseFloat(document.getElementById('emp-salary').value) || 0;
        var trans = parseFloat(document.getElementById('emp-trans').value) || 0;
        var meal = parseFloat(document.getElementById('emp-meal').value) || 0;

        if (!name) {
          toast('Nama karyawan wajib diisi', 'warning');
          return;
        }

        var arr = ensureArr('employees');
        if (existing) {
          var idx = arr.findIndex(function (x) {
            return x.id === existing.id;
          });
          if (idx >= 0)
            Object.assign(arr[idx], {
              name: name,
              position: pos,
              email: email,
              departmentId: deptId,
              salary: salary,
              transportAllowance: trans,
              mealAllowance: meal,
            });
        } else {
          arr.push({
            id: uid('EMP'),
            name: name,
            position: pos,
            email: email,
            departmentId: deptId,
            salary: salary,
            transportAllowance: trans,
            mealAllowance: meal,
            active: true,
            createdAt: today(),
          });
        }
        save();
        closeM();
        toast(existing ? 'Data karyawan diperbarui' : 'Karyawan ditambahkan', 'success');
        // If this employee's email matches a registered login account, push the
        // department's role to it (admin only — server rules enforce this too).
        if (email && typeof window.applyDepartmentRoles === 'function') {
          window.applyDepartmentRoles({ silent: true });
        }
        openPayroll();
      });
    }, 60);
  }

  function runPayrollModal() {
    var employees = ensureArr('employees');
    if (employees.length === 0) {
      toast('Belum ada data karyawan', 'warning');
      return;
    }

    var total = employees.reduce(function (s, e) {
      return s + (e.salary || 0) + (e.transportAllowance || 0) + (e.mealAllowance || 0);
    }, 0);

    var body =
      '<div style="display:flex;flex-direction:column;gap:12px">' +
      '<label style="font-size:12px;font-weight:700">Periode<input id="pr-period" class="form-input" type="month" value="' +
      thisMonth() +
      '" style="width:100%;margin-top:4px"></label>' +
      '<div style="background:var(--bg);border-radius:8px;padding:12px">' +
      '<div style="font-size:12px;font-weight:700;margin-bottom:8px">Ringkasan</div>' +
      '<div style="font-size:12px">Jumlah karyawan: <strong>' +
      employees.length +
      '</strong></div>' +
      '<div style="font-size:12px">Total pembayaran: <strong>' +
      money(total) +
      '</strong></div>' +
      '</div>' +
      '<label style="font-size:12px"><input type="checkbox" id="pr-post" checked> Langsung posting ke jurnal</label>' +
      '</div>';

    modal(
      'Proses Payroll',
      body,
      '<button class="btn-ghost" data-action="closeModal">Batal</button>' +
        '<button class="btn" id="pr-run">Proses</button>',
      false
    );

    setTimeout(function () {
      document.getElementById('pr-run').addEventListener('click', function () {
        var period = document.getElementById('pr-period').value;
        var doPost = document.getElementById('pr-post').checked;
        var employees = ensureArr('employees');
        var total = employees.reduce(function (s, e) {
          return s + (e.salary || 0) + (e.transportAllowance || 0) + (e.mealAllowance || 0);
        }, 0);

        var run = {
          id: uid('PAY'),
          period: period,
          employeeCount: employees.length,
          totalAmount: total,
          date: today(),
          posted: doPost,
          details: employees.map(function (e) {
            return {
              employeeId: e.id,
              name: e.name,
              salary: e.salary,
              transport: e.transportAllowance || 0,
              meal: e.mealAllowance || 0,
            };
          }),
        };
        ensureArr('payrollRuns').push(run);

        save();
        if (doPost && window.GL && typeof window.GL.reconcileAll === 'function') {
          window.GL.reconcileAll();
          save();
        }
        closeM();
        toast('Payroll diproses: ' + money(total) + (doPost ? ' — jurnal diposting' : ' — draft'), 'success');
        openPayroll();
      });
    }, 60);
  }

  function payPayrollModal(run) {
    var body =
      '<div style="display:flex;flex-direction:column;gap:12px">' +
      '<div style="background:var(--bg);border-radius:8px;padding:12px">' +
      '<div style="font-size:12px">Payroll: <strong>' + esc(run.id) + '</strong></div>' +
      '<div style="font-size:12px">Periode: <strong>' + esc(run.period) + '</strong></div>' +
      '<div style="font-size:12px">Total: <strong>' + money(run.totalAmount) + '</strong></div>' +
      '</div>' +
      '<label style="font-size:12px;font-weight:700">Metode Pembayaran<select id="pp-method" class="form-select" style="width:100%;margin-top:4px">' +
      '<option value="Tunai">Tunai — Kas</option>' +
      '<option value="Transfer BCA">Transfer BCA</option>' +
      '<option value="Transfer Mandiri">Transfer Mandiri</option>' +
      '</select></label>' +
      '<label style="font-size:12px;font-weight:700">Tanggal Bayar<input id="pp-date" class="form-input" type="date" value="' + today() + '" style="width:100%;margin-top:4px"></label>' +
      '</div>';

    modal(
      'Bayar Gaji',
      body,
      '<button class="btn-ghost" data-action="closeModal">Batal</button>' +
        '<button class="btn" id="pp-save">Bayar</button>',
      false
    );

    setTimeout(function () {
      document.getElementById('pp-save').addEventListener('click', function () {
        var method = document.getElementById('pp-method').value;
        var payDate = document.getElementById('pp-date').value || today();

        var cashAccounts = { 'Tunai': '110101', 'Transfer BCA': '110102', 'Transfer Mandiri': '110103' };
        var cashAcc = cashAccounts[method] || '110101';
        var salaryPayableAcc = '210401';

        if (window.GL && typeof window.GL.postJournalVoucher === 'function') {
          try {
            window.GL.postJournalVoucher(payDate, [
              { accountNo: salaryPayableAcc, debit: run.totalAmount, memo: 'Pembayaran gaji ' + run.period },
              { accountNo: cashAcc, credit: run.totalAmount, memo: 'Bayar via ' + method + ' ' + run.id },
            ], 'Pembayaran gaji ' + run.period + ' (' + run.id + ')');
          } catch (err) {
            toast('Gagal posting jurnal: ' + err.message, 'error');
            return;
          }
        }

        run.paid = true;
        run.paidDate = payDate;
        run.payMethod = method;
        save();
        closeM();
        toast('Gaji ' + run.period + ' dibayar via ' + method + ' — ' + money(run.totalAmount), 'success');
        openPayroll();
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
      // Budget
      case 'addBudget':
        addBudgetModal();
        break;
      case 'editBudget': {
        var b = ensureArr('budgets').find(function (x) {
          return x.id === id;
        });
        if (b) addBudgetModal(b);
        break;
      }
      case 'delBudget': {
        if (!confirm('Hapus budget ini?')) return;
        var arr = ensureArr('budgets');
        var idx = arr.findIndex(function (x) {
          return x.id === id;
        });
        if (idx >= 0) arr.splice(idx, 1);
        save();
        toast('Budget dihapus', 'success');
        openBudget();
        break;
      }
      // Budget Transfer
      case 'newBudgetTransfer':
        budgetTransferModal();
        break;
      // Account History
      case 'ahFilter':
        filterAccountHistory();
        break;
      // Expense Accrual
      case 'addAccrual':
        addAccrualModal();
        break;
      case 'postAccrual':
        postAccrual(id);
        break;
      case 'delAccrual': {
        if (!confirm('Hapus akrual ini?')) return;
        var arr2 = ensureArr('expenseAccruals');
        var idx2 = arr2.findIndex(function (x) {
          return x.id === id;
        });
        if (idx2 >= 0) arr2.splice(idx2, 1);
        save();
        toast('Akrual dihapus', 'success');
        openExpenseAccrual();
        break;
      }
      // Payroll
      case 'addEmployee':
        addEmployeeModal();
        break;
      case 'editEmployee': {
        var emp = ensureArr('employees').find(function (x) {
          return x.id === id;
        });
        if (emp) addEmployeeModal(emp);
        break;
      }
      case 'delEmployee': {
        if (!confirm('Hapus data karyawan ini?')) return;
        var arr3 = ensureArr('employees');
        var idx3 = arr3.findIndex(function (x) {
          return x.id === id;
        });
        if (idx3 >= 0) arr3.splice(idx3, 1);
        save();
        toast('Karyawan dihapus', 'success');
        openPayroll();
        break;
      }
      case 'runPayroll':
        runPayrollModal();
        break;
      case 'postPayroll': {
        var payRun = ensureArr('payrollRuns').find(function (x) { return x.id === id; });
        if (payRun && !payRun.posted) {
          payRun.posted = true;
          save();
          if (window.GL && typeof window.GL.reconcileAll === 'function') {
            window.GL.reconcileAll();
            save();
          }
          toast('Payroll ' + id + ' diposting ke GL', 'success');
          openPayroll();
        }
        break;
      }
      case 'payPayroll': {
        var pRun = ensureArr('payrollRuns').find(function (x) { return x.id === id; });
        if (pRun && pRun.posted && !pRun.paid) payPayrollModal(pRun);
        break;
      }
      // Budget vs Actual filter
      case 'bvaFilter':
        filterBudgetVsActual();
        break;
    }
  });

  // ══════════════════════════════════════════════════════════════════════════════
  // § AUDIT JOURNAL
  // ══════════════════════════════════════════════════════════════════════════════
  function openAuditJournal() {
    var journals = db().journals || [];
    var accounts = db().accountsChart || [];
    var accMap = {};
    accounts.forEach(function (a) {
      accMap[a.no || a.code || ''] = a.name;
    });

    // Build filter bar state
    var fFrom = '',
      fTo = '',
      fAcc = '',
      fQ = '';

    function renderTable(from, to, acc, q) {
      var filtered = journals.filter(function (j) {
        if (from && j.date < from) return false;
        if (to && j.date > to) return false;
        if (acc) {
          var lines = j.lines || j.entries || [];
          var hasAcc = lines.some(function (l) {
            return (l.accountNo || l.account || l.accountCode) === acc;
          });
          if (!hasAcc) return false;
        }
        if (q) {
          var ql = q.toLowerCase();
          var src = typeof j.source === 'object' ? (j.source.docType || '') : (j.source || '');
          var haystack =
            (j.number || j.ref || j.id || '') + ' ' + (j.memo || j.description || '') + ' ' + (j.date || '') + ' ' + src;
          if (haystack.toLowerCase().indexOf(ql) < 0) return false;
        }
        return true;
      });

      filtered = filtered.slice().sort(function (a, b) {
        return a.date > b.date ? -1 : a.date < b.date ? 1 : 0;
      });
      var total = filtered.length;
      filtered = filtered.slice(0, 200);

      if (!filtered.length)
        return '<tr><td colspan="6" style="text-align:center;padding:24px;color:var(--muted)">Tidak ada jurnal ditemukan.</td></tr>';

      return (
        filtered
          .map(function (j) {
            var lines = j.lines || j.entries || [];
            var debitTotal = j.totals ? j.totals.debit : lines.reduce(function (s, l) {
              return s + (Number(l.debit) || l.debitAmount || 0);
            }, 0);
            var accList =
              lines
                .slice(0, 3)
                .map(function (l) {
                  var code = l.accountNo || l.account || l.accountCode || '';
                  return esc(code + (accMap[code] ? ' ' + accMap[code].slice(0, 20) : ''));
                })
                .join(', ') + (lines.length > 3 ? '…' : '');
            var src = typeof j.source === 'object' ? (j.source.docType || '—') : (j.source || '—');
            return (
              '<tr>' +
              '<td class="td-p" style="font-size:11px;white-space:nowrap">' +
              esc(j.date || '') +
              '</td>' +
              '<td class="td-p" style="font-size:11px;font-weight:700">' +
              esc(j.number || j.ref || j.id || '') +
              '</td>' +
              '<td class="td-p" style="font-size:11px">' +
              esc(j.memo || j.description || '—') +
              '</td>' +
              '<td class="td-p" style="font-size:11px;color:var(--muted)">' +
              accList +
              '</td>' +
              '<td class="td-p" style="text-align:right;font-weight:700;font-size:12px">' +
              money(debitTotal) +
              '</td>' +
              '<td class="td-p" style="font-size:11px;color:var(--muted)">' +
              esc(src) +
              '</td>' +
              '</tr>'
            );
          })
          .join('') +
        (total > 200
          ? '<tr><td colspan="6" style="text-align:center;padding:8px;color:var(--muted);font-size:11px">Menampilkan 200 dari ' +
            total +
            ' jurnal. Gunakan filter untuk mempersempit.</td></tr>'
          : '')
      );
    }

    var accOpts =
      '<option value="">— Semua Akun —</option>' +
      accounts
        .map(function (a) {
          return (
            '<option value="' + esc(a.no || a.code || '') + '">' + esc(a.no || a.code || '') + ' ' + esc(a.name) + '</option>'
          );
        })
        .join('');

    var TH =
      'text-align:left;padding:10px 14px;font-size:11px;color:var(--muted);font-weight:700;border-bottom:1px solid var(--border)';

    injectView(
      'finance',
      '<div class="sec-hdr"><div><h1>Audit Journal</h1><p>Semua entri jurnal — ' +
        journals.length.toLocaleString('id-ID') +
        ' total</p></div></div>' +
        '<div class="card" style="margin-bottom:12px">' +
        '<div style="display:flex;gap:10px;flex-wrap:wrap;align-items:flex-end">' +
        '<div><label style="font-size:11px;color:var(--muted);display:block;margin-bottom:3px">Dari</label>' +
        '<input class="form-input" id="aj-from" type="date" style="width:140px"></div>' +
        '<div><label style="font-size:11px;color:var(--muted);display:block;margin-bottom:3px">Sampai</label>' +
        '<input class="form-input" id="aj-to" type="date" style="width:140px"></div>' +
        '<div><label style="font-size:11px;color:var(--muted);display:block;margin-bottom:3px">Akun</label>' +
        '<select class="form-select" id="aj-acc" style="width:260px">' +
        accOpts +
        '</select></div>' +
        '<div style="flex:1;min-width:140px"><label style="font-size:11px;color:var(--muted);display:block;margin-bottom:3px">Cari</label>' +
        '<input class="form-input" id="aj-q" placeholder="Ref, memo..."></div>' +
        '<button class="btn" id="aj-filter">Filter</button>' +
        '<button class="btn-ghost" id="aj-reset">Reset</button>' +
        '</div></div>' +
        '<div class="card" style="overflow-x:auto">' +
        '<table style="width:100%;border-collapse:collapse">' +
        '<thead><tr>' +
        '<th style="' +
        TH +
        '">Tanggal</th><th style="' +
        TH +
        '">Referensi</th>' +
        '<th style="' +
        TH +
        '">Memo</th><th style="' +
        TH +
        '">Akun</th>' +
        '<th style="' +
        TH +
        'text-align:right">Jumlah</th><th style="' +
        TH +
        '">Sumber</th>' +
        '</tr></thead>' +
        '<tbody id="aj-tbody">' +
        renderTable('', '', '', '') +
        '</tbody>' +
        '</table></div>'
    );

    setTimeout(function () {
      var filterBtn = document.getElementById('aj-filter');
      var resetBtn = document.getElementById('aj-reset');
      function applyFilter() {
        fFrom = document.getElementById('aj-from').value;
        fTo = document.getElementById('aj-to').value;
        fAcc = document.getElementById('aj-acc').value;
        fQ = (document.getElementById('aj-q').value || '').trim();
        var tbody = document.getElementById('aj-tbody');
        if (tbody) tbody.innerHTML = renderTable(fFrom, fTo, fAcc, fQ);
      }
      if (filterBtn) filterBtn.addEventListener('click', applyFilter);
      if (resetBtn)
        resetBtn.addEventListener('click', function () {
          ['aj-from', 'aj-to', 'aj-q'].forEach(function (id) {
            var el = document.getElementById(id);
            if (el) el.value = '';
          });
          var accEl = document.getElementById('aj-acc');
          if (accEl) accEl.value = '';
          var tbody = document.getElementById('aj-tbody');
          if (tbody) tbody.innerHTML = renderTable('', '', '', '');
        });
    }, 60);
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // EXPOSE TO MENU-COVERAGE
  // ══════════════════════════════════════════════════════════════════════════════
  window._budgetGLExtras = {
    openBudget: openBudget,
    openBudgetMonitor: openBudgetMonitor,
    openBudgetTransfer: openBudgetTransfer,
    openAccountHistory: openAccountHistory,
    openExpenseAccrual: openExpenseAccrual,
    openPayroll: openPayroll,
    openAuditJournal: openAuditJournal,
  };

  console.log('[BudgetGL] Budget & GL extras ready');
})();
