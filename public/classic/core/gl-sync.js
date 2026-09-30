// ═══════════════════════════════════════════════════════════════════════════════
// KELOLA ERP (DEMO) — GL Auto-Posting Hook  (gl-sync.js)
// Phase 2a of the V4 plan (see docs/ARCHITECTURE_ERP_V4.md).
//
// Every document mutation in the app already ends with a saveDB() call. Rather than
// thread GL.post() into each of the ~8 battle-tested status-mutation sites, this
// wraps window.saveDB ONCE: before each persist it reconciles all auto-journals
// from current state. The reconcile is idempotent with stable ids, so running it on
// every save is safe and cheap. Failures are swallowed so a GL bug can never block
// a save.
//
// Loaded after erp-crud / erp-patch (so the CRUD's saveDB references resolve to the
// wrapped window.saveDB) and runs one reconcile at startup to journalize existing
// data. Global-scope rule: classic <script>, IIFE-wrapped, declares no top-level
// names.
// ═══════════════════════════════════════════════════════════════════════════════
(function () {
  'use strict';

  if (typeof window.saveDB !== 'function' || !window.GL) {
    return;
  }

  const _origSave = window.saveDB;

  window.saveDB = function glSyncedSave() {
    try {
      window.GL.reconcileAll();
    } catch (err) {
      console.error('[GL] reconcile failed (save still proceeds):', err);
    }
    return _origSave.apply(this, arguments);
  };

  // Journalize whatever is already in the DB on first load, and persist once so the
  // journals are mirrored to localStorage. Guarded — never block boot.
  try {
    const n = window.GL.reconcileAll();
    if (typeof _origSave === 'function') {
      _origSave();
    }
    console.warn(`[GL] Initial reconcile: ${n} auto-journal(s) built`);
  } catch (err) {
    console.error('[GL] initial reconcile failed:', err);
  }
})();
