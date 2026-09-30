// KELOLA ERP (DEMO) — Input Surat Jalan (petugas lapangan)  (surat-jalan-view.js)
// ─────────────────────────────────────────────────────────────────────────────
// The only screen the `lapangan` role can reach. It exists because the people
// recording loads are standing at a weighbridge on a phone, not sitting in an
// office: one truck at a time, big fields, no money on screen, and no way to
// quietly change a load that was already recorded.
//
// The correction path is deliberately indirect. A field user who mistypes CANNOT
// edit the saved record — they raise a flag with a note, TMA fixes it, and the
// flag is what the Telegram bot announces (telegram.js). That keeps a shared
// login from being able to rewrite history.
//
// Because the account is SHARED across sites, the operator types their own name
// into "Nama Petugas" — the audit trail cannot otherwise tell who was on shift.
// See docs/PERTANYAAN_CLIENT.md butir 6.
//
// Global-scope rule: classic <script>, IIFE-wrapped, exposes only
// window.renderSuratJalan (+ window.SuratJalanView for handlers and tests).
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
  const today = () => new Date().toISOString().slice(0, 10);

  const LS_OPERATOR = 'erp.suratjalan.operator';

  function _operatorName() {
    try {
      return window.localStorage.getItem(LS_OPERATOR) || '';
    } catch (_) {
      return '';
    }
  }
  function _rememberOperator(name) {
    try {
      window.localStorage.setItem(LS_OPERATOR, name);
    } catch (_) {
      /* private mode — the name still goes onto the record */
    }
  }

  /** Netto in tonnes from the two weighbridge readings. */
  function netto(gross, tare) {
    if (gross == null || tare == null) return null;
    return Math.round((gross - tare) * 1000) / 1000;
  }

  /** Loads recorded today, newest first — the operator's own working list. */
  function _todayLoads() {
    return (db().deliveryOrders || [])
      .filter(d => d.date === today())
      .slice()
      .sort((a, b) => String(b.id).localeCompare(String(a.id)));
  }

  function _optionList(values) {
    return [...new Set(values.filter(Boolean))]
      .sort((a, b) => String(a).localeCompare(String(b)))
      .map(v => `<option value="${esc(v)}">`)
      .join('');
  }

  function _field(id, label, opts) {
    const o = opts || {};
    const list = o.datalist ? ` list="${id}-list"` : '';
    return `
      <div class="form-group">
        <label class="form-label" style="font-size:13px">${esc(label)}${o.required ? ' <span style="color:var(--danger)">*</span>' : ''}</label>
        <input class="form-input" id="${id}" type="${o.type || 'text'}"
          ${o.step ? `step="${o.step}"` : ''}
          ${o.inputmode ? `inputmode="${o.inputmode}"` : ''}
          value="${esc(o.value || '')}"
          placeholder="${esc(o.placeholder || '')}"${list}
          style="font-size:16px;padding:11px 12px">
        ${o.datalist ? `<datalist id="${id}-list">${o.datalist}</datalist>` : ''}
      </div>`;
  }

  window.renderSuratJalan = function renderSuratJalan() {
    const dos = db().deliveryOrders || [];
    const sites = _optionList(dos.map(d => d.site));
    const vehicles = _optionList(dos.map(d => d.vehicle).filter(v => v && v !== '—'));
    const drivers = _optionList(dos.map(d => d.driver).filter(v => v && v !== '—'));
    const materials = _optionList((db().inventoryItems || []).map(i => i.name));
    const loads = _todayLoads();

    return `
      <div class="sec-hdr">
        <h1>Input Surat Jalan</h1>
        <p class="sec-sub">Catat satu muatan truk. Isi angka timbangan apa adanya —
          bagian kantor yang menghitung sisanya.</p>
      </div>

      <div class="card" style="max-width:720px">
        ${_field('sj-operator', 'Nama Petugas', {
          required: true,
          value: _operatorName(),
          placeholder: 'Nama Anda',
        })}
        <div class="form-row">
          ${_field('sj-date', 'Tanggal', { type: 'date', required: true, value: today() })}
          ${_field('sj-site', 'Lokasi / Site', { required: true, datalist: sites, placeholder: 'cth: TRIAS CIKANDE' })}
        </div>
        <div class="form-row">
          ${_field('sj-vehicle', 'No. Polisi', { required: true, datalist: vehicles, placeholder: 'B 1234 XY' })}
          ${_field('sj-driver', 'Nama Supir', { datalist: drivers, placeholder: 'Nama supir' })}
        </div>
        <div class="form-row">
          ${_field('sj-material', 'Material', { required: true, datalist: materials, placeholder: 'cth: Splite 1-2' })}
          ${_field('sj-po', 'No. PO', { placeholder: 'cth: 054' })}
        </div>

        <div style="font-size:12px;font-weight:700;color:var(--muted);margin:14px 0 6px">Nomor Dokumen</div>
        <div class="form-row">
          ${_field('sj-gjib', 'No. GJIB / Timbangan', { placeholder: 'cth: 40699' })}
          ${_field('sj-do', 'No. DO', { placeholder: 'cth: 40539' })}
        </div>
        ${_field('sj-no', 'No. Surat Jalan', { required: true, placeholder: 'cth: 421' })}

        <div style="font-size:12px;font-weight:700;color:var(--muted);margin:14px 0 6px">Timbangan (kg)</div>
        <div class="form-row">
          ${_field('sj-gross', 'Berat Isi', { type: 'number', step: '1', inputmode: 'decimal', placeholder: 'cth: 48890' })}
          ${_field('sj-tare', 'Berat Kosong', { type: 'number', step: '1', inputmode: 'decimal', placeholder: 'cth: 12470' })}
        </div>
        <div id="sj-netto" style="font-size:15px;font-weight:800;padding:10px 12px;border-radius:8px;
          background:var(--surface-2,#F3F4F6);margin-bottom:12px">Netto: —</div>

        <div class="form-group">
          <label class="form-label" style="font-size:13px">Catatan <span style="font-size:11px;color:var(--muted);font-weight:400">(opsional)</span></label>
          <textarea class="form-input" id="sj-notes" rows="2" placeholder="Catatan kondisi muatan…" style="font-size:15px"></textarea>
        </div>

        <button class="btn" id="sj-save" style="width:100%;padding:13px;font-size:15px;font-weight:800">
          Simpan Surat Jalan
        </button>
      </div>

      <div class="card" style="max-width:720px;margin-top:16px">
        <div style="font-size:14px;font-weight:800;margin-bottom:4px">Input Hari Ini (${loads.length})</div>
        <div style="font-size:11px;color:var(--muted);margin-bottom:10px">
          Salah input? Tekan <strong>Minta Koreksi</strong> dan tulis apa yang salah —
          kantor yang akan membetulkan.
        </div>
        ${
          loads.length === 0
            ? '<div style="font-size:12px;color:var(--muted);text-align:center;padding:20px">Belum ada input hari ini.</div>'
            : loads
                .map(d => {
                  const n = netto(d.grossWeight, d.tareWeight);
                  const flagged = !!d.needsCorrection;
                  return `<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;
                    padding:10px 0;border-top:1px solid var(--border,#E5E7EB)">
                    <div style="min-width:0">
                      <div style="font-weight:700;font-size:13px">
                        SJ ${esc(d.suratJalanNo || '—')} · ${esc(d.vehicle || '—')}
                        ${flagged ? '<span style="display:inline-block;font-size:10px;font-weight:800;color:#92400E;background:#FEF3C7;border-radius:99px;padding:1px 7px;margin-left:4px">MINTA KOREKSI</span>' : ''}
                      </div>
                      <div style="font-size:11px;color:var(--muted)">
                        ${esc((d.lines || [])[0]?.itemName || '—')} · ${n != null ? n + ' Ton' : '—'} · ${esc(d.site || '—')}
                      </div>
                      ${flagged && d.correctionNote ? `<div style="font-size:11px;color:#92400E;margin-top:2px">“${esc(d.correctionNote)}”</div>` : ''}
                    </div>
                    ${
                      flagged
                        ? '<span style="font-size:11px;color:var(--muted);white-space:nowrap">menunggu kantor</span>'
                        : `<button class="btn-ghost" data-action="sjFlag" data-id="${esc(d.id)}"
                            style="font-size:12px;padding:7px 12px;white-space:nowrap">Minta Koreksi</button>`
                    }
                  </div>`;
                })
                .join('')
        }
      </div>`;
  };

  // ── save ─────────────────────────────────────────────────────────────────────
  function _val(id) {
    const el = document.getElementById(id);
    if (!el) return '';
    const raw = el.value;
    return typeof window.sanitizeInput === 'function' ? window.sanitizeInput(raw) : String(raw).trim();
  }
  function _numVal(id) {
    const el = document.getElementById(id);
    if (!el || el.value === '') return null;
    const n = Number(el.value);
    return isNaN(n) ? null : n;
  }

  /** Weighbridge readings are entered in kg; the record stores tonnes. */
  function kgToTon(v) {
    if (v == null) return null;
    return Math.round((v >= 1000 ? v / 1000 : v) * 1000) / 1000;
  }

  function save() {
    const operator = _val('sj-operator');
    const date = _val('sj-date');
    const site = _val('sj-site');
    const vehicle = _val('sj-vehicle');
    const material = _val('sj-material');
    const sjNo = _val('sj-no');

    const missing = [];
    if (!operator) missing.push('Nama Petugas');
    if (!date) missing.push('Tanggal');
    if (!site) missing.push('Lokasi');
    if (!vehicle) missing.push('No. Polisi');
    if (!material) missing.push('Material');
    if (!sjNo) missing.push('No. Surat Jalan');
    if (missing.length) {
      toast(`Belum diisi: ${missing.join(', ')}`, 'warning');
      return null;
    }

    const gross = kgToTon(_numVal('sj-gross'));
    const tare = kgToTon(_numVal('sj-tare'));
    if (gross != null && tare != null && gross <= tare) {
      toast('Berat isi harus lebih besar dari berat kosong', 'warning');
      return null;
    }
    const qty = netto(gross, tare);
    if (qty == null || qty <= 0) {
      toast('Isi berat timbangan dulu', 'warning');
      return null;
    }

    _rememberOperator(operator);

    const D = db();
    const item = (D.inventoryItems || []).find(
      i => String(i.name).toLowerCase() === material.toLowerCase()
    );
    const id =
      typeof window.nextId === 'function'
        ? window.nextId('DO', D.deliveryOrders || [])
        : `DO-${Date.now()}`;

    const doc = {
      id,
      number: id,
      soId: null,
      poId: null,
      customer: '',
      customerId: null,
      supplierId: null,
      destination: site,
      site,
      date,
      status: 'Sent',
      driver: _val('sj-driver') || '—',
      vehicle,
      customerPO: '',
      supplierPoNo: _val('sj-po'),
      notes: _val('sj-notes'),
      weighNo: _val('sj-gjib'),
      externalDoNo: _val('sj-do'),
      suratJalanNo: sjNo,
      grossWeight: gross,
      tareWeight: tare,
      recordedBy: operator,
      needsCorrection: false,
      correctionNote: '',
      lines: [
        {
          itemId: item ? item.id : null,
          itemName: item ? item.name : material,
          itemCode: '',
          qty,
          unit: 'Ton',
        },
      ],
    };

    (D.deliveryOrders || (D.deliveryOrders = [])).unshift(doc);
    if (typeof window.saveDB === 'function') window.saveDB();
    toast(`Surat jalan ${sjNo} tersimpan — ${qty} Ton`, 'success');
    if (typeof window.invalidateView === 'function') window.invalidateView('suratjalan');
    if (typeof window.navigate === 'function') window.navigate('suratjalan');
    return doc;
  }

  // ── correction request ───────────────────────────────────────────────────────
  function flag(id) {
    const d = (db().deliveryOrders || []).find(x => String(x.id) === String(id));
    if (!d) {
      toast('Surat jalan tidak ditemukan', 'danger');
      return;
    }
    window.openModal(
      `Minta Koreksi — SJ ${esc(d.suratJalanNo || d.id)}`,
      `<div style="font-size:12px;color:var(--muted);margin-bottom:10px">
         Tulis apa yang salah. Kantor akan membetulkan datanya —
         Anda tidak perlu (dan tidak bisa) mengubahnya sendiri.
       </div>
       <div class="form-group">
         <label class="form-label">Yang perlu dibetulkan</label>
         <textarea class="form-input" id="sj-flag-note" rows="3"
           placeholder="cth: berat kosong salah, seharusnya 12470"></textarea>
       </div>`,
      `<button class="btn-ghost" data-action="closeModal">Batal</button>
       <button class="btn" id="sj-flag-save">Kirim</button>`
    );
    setTimeout(() => {
      document.getElementById('sj-flag-save')?.addEventListener('click', () => {
        const note =
          typeof window.sanitizeInput === 'function'
            ? window.sanitizeInput(document.getElementById('sj-flag-note')?.value || '')
            : (document.getElementById('sj-flag-note')?.value || '').trim();
        if (!note) {
          toast('Tulis dulu apa yang salah', 'warning');
          return;
        }
        d.needsCorrection = true;
        d.correctionNote = note;
        d.correctionBy = _operatorName();
        d.correctionAt = new Date().toISOString();
        if (typeof window.saveDB === 'function') window.saveDB();
        if (typeof window.closeModal === 'function') window.closeModal();
        toast('Permintaan koreksi terkirim ke kantor', 'success');
        if (typeof window.invalidateView === 'function') window.invalidateView('suratjalan');
        if (typeof window.navigate === 'function') window.navigate('suratjalan');
      });
    }, 50);
  }

  // Live netto readout + delegated actions (survive view re-renders).
  document.addEventListener('input', ev => {
    if (!ev.target || (ev.target.id !== 'sj-gross' && ev.target.id !== 'sj-tare')) return;
    const out = document.getElementById('sj-netto');
    if (!out) return;
    const n = netto(kgToTon(_numVal('sj-gross')), kgToTon(_numVal('sj-tare')));
    out.textContent = n != null && n > 0 ? `Netto: ${n} Ton` : 'Netto: —';
  });

  document.addEventListener('click', ev => {
    const el = ev.target && ev.target.closest ? ev.target.closest('#sj-save,[data-action="sjFlag"]') : null;
    if (!el) return;
    if (el.id === 'sj-save') {
      save();
    } else {
      flag(el.getAttribute('data-id'));
    }
  });

  window.SuratJalanView = { save, flag, netto, kgToTon, _todayLoads };
})();
