// KELOLA ERP (DEMO) — Import REKAP Pengambilan  (rekap-import.js)
// ─────────────────────────────────────────────────────────────────────────────
// The client's field records live in "REKAP TMA-<lokasi>.xlsx" workbooks whose
// shape is nothing like the flat one-header-row sheets excel-import.js handles:
//
//   • header spans TWO rows — row A is "No No No No No SUPIR Tanggal …" and row
//     B qualifies the repeated "No" columns as GJIB / DO / Surat Jalan / Polisi.
//   • ONE SHEET PER MATERIAL; the sheet name IS the material ("SPLITE 1-2").
//   • rows are grouped by date and every group is followed by a subtotal row
//     that fills only the Qty column, then a grand "SUBTOTAL … Ton" row.
//   • weights are written Indonesian-style in KILOGRAMS: "43.220" is 43,220 kg,
//     the dot being a THOUSANDS separator. Reading it as a decimal understates
//     every load by 1000× and silently corrupts every invoice built on it.
//
// So this is a separate importer rather than another SHEETS entry. It commits
// through the same DB + saveDB() path as the rest of the app, producing one
// deliveryOrder per truckload.
//
// Open questions still pending with the client (see docs/PERTANYAAN_CLIENT.md):
// the dedupe key is provisional — surat-jalan numbers repeat across material
// sheets — so duplicates are FLAGGED in the preview and the operator decides.
//
// IIFE-wrapped classic <script>; exposes ONLY window.RekapImport.
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

  // Parsed state between the mapping step and the commit step.
  let _state = null; // { rows, materials, fileName, supplierId }

  // ── column detection ─────────────────────────────────────────────────────────
  // Patterns are tried in this order and each field is claimed once, so the
  // narrower ones ("Surat Jalan") must come before the broader ones ("DO").
  const COL_PATTERNS = [
    ['suratJalanNo', /surat\s*jalan/i],
    ['weighNo', /gjib|timbang/i],
    ['vehicle', /polisi|nopol/i],
    ['driver', /supir|sopir|driver/i],
    ['date', /tanggal|tgl/i],
    ['gross', /\bisi\b/i],
    ['tare', /kosong/i],
    ['netto', /qty|netto|net\b/i],
    ['material', /material|barang/i],
    ['keterangan', /keterangan|lokasi|proyek/i],
    ['supplierPoNo', /\bpo\b/i],
    ['externalDoNo', /\bdo\b/i],
  ];

  /** Locate the 2-row header and map each spreadsheet column to a field name.
   *  Returns { headerEnd, idx } where headerEnd is the last header row index. */
  function _findHeader(aoa) {
    for (let r = 0; r < Math.min(aoa.length, 30); r++) {
      const row = (aoa[r] || []).map(c => String(c == null ? '' : c).trim());
      const joined = row.join(' ');
      // The anchor row is the one naming the driver and date columns.
      if (!/supir|sopir|driver/i.test(joined) || !/tanggal|tgl/i.test(joined)) continue;

      const next = (aoa[r + 1] || []).map(c => String(c == null ? '' : c).trim());
      // Row B only qualifies row A when it holds no data of its own — if it
      // parses as a date it is already the first record and the header is 1 row.
      const twoRow = next.some(c => /gjib|surat\s*jalan|polisi|\bdo\b|\bpo\b/i.test(c));
      const width = Math.max(row.length, twoRow ? next.length : 0);
      const combined = [];
      for (let c = 0; c < width; c++) {
        combined[c] = [row[c] || '', twoRow ? next[c] || '' : ''].filter(Boolean).join(' ').trim();
      }

      const idx = {};
      const taken = new Set();
      COL_PATTERNS.forEach(([field, re]) => {
        for (let c = 0; c < combined.length; c++) {
          if (taken.has(c) || !combined[c] || !re.test(combined[c])) continue;
          idx[field] = c;
          taken.add(c);
          return;
        }
      });
      if (idx.date == null) continue;
      return { headerEnd: twoRow ? r + 1 : r, idx, combined };
    }
    return null;
  }

  // ── value coercion ───────────────────────────────────────────────────────────
  /** Indonesian-formatted number: "43.220" → 43220, "1.234.567" → 1234567,
   *  "48,89" → 48.89. A dot is a thousands separator only when followed by
   *  exactly three digits; otherwise it is a decimal point. */
  function _num(v) {
    if (v == null || v === '') return null;
    if (typeof v === 'number') return v;
    let s = String(v).trim().replace(/[^0-9.,-]/g, '');
    if (!s) return null;
    s = s.replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.');
    const n = Number(s);
    return isNaN(n) ? null : n;
  }

  /** Weight cells are labelled (kg) and written as kg. Values below 1000 are
   *  assumed to already be tonnes so a hand-edited "48,89" still works. */
  function _toTon(v) {
    const n = _num(v);
    if (n == null) return null;
    return n >= 1000 ? Math.round((n / 1000) * 1000) / 1000 : Math.round(n * 1000) / 1000;
  }

  const MONTHS = {
    jan: 1, feb: 2, mar: 3, apr: 4, may: 5, mei: 5, jun: 6, jul: 7,
    aug: 8, agu: 8, ags: 8, sep: 9, oct: 10, okt: 10, nov: 11, dec: 12, des: 12,
  };

  /** "13-Dec-25" / "7-Jan-26" / Date / Excel serial → "YYYY-MM-DD". */
  function _date(v) {
    if (v == null || v === '') return null;
    if (v instanceof Date && !isNaN(v)) {
      return `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, '0')}-${String(v.getDate()).padStart(2, '0')}`;
    }
    if (typeof v === 'number') {
      const d = new Date(Math.round((v - 25569) * 86400 * 1000));
      return isNaN(d) ? null : d.toISOString().slice(0, 10);
    }
    const s = String(v).trim();
    let m = s.match(/^(\d{1,2})[-/\s]([A-Za-z]{3,})[-/\s](\d{2,4})$/);
    if (m) {
      const mo = MONTHS[m[2].slice(0, 3).toLowerCase()];
      if (mo) {
        let y = Number(m[3]);
        if (y < 100) y += 2000;
        return `${y}-${String(mo).padStart(2, '0')}-${String(Number(m[1])).padStart(2, '0')}`;
      }
    }
    m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (m) return `${m[1]}-${String(+m[2]).padStart(2, '0')}-${String(+m[3]).padStart(2, '0')}`;
    m = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
    if (m) return `${m[3]}-${String(+m[2]).padStart(2, '0')}-${String(+m[1]).padStart(2, '0')}`;
    // No `new Date(s)` fallback on purpose. V8 parses "Splite 1-2" as
    // 2 Jan 2001 and "ABU 0-5" as 1 May 2000, which let the sheet's grand-total
    // row pass as a truckload and doubled every material's tonnage.
    return null;
  }

  /** Fold material spelling variants together: "Splite 1-2" / "SPLITE 1-2" and
   *  "ABU BATU 0-5" / "ABU 0-5" (the grand-total row drops "BATU"). */
  function _normMaterial(s) {
    return String(s || '')
      .toUpperCase()
      .replace(/\s+/g, ' ')
      .replace(/[^A-Z0-9 -]/g, '')
      .trim();
  }

  // ── parsing ──────────────────────────────────────────────────────────────────
  function _parseSheet(aoa, sheetName) {
    const hdr = _findHeader(aoa);
    if (!hdr) return { rows: [], skipped: 0, error: 'Header tidak dikenali' };
    const { idx, headerEnd } = hdr;
    const cell = (raw, f) => (idx[f] != null ? raw[idx[f]] : '');
    const rows = [];
    let skipped = 0;

    for (let r = headerEnd + 1; r < aoa.length; r++) {
      const raw = (aoa[r] || []).map(c => (c == null ? '' : c));
      if (raw.every(c => String(c).trim() === '')) continue;
      // Grand-total and per-date subtotal rows carry no date; the grand total
      // additionally spells SUBTOTAL somewhere on the line.
      if (raw.some(c => /subtotal|jumlah|total/i.test(String(c)))) {
        skipped++;
        continue;
      }
      const date = _date(cell(raw, 'date'));
      if (!date) {
        skipped++;
        continue;
      }
      // Second gate: a real load always carries at least one identifying
      // number. Subtotal and label rows carry only a tonnage, so without this
      // any stray value in the date column would turn one into a phantom load.
      const hasId = ['weighNo', 'externalDoNo', 'suratJalanNo', 'vehicle'].some(
        f => String(cell(raw, f) || '').trim() !== ''
      );
      if (!hasId) {
        skipped++;
        continue;
      }
      const gross = _toTon(cell(raw, 'gross'));
      const tare = _toTon(cell(raw, 'tare'));
      const nettoCol = _toTon(cell(raw, 'netto'));
      const netto =
        gross != null && tare != null ? Math.round((gross - tare) * 1000) / 1000 : nettoCol;

      const rec = {
        _row: r + 1,
        _sheet: sheetName,
        _errors: [],
        _warnings: [],
        date,
        weighNo: String(cell(raw, 'weighNo') || '').trim(),
        externalDoNo: String(cell(raw, 'externalDoNo') || '').trim(),
        suratJalanNo: String(cell(raw, 'suratJalanNo') || '').trim(),
        vehicle: String(cell(raw, 'vehicle') || '').trim(),
        driver: String(cell(raw, 'driver') || '').trim(),
        gross,
        tare,
        netto,
        // The Material column repeats the sheet name; the sheet name wins when
        // the cell is blank.
        material: String(cell(raw, 'material') || '').trim() || sheetName,
        site: String(cell(raw, 'keterangan') || '').trim(),
        supplierPoNo: String(cell(raw, 'supplierPoNo') || '').trim(),
      };

      if (netto == null || netto <= 0) rec._errors.push('Netto kosong / tidak valid');
      if (gross != null && tare != null && gross <= tare) {
        rec._errors.push('Berat isi ≤ berat kosong');
      }
      // Cross-check the sheet's own Qty column against isi − kosong.
      if (nettoCol != null && netto != null && Math.abs(nettoCol - netto) > 0.02) {
        rec._warnings.push(`Qty di file (${nettoCol}) ≠ isi−kosong (${netto})`);
      }
      if (!rec.supplierPoNo) rec._warnings.push('No PO kosong');
      rows.push(rec);
    }
    return { rows, skipped, error: null };
  }

  // ── duplicate detection ──────────────────────────────────────────────────────
  // PROVISIONAL KEY — see docs/PERTANYAAN_CLIENT.md butir 1. Surat-jalan numbers
  // are known to repeat across material sheets, so this combination is the
  // safest available today. Matches are flagged, never dropped silently.
  function _dupKey(r) {
    return [r.date, _normMaterial(r.vehicle), String(r.suratJalanNo).trim()].join('|');
  }
  function _existingKeys() {
    const set = new Set();
    (db().deliveryOrders || []).forEach(d => {
      set.add(
        [d.date, _normMaterial(d.vehicle), String(d.suratJalanNo || '').trim()].join('|')
      );
    });
    return set;
  }

  // ── material → item master mapping ───────────────────────────────────────────
  function _savedMap() {
    return (db().settings && db().settings.rekapMaterialMap) || {};
  }
  /** Best-guess item for a material name: exact normalised match first, then a
   *  containment match, so "SPLITE 1-2" finds an item named "Split 1-2". */
  function _suggestItem(material) {
    const items = db().inventoryItems || [];
    const key = _normMaterial(material);
    const saved = _savedMap()[key];
    if (saved != null) {
      const hit = items.find(i => String(i.id) === String(saved));
      if (hit) return hit.id;
    }
    let hit = items.find(i => _normMaterial(i.name) === key);
    if (hit) return hit.id;
    hit = items.find(i => {
      const n = _normMaterial(i.name);
      return n && (n.includes(key) || key.includes(n));
    });
    return hit ? hit.id : '';
  }

  // ── PO resolution ────────────────────────────────────────────────────────────
  /** The rekap's "No PO" is a bare sequence number ("041", "133"). Match it
   *  against purchase orders whose number contains that sequence in the same
   *  year as the row's date. Ambiguous or missing matches leave poId null and
   *  the raw number is kept on the record either way. */
  function _resolvePO(poNo, date) {
    const seq = String(poNo || '').trim();
    if (!seq) return null;
    const year = String(date || '').slice(0, 4);
    const wanted = String(Number(seq));
    const matches = (db().purchaseOrders || []).filter(p => {
      const num = String(p.number || p.id || '');
      const groups = num.match(/\d+/g) || [];
      const sameYear = !year || num.includes(year) || String(p.date || '').startsWith(year);
      return sameYear && groups.some(g => String(Number(g)) === wanted);
    });
    return matches.length === 1 ? matches[0].id : null;
  }

  // ── step 1: supplier + material mapping ──────────────────────────────────────
  function _renderMappingStep() {
    const items = db().inventoryItems || [];
    const suppliers = db().suppliers || [];
    const itemOpts = items
      .map(i => `<option value="${esc(i.id)}">${esc(i.name)}</option>`)
      .join('');

    const matRows = _state.materials
      .map(m => {
        const sel = _suggestItem(m.name);
        return `
        <tr>
          <td style="padding:6px 8px">
            <strong>${esc(m.name)}</strong>
            <div style="font-size:11px;color:var(--muted)">${m.count} baris · ${m.ton.toFixed(2)} Ton</div>
          </td>
          <td style="padding:6px 8px">
            <select class="form-select rekap-map" data-mat="${esc(_normMaterial(m.name))}" style="width:100%">
              <option value="">— Buat item baru: ${esc(m.name)} —</option>
              ${itemOpts}
            </select>
          </td>
        </tr>`;
      })
      .join('');

    const supOpts = suppliers
      .map(s => `<option value="${esc(s.id)}">${esc(s.name)}</option>`)
      .join('');

    return `
      <div style="font-size:12px;color:var(--muted);margin-bottom:12px">
        <strong>${esc(_state.fileName)}</strong> — ${_state.rows.length} muatan terbaca
        dari ${_state.materials.length} material.
      </div>

      <div class="form-group" style="margin-bottom:14px">
        <label class="form-label">Supplier (asal pengambilan)</label>
        <select class="form-select" id="rekap-supplier">
          <option value="">— Tidak ditentukan —</option>
          ${supOpts}
        </select>
        <div style="font-size:11px;color:var(--muted);margin-top:4px">
          Satu file rekap = pengambilan dari satu supplier. Dipakai untuk semua baris.
        </div>
      </div>

      <div class="form-group">
        <label class="form-label">Pemetaan Material → Barang</label>
        <div class="table-wrap" style="overflow:auto;max-height:260px">
          <table style="width:100%;font-size:12px">
            <thead><tr>
              <th style="text-align:left;padding:6px 8px">Material di file</th>
              <th style="text-align:left;padding:6px 8px">Barang di sistem</th>
            </tr></thead>
            <tbody>${matRows}</tbody>
          </table>
        </div>
        <div style="font-size:11px;color:var(--muted);margin-top:6px">
          Pilihan ini diingat untuk impor berikutnya.
        </div>
      </div>`;
  }

  // ── step 2: preview ──────────────────────────────────────────────────────────
  function _renderPreviewStep() {
    const existing = _existingKeys();
    const seen = new Set();
    let dupes = 0;
    let bad = 0;
    let ton = 0;

    _state.rows.forEach(r => {
      r._dupe = false;
      const k = _dupKey(r);
      if (existing.has(k) || seen.has(k)) {
        r._dupe = true;
        dupes++;
      }
      seen.add(k);
      if (r._errors.length) bad++;
      else if (!r._dupe) ton += r.netto || 0;
    });

    const head = ['Tgl', 'GJIB', 'DO', 'SJ', 'Nopol', 'Supir', 'Isi', 'Kosong', 'Netto', 'Material', 'Lokasi', 'PO', 'Status']
      .map(h => `<th style="text-align:left;padding:4px 8px;white-space:nowrap">${h}</th>`)
      .join('');

    const body = _state.rows
      .slice(0, 100)
      .map(r => {
        const bg = r._errors.length
          ? 'background:var(--danger-bg)'
          : r._dupe
            ? 'background:var(--warning-bg,#FEF3C7)'
            : '';
        const status = r._errors.length
          ? `<span style="color:var(--danger)">${esc(r._errors.join('; '))}</span>`
          : r._dupe
            ? '<span style="color:var(--warning)">Duplikat?</span>'
            : r._warnings.length
              ? `<span style="color:var(--muted)">${esc(r._warnings.join('; '))}</span>`
              : '<span style="color:var(--success)">✓</span>';
        return `<tr style="${bg}">
          <td style="padding:4px 8px;white-space:nowrap">${esc(r.date)}</td>
          <td style="padding:4px 8px">${esc(r.weighNo)}</td>
          <td style="padding:4px 8px">${esc(r.externalDoNo)}</td>
          <td style="padding:4px 8px">${esc(r.suratJalanNo)}</td>
          <td style="padding:4px 8px;font-family:monospace">${esc(r.vehicle)}</td>
          <td style="padding:4px 8px">${esc(r.driver)}</td>
          <td style="padding:4px 8px;text-align:right">${r.gross ?? ''}</td>
          <td style="padding:4px 8px;text-align:right">${r.tare ?? ''}</td>
          <td style="padding:4px 8px;text-align:right;font-weight:700">${r.netto ?? ''}</td>
          <td style="padding:4px 8px;white-space:nowrap">${esc(r.material)}</td>
          <td style="padding:4px 8px;white-space:nowrap">${esc(r.site)}</td>
          <td style="padding:4px 8px">${esc(r.supplierPoNo)}</td>
          <td style="padding:4px 8px;white-space:nowrap">${status}</td>
        </tr>`;
      })
      .join('');

    _state.stats = { dupes, bad, ton };

    return `
      <div style="display:flex;gap:16px;flex-wrap:wrap;font-size:12px;margin-bottom:10px">
        <div><strong>${_state.rows.length}</strong> muatan</div>
        <div style="color:var(--success)"><strong>${(_state.rows.length - bad - dupes)}</strong> siap import</div>
        <div style="color:var(--warning)"><strong>${dupes}</strong> dugaan duplikat</div>
        <div style="color:var(--danger)"><strong>${bad}</strong> bermasalah</div>
        <div><strong>${ton.toFixed(2)}</strong> Ton total</div>
      </div>
      <div style="font-size:11px;color:var(--muted);margin-bottom:8px">
        Berat dibaca sebagai kilogram dan dikonversi ke Ton. Baris bermasalah selalu dilewati.
      </div>
      <label style="display:flex;align-items:center;gap:6px;font-size:12px;margin-bottom:10px;cursor:pointer">
        <input type="checkbox" id="rekap-skip-dupes" checked>
        Lewati baris yang terdeteksi duplikat
        <span style="color:var(--muted)">(kunci: tanggal + nopol + no. surat jalan — masih menunggu konfirmasi client)</span>
      </label>
      <div class="table-wrap" style="overflow:auto;max-height:340px">
        <table style="width:100%;font-size:11px"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>
      </div>
      ${_state.rows.length > 100 ? `<div style="font-size:11px;color:var(--muted);margin-top:6px">…dan ${_state.rows.length - 100} baris lagi</div>` : ''}`;
  }

  // ── commit ───────────────────────────────────────────────────────────────────
  function _commit(skipDupes) {
    const created = { items: 0, dos: 0 };
    let skipped = 0;
    const unresolvedPO = new Set();

    const D = db();
    D.settings = D.settings || {};
    D.settings.rekapMaterialMap = D.settings.rekapMaterialMap || {};

    const supplier = (D.suppliers || []).find(s => String(s.id) === String(_state.supplierId));

    // Resolve every material to a concrete item once, creating the ones the
    // operator left as "buat item baru".
    const itemFor = {};
    _state.materials.forEach(m => {
      const key = _normMaterial(m.name);
      let id = _state.mapping[key];
      if (!id) {
        const nextId =
          (D.inventoryItems || []).reduce((mx, x) => Math.max(mx, Number(x.id) || 0), 0) + 1;
        const item = {
          id: nextId,
          name: m.name,
          category: 'Material',
          unit: 'Ton',
          stock: 0,
          min: 0,
          cost: 0,
          sell: 0,
          warehouseStock: {},
        };
        (D.inventoryItems || (D.inventoryItems = [])).push(item);
        created.items++;
        id = item.id;
      }
      itemFor[key] = id;
      D.settings.rekapMaterialMap[key] = id;
    });

    const existing = _existingKeys();
    const seen = new Set();

    _state.rows.forEach(r => {
      if (r._errors.length) {
        skipped++;
        return;
      }
      const k = _dupKey(r);
      if (skipDupes && (existing.has(k) || seen.has(k))) {
        skipped++;
        return;
      }
      seen.add(k);

      const matKey = _normMaterial(r.material);
      const itemId = itemFor[matKey];
      const item = (D.inventoryItems || []).find(i => String(i.id) === String(itemId));
      const poId = _resolvePO(r.supplierPoNo, r.date);
      if (r.supplierPoNo && !poId) unresolvedPO.add(r.supplierPoNo);

      const newId =
        typeof window.nextId === 'function'
          ? window.nextId('DO', D.deliveryOrders || [])
          : `DO-REKAP-${Date.now()}-${created.dos}`;

      const doc = {
        id: newId,
        number: newId,
        soId: null,
        poId: poId,
        customer: supplier ? supplier.name : '',
        customerId: null,
        supplierId: supplier ? supplier.id : null,
        destination: r.site || '',
        site: r.site || '',
        date: r.date,
        status: 'Sent',
        driver: r.driver || '—',
        vehicle: r.vehicle || '—',
        customerPO: '',
        supplierPoNo: r.supplierPoNo || '',
        notes: r._warnings.length ? r._warnings.join(' · ') : '',
        weighNo: r.weighNo || '',
        externalDoNo: r.externalDoNo || '',
        suratJalanNo: r.suratJalanNo || '',
        grossWeight: r.gross,
        tareWeight: r.tare,
        importedFrom: _state.fileName,
        lines: [
          {
            itemId: itemId,
            itemName: item ? item.name : r.material,
            itemCode: '',
            qty: r.netto,
            unit: 'Ton',
          },
        ],
      };
      (D.deliveryOrders || (D.deliveryOrders = [])).unshift(doc);
      created.dos++;
    });

    if (typeof window.saveDB === 'function') window.saveDB();
    if (typeof window.closeModal === 'function') window.closeModal();
    if (typeof window.navigate === 'function') window.navigate('logistics');

    const bits = [`${created.dos} surat jalan dibuat`];
    if (created.items) bits.push(`${created.items} barang baru`);
    if (skipped) bits.push(`${skipped} dilewati`);
    toast(bits.join(' · '), created.dos ? 'success' : 'warning');
    if (unresolvedPO.size) {
      toast(
        `No. PO belum cocok dengan PO di sistem: ${[...unresolvedPO].slice(0, 8).join(', ')}${unresolvedPO.size > 8 ? '…' : ''}`,
        'warning'
      );
    }
    _state = null;
  }

  // ── wizard plumbing ──────────────────────────────────────────────────────────
  function _showMapping() {
    window.openModal(
      'Import REKAP Pengambilan — 1/2 Pemetaan',
      _renderMappingStep(),
      `<button class="btn-ghost" data-action="closeModal">Batal</button>
       <button class="btn" id="rekap-next">Lanjut →</button>`,
      true
    );
    setTimeout(() => {
      // Pre-select each material's best guess.
      document.querySelectorAll('.rekap-map').forEach(sel => {
        const mat = sel.dataset.mat;
        const src = _state.materials.find(m => _normMaterial(m.name) === mat);
        const guess = src ? _suggestItem(src.name) : '';
        if (guess) sel.value = String(guess);
      });
      document.getElementById('rekap-next')?.addEventListener('click', () => {
        _state.mapping = {};
        document.querySelectorAll('.rekap-map').forEach(sel => {
          _state.mapping[sel.dataset.mat] = sel.value || '';
        });
        _state.supplierId = document.getElementById('rekap-supplier')?.value || '';
        _showPreview();
      });
    }, 50);
  }

  function _showPreview() {
    window.openModal(
      'Import REKAP Pengambilan — 2/2 Pratinjau',
      _renderPreviewStep(),
      `<button class="btn-ghost" id="rekap-back">← Kembali</button>
       <button class="btn" id="rekap-commit">✓ Import</button>`,
      true
    );
    setTimeout(() => {
      document.getElementById('rekap-back')?.addEventListener('click', _showMapping);
      document.getElementById('rekap-commit')?.addEventListener('click', () => {
        const skip = document.getElementById('rekap-skip-dupes')?.checked !== false;
        _commit(skip);
      });
    }, 50);
  }

  // ── entry point ──────────────────────────────────────────────────────────────
  /** Parse a workbook and open the wizard. Split out from open() so the flow can
   *  be driven without a native file dialog. Returns a promise for that use. */
  function handleFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = ev => {
        try {
          const wb = window.XLSX.read(new Uint8Array(ev.target.result), {
            type: 'array',
            cellDates: true,
          });
          const rows = [];
          const failed = [];
          wb.SheetNames.forEach(name => {
            const aoa = window.XLSX.utils.sheet_to_json(wb.Sheets[name], {
              header: 1,
              raw: false,
              defval: '',
            });
            const res = _parseSheet(aoa, name);
            if (res.error) {
              failed.push(`${name} (${res.error})`);
              return;
            }
            rows.push(...res.rows);
          });

          if (!rows.length) {
            toast(
              failed.length
                ? `Tidak ada baris terbaca. Sheet dilewati: ${failed.join(', ')}`
                : 'Tidak ada baris yang dikenali di file ini',
              'warning'
            );
            resolve(null);
            return;
          }

          // Distinct materials with their volume, for the mapping screen.
          const matMap = new Map();
          rows.forEach(r => {
            const key = _normMaterial(r.material);
            if (!matMap.has(key)) matMap.set(key, { name: r.material, count: 0, ton: 0 });
            const m = matMap.get(key);
            m.count++;
            m.ton += r.netto || 0;
          });

          _state = {
            rows,
            materials: [...matMap.values()],
            fileName: file.name,
            mapping: {},
            supplierId: '',
          };
          if (failed.length) {
            toast(`Sheet dilewati: ${failed.join(', ')}`, 'warning');
          }
          _showMapping();
          resolve(_state);
        } catch (err) {
          console.error('[rekap-import] parse error', err);
          toast('Gagal membaca file: ' + (err && err.message), 'danger');
          reject(err);
        }
      };
      reader.readAsArrayBuffer(file);
    });
  }

  function open() {
    if (!window.XLSX) {
      toast('Parser Excel belum siap (XLSX). Muat ulang halaman.', 'danger');
      return;
    }
    const inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = '.xlsx,.xls';
    inp.style.display = 'none';
    document.body.appendChild(inp);
    inp.addEventListener('change', () => {
      const file = inp.files && inp.files[0];
      inp.remove();
      if (file) handleFile(file);
    });
    inp.click();
  }

  window.RekapImport = {
    open,
    handleFile,
    // exported for tests
    _parseSheet,
    _findHeader,
    _num,
    _toTon,
    _date,
    _normMaterial,
  };
})();
