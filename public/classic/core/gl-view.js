// ═══════════════════════════════════════════════════════════════════════════════
// KELOLA ERP (DEMO) — General Ledger View  (gl-view.js)
// Phase 2b of the V4 plan (see docs/ARCHITECTURE_ERP_V4.md).
//
// The user-facing GL: a "General Ledger" view (#view-ledger, already in index.html)
// with three tabs — Neraca Saldo (Trial Balance), Jurnal (all journals), Bagan Akun
// (Chart of Accounts) — plus a Journal Voucher entry modal that enforces Dr === Cr
// via GL.postJournalVoucher().
//
// Additive & non-breaking: registers window.renderLedger and ERP actions; the only
// edits elsewhere are a one-line `case 'ledger'` in erp-view.js's getRenderer switch
// and repointing two flyout items in nav.js to this view.
//
// Global-scope rule: classic <script>, IIFE-wrapped, exposes only window.renderLedger
// (+ ERP action registrations). Declares no colliding top-level names.
// ═══════════════════════════════════════════════════════════════════════════════
(function () {
  'use strict';

  let activeTab = 'trial'; // 'trial' | 'journals' | 'chart'

  function esc(s) {
    if (typeof window.escapeHtml === 'function') {
      return window.escapeHtml(s);
    }
    return String(s === null || s === undefined ? '' : s);
  }
  function money(v) {
    return typeof window.idrFull === 'function' ? window.idrFull(v) : `Rp ${v}`;
  }
  function db() {
    return window.DB || {};
  }

  const TYPE_LABEL = {
    CASH_BANK: 'Kas & Bank',
    ACCOUNT_RECEIVABLE: 'Piutang',
    INVENTORY: 'Persediaan',
    OTHER_CURRENT_ASSET: 'Aset Lancar Lain',
    FIXED_ASSET: 'Aset Tetap',
    ACCUMULATED_DEPRECIATION: 'Akumulasi Penyusutan',
    OTHER_ASSET: 'Aset Lain',
    ACCOUNT_PAYABLE: 'Hutang',
    OTHER_CURRENT_LIABILITY: 'Kewajiban Lancar Lain',
    LONG_TERM_LIABILITY: 'Kewajiban Jangka Panjang',
    EQUITY: 'Ekuitas',
    REVENUE: 'Pendapatan',
    COGS: 'HPP',
    EXPENSE: 'Beban',
    OTHER_EXPENSE: 'Beban Lain',
    OTHER_INCOME: 'Pendapatan Lain',
  };

  function tabBtn(id, label) {
    const on = activeTab === id;
    return `<button class="btn-ghost" data-action="glTab" data-val="${id}"
      style="font-size:12px;padding:6px 14px;border-radius:8px;font-weight:700;
      ${on ? 'background:var(--primary);color:#fff' : 'color:var(--muted)'}">${esc(label)}</button>`;
  }

  // ── Trial Balance tab ───────────────────────────────────────────────────────
  function trialTab() {
    const tb = window.GL
      ? window.GL.trialBalance()
      : { rows: [], totalDebit: 0, totalCredit: 0, balanced: true };
    const rows =
      tb.rows.length === 0
        ? `<tr><td colspan="4" style="padding:18px;text-align:center;color:var(--muted);font-size:13px">
             Belum ada transaksi yang membentuk jurnal. Buat SO (Terkirim) / PO (Diterima) atau Jurnal Umum.
           </td></tr>`
        : tb.rows
            .map(
              r => `<tr style="border-bottom:1px solid var(--border)">
          <td style="padding:7px 10px;font-size:12px;font-family:monospace;color:var(--muted)">${esc(r.no)}</td>
          <td style="padding:7px 10px;font-size:12px;font-weight:600">${esc(r.name)}
            <span style="font-size:10px;color:var(--muted);font-weight:400"> · ${esc(TYPE_LABEL[r.type] || r.type)}</span></td>
          <td style="padding:7px 10px;font-size:12px;text-align:right;font-weight:600">${r.debit ? money(r.debit) : '—'}</td>
          <td style="padding:7px 10px;font-size:12px;text-align:right;font-weight:600">${r.credit ? money(r.credit) : '—'}</td>
        </tr>`
            )
            .join('');

    return `
    ${
      typeof window.statRow === 'function'
        ? window.statRow([
            { label: 'Total Debit', value: money(tb.totalDebit), sub: 'Seluruh akun' },
            { label: 'Total Kredit', value: money(tb.totalCredit), sub: 'Seluruh akun' },
            {
              label: 'Status',
              value: tb.balanced ? 'Seimbang ✓' : 'Tidak Seimbang',
              sub: tb.balanced ? 'Debit = Kredit' : 'Periksa jurnal',
              color: tb.balanced ? '#34C759' : '#FF3B30',
            },
          ])
        : ''
    }
    <div class="card">
      <div style="font-size:14px;font-weight:700;margin-bottom:10px">Neraca Saldo</div>
      <div class="table-wrap">
        <table style="width:100%;border-collapse:collapse">
          <thead><tr style="background:var(--bg)">
            <th style="padding:8px 10px;font-size:11px;font-weight:700;text-align:left;width:90px">Kode</th>
            <th style="padding:8px 10px;font-size:11px;font-weight:700;text-align:left">Nama Akun</th>
            <th style="padding:8px 10px;font-size:11px;font-weight:700;text-align:right;width:150px">Debit</th>
            <th style="padding:8px 10px;font-size:11px;font-weight:700;text-align:right;width:150px">Kredit</th>
          </tr></thead>
          <tbody>${rows}</tbody>
          <tfoot><tr style="border-top:2px solid var(--border)">
            <td colspan="2" style="padding:9px 10px;font-size:12px;font-weight:800;text-align:right">TOTAL</td>
            <td style="padding:9px 10px;font-size:13px;font-weight:800;text-align:right">${money(tb.totalDebit)}</td>
            <td style="padding:9px 10px;font-size:13px;font-weight:800;text-align:right">${money(tb.totalCredit)}</td>
          </tr></tfoot>
        </table>
      </div>
    </div>`;
  }

  // ── Journals tab ────────────────────────────────────────────────────────────
  function journalsTab() {
    const journals = (db().journals || []).slice().reverse(); // newest first
    if (journals.length === 0) {
      return `<div class="card"><div style="padding:24px;text-align:center;color:var(--muted);font-size:13px">
        Belum ada jurnal. Jurnal otomatis dibuat saat SO Terkirim / PO Diterima / pembayaran dicatat,
        atau buat <strong>Jurnal Umum</strong> manual.
      </div></div>`;
    }
    const cards = journals
      .map(j => {
        const src =
          j.source === 'manual'
            ? 'Jurnal Umum'
            : j.source && j.source.docType
              ? `${esc(j.source.docType)} ${esc(j.source.docId)}`
              : '—';
        const lines = (j.lines || [])
          .map(
            l => `<tr>
            <td style="padding:4px 10px;font-size:11px;font-family:monospace;color:var(--muted)">${esc(l.accountNo)}</td>
            <td style="padding:4px 10px;font-size:12px">${esc(l.accountName)}${l.memo ? `<span style="color:var(--muted);font-size:10px"> · ${esc(l.memo)}</span>` : ''}</td>
            <td style="padding:4px 10px;font-size:12px;text-align:right">${l.debit ? money(l.debit) : ''}</td>
            <td style="padding:4px 10px;font-size:12px;text-align:right">${l.credit ? money(l.credit) : ''}</td>
          </tr>`
          )
          .join('');
        return `<div style="border:1px solid var(--border);border-radius:10px;margin-bottom:10px;overflow:hidden">
          <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 12px;background:var(--bg)">
            <div style="font-size:12px;font-weight:700">${esc(j.number || j.id)}
              <span style="font-size:11px;color:var(--muted);font-weight:400"> · ${esc(src)}</span></div>
            <div style="font-size:11px;color:var(--muted)">${esc(j.date || '')}</div>
          </div>
          <table style="width:100%;border-collapse:collapse">
            <tbody>${lines}</tbody>
            <tfoot><tr style="border-top:1px solid var(--border)">
              <td colspan="2" style="padding:5px 10px;font-size:11px;font-weight:700;text-align:right;color:var(--muted)">Total</td>
              <td style="padding:5px 10px;font-size:12px;font-weight:800;text-align:right">${money(j.totals ? j.totals.debit : 0)}</td>
              <td style="padding:5px 10px;font-size:12px;font-weight:800;text-align:right">${money(j.totals ? j.totals.credit : 0)}</td>
            </tr></tfoot>
          </table>
        </div>`;
      })
      .join('');
    return `<div class="card">
      <div style="font-size:14px;font-weight:700;margin-bottom:10px">Daftar Jurnal (${journals.length})</div>
      ${cards}
    </div>`;
  }

  // ── Chart of Accounts tab ───────────────────────────────────────────────────
  function chartTab() {
    const chart = db().accountsChart || [];
    const rows = chart
      .map(
        a => `<tr style="border-bottom:1px solid var(--border)">
        <td style="padding:7px 10px;font-size:12px;font-family:monospace;color:var(--muted)">${esc(a.no)}</td>
        <td style="padding:7px 10px;font-size:12px;font-weight:600">${esc(a.name)}</td>
        <td style="padding:7px 10px;font-size:11px;color:var(--muted)">${esc(TYPE_LABEL[a.type] || a.type)}</td>
        <td style="padding:7px 10px;font-size:11px;text-align:right;color:var(--muted)">${esc(a.currency || 'IDR')}</td>
      </tr>`
      )
      .join('');
    return `<div class="card">
      <div style="font-size:14px;font-weight:700;margin-bottom:10px">Bagan Akun (${chart.length})</div>
      <div class="table-wrap"><table style="width:100%;border-collapse:collapse">
        <thead><tr style="background:var(--bg)">
          <th style="padding:8px 10px;font-size:11px;font-weight:700;text-align:left;width:90px">Kode</th>
          <th style="padding:8px 10px;font-size:11px;font-weight:700;text-align:left">Nama Akun</th>
          <th style="padding:8px 10px;font-size:11px;font-weight:700;text-align:left;width:170px">Tipe</th>
          <th style="padding:8px 10px;font-size:11px;font-weight:700;text-align:right;width:70px">Mata Uang</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table></div>
    </div>`;
  }

  function renderLedger() {
    const header =
      typeof window.secHdr === 'function'
        ? window.secHdr(
            'General Ledger',
            'Buku besar — neraca saldo, jurnal & bagan akun',
            'Jurnal Umum',
            'glPostJV'
          )
        : '<h1>General Ledger</h1>';
    let bodyHtml = '';
    if (activeTab === 'journals') {
      bodyHtml = journalsTab();
    } else if (activeTab === 'chart') {
      bodyHtml = chartTab();
    } else {
      bodyHtml = trialTab();
    }
    return `
    ${header}
    <div style="display:flex;gap:6px;margin-bottom:14px">
      ${tabBtn('trial', 'Neraca Saldo')}
      ${tabBtn('journals', 'Jurnal')}
      ${tabBtn('chart', 'Bagan Akun')}
    </div>
    ${bodyHtml}`;
  }

  function refresh() {
    const el = document.getElementById('view-ledger');
    if (el) {
      el.innerHTML = renderLedger();
    }
  }

  // ── Journal Voucher entry modal ─────────────────────────────────────────────
  function accountOptions(selected) {
    return (db().accountsChart || [])
      .map(
        a =>
          `<option value="${esc(a.no)}"${selected === a.no ? ' selected' : ''}>${esc(a.no)} — ${esc(a.name)}</option>`
      )
      .join('');
  }

  function jvRowHTML() {
    return `<tr>
      <td style="padding:4px 6px">
        <select class="form-select jv-acc" style="font-size:12px;padding:5px 8px;width:100%">
          <option value="">— Pilih Akun —</option>${accountOptions('')}
        </select>
      </td>
      <td style="padding:4px 6px">
        <input class="form-input jv-debit" type="number" min="0" value="0" style="font-size:12px;padding:5px 8px;width:120px">
      </td>
      <td style="padding:4px 6px">
        <input class="form-input jv-credit" type="number" min="0" value="0" style="font-size:12px;padding:5px 8px;width:120px">
      </td>
      <td style="padding:4px 6px;text-align:center">
        <button type="button" class="jv-del" title="Hapus baris"
          style="background:none;border:none;cursor:pointer;color:var(--muted);font-size:18px;line-height:1">×</button>
      </td>
    </tr>`;
  }

  function openJVModal() {
    if (!window.openModal || !window.GL) {
      return;
    }
    const today =
      typeof window.today === 'function' ? window.today() : new Date().toISOString().slice(0, 10);
    window.openModal(
      'Jurnal Umum',
      `
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Tanggal</label>
          <input class="form-input" id="jv-date" type="date" value="${today}">
        </div>
        <div class="form-group">
          <label class="form-label">Keterangan</label>
          <input class="form-input" id="jv-memo" type="text" placeholder="Deskripsi jurnal (opsional)">
        </div>
      </div>
      <div style="margin-top:10px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
          <span class="form-label" style="margin:0;font-size:13px;font-weight:700">Baris Jurnal</span>
          <button type="button" class="btn-ghost" id="jv-add" style="font-size:11px;padding:4px 10px">+ Tambah Baris</button>
        </div>
        <table style="width:100%;border-collapse:collapse">
          <thead><tr style="background:var(--bg)">
            <th style="padding:6px 8px;font-size:11px;font-weight:700;text-align:left">Akun</th>
            <th style="padding:6px 8px;font-size:11px;font-weight:700;text-align:left;width:130px">Debit</th>
            <th style="padding:6px 8px;font-size:11px;font-weight:700;text-align:left;width:130px">Kredit</th>
            <th style="width:30px"></th>
          </tr></thead>
          <tbody id="jv-body">${jvRowHTML()}${jvRowHTML()}</tbody>
        </table>
        <div style="display:flex;justify-content:flex-end;gap:18px;margin-top:10px;padding-top:8px;border-top:1px solid var(--border);font-size:12px">
          <span>Debit: <strong id="jv-td">Rp 0</strong></span>
          <span>Kredit: <strong id="jv-tc">Rp 0</strong></span>
          <span id="jv-bal" style="font-weight:800"></span>
        </div>
      </div>`,
      `<button class="btn-ghost" data-action="closeModal">Batal</button>
       <button class="btn" id="jv-save">Simpan Jurnal</button>`,
      true
    );

    setTimeout(() => {
      const body = document.getElementById('jv-body');
      const tdEl = document.getElementById('jv-td');
      const tcEl = document.getElementById('jv-tc');
      const balEl = document.getElementById('jv-bal');

      function recalc() {
        let td = 0;
        let tc = 0;
        body.querySelectorAll('tr').forEach(tr => {
          td += parseFloat(tr.querySelector('.jv-debit')?.value) || 0;
          tc += parseFloat(tr.querySelector('.jv-credit')?.value) || 0;
        });
        tdEl.textContent = money(td);
        tcEl.textContent = money(tc);
        const balanced = Math.round(td) === Math.round(tc) && td > 0;
        balEl.textContent = balanced ? 'Seimbang ✓' : 'Belum seimbang';
        balEl.style.color = balanced ? '#34C759' : '#FF9F0A';
      }

      function wireRow(tr) {
        tr.querySelector('.jv-debit')?.addEventListener('input', recalc);
        tr.querySelector('.jv-credit')?.addEventListener('input', recalc);
        tr.querySelector('.jv-del')?.addEventListener('click', () => {
          tr.remove();
          recalc();
        });
      }
      body.querySelectorAll('tr').forEach(wireRow);

      document.getElementById('jv-add')?.addEventListener('click', () => {
        const tmp = document.createElement('tbody');
        tmp.innerHTML = jvRowHTML();
        const tr = tmp.firstElementChild;
        body.appendChild(tr);
        wireRow(tr);
        recalc();
      });

      document.getElementById('jv-save')?.addEventListener('click', () => {
        const date = document.getElementById('jv-date').value;
        const memo = document.getElementById('jv-memo').value.trim();
        const lines = [];
        body.querySelectorAll('tr').forEach(tr => {
          const accountNo = tr.querySelector('.jv-acc')?.value;
          const debit = parseFloat(tr.querySelector('.jv-debit')?.value) || 0;
          const credit = parseFloat(tr.querySelector('.jv-credit')?.value) || 0;
          if (accountNo && (debit > 0 || credit > 0)) {
            lines.push({ accountNo, debit, credit, memo });
          }
        });
        if (lines.length < 2) {
          window.showToast?.('Jurnal memerlukan minimal 2 baris dengan nilai', 'warning');
          return;
        }
        try {
          window.GL.postJournalVoucher(date, lines, memo);
          window.saveDB?.();
          window.closeModal?.();
          activeTab = 'journals';
          refresh();
          window.showToast?.('Jurnal umum berhasil disimpan', 'success');
        } catch (err) {
          window.showToast?.(err.message || 'Gagal menyimpan jurnal', 'danger');
        }
      });

      recalc();
    }, 50);
  }

  // ── Wire up ─────────────────────────────────────────────────────────────────
  window.renderLedger = renderLedger;

  if (window.ERP && typeof window.ERP.registerAction === 'function') {
    window.ERP.registerAction('glTab', function (id, type, val) {
      if (val) {
        activeTab = val;
        refresh();
      }
      return true;
    });
    window.ERP.registerAction('glPostJV', function () {
      openJVModal();
      return true;
    });
  }
})();
