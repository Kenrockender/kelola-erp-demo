// KELOLA ERP (DEMO) — Ringkasan PDF Pesanan  (order-summary.js)
// ─────────────────────────────────────────────────────────────────────────────
// Lets the user pick a period and generate a printable summary of Sales Orders
// or Purchase Orders — "apa saja yang dibeli/dijual selama berapa hari" — with
// per-item totals, a per-document list, and grand totals. Output opens in a
// print window so the browser's "Save as PDF" produces the file.
//
// IIFE-wrapped classic <script>; exposes ONLY window.printOrderSummary.
(function () {
  'use strict';

  const esc =
    window.escapeHtml ||
    (s =>
      String(s == null ? '' : s).replace(
        /[&<>"']/g,
        m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[m]
      ));
  const toast = (m, t) => (window.showToast ? window.showToast(m, t) : console.log(m));
  const fmtRp = n => 'Rp ' + Math.round(Number(n) || 0).toLocaleString('id-ID');

  function _cfg(kind) {
    return kind === 'purchase'
      ? { coll: 'purchaseOrders', party: 'supplier', label: 'Pembelian (PO)', verb: 'Dibeli' }
      : { coll: 'salesOrders', party: 'customer', label: 'Penjualan (SO)', verb: 'Dijual' };
  }

  function _lineAmount(l) {
    if (l.subtotal != null && l.subtotal !== '') return Number(l.subtotal) || 0;
    return (Number(l.qty) || 0) * (Number(l.price || l.unitPrice) || 0);
  }

  // Aggregate documents in [from, to] into per-item + per-document summaries.
  function _aggregate(kind, from, to) {
    const cfg = _cfg(kind);
    const docs = (DB[cfg.coll] || []).filter(
      o =>
        o.status !== 'Draft' &&
        o.status !== 'Cancelled' &&
        o.date &&
        o.date >= from &&
        o.date <= to
    );
    const itemMap = new Map();
    let grand = 0;
    const docRows = [];
    docs.forEach(o => {
      const lines = o.lines && o.lines.length ? o.lines : o.items || [];
      let docQty = 0;
      lines.forEach(l => {
        const key = String(l.itemName || '').toLowerCase().trim() || '(tanpa nama)';
        const cur = itemMap.get(key) || {
          name: l.itemName || '(tanpa nama)',
          qty: 0,
          unit: l.unit || '',
          amount: 0,
        };
        cur.qty += Number(l.qty) || 0;
        cur.amount += _lineAmount(l);
        if (!cur.unit && l.unit) cur.unit = l.unit;
        itemMap.set(key, cur);
        docQty += Number(l.qty) || 0;
      });
      const amt = Number(o.amount) || 0;
      grand += amt;
      docRows.push({
        number:
          (typeof window.docNum === 'function' ? window.docNum(o.number, o.id) : o.number || o.id) ||
          o.id,
        date: o.date,
        party: o[cfg.party] || o.customer || o.supplier || '—',
        qty: docQty,
        amount: amt,
      });
    });
    const items = Array.from(itemMap.values()).sort((a, b) => b.amount - a.amount);
    docRows.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    return { cfg, items, docRows, grand, docCount: docs.length };
  }

  function _daysBetween(from, to) {
    const d1 = new Date(from);
    const d2 = new Date(to);
    if (isNaN(d1) || isNaN(d2)) return 0;
    return Math.round((d2 - d1) / 86400000) + 1;
  }

  function _buildPrintHtml(kind, from, to, agg) {
    const company = (DB.settings && DB.settings.company) || {};
    const companyName = company.name || 'DEMO';
    const days = _daysBetween(from, to);
    const itemRows = agg.items.length
      ? agg.items
          .map(
            it => `<tr>
        <td>${esc(it.name)}</td>
        <td style="text-align:right">${(it.qty || 0).toLocaleString('id-ID')}</td>
        <td>${esc(it.unit || '')}</td>
        <td style="text-align:right">${fmtRp(it.amount)}</td>
      </tr>`
          )
          .join('')
      : '<tr><td colspan="4" style="text-align:center;color:#777">Tidak ada data pada periode ini.</td></tr>';
    const docRows = agg.docRows.length
      ? agg.docRows
          .map(
            d => `<tr>
        <td>${esc(d.number)}</td>
        <td>${esc(d.date)}</td>
        <td>${esc(d.party)}</td>
        <td style="text-align:right">${(d.qty || 0).toLocaleString('id-ID')}</td>
        <td style="text-align:right">${fmtRp(d.amount)}</td>
      </tr>`
          )
          .join('')
      : '<tr><td colspan="5" style="text-align:center;color:#777">Tidak ada dokumen.</td></tr>';

    return `<!DOCTYPE html><html><head><meta charset="UTF-8">
    <title>Ringkasan ${esc(agg.cfg.label)} ${esc(from)} s/d ${esc(to)}</title>
    <style>
      body { font-family: Arial, Helvetica, sans-serif; font-size: 12px; color: #1a1a1a; margin: 28px 36px; }
      h1 { font-size: 18px; margin: 0 0 2px; }
      h2 { font-size: 13px; margin: 22px 0 6px; }
      .muted { color: #666; }
      .head { display:flex; justify-content:space-between; align-items:flex-start; border-bottom:2px solid #000; padding-bottom:8px; margin-bottom:14px; }
      .stats { display:flex; gap:24px; margin:10px 0 4px; flex-wrap:wrap; }
      .stat .v { font-size:16px; font-weight:700; }
      .stat .l { font-size:11px; color:#666; }
      table { width:100%; border-collapse:collapse; margin-top:4px; }
      th { text-align:left; border-bottom:1.5px solid #000; padding:6px 8px; font-size:11px; }
      td { padding:5px 8px; border-bottom:1px solid #e5e7eb; }
      tfoot td { border-top:2px solid #000; font-weight:700; }
      @media print { body { margin: 0; } }
    </style></head><body>
      <div class="head">
        <div>
          <h1>${esc(companyName)}</h1>
          <div class="muted">Ringkasan ${esc(agg.cfg.label)}</div>
        </div>
        <div style="text-align:right" class="muted">
          <div>Periode: <strong>${esc(from)}</strong> s/d <strong>${esc(to)}</strong></div>
          <div>Dicetak: ${esc(new Date().toLocaleString('id-ID'))}</div>
        </div>
      </div>
      <div class="stats">
        <div class="stat"><div class="v">${days} hari</div><div class="l">Rentang periode</div></div>
        <div class="stat"><div class="v">${agg.docCount}</div><div class="l">Jumlah dokumen</div></div>
        <div class="stat"><div class="v">${agg.items.length}</div><div class="l">Jenis barang</div></div>
        <div class="stat"><div class="v">${fmtRp(agg.grand)}</div><div class="l">Total ${esc(agg.cfg.verb.toLowerCase())}</div></div>
      </div>
      <h2>Ringkasan per Barang</h2>
      <table>
        <thead><tr><th>Barang</th><th style="text-align:right">Total Qty</th><th>Satuan</th><th style="text-align:right">Total Nilai</th></tr></thead>
        <tbody>${itemRows}</tbody>
        <tfoot><tr><td colspan="3">Total</td><td style="text-align:right">${fmtRp(agg.grand)}</td></tr></tfoot>
      </table>
      <h2>Daftar Dokumen</h2>
      <table>
        <thead><tr><th>Nomor</th><th>Tanggal</th><th>${kind === 'purchase' ? 'Supplier' : 'Pelanggan'}</th><th style="text-align:right">Total Qty</th><th style="text-align:right">Nilai</th></tr></thead>
        <tbody>${docRows}</tbody>
        <tfoot><tr><td colspan="4">Total</td><td style="text-align:right">${fmtRp(agg.grand)}</td></tr></tfoot>
      </table>
      <script>window.onload=function(){window.print();};</scr${''}ipt>
    </body></html>`;
  }

  function _generate(kind, from, to) {
    if (!from || !to) {
      toast('Isi tanggal mulai dan akhir', 'warning');
      return;
    }
    if (from > to) {
      toast('Tanggal mulai tidak boleh setelah tanggal akhir', 'warning');
      return;
    }
    const agg = _aggregate(kind, from, to);
    if (!agg.docCount) {
      toast('Tidak ada dokumen pada periode tersebut', 'warning');
      return;
    }
    const win = window.open('', '_blank', 'width=820,height=900');
    if (!win) {
      toast('Pop-up diblokir browser — izinkan pop-up untuk membuat PDF', 'warning');
      return;
    }
    win.document.write(_buildPrintHtml(kind, from, to, agg));
    win.document.close();
    if (typeof window.closeModal === 'function') window.closeModal();
  }

  window.printOrderSummary = function printOrderSummary(kind) {
    kind = kind === 'purchase' ? 'purchase' : 'sales';
    const cfg = _cfg(kind);
    if (typeof window.openModal !== 'function') {
      // No modal — default to last 30 days.
      const to = new Date().toISOString().slice(0, 10);
      const f = new Date();
      f.setDate(f.getDate() - 29);
      _generate(kind, f.toISOString().slice(0, 10), to);
      return;
    }
    const toIso = new Date().toISOString().slice(0, 10);
    const fromD = new Date();
    fromD.setDate(fromD.getDate() - 29);
    const fromIso = fromD.toISOString().slice(0, 10);

    const body = `
      <div style="font-size:12px;color:var(--muted);margin-bottom:12px">
        Pilih periode untuk ringkasan ${esc(cfg.label)}. Ringkasan berisi total per barang,
        daftar dokumen, dan total nilai — siap disimpan sebagai PDF.
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Dari Tanggal</label>
          <input class="form-input" id="osum-from" type="date" value="${fromIso}">
        </div>
        <div class="form-group">
          <label class="form-label">Sampai Tanggal</label>
          <input class="form-input" id="osum-to" type="date" value="${toIso}">
        </div>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:4px">
        <button class="btn-ghost" data-osum-range="7" type="button" style="font-size:11px">7 hari</button>
        <button class="btn-ghost" data-osum-range="30" type="button" style="font-size:11px">30 hari</button>
        <button class="btn-ghost" data-osum-range="90" type="button" style="font-size:11px">90 hari</button>
      </div>`;
    const footer =
      '<button class="btn-ghost" data-action="closeModal">Batal</button>' +
      '<button class="btn" id="osum-go">🖨 Buat PDF</button>';
    window.openModal(`Ringkasan PDF — ${esc(cfg.label)}`, body, footer, false);

    setTimeout(() => {
      const fromInp = document.getElementById('osum-from');
      const toInp = document.getElementById('osum-to');
      document.querySelectorAll('[data-osum-range]').forEach(b =>
        b.addEventListener('click', () => {
          const n = parseInt(b.dataset.osumRange, 10);
          const t = new Date();
          const f = new Date();
          f.setDate(f.getDate() - (n - 1));
          if (toInp) toInp.value = t.toISOString().slice(0, 10);
          if (fromInp) fromInp.value = f.toISOString().slice(0, 10);
        })
      );
      document.getElementById('osum-go')?.addEventListener('click', () => {
        _generate(kind, fromInp?.value, toInp?.value);
      });
    }, 30);
  };
})();
