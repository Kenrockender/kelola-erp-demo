// KELOLA ERP (DEMO) — Export REKAP Pengambilan & Purchase Order  (rekap-export.js)
// ─────────────────────────────────────────────────────────────────────────────
// Reproduces the client's own two spreadsheet layouts so exported files drop
// straight into their existing workflow (and re-import cleanly through
// rekap-import.js):
//
//   1. REKAP TMA-<lokasi>.xlsx — one FILE per site, one SHEET per material,
//      a two-row header, rows grouped by date with a subtotal row after each
//      group, then a grand "SUBTOTAL / <material> = <total> Ton" block.
//      Weights are written in KILOGRAMS with the #,##0 format, which an
//      Indonesian-locale Excel renders as "43.220" — matching the source file
//      and round-tripping through the importer.
//
//   2. Contoh PO.xlsx — the "FORM PEMESANAN BARANG / PURCHASE ORDER" form:
//      a label:value block, the order block, SUB TOTAL / PPN / TOTAL, and two
//      signature columns.
//
// Both are built with the zero-dependency NSAXlsx form-style writer, so they
// work offline in the PWA.
//
// IIFE-wrapped classic <script>; exposes ONLY window.RekapExport.
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
  const db = () => window.DB || {};

  /** 0-based column index → spreadsheet letter (0→A, 25→Z, 26→AA). */
  function colLetter(i) {
    let s = '';
    let n = i;
    for (;;) {
      s = String.fromCharCode(65 + (n % 26)) + s;
      n = Math.floor(n / 26) - 1;
      if (n < 0) break;
    }
    return s;
  }
  const addr = (col, row) => colLetter(col) + row;

  const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  /** "2025-12-13" → "13-Dec-25", the form used throughout the client's rekap. */
  function fmtDate(iso) {
    const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return String(iso || '');
    return `${Number(m[3])}-${MONTH_ABBR[Number(m[2]) - 1]}-${m[1].slice(2)}`;
  }

  /** Tonnes as stored → kilograms as written in the rekap. */
  const toKg = t => (t == null ? null : Math.round(t * 1000));

  // ── source data ──────────────────────────────────────────────────────────────
  /** Delivery orders in range, newest last, with the fields the rekap needs. */
  function _loads(from, to, site) {
    return (db().deliveryOrders || [])
      .filter(d => {
        if (!d.date) return false;
        if (from && d.date < from) return false;
        if (to && d.date > to) return false;
        if (site && String(d.site || '') !== site) return false;
        // A rekap row is a weighed truckload; documents without weights are
        // ordinary deliveries and do not belong in this report.
        return d.grossWeight != null || d.tareWeight != null || (d.lines || []).length > 0;
      })
      .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  }

  function _sites() {
    const set = new Set();
    (db().deliveryOrders || []).forEach(d => d.site && set.add(String(d.site).trim()));
    return [...set].sort((a, b) => a.localeCompare(b));
  }

  /** material name → [loads], keyed off the first line's item name. */
  function _byMaterial(loads) {
    const map = new Map();
    loads.forEach(d => {
      const line = (d.lines || [])[0] || {};
      const name = line.itemName || 'LAIN-LAIN';
      if (!map.has(name)) map.set(name, []);
      map.get(name).push({ doc: d, line });
    });
    return map;
  }

  // ── REKAP sheet builder ──────────────────────────────────────────────────────
  const HEAD_A = ['No', 'No', 'No', 'No', 'No', 'SUPIR', 'Tanggal', 'Isi(kg)', 'Kosong(Kg)', 'Qty(kg)', 'Material', 'Keterangan', 'No'];
  const HEAD_B = ['', 'GJIB', 'DO', 'Surat Jalan', 'Polisi', '', '', '', '', '', '', '', 'PO'];
  const WIDTHS = [5, 9, 9, 11, 11, 13, 11, 11, 12, 11, 16, 16, 8];
  const QTY_COL = 9;

  function _rekapSheet(material, entries) {
    const cells = [];
    const border = { bt: 'thin', bb: 'thin', bl: 'thin', br: 'thin' };

    HEAD_A.forEach((h, c) => {
      cells.push({ c: addr(c, 1), v: h, t: 'text', s: { b: true, h: 'center', ...border } });
    });
    HEAD_B.forEach((h, c) => {
      cells.push({ c: addr(c, 2), v: h, t: 'text', s: { b: true, h: 'center', ...border } });
    });

    // Group by date, preserving chronological order.
    const groups = new Map();
    entries.forEach(e => {
      const d = e.doc.date;
      if (!groups.has(d)) groups.set(d, []);
      groups.get(d).push(e);
    });

    let row = 3;
    let grandKg = 0;
    groups.forEach((list, date) => {
      let groupKg = 0;
      list.forEach((e, i) => {
        const d = e.doc;
        const nettoT =
          d.grossWeight != null && d.tareWeight != null
            ? d.grossWeight - d.tareWeight
            : e.line.qty;
        const kg = toKg(nettoT) || 0;
        groupKg += kg;
        const vals = [
          i + 1,
          d.weighNo || '',
          d.externalDoNo || '',
          d.suratJalanNo || '',
          d.vehicle && d.vehicle !== '—' ? d.vehicle : '',
          d.driver && d.driver !== '—' ? d.driver : '',
          fmtDate(d.date),
          toKg(d.grossWeight),
          toKg(d.tareWeight),
          kg,
          e.line.itemName || material,
          d.site || d.destination || '',
          d.supplierPoNo || d.customerPO || '',
        ];
        vals.forEach((v, c) => {
          if (v == null || v === '') return;
          const numeric = c === 0 || (c >= 7 && c <= QTY_COL);
          cells.push({
            c: addr(c, row),
            v,
            t: numeric ? 'int' : 'text',
            s: { h: numeric ? 'right' : c === 0 ? 'center' : 'left', ...border },
          });
        });
        row++;
      });
      // Per-date subtotal: only the Qty column carries a value, as in the source.
      cells.push({
        c: addr(QTY_COL, row),
        v: groupKg,
        t: 'int',
        s: { b: true, h: 'right', bt: 'thin', bb: 'thin' },
      });
      grandKg += groupKg;
      row++;
      void date;
    });

    // Grand total block.
    row++;
    cells.push({ c: addr(6, row), v: 'SUBTOTAL', t: 'text', s: { b: true } });
    row++;
    cells.push({ c: addr(6, row), v: material, t: 'text', s: { b: true } });
    cells.push({ c: addr(8, row), v: '=', t: 'text', s: { b: true, h: 'center' } });
    cells.push({ c: addr(QTY_COL, row), v: grandKg, t: 'int', s: { b: true, h: 'right' } });
    cells.push({ c: addr(10, row), v: 'Ton', t: 'text', s: { b: true } });

    return {
      // Excel caps sheet names at 31 chars and forbids : \ / ? * [ ]
      name: String(material).replace(/[:\\/?*[\]]/g, '-').slice(0, 31) || 'MATERIAL',
      cols: WIDTHS.map((w, i) => ({ i, width: w })),
      cells,
      _totalKg: grandKg,
    };
  }

  // ── REKAP export ─────────────────────────────────────────────────────────────
  function exportRekap(opts) {
    const { from, to, site } = opts || {};
    if (!window.NSAXlsx) {
      toast('Penulis Excel tidak tersedia', 'danger');
      return 0;
    }
    const loads = _loads(from, to, site);
    if (!loads.length) {
      toast('Tidak ada pengambilan pada periode / lokasi ini', 'warning');
      return 0;
    }
    const sheets = [];
    _byMaterial(loads).forEach((entries, material) => {
      sheets.push(_rekapSheet(material, entries));
    });
    const label = site ? String(site).replace(/[^A-Za-z0-9]+/g, '-') : 'SEMUA';
    const period = from && to ? `${from}_${to}` : from || to || 'semua';
    window.NSAXlsx.download(`REKAP ${label} ${period}.xlsx`, sheets);
    return loads.length;
  }

  // ── PO form export ───────────────────────────────────────────────────────────
  const PO_LABEL_COL = 1;
  const PO_SEP_COL = 2;
  const PO_VALUE_COL = 3;

  function _poRow(cells, row, label, value) {
    if (label !== null) {
      cells.push({ c: addr(0, row), v: '●', t: 'text' });
      cells.push({ c: addr(PO_LABEL_COL, row), v: label, t: 'text' });
      cells.push({ c: addr(PO_SEP_COL, row), v: ':', t: 'text', s: { h: 'center' } });
    }
    cells.push({ c: addr(PO_VALUE_COL, row), v: value, t: 'text', s: { b: true } });
  }

  function exportPO(poId) {
    if (!window.NSAXlsx) {
      toast('Penulis Excel tidak tersedia', 'danger');
      return false;
    }
    const po = (db().purchaseOrders || []).find(p => String(p.id) === String(poId));
    if (!po) {
      toast('Purchase Order tidak ditemukan', 'danger');
      return false;
    }
    const supplier =
      (db().suppliers || []).find(s => String(s.id) === String(po.supplierId)) || {};
    const cells = [];

    cells.push({
      c: addr(0, 4),
      v: 'FORM PEMESANAN BARANG / PURCHASE ORDER',
      t: 'text',
      s: { b: true, sz: 14 },
    });

    let row = 7;
    _poRow(cells, row++, 'Kepada', supplier.name || po.supplier || '');
    if (supplier.address) {
      _poRow(cells, row++, '', supplier.address);
    }
    _poRow(cells, row++, 'Up.', supplier.contact || '');
    _poRow(cells, row++, 'No. Telepon', supplier.phone || '');
    _poRow(cells, row++, 'No. PO', po.number || po.id || '');
    _poRow(cells, row++, 'Tanggal Pemesanan', fmtDate(po.date));
    _poRow(cells, row++, 'Tanggal Pengambilan', po.pickupDate || po.deliveryDate || '');
    _poRow(cells, row++, 'Proyek', po.project || po.destination || '');
    _poRow(cells, row++, 'Pembayaran', po.paymentTerm || po.terms || '');

    row += 2;
    cells.push({ c: addr(1, row), v: 'Daftar Pesanan:', t: 'text', s: { b: true } });
    row++;

    const border = { bt: 'thin', bb: 'thin', bl: 'thin', br: 'thin' };
    ['NAMA BARANG', 'JUMLAH', 'HARGA SATUAN', 'TOTAL'].forEach((h, i) => {
      cells.push({
        c: addr(1 + i, row),
        v: h,
        t: 'text',
        s: { b: true, h: 'center', ...border },
      });
    });
    row++;

    let subtotal = 0;
    (po.lines || []).forEach(l => {
      const qty = Number(l.qty) || 0;
      const price = Number(l.price) || 0;
      const total = qty * price - (Number(l.lineDiscount) || 0);
      subtotal += total;
      cells.push({ c: addr(1, row), v: l.itemName || '', t: 'text', s: border });
      cells.push({ c: addr(2, row), v: qty, t: 'int', s: { h: 'right', ...border } });
      cells.push({ c: addr(3, row), v: price, t: 'int', s: { h: 'right', ...border } });
      cells.push({ c: addr(4, row), v: total, t: 'int', s: { h: 'right', ...border } });
      if (l.unit) {
        cells.push({ c: addr(5, row), v: l.unit, t: 'text' });
      }
      row++;
    });

    // The client's own PPN rate lives in settings; the sample PO uses 11%.
    const rate =
      Number((db().settings && db().settings.taxRate) != null ? db().settings.taxRate : 11) || 0;
    const ppn = Math.round((subtotal * rate) / 100);

    row++;
    cells.push({ c: addr(1, row), v: 'SUB TOTAL', t: 'text', s: { b: true } });
    cells.push({ c: addr(4, row), v: subtotal, t: 'int', s: { b: true, h: 'right' } });
    row++;
    cells.push({ c: addr(1, row), v: `PPN ${rate}%`, t: 'text', s: { b: true } });
    cells.push({ c: addr(4, row), v: ppn, t: 'int', s: { b: true, h: 'right' } });
    row++;
    cells.push({ c: addr(1, row), v: 'TOTAL', t: 'text', s: { b: true } });
    cells.push({
      c: addr(4, row),
      v: subtotal + ppn,
      t: 'int',
      s: { b: true, h: 'right', bt: 'thin', bb: 'medium' },
    });

    row += 4;
    cells.push({ c: addr(1, row), v: 'Menyetujui,', t: 'text' });
    cells.push({ c: addr(4, row), v: 'Pemesan:', t: 'text' });
    row++;
    cells.push({ c: addr(1, row), v: 'Penerima Order', t: 'text' });

    row += 5;
    cells.push({ c: addr(1, row), v: supplier.contact || '', t: 'text', s: { b: true } });
    cells.push({
      c: addr(4, row),
      v: (db().settings && db().settings.company && db().settings.company.signer) || '',
      t: 'text',
      s: { b: true },
    });

    window.NSAXlsx.download(`${po.number || po.id}.xlsx`, [
      {
        name: 'PO',
        cols: [
          { i: 0, width: 4 },
          { i: 1, width: 26 },
          { i: 2, width: 3 },
          { i: 3, width: 20 },
          { i: 4, width: 22 },
          { i: 5, width: 16 },
        ],
        cells,
      },
    ]);
    return true;
  }

  // ── REKAP export dialog ──────────────────────────────────────────────────────
  function open() {
    const sites = _sites();
    const loads = db().deliveryOrders || [];
    const dates = loads.map(d => d.date).filter(Boolean).sort();
    const defFrom = dates[0] || '';
    const defTo = dates[dates.length - 1] || '';

    const body = `
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Dari Tanggal</label>
          <input class="form-input" id="rkx-from" type="date" value="${esc(defFrom)}">
        </div>
        <div class="form-group">
          <label class="form-label">Sampai Tanggal</label>
          <input class="form-input" id="rkx-to" type="date" value="${esc(defTo)}">
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Lokasi / Site</label>
        <select class="form-select" id="rkx-site">
          <option value="__ALL__">Semua lokasi — satu file per lokasi</option>
          ${sites.map(s => `<option value="${esc(s)}">${esc(s)}</option>`).join('')}
        </select>
      </div>
      <div style="font-size:11px;color:var(--muted);margin-top:8px">
        Satu sheet per material, dikelompokkan per tanggal dengan subtotal —
        mengikuti bentuk REKAP TMA yang sudah dipakai. Berat ditulis dalam kilogram.
      </div>`;

    window.openModal(
      'Export REKAP Pengambilan',
      body,
      `<button class="btn-ghost" data-action="closeModal">Batal</button>
       <button class="btn" id="rkx-go">⬇ Export</button>`,
      true
    );

    setTimeout(() => {
      document.getElementById('rkx-go')?.addEventListener('click', () => {
        const from = document.getElementById('rkx-from')?.value || '';
        const to = document.getElementById('rkx-to')?.value || '';
        const site = document.getElementById('rkx-site')?.value || '__ALL__';
        let n = 0;
        if (site === '__ALL__') {
          const list = sites.length ? sites : [''];
          list.forEach(s => {
            n += exportRekap({ from, to, site: s });
          });
        } else {
          n = exportRekap({ from, to, site });
        }
        if (n) {
          toast(`${n} pengambilan diekspor`, 'success');
          if (typeof window.closeModal === 'function') window.closeModal();
        }
      });
    }, 50);
  }

  window.RekapExport = {
    open,
    exportRekap,
    exportPO,
    // exported for tests
    _rekapSheet,
    _byMaterial,
    _loads,
    fmtDate,
    colLetter,
  };
})();
