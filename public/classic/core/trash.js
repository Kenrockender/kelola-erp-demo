// ═══════════════════════════════════════════════════════════════════════════════
// KELOLA ERP (DEMO) — Recycle Bin / Soft-Delete  (trash.js)
//
// Every record deleted from a tracked collection is captured (with its full
// pre-delete content) into DB.trash, where it can be restored with one click or
// purged permanently. Complements the in-session undo toast: the bin persists
// across reloads and syncs via Firestore ('trash' is in the db.js COLLECTIONS
// map), so a delete on one device can be restored from another.
//
// Mechanism: wraps the window.saveDB chokepoint (same pattern as integrity.js).
// Load order in vite.config.js classicOrder matters:
//   gl-sync.js → trash.js → integrity.js
// Integrity wraps OUTERMOST, so a period-lock violation reverts + returns before
// this capture runs — deletions that never actually commit are not binned.
//
// On each save the live DB is diffed against an id-set snapshot per collection:
//   • id vanished  → record pushed into DB.trash
//   • id came back → matching bin entry dropped (undo toast / restore happened)
//
// Retention: newest MAX_ENTRIES kept, anything older than RETENTION_DAYS pruned.
//
// Global-scope rule: classic <script>, IIFE-wrapped, exposes window.Trash and
// window._trashExtras (menu-router handle).
// ═══════════════════════════════════════════════════════════════════════════════
(function () {
  'use strict';

  const MAX_ENTRIES = 300;
  const RETENTION_DAYS = 90;

  // Same tracked set as integrity.js: DocRegistry collections + reference data.
  function trackedCollections() {
    const out = [];
    const types = (window.DocRegistry && window.DocRegistry.types) || {};
    Object.keys(types).forEach(k => {
      const c = types[k] && types[k].collection;
      if (c && out.indexOf(c) === -1) {
        out.push(c);
      }
    });
    [
      'itemAdjustments',
      'inventoryItems',
      'customers',
      'suppliers',
      'employees',
      'warehouses',
      'budgets',
      'budgetTransfers',
      'payrollRuns',
      'salesDownPayments',
      'purchaseDownPayments',
      'goodsReceipts',
      'fleet',
      'expedition',
    ].forEach(c => {
      if (out.indexOf(c) === -1) {
        out.push(c);
      }
    });
    return out;
  }

  function db() {
    return window.DB || {};
  }

  function bin() {
    const data = db();
    if (!Array.isArray(data.trash)) {
      data.trash = [];
    }
    return data.trash;
  }

  function esc(s) {
    if (typeof window.escapeHtml === 'function') {
      return window.escapeHtml(String(s == null ? '' : s));
    }
    return String(s == null ? '' : s).replace(
      /[&<>"']/g,
      c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
    );
  }

  function currentUserEmail() {
    try {
      const u = window.erpAuth && window.erpAuth.getCurrentUser && window.erpAuth.getCurrentUser();
      return (u && (u.email || u.name)) || 'unknown';
    } catch (_) {
      return 'unknown';
    }
  }

  // ── Snapshot: collection → Map(id → deep-copied record) ──────────────────────
  let snapshot = null;
  let _seq = 0;

  function takeSnapshot() {
    const snap = {};
    trackedCollections().forEach(name => {
      const m = new Map();
      const arr = db()[name];
      (Array.isArray(arr) ? arr : []).forEach(r => {
        if (r && r.id != null) {
          m.set(String(r.id), JSON.parse(JSON.stringify(r)));
        }
      });
      snap[name] = m;
    });
    snapshot = snap;
  }

  function refreshSnapshot() {
    try {
      takeSnapshot();
    } catch (e) {
      console.warn('[Trash] snapshot refresh failed:', e);
    }
  }

  // ── Capture (runs inside the saveDB wrap, before the actual save) ────────────
  function captureDeletions() {
    if (!snapshot) {
      refreshSnapshot();
      return;
    }
    const data = db();
    const now = new Date().toISOString();
    const user = currentUserEmail();
    let touched = false;

    trackedCollections().forEach(name => {
      const prev = snapshot[name];
      if (!(prev instanceof Map) || prev.size === 0) {
        return;
      }
      const liveIds = new Set();
      const arr = data[name];
      (Array.isArray(arr) ? arr : []).forEach(r => {
        if (r && r.id != null) {
          liveIds.add(String(r.id));
        }
      });

      prev.forEach((rec, id) => {
        if (liveIds.has(id)) {
          return;
        }
        // Already binned (e.g. double save in one burst)? Skip.
        const exists = bin().some(t => t && t.collection === name && t.recordId === id);
        if (!exists) {
          bin().push({
            id: 'TR-' + Date.now() + '-' + ++_seq,
            collection: name,
            recordId: id,
            number: (rec && (rec.number || rec.no)) || '',
            label: (rec && (rec.customer || rec.supplier || rec.name || rec.memo)) || '',
            deletedAt: now,
            deletedBy: user,
            record: rec,
          });
          touched = true;
        }
      });

      // A binned id that is live again was restored elsewhere (undo toast,
      // another device) — drop the stale entry.
      const before = bin().length;
      data.trash = bin().filter(
        t => !(t && t.collection === name && liveIds.has(String(t.recordId)))
      );
      if (data.trash.length !== before) {
        touched = true;
      }
    });

    // Retention: prune by age, then cap by count (oldest out first).
    const cutoff = new Date(Date.now() - RETENTION_DAYS * 86400000).toISOString();
    const pruned = bin().filter(t => t && t.deletedAt >= cutoff);
    if (pruned.length > MAX_ENTRIES) {
      pruned.splice(0, pruned.length - MAX_ENTRIES);
    }
    if (pruned.length !== bin().length) {
      data.trash = pruned;
      touched = true;
    }

    return touched;
  }

  function installSaveHook() {
    if (typeof window.saveDB !== 'function') {
      console.warn('[Trash] window.saveDB missing — hook not installed');
      return;
    }
    const _origSave = window.saveDB;
    window.saveDB = function trashGuardedSave() {
      try {
        captureDeletions();
      } catch (e) {
        // A bin bug must never block a save.
        console.error('[Trash] capture failed (save proceeds):', e);
      }
      const result = _origSave.apply(this, arguments);
      refreshSnapshot();
      return result;
    };
  }

  // ── Restore / purge ───────────────────────────────────────────────────────────
  function restore(trashId) {
    const data = db();
    const idx = bin().findIndex(t => t && t.id === trashId);
    if (idx === -1) {
      return;
    }
    const t = bin()[idx];
    if (!Array.isArray(data[t.collection])) {
      data[t.collection] = [];
    }
    const taken = data[t.collection].some(r => r && String(r.id) === String(t.recordId));
    if (taken) {
      window.showToast &&
        window.showToast(`Gagal: ${t.recordId} sudah ada di ${t.collection}`, 'warning');
      return;
    }
    data[t.collection].push(JSON.parse(JSON.stringify(t.record)));
    data.trash.splice(idx, 1);
    window.saveDB();
    window.showToast && window.showToast(`${t.recordId} dipulihkan ke ${t.collection}`, 'success');
    openRecycleBin();
  }

  function purge(trashId) {
    const data = db();
    const idx = bin().findIndex(t => t && t.id === trashId);
    if (idx === -1) {
      return;
    }
    data.trash.splice(idx, 1);
    window.saveDB();
    openRecycleBin();
  }

  function purgeAll() {
    db().trash = [];
    window.saveDB();
    openRecycleBin();
  }

  // ── UI (injectView pattern, hosted in the settings view) ─────────────────────
  function injectView(hostView, html) {
    window.invalidateView && window.invalidateView(hostView);
    window.navigate && window.navigate(hostView);
    setTimeout(function () {
      const el = document.getElementById('view-' + hostView);
      if (el) {
        el.innerHTML = html;
      }
    }, 0);
  }

  const TH =
    'text-align:left;padding:10px 14px;font-size:11px;color:var(--muted);font-weight:700;border-bottom:1px solid var(--border)';

  function openRecycleBin() {
    const entries = bin().slice().reverse();
    const rows = entries
      .map(t => {
        const when = (t.deletedAt || '').slice(0, 16).replace('T', ' ');
        return (
          '<tr>' +
          `<td class="td-p" style="white-space:nowrap">${esc(when)}</td>` +
          `<td class="td-p">${esc(t.collection)}</td>` +
          `<td class="td-p" style="font-weight:700">${esc(t.number || t.recordId)}</td>` +
          `<td class="td-p">${esc(t.label)}</td>` +
          `<td class="td-p">${esc(t.deletedBy)}</td>` +
          '<td class="td-p" style="text-align:right;white-space:nowrap">' +
          `<button class="btn-ghost" data-action="trashRestore" data-id="${esc(t.id)}" style="font-size:11px;padding:4px 10px">Pulihkan</button> ` +
          `<button class="btn-ghost" data-action="trashPurge" data-id="${esc(t.id)}" style="font-size:11px;padding:4px 10px;color:#FF3B30">Hapus</button>` +
          '</td></tr>'
        );
      })
      .join('');

    injectView(
      'settings',
      '<div class="card">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:12px">' +
        '<div><div style="font-size:15px;font-weight:800">Recycle Bin</div>' +
        `<div style="font-size:11px;color:var(--muted)">Dokumen terhapus disimpan ${RETENTION_DAYS} hari (maks. ${MAX_ENTRIES} entri) dan bisa dipulihkan satu klik.</div></div>` +
        (entries.length > 0
          ? '<button class="btn-ghost" data-action="trashPurgeAll" style="font-size:11px;padding:4px 10px;color:#FF3B30">Kosongkan Semua</button>'
          : '') +
        '</div>' +
        (entries.length === 0
          ? '<div style="text-align:center;padding:40px;color:var(--muted)">' +
            '<div style="font-size:32px;margin-bottom:8px">🗑️</div>' +
            '<div style="font-size:14px;font-weight:700;margin-bottom:4px">Recycle bin kosong</div>' +
            '<div style="font-size:12px">Dokumen yang dihapus akan muncul di sini.</div></div>'
          : '<div style="overflow:auto"><table style="width:100%;border-collapse:collapse;font-size:12px">' +
            `<thead><tr><th style="${TH}">Dihapus</th><th style="${TH}">Koleksi</th><th style="${TH}">Dokumen</th><th style="${TH}">Keterangan</th><th style="${TH}">Oleh</th><th style="${TH};text-align:right">Aksi</th></tr></thead>` +
            `<tbody>${rows}</tbody></table></div>`) +
        '</div>'
    );
  }

  // Delegated clicks (self-contained, same pattern as integrity.js).
  document.addEventListener('click', e => {
    const el = e.target && e.target.closest ? e.target.closest('[data-action]') : null;
    if (!el) {
      return;
    }
    const action = el.getAttribute('data-action');
    if (action === 'trashRestore') {
      restore(el.getAttribute('data-id'));
    } else if (action === 'trashPurge') {
      purge(el.getAttribute('data-id'));
    } else if (action === 'trashPurgeAll') {
      if (window.confirm('Kosongkan recycle bin? Semua entri dihapus permanen.')) {
        purgeAll();
      }
    }
  });

  // ── Boot ─────────────────────────────────────────────────────────────────────
  refreshSnapshot();
  installSaveHook();

  window.Trash = {
    refreshSnapshot,
    restore,
    purge,
    purgeAll,
    openRecycleBin,
  };
  window._trashExtras = { openRecycleBin };

  console.log('[Trash] recycle bin active (' + trackedCollections().length + ' collections tracked)');
})();
