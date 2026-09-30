// ═══════════════════════════════════════════════════════════════════════════════
// KELOLA ERP (DEMO) — Item Adjustment View  (adjust-view.js)
// Phase 3a of the V4 plan (see docs/ARCHITECTURE_ERP_V4.md).
//
// Penyesuaian Persediaan: correct stock quantity (and thereby cost value) up or down
// outside the normal SO/PO flow — e.g. stock-opname differences, breakage, found
// goods. Each saved adjustment mutates item.stock immediately and, via the saveDB →
// GL reconcile hook, posts an inventory-vs-adjustment journal at moving-average cost.
//
// Renders into #view-adjustments. Additive: registers window.renderAdjustments +
// ERP actions; the only edits elsewhere are the getRenderer case, the nav repoint,
// the index.html container, and DB seeding.
//
// Global-scope rule: classic <script>, IIFE-wrapped, exposes only
// window.renderAdjustments (+ ERP action registrations).
// ═══════════════════════════════════════════════════════════════════════════════
(function () {
  'use strict';

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

  function renderAdjustments() {
    const adjustments = (db().itemAdjustments || []).slice().reverse(); // newest first
    const header =
      typeof window.secHdr === 'function'
        ? window.secHdr(
            'Penyesuaian Persediaan',
            'Koreksi stok & nilai persediaan (stock opname, kerusakan, dll.)',
            'Buat Penyesuaian',
            'adjNew'
          )
        : '<h1>Penyesuaian Persediaan</h1>';

    const body =
      adjustments.length === 0
        ? `<div class="card"><div style="padding:24px;text-align:center;color:var(--muted);font-size:13px">
            Belum ada penyesuaian. Klik <strong>Buat Penyesuaian</strong> untuk mengoreksi stok.
          </div></div>`
        : adjustments
            .map(a => {
              const lines = (a.lines || [])
                .map(l => {
                  const sign = l.type === 'out' ? '−' : '+';
                  const color = l.type === 'out' ? '#FF3B30' : '#34C759';
                  return `<tr style="border-bottom:1px solid var(--border)">
                  <td style="padding:6px 10px;font-size:12px;font-weight:600">${esc(l.itemName)}</td>
                  <td style="padding:6px 10px;font-size:12px;text-align:right;color:${color};font-weight:700">${sign}${esc(l.qty)} ${esc(l.unit || '')}</td>
                </tr>`;
                })
                .join('');
              return `<div style="border:1px solid var(--border);border-radius:10px;margin-bottom:10px;overflow:hidden">
              <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 12px;background:var(--bg)">
                <div style="font-size:12px;font-weight:700">${esc(a.number || a.id)}
                  ${a.note ? `<span style="font-size:11px;color:var(--muted);font-weight:400"> · ${esc(a.note)}</span>` : ''}</div>
                <div style="display:flex;align-items:center;gap:10px">
                  <span style="font-size:11px;color:var(--muted)">${esc(a.date || '')}</span>
                  <button class="action-ghost" data-action="adjDelete" data-id="${esc(a.id)}"
                    style="font-size:11px;color:#FF3B30">Hapus</button>
                </div>
              </div>
              <table style="width:100%;border-collapse:collapse"><tbody>${lines}</tbody></table>
            </div>`;
            })
            .join('');

    return `${header}<div class="card">
      <div style="font-size:14px;font-weight:700;margin-bottom:10px">Daftar Penyesuaian (${adjustments.length})</div>
      ${body}
    </div>`;
  }

  function refresh() {
    const el = document.getElementById('view-adjustments');
    if (el) {
      el.innerHTML = renderAdjustments();
    }
  }

  // ── Create modal ────────────────────────────────────────────────────────────
  function itemOptions(selected) {
    return (db().inventoryItems || [])
      .map(
        i =>
          `<option value="${esc(i.id)}" data-unit="${esc(i.unit)}"${String(selected) === String(i.id) ? ' selected' : ''}>${esc(i.name)}</option>`
      )
      .join('');
  }

  function rowHTML() {
    return `<tr>
      <td style="padding:4px 6px">
        <select class="form-select adj-item" style="font-size:12px;padding:5px 8px;width:100%">
          <option value="">— Pilih Item —</option>${itemOptions('')}
        </select>
      </td>
      <td style="padding:4px 6px">
        <select class="form-select adj-type" style="font-size:12px;padding:5px 8px">
          <option value="in">Tambah (+)</option>
          <option value="out">Kurang (−)</option>
        </select>
      </td>
      <td style="padding:4px 6px">
        <input class="form-input adj-qty" type="number" min="1" value="1" style="font-size:12px;padding:5px 8px;width:80px">
      </td>
      <td style="padding:4px 6px;font-size:11px;color:var(--muted)" class="adj-unit"></td>
      <td style="padding:4px 6px;text-align:center">
        <button type="button" class="adj-del" title="Hapus baris"
          style="background:none;border:none;cursor:pointer;color:var(--muted);font-size:18px;line-height:1">×</button>
      </td>
    </tr>`;
  }

  function openAdjModal() {
    if (!window.openModal) {
      return;
    }
    const today =
      typeof window.today === 'function' ? window.today() : new Date().toISOString().slice(0, 10);
    window.openModal(
      'Buat Penyesuaian Persediaan',
      `
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Tanggal</label>
          <input class="form-input" id="adj-date" type="date" value="${today}">
        </div>
        <div class="form-group">
          <label class="form-label">Keterangan</label>
          <input class="form-input" id="adj-note" type="text" placeholder="Stock opname, kerusakan, dll. (opsional)">
        </div>
      </div>
      <div style="margin-top:10px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
          <span class="form-label" style="margin:0;font-size:13px;font-weight:700">Baris Penyesuaian</span>
          <button type="button" class="btn-ghost" id="adj-add" style="font-size:11px;padding:4px 10px">+ Tambah Baris</button>
        </div>
        <table style="width:100%;border-collapse:collapse">
          <thead><tr style="background:var(--bg)">
            <th style="padding:6px 8px;font-size:11px;font-weight:700;text-align:left">Item</th>
            <th style="padding:6px 8px;font-size:11px;font-weight:700;text-align:left;width:110px">Tipe</th>
            <th style="padding:6px 8px;font-size:11px;font-weight:700;text-align:left;width:90px">Kuantitas</th>
            <th style="padding:6px 8px;font-size:11px;font-weight:700;text-align:left;width:50px">Sat.</th>
            <th style="width:30px"></th>
          </tr></thead>
          <tbody id="adj-body">${rowHTML()}</tbody>
        </table>
      </div>`,
      `<button class="btn-ghost" data-action="closeModal">Batal</button>
       <button class="btn" id="adj-save">Simpan</button>`,
      true
    );

    setTimeout(() => {
      const body = document.getElementById('adj-body');

      function wireRow(tr) {
        const sel = tr.querySelector('.adj-item');
        const unitTd = tr.querySelector('.adj-unit');
        sel?.addEventListener('change', () => {
          const opt = sel.options[sel.selectedIndex];
          unitTd.textContent = opt ? opt.dataset.unit || '' : '';
        });
        tr.querySelector('.adj-del')?.addEventListener('click', () => {
          tr.remove();
        });
      }
      body.querySelectorAll('tr').forEach(wireRow);

      document.getElementById('adj-add')?.addEventListener('click', () => {
        const tmp = document.createElement('tbody');
        tmp.innerHTML = rowHTML();
        const tr = tmp.firstElementChild;
        body.appendChild(tr);
        wireRow(tr);
      });

      document.getElementById('adj-save')?.addEventListener('click', () => {
        const date = document.getElementById('adj-date').value;
        const note = document.getElementById('adj-note').value.trim();
        const lines = [];
        body.querySelectorAll('tr').forEach(tr => {
          const sel = tr.querySelector('.adj-item');
          const itemId = sel?.value ? Number(sel.value) : null;
          if (!itemId) {
            return;
          }
          const item = (db().inventoryItems || []).find(i => String(i.id) === String(itemId));
          if (!item) {
            return;
          }
          const type = tr.querySelector('.adj-type').value === 'out' ? 'out' : 'in';
          const qty = Math.max(1, parseInt(tr.querySelector('.adj-qty').value, 10) || 1);
          lines.push({ itemId, itemName: item.name, unit: item.unit, type, qty });
        });
        if (lines.length === 0) {
          window.showToast?.('Tambahkan minimal 1 baris item', 'warning');
          return;
        }
        saveAdjustment(date, lines, note);
      });
    }, 50);
  }

  function saveAdjustment(date, lines, note) {
    const data = db();
    if (!Array.isArray(data.itemAdjustments)) {
      data.itemAdjustments = [];
    }
    const number =
      window.DocEngine && typeof window.DocEngine.nextNumber === 'function'
        ? window.DocEngine.nextNumber('ADJ', date, {
            sequences: data.numberSequences,
            commit: true,
          })
        : `ADJ-${Date.now()}`;
    const id = `ADJ-${Date.now()}`;

    // Mutate stock immediately (the cost ledger + GL derive from current stock).
    lines.forEach(l => {
      const item = data.inventoryItems.find(i => String(i.id) === String(l.itemId));
      if (!item) {
        return;
      }
      if (l.type === 'out') {
        item.stock = Math.max(0, (Number(item.stock) || 0) - l.qty);
      } else {
        item.stock = (Number(item.stock) || 0) + l.qty;
      }
    });

    data.itemAdjustments.push({ id, number, date, lines, note });
    window.saveDB?.(); // triggers GL reconcile via gl-sync
    window.closeModal?.();
    refresh();
    window.showToast?.(`${number} berhasil disimpan`, 'success');
  }

  function deleteAdjustment(id) {
    const data = db();
    const idx = (data.itemAdjustments || []).findIndex(a => a.id === id);
    if (idx === -1) {
      return;
    }
    const adj = data.itemAdjustments[idx];
    // Reverse the stock mutation.
    (adj.lines || []).forEach(l => {
      const item = data.inventoryItems.find(i => String(i.id) === String(l.itemId));
      if (!item) {
        return;
      }
      if (l.type === 'out') {
        item.stock = (Number(item.stock) || 0) + l.qty;
      } else {
        item.stock = Math.max(0, (Number(item.stock) || 0) - l.qty);
      }
    });
    data.itemAdjustments.splice(idx, 1);
    window.saveDB?.();
    refresh();
    window.showToast?.(`${adj.number || adj.id} dihapus`, 'success');
  }

  window.renderAdjustments = renderAdjustments;

  if (window.ERP && typeof window.ERP.registerAction === 'function') {
    window.ERP.registerAction('adjNew', function () {
      openAdjModal();
      return true;
    });
    window.ERP.registerAction('adjDelete', function (id) {
      if (id) {
        deleteAdjustment(id);
      }
      return true;
    });
  }
})();
