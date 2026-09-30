// ═══════════════════════════════════════════════════════════════════════════════
// KELOLA ERP (DEMO) — Data Integrity Module  (integrity.js)
//
// Adds accounting data-integrity on top of the existing save flow:
//   • Audit trail  — every add/update/delete/status-change on tracked collections
//                    is appended to DB.auditLog (user + timestamp, capped).
//   • Period lock  — mutations to transactional records dated on/before
//                    DB.settings.periodLock.lockedThrough are rolled back to the
//                    pre-mutation snapshot and the save is skipped.
//   • Ledger check — verifyLedger() confirms every journal balances and the
//                    trial balance nets to zero.
//
// Mechanism: wraps the single global window.saveDB chokepoint (already wrapped
// once by gl-sync.js, which must load BEFORE this file so the GL reconcile runs
// inside the integrity-guarded save). On each save the live DB is diffed against
// an in-memory snapshot of tracked collections; the snapshot is then re-baselined.
// db.js calls Integrity.refreshSnapshot() after remote Firestore snapshots so
// synced records don't show up as local edits.
//
// Transactional collections come from window.DocRegistry.types (+ manual
// journals, itemAdjustments). Reference data (items, customers, …) is audited
// but NOT period-locked. DB.auditLog is local-only (not in the Firestore
// COLLECTIONS sync map) by design.
//
// Global-scope rule: classic <script>, IIFE-wrapped, exposes ONLY window.Integrity.
// ═══════════════════════════════════════════════════════════════════════════════
(function () {
  'use strict';

  const MAX_AUDIT = 2000;

  // ── Tracked collections ──────────────────────────────────────────────────────
  function txnCollections() {
    const out = [];
    const types = (window.DocRegistry && window.DocRegistry.types) || {};
    Object.keys(types).forEach(k => {
      const c = types[k] && types[k].collection;
      if (c && out.indexOf(c) === -1) {
        out.push(c);
      }
    });
    if (out.indexOf('itemAdjustments') === -1) {
      out.push('itemAdjustments');
    }
    return out;
  }

  // Reference data: audited, never period-locked.
  const REF_COLLECTIONS = [
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
  ];

  function trackedCollections() {
    return txnCollections().concat(REF_COLLECTIONS);
  }

  // ── Helpers ──────────────────────────────────────────────────────────────────
  function db() {
    return window.DB || {};
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

  function lockedThrough() {
    const s = db().settings;
    return (s && s.periodLock && s.periodLock.lockedThrough) || '';
  }

  // ISO date (YYYY-MM-DD) of a record, '' when undated.
  function recDate(rec) {
    const d = rec && (rec.date || rec.createdAt || rec.created);
    return typeof d === 'string' ? d.slice(0, 10) : '';
  }

  function isLocked(dateStr) {
    const lock = lockedThrough();
    return !!(lock && dateStr && dateStr <= lock);
  }

  // ── Snapshot (deep copy of tracked collections, keyed by record id) ──────────
  let snapshot = null;

  function takeSnapshot() {
    const snap = {};
    trackedCollections().forEach(name => {
      const arr = db()[name];
      snap[name] = Array.isArray(arr) ? JSON.parse(JSON.stringify(arr)) : [];
    });
    // Manual + accurate journals only — auto journals are derived (rebuilt by
    // GL.reconcileAll on every save) and would be pure noise in the audit log.
    snap._manualJournals = (db().journals || []).filter(j => j && j.source === 'manual');
    snap._manualJournals = JSON.parse(JSON.stringify(snap._manualJournals));
    snapshot = snap;
  }

  function refreshSnapshot() {
    try {
      takeSnapshot();
    } catch (e) {
      console.warn('[Integrity] snapshot refresh failed:', e);
    }
  }

  function byId(arr) {
    const m = new Map();
    (arr || []).forEach(r => {
      if (r && r.id != null) {
        m.set(String(r.id), r);
      }
    });
    return m;
  }

  // ── Diff + audit + period-lock enforcement ───────────────────────────────────
  // Returns { entries: [...], violations: [...] }
  function diffAgainstSnapshot() {
    const entries = [];
    const violations = [];
    const txn = new Set(txnCollections());
    const now = new Date().toISOString();
    const user = currentUserEmail();

    function diffCollection(name, oldArr, newArr, lockable) {
      const oldMap = byId(oldArr);
      const newMap = byId(newArr);

      newMap.forEach((rec, id) => {
        const prev = oldMap.get(id);
        if (!prev) {
          entries.push(entry('add', name, rec));
          if (lockable && isLocked(recDate(rec))) {
            violations.push(violation('add', name, rec));
          }
          return;
        }
        const a = JSON.stringify(prev);
        const b = JSON.stringify(rec);
        if (a === b) {
          return;
        }
        // Status-only change gets its own action type for a readable log.
        const pc = Object.assign({}, prev, { status: rec.status });
        const action = JSON.stringify(pc) === b ? 'status' : 'update';
        const e = entry(action, name, rec);
        if (action === 'status') {
          e.summary = `${prev.status || '—'} → ${rec.status || '—'}`;
        }
        entries.push(e);
        if (lockable && (isLocked(recDate(rec)) || isLocked(recDate(prev)))) {
          violations.push(violation(action, name, rec));
        }
      });

      oldMap.forEach((rec, id) => {
        if (!newMap.has(id)) {
          entries.push(entry('delete', name, rec));
          if (lockable && isLocked(recDate(rec))) {
            violations.push(violation('delete', name, rec));
          }
        }
      });
    }

    function entry(action, collectionName, rec) {
      return {
        ts: now,
        user,
        action,
        collection: collectionName,
        id: rec && rec.id != null ? String(rec.id) : '',
        number: (rec && (rec.number || rec.no)) || '',
        date: recDate(rec),
      };
    }

    function violation(action, collectionName, rec) {
      return {
        action,
        collection: collectionName,
        id: rec && rec.id != null ? String(rec.id) : '',
        date: recDate(rec),
      };
    }

    trackedCollections().forEach(name => {
      diffCollection(name, snapshot[name], db()[name], txn.has(name));
    });
    const manualNow = (db().journals || []).filter(j => j && j.source === 'manual');
    diffCollection('journals', snapshot._manualJournals, manualNow, true);

    return { entries, violations };
  }

  function appendAudit(entries) {
    if (!entries.length) {
      return;
    }
    const data = db();
    if (!Array.isArray(data.auditLog)) {
      data.auditLog = [];
    }
    entries.forEach(e => data.auditLog.push(e));
    if (data.auditLog.length > MAX_AUDIT) {
      data.auditLog = data.auditLog.slice(data.auditLog.length - MAX_AUDIT);
    }
  }

  // Roll every tracked collection back to the snapshot (period-lock violation).
  function revertToSnapshot() {
    const data = db();
    trackedCollections().forEach(name => {
      data[name] = JSON.parse(JSON.stringify(snapshot[name]));
    });
    // Restore manual journals; keep derived (auto/accurate) ones — reconcileAll
    // rebuilds autos from the reverted documents on the next save anyway.
    const keep = (data.journals || []).filter(j => !j || j.source !== 'manual');
    data.journals = keep.concat(JSON.parse(JSON.stringify(snapshot._manualJournals)));
  }

  // ── Ledger self-check ────────────────────────────────────────────────────────
  function verifyLedger() {
    const problems = [];
    const journals = db().journals || [];
    journals.forEach(j => {
      if (!j || !Array.isArray(j.lines)) {
        return;
      }
      const debit = j.lines.reduce((s, l) => s + (Number(l.debit) || 0), 0);
      const credit = j.lines.reduce((s, l) => s + (Number(l.credit) || 0), 0);
      if (Math.round(debit * 100) !== Math.round(credit * 100)) {
        problems.push({
          id: j.id,
          number: j.number || j.id,
          debit,
          credit,
        });
      }
    });

    let tb = null;
    try {
      tb = window.GL && typeof window.GL.trialBalance === 'function' ? window.GL.trialBalance() : null;
    } catch (e) {
      console.warn('[Integrity] trialBalance failed:', e);
    }

    return {
      ok: problems.length === 0 && (!tb || tb.balanced),
      journalCount: journals.length,
      unbalanced: problems,
      trialBalance: tb ? { totalDebit: tb.totalDebit, totalCredit: tb.totalCredit, balanced: tb.balanced } : null,
    };
  }

  // ── saveDB wrap (the chokepoint) ─────────────────────────────────────────────
  function installSaveHook() {
    if (typeof window.saveDB !== 'function') {
      console.warn('[Integrity] window.saveDB missing — hook not installed');
      return;
    }
    const _origSave = window.saveDB;

    window.saveDB = function integrityGuardedSave() {
      try {
        if (snapshot) {
          const diff = diffAgainstSnapshot();
          if (diff.violations.length > 0) {
            revertToSnapshot();
            const v = diff.violations[0];
            const msg =
              `Periode terkunci s/d ${lockedThrough()} — perubahan ${v.collection} ` +
              `${v.id} (${v.date || 'tanpa tanggal'}) dibatalkan`;
            console.warn('[Integrity] ' + msg, diff.violations);
            if (typeof window.showToast === 'function') {
              window.showToast(msg, 'danger');
            }
            // Refresh the active view so the reverted data is what the user sees.
            try {
              if (typeof window.invalidateView === 'function' && window.activeView) {
                window.invalidateView(window.activeView);
              }
              if (typeof window.navigate === 'function' && window.activeView) {
                window.navigate(window.activeView);
              }
            } catch (_) {
              /* ignore */
            }
            return; // skip the save entirely
          }
          appendAudit(diff.entries);
        }
      } catch (err) {
        // An integrity bug must never block a save.
        console.error('[Integrity] check failed (save proceeds):', err);
      }
      const result = _origSave.apply(this, arguments);
      refreshSnapshot();
      return result;
    };
  }

  // Pre-validate manual journal vouchers so a locked-period JV fails loudly at
  // posting time instead of being silently rolled back at save time.
  function installJVGuard() {
    if (!window.GL || typeof window.GL.postJournalVoucher !== 'function') {
      return;
    }
    const _origPost = window.GL.postJournalVoucher;
    window.GL.postJournalVoucher = function guardedPostJV(date) {
      const d = typeof date === 'string' ? date.slice(0, 10) : '';
      if (isLocked(d)) {
        throw new Error(`Periode terkunci s/d ${lockedThrough()} — jurnal tanggal ${d} ditolak`);
      }
      return _origPost.apply(this, arguments);
    };
  }

  // ── UI: status card (rendered inside the Finance view) ───────────────────────
  function statusCardHTML() {
    const lock = lockedThrough();
    const log = db().auditLog || [];
    const last = log.length > 0 ? log[log.length - 1] : null;
    const lockBadge = lock
      ? `<span style="color:#34C759;font-weight:700">Terkunci s/d ${esc(lock)}</span>`
      : '<span style="color:var(--muted)">Tidak aktif</span>';
    const lastLine = last
      ? `${esc(last.ts.slice(0, 16).replace('T', ' '))} — ${esc(last.user)} ${esc(last.action)} ${esc(last.collection)} ${esc(last.id)}`
      : 'Belum ada aktivitas tercatat';

    return `
  <div class="card" style="margin-top:14px">
    <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:12px">
      <div style="font-size:13px;font-weight:700">Integritas Data</div>
      <div style="display:flex;gap:6px;flex-wrap:wrap">
        <button class="btn-ghost" data-action="igPeriodLock" style="font-size:11px;padding:4px 10px">Kunci Periode</button>
        <button class="btn-ghost" data-action="igAuditLog" style="font-size:11px;padding:4px 10px">Audit Log (${log.length})</button>
        <button class="btn-ghost" data-action="igVerifyLedger" style="font-size:11px;padding:4px 10px">Cek Buku Besar</button>
      </div>
    </div>
    <div style="font-size:11px;color:var(--muted);padding:7px 0;border-bottom:1px solid var(--border)">Kunci periode: ${lockBadge}</div>
    <div style="font-size:11px;color:var(--muted);padding:7px 0">Aktivitas terakhir: ${lastLine}</div>
  </div>`;
  }

  // ── UI: modals ───────────────────────────────────────────────────────────────
  function openPeriodLockModal() {
    const lock = lockedThrough();
    window.openModal(
      'Kunci Periode Akuntansi',
      `<p style="font-size:12px;color:var(--muted);margin-bottom:12px;line-height:1.5">
        Transaksi bertanggal pada atau sebelum tanggal kunci tidak bisa ditambah,
        diubah, atau dihapus. Perubahan yang melanggar otomatis dibatalkan.
      </p>
      <label style="font-size:12px;font-weight:600;display:block;margin-bottom:6px">Kunci sampai dengan tanggal</label>
      <input type="date" id="igLockDate" value="${esc(lock)}" style="width:100%">`,
      `${lock ? '<button class="btn-ghost" id="igLockClear">Buka Kunci</button>' : ''}
       <button class="btn-ghost" data-action="closeModal">Batal</button>
       <button class="btn" id="igLockSave">Simpan</button>`
    );
    setTimeout(() => {
      const save = document.getElementById('igLockSave');
      const clear = document.getElementById('igLockClear');
      if (save) {
        save.addEventListener('click', () => {
          const val = (document.getElementById('igLockDate') || {}).value || '';
          if (!val) {
            window.showToast('Pilih tanggal kunci terlebih dahulu', 'warning');
            return;
          }
          setLock(val);
        });
      }
      if (clear) {
        clear.addEventListener('click', () => setLock(''));
      }
    }, 50);
  }

  function setLock(val) {
    const data = db();
    if (!data.settings) {
      data.settings = {};
    }
    data.settings.periodLock = val
      ? { lockedThrough: val, setBy: currentUserEmail(), setAt: new Date().toISOString() }
      : null;
    window.closeModal();
    window.saveDB();
    window.showToast(val ? `Periode dikunci s/d ${val}` : 'Kunci periode dibuka', 'success');
    if (typeof window.invalidateView === 'function') {
      window.invalidateView('finance');
    }
    if (typeof window.navigate === 'function') {
      window.navigate('finance');
    }
  }

  function openAuditLogModal() {
    const log = (db().auditLog || []).slice().reverse().slice(0, 200);
    const rows = log
      .map(
        e => `<tr>
          <td style="white-space:nowrap">${esc((e.ts || '').slice(0, 16).replace('T', ' '))}</td>
          <td>${esc(e.user)}</td>
          <td>${esc(e.action)}</td>
          <td>${esc(e.collection)}</td>
          <td>${esc(e.number || e.id)}${e.summary ? ' <span style="color:var(--muted)">(' + esc(e.summary) + ')</span>' : ''}</td>
        </tr>`
      )
      .join('');
    window.openModal(
      'Audit Log',
      log.length === 0
        ? '<p style="font-size:12px;color:var(--muted)">Belum ada aktivitas tercatat. Setiap tambah/ubah/hapus dokumen akan muncul di sini.</p>'
        : `<div style="max-height:55vh;overflow:auto">
            <table class="data-table" style="font-size:11px;width:100%">
              <thead><tr><th>Waktu</th><th>User</th><th>Aksi</th><th>Koleksi</th><th>Dokumen</th></tr></thead>
              <tbody>${rows}</tbody>
            </table>
          </div>
          <p style="font-size:10px;color:var(--muted);margin-top:8px">Menampilkan ${log.length} aktivitas terakhir (maks. ${MAX_AUDIT} tersimpan, lokal di perangkat ini).</p>`,
      '<button class="btn-ghost" data-action="closeModal">Tutup</button>',
      true
    );
  }

  function openVerifyLedgerModal() {
    const r = verifyLedger();
    const fmt = n => 'Rp ' + Math.round(n || 0).toLocaleString('id-ID');
    const tbLine = r.trialBalance
      ? `<div style="font-size:12px;padding:6px 0">Trial balance: D ${fmt(r.trialBalance.totalDebit)} / K ${fmt(r.trialBalance.totalCredit)} — ${r.trialBalance.balanced ? '<span style="color:#34C759;font-weight:700">Seimbang</span>' : '<span style="color:#FF3B30;font-weight:700">TIDAK seimbang</span>'}</div>`
      : '<div style="font-size:12px;padding:6px 0;color:var(--muted)">Trial balance: GL belum tersedia</div>';
    const badRows = r.unbalanced
      .slice(0, 50)
      .map(
        j =>
          `<tr><td>${esc(j.number)}</td><td>${fmt(j.debit)}</td><td>${fmt(j.credit)}</td></tr>`
      )
      .join('');
    window.openModal(
      'Cek Buku Besar',
      `<div style="font-size:13px;font-weight:700;color:${r.ok ? '#34C759' : '#FF3B30'};margin-bottom:8px">
        ${r.ok ? '✓ Semua jurnal seimbang' : '✗ Ditemukan masalah'}
      </div>
      <div style="font-size:12px;padding:6px 0">Total jurnal diperiksa: ${r.journalCount}</div>
      ${tbLine}
      ${
        r.unbalanced.length > 0
          ? `<table class="data-table" style="font-size:11px;width:100%;margin-top:8px">
              <thead><tr><th>Jurnal</th><th>Debit</th><th>Kredit</th></tr></thead>
              <tbody>${badRows}</tbody>
            </table>`
          : ''
      }`,
      '<button class="btn-ghost" data-action="closeModal">Tutup</button>'
    );
  }

  // Delegated clicks for the status-card buttons (self-contained — no edits to
  // the erp-crud action switch needed).
  document.addEventListener('click', e => {
    const el = e.target && e.target.closest ? e.target.closest('[data-action]') : null;
    if (!el) {
      return;
    }
    const action = el.getAttribute('data-action');
    if (action === 'igPeriodLock') {
      openPeriodLockModal();
    } else if (action === 'igAuditLog') {
      openAuditLogModal();
    } else if (action === 'igVerifyLedger') {
      openVerifyLedgerModal();
    }
  });

  // ── Boot ─────────────────────────────────────────────────────────────────────
  refreshSnapshot();
  installSaveHook();
  installJVGuard();

  window.Integrity = {
    refreshSnapshot,
    verifyLedger,
    statusCardHTML,
    isLocked,
    lockedThrough,
  };

  console.log('[Integrity] audit trail + period lock + ledger check active');
})();
