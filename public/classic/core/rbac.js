// ═══════════════════════════════════════════════════════════════════════════════
// KELOLA ERP (DEMO) — Role-Based Access Control  (rbac.js)  [client layer]
//
// The REAL security boundary is firestore.rules (server). This file makes the UI
// match what the server allows, with three mechanisms:
//   1. Permission matrix  — fixed preset roles × modules × actions.
//   2. Menu / button gating — hide modules a role can't see, hide create/delete
//                             buttons a role can't use (nav.js + a navigate wrap).
//   3. saveDB safety net  — mirrors integrity.js: diffs the live DB against a
//                           snapshot and reverts any mutation the role isn't
//                           allowed to make, then skips the save. Defence in
//                           depth for local mode and any button we didn't hide.
//
// The active role is resolved in src/core/user-role.js before the classic bundle
// loads and published as window.__ERP_USER = { role, active, ... }.
//
// Load order (vite.config.js classicOrder): rbac.js is LAST so its saveDB wrap is
// OUTERMOST — an unauthorized mutation is reverted before integrity.js/trash.js
// (inner wraps) ever see it. Its API is read at render time, so loading last is
// fine for nav.js/settings.js too (the whole bundle runs before the first nav).
//
// Global-scope rule: classic <script>, IIFE-wrapped, exposes ONLY window.RBAC.
// ═══════════════════════════════════════════════════════════════════════════════
(function () {
  'use strict';

  // ── Permission matrix ────────────────────────────────────────────────────────
  const VIEW = ['view'];
  const RW = ['view', 'create', 'edit']; // read/write, no delete
  const FULL = ['view', 'create', 'edit', 'delete'];
  const NONE = [];

  // role → module → [actions]. Modules not listed default to NONE.
  // Modules: dashboard, reports, sales, purchases, inventory, gl, tax, assets,
  // master, admin (user mgmt / company profile), config (the shared settings doc
  // which also holds reference data: asset/category/unit lists). config is
  // admin+manajer because that doc bundles operational reference data managers
  // maintain alongside admin-only company config.
  // `logistics` covers deliveryOrders ONLY. It was split out of `sales` so the
  // field role can be given create-rights on surat jalan without also gaining
  // rights over orders, invoices and receipts. Every other role mirrors its own
  // `sales` level here, so the split changed nothing for them.
  const CREATE_ONLY = ['view', 'create']; // may add, may not alter what exists

  const PERMISSIONS = {
    admin: {
      dashboard: VIEW, reports: VIEW, sales: FULL, logistics: FULL, purchases: FULL, inventory: FULL,
      gl: FULL, tax: FULL, assets: FULL, master: FULL, admin: FULL, config: FULL,
    },
    manajer: {
      dashboard: VIEW, reports: VIEW, sales: FULL, logistics: FULL, purchases: FULL, inventory: FULL,
      gl: RW, tax: VIEW, assets: FULL, master: FULL, admin: NONE, config: RW,
    },
    akunting: {
      dashboard: VIEW, reports: VIEW, sales: VIEW, logistics: VIEW, purchases: VIEW, inventory: VIEW,
      gl: FULL, tax: FULL, assets: VIEW, master: VIEW, admin: NONE, config: NONE,
    },
    penjualan: {
      dashboard: VIEW, reports: VIEW, sales: RW, logistics: RW, purchases: VIEW, inventory: VIEW,
      gl: NONE, tax: NONE, assets: NONE, master: RW, admin: NONE, config: NONE,
    },
    // Shared field account: one login for all sites, used by whoever is at the
    // weighbridge. May record a surat jalan and flag one for correction, and
    // nothing else — no edits, no deletes, and no module that exposes a rupiah
    // value. See docs/PERTANYAAN_CLIENT.md butir 6.
    lapangan: {
      dashboard: NONE, reports: NONE, sales: NONE, logistics: CREATE_ONLY, purchases: NONE,
      inventory: NONE, gl: NONE, tax: NONE, assets: NONE, master: NONE, admin: NONE, config: NONE,
    },
    viewer: {
      dashboard: VIEW, reports: VIEW, sales: VIEW, logistics: VIEW, purchases: VIEW, inventory: VIEW,
      gl: VIEW, tax: VIEW, assets: VIEW, master: VIEW, admin: NONE, config: NONE,
    },
    pending: {
      dashboard: VIEW, reports: NONE, sales: NONE, logistics: NONE, purchases: NONE, inventory: NONE,
      gl: NONE, tax: NONE, assets: NONE, master: NONE, admin: NONE, config: NONE,
    },
  };

  // Firestore collection → module (business data). System collections (below) are
  // exempt from the saveDB net entirely.
  const COLLECTION_MODULE = {
    salesOrders: 'sales', salesQuotations: 'sales', salesInvoices: 'sales',
    salesReceipts: 'sales', salesReturns: 'sales',
    salesDownPayments: 'sales',
    // deliveryOrders sits in its own module so the field role can create surat
    // jalan without gaining any rights over the money-bearing sales documents.
    deliveryOrders: 'logistics',
    purchaseOrders: 'purchases', purchaseQuotations: 'purchases', purchaseInvoices: 'purchases',
    purchasePayments: 'purchases', purchaseReturns: 'purchases', purchaseDownPayments: 'purchases',
    goodsReceipts: 'purchases',
    inventoryItems: 'inventory', itemAdjustments: 'inventory', itemTransfers: 'inventory',
    warehouses: 'inventory',
    // NOTE: journals/paymentLogs/accounts are NOT listed here. They are auto-
    // maintained side-effects of allowed sales/purchase activity (GL reconcile
    // runs inside saveDB), so gating them would block legitimate transactions.
    // Manual journal vouchers ARE gated separately (manualJournals, below).
    budgets: 'gl', budgetTransfers: 'gl', payrollRuns: 'gl',
    customers: 'master', suppliers: 'master', employees: 'master', fleet: 'master',
    expedition: 'master',
    assets: 'assets', faCategories: 'assets', fiscalFaCategories: 'assets',
    assetTransfers: 'assets', assetDispositions: 'assets',
    // The settings doc bundles admin config + reference data (asset/category/unit
    // lists) → module 'config' (admin+manajer). users/{uid} is managed outside DB.
    settings: 'config',
  };

  // App-internal side-effect collections: written as a by-product of legitimate
  // actions or by background schedulers (notifications/number sequences). Never
  // reverted by the net so a read-only role's session doesn't thrash.
  const SYSTEM_COLLECTIONS = new Set([
    'notifications', 'reservations', 'numberSequences', 'auditLog', 'trash',
    // GL side-effects of allowed transactions — exempt (see COLLECTION_MODULE).
    'paymentLogs', 'accounts',
  ]);

  // Sidebar menu group key → module (nav.js gating).
  const GROUP_MODULE = {
    dashboard: 'dashboard', company: 'admin', ledger: 'gl', cashbank: 'gl',
    sales: 'sales', purchases: 'purchases', inventory: 'inventory',
    assets: 'assets', tax: 'tax', reports: 'reports', logistics: 'logistics',
  };

  // View id → module (click-guard / button gating). Ambiguous shared views
  // (invoices/returns/quotations) map leniently; the saveDB net is authoritative.
  const VIEW_MODULE = {
    dashboard: 'dashboard', settings: 'admin', tax: 'tax', master: 'master',
    ledger: 'gl', finance: 'gl', financials: 'reports', reports: 'reports',
    sales: 'sales', quotations: 'sales', logistics: 'logistics', invoices: 'sales',
    returns: 'sales', purchase: 'purchases', inventory: 'inventory',
    warehouse: 'inventory', adjustments: 'inventory', assets: 'assets',
    // Read-only AR/AP summary — gated as a report, not as sales/purchases, so
    // roles that may see reports but not edit orders can still open it.
    outstanding: 'reports',
    // Field-operator input screen — the one view the `lapangan` role can open.
    suratjalan: 'logistics',
    // Pages split out of the former tabbed views. Each keeps the module its
    // parent view had, so no role's access changed with the split.
    salesInvoices: 'sales', salesReceipts: 'sales', salesQuotations: 'sales',
    salesReturns: 'sales',
    purchaseInvoices: 'purchases', purchasePayments: 'purchases',
    purchaseQuotations: 'purchases', purchaseReturns: 'purchases',
    reportPL: 'reports', reportBS: 'reports', reportCF: 'reports',
  };

  // ── Role accessors ───────────────────────────────────────────────────────────
  function user() {
    return window.__ERP_USER || { role: 'viewer', active: true };
  }
  function currentRole() {
    const u = user();
    // An inactive (pending-approval) account behaves as `pending`.
    if (u.active === false) {
      return 'pending';
    }
    return PERMISSIONS[u.role] ? u.role : 'viewer';
  }
  function isAdmin() {
    return currentRole() === 'admin';
  }

  function actionsFor(module) {
    const perms = PERMISSIONS[currentRole()] || {};
    return perms[module] || NONE;
  }

  /** Can the current role perform `action` on `module`? */
  function can(action, module) {
    if (isAdmin()) {
      return true;
    }
    return actionsFor(module).indexOf(action) !== -1;
  }
  function canView(module) {
    return can('view', module);
  }
  function canWrite(module) {
    return can('create', module) || can('edit', module);
  }
  function canViewGroup(groupKey) {
    const m = GROUP_MODULE[groupKey];
    return m ? canView(m) : true;
  }

  /** Where this role should land after login. Most roles get the dashboard; the
   *  field role cannot see it at all, so it lands on the surat jalan form. */
  function landingView() {
    return canView('dashboard') ? 'dashboard' : canView('logistics') ? 'suratjalan' : 'dashboard';
  }

  // Capabilities (admin-only): user management, settings, period lock, permanent delete.
  function canManageUsers() {
    return isAdmin();
  }
  function canManageSettings() {
    return isAdmin();
  }
  function canPeriodLock() {
    return isAdmin();
  }
  function canPermanentDelete() {
    return isAdmin();
  }

  // ── saveDB safety net (mirror of integrity.js) ───────────────────────────────
  function db() {
    return window.DB || {};
  }
  const trackedCollections = Object.keys(COLLECTION_MODULE);

  // Only MANUAL journal vouchers are user-authored GL entries; auto/accurate
  // journals are derived (rebuilt by GL reconcile on every save) and must be
  // exempt or they'd flag every allowed sales/purchase post as a 'gl' write.
  function manualJournals() {
    return (db().journals || []).filter(j => j && j.source === 'manual');
  }

  let snapshot = null;
  function takeSnapshot() {
    const snap = {};
    trackedCollections.forEach(name => {
      const arr = db()[name];
      // Object-style collections (settings) aren't arrays; capture them by JSON
      // identity under a single synthetic key.
      if (Array.isArray(arr)) {
        snap[name] = JSON.parse(JSON.stringify(arr));
      } else if (arr && typeof arr === 'object') {
        snap[name] = { __obj: JSON.stringify(arr) };
      } else {
        snap[name] = [];
      }
    });
    snap._manualJournals = JSON.parse(JSON.stringify(manualJournals()));
    snapshot = snap;
  }
  function refreshSnapshot() {
    try {
      takeSnapshot();
    } catch (e) {
      console.warn('[RBAC] snapshot refresh failed:', e);
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

  // Detect the first mutation the current role is NOT allowed to make.
  // Returns { module, action, collection } or null.
  function findViolation() {
    if (isAdmin()) {
      return null;
    }
    for (let i = 0; i < trackedCollections.length; i++) {
      const name = trackedCollections[i];
      if (SYSTEM_COLLECTIONS.has(name)) {
        continue;
      }
      const module = COLLECTION_MODULE[name];
      const oldSnap = snapshot[name];
      const live = db()[name];

      // Object-style collection: any change ⇒ an edit.
      if (oldSnap && oldSnap.__obj !== undefined) {
        const now = live && typeof live === 'object' ? JSON.stringify(live) : '';
        if (now !== oldSnap.__obj && !can('edit', module)) {
          return { module, action: 'edit', collection: name };
        }
        continue;
      }

      const oldMap = byId(oldSnap);
      const newMap = byId(live);
      let v = null;
      newMap.forEach((rec, id) => {
        if (v) {
          return;
        }
        const prev = oldMap.get(id);
        if (!prev) {
          if (!can('create', module)) {
            v = { module, action: 'create', collection: name };
          }
        } else if (JSON.stringify(prev) !== JSON.stringify(rec) && !can('edit', module)) {
          v = { module, action: 'edit', collection: name };
        }
      });
      if (v) {
        return v;
      }
      oldMap.forEach((rec, id) => {
        if (v) {
          return;
        }
        if (!newMap.has(id) && !can('delete', module)) {
          v = { module, action: 'delete', collection: name };
        }
      });
      if (v) {
        return v;
      }
    }

    // Manual journal vouchers (module 'gl').
    const jOld = byId(snapshot._manualJournals);
    const jNew = byId(manualJournals());
    let jv = null;
    jNew.forEach((rec, id) => {
      if (jv) {
        return;
      }
      const prev = jOld.get(id);
      if (!prev && !can('create', 'gl')) {
        jv = { module: 'gl', action: 'create', collection: 'journals' };
      } else if (prev && JSON.stringify(prev) !== JSON.stringify(rec) && !can('edit', 'gl')) {
        jv = { module: 'gl', action: 'edit', collection: 'journals' };
      }
    });
    if (!jv) {
      jOld.forEach((rec, id) => {
        if (jv) {
          return;
        }
        if (!jNew.has(id) && !can('delete', 'gl')) {
          jv = { module: 'gl', action: 'delete', collection: 'journals' };
        }
      });
    }
    return jv;
  }

  function revertToSnapshot() {
    const data = db();
    trackedCollections.forEach(name => {
      const s = snapshot[name];
      if (s && s.__obj !== undefined) {
        try {
          data[name] = JSON.parse(s.__obj);
        } catch (_) {
          /* leave as-is */
        }
      } else {
        data[name] = JSON.parse(JSON.stringify(s || []));
      }
    });
    // Restore manual journals; keep derived (auto/accurate) ones — reconcile
    // rebuilds autos from the reverted documents on the next save.
    const keep = (data.journals || []).filter(j => !j || j.source !== 'manual');
    data.journals = keep.concat(JSON.parse(JSON.stringify(snapshot._manualJournals || [])));
  }

  const ACTION_LABEL = { create: 'menambah', edit: 'mengubah', delete: 'menghapus' };
  const MODULE_LABEL = {
    sales: 'Penjualan', purchases: 'Pembelian', inventory: 'Inventory', gl: 'Buku Besar',
    tax: 'Pajak', assets: 'Aset', master: 'Master Data', admin: 'Pengaturan/Admin',
    config: 'Pengaturan',
  };

  function installSaveHook() {
    if (typeof window.saveDB !== 'function') {
      console.warn('[RBAC] window.saveDB missing — net not installed');
      return;
    }
    const _origSave = window.saveDB;
    window.saveDB = function rbacGuardedSave() {
      try {
        if (snapshot) {
          const v = findViolation();
          if (v) {
            revertToSnapshot();
            const msg =
              `Akses ditolak — peran "${currentRole()}" tidak boleh ` +
              `${ACTION_LABEL[v.action] || v.action} data ${MODULE_LABEL[v.module] || v.module}.`;
            console.warn('[RBAC] ' + msg, v);
            if (typeof window.showToast === 'function') {
              window.showToast(msg, 'danger');
            }
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
        }
      } catch (err) {
        // An RBAC bug must never block a legitimate save.
        console.error('[RBAC] net check failed (save proceeds):', err);
      }
      const result = _origSave.apply(this, arguments);
      refreshSnapshot();
      return result;
    };
  }

  // ── Click guard (capture phase, runs before module bubble handlers) ──────────
  const CREATE_RE = /^(add|new|create|buat|tambah|post|save|simpan)/i;
  const DELETE_RE = /^(del|delete|hapus|remove|purge|void|reset)/i;
  const EDIT_RE = /^(edit|update|ubah)/i;
  // Whitelisted action verbs that are never writes (view/filter/print/etc.) and
  // must never be blocked even if they superficially match above.
  const SAFE_ACTIONS = new Set(['addWidget']);

  function activeModule() {
    const v = window.activeView || 'dashboard';
    return VIEW_MODULE[v] || 'dashboard';
  }

  function installClickGuard() {
    document.addEventListener(
      'click',
      function (e) {
        if (isAdmin()) {
          return;
        }
        const el = e.target && e.target.closest ? e.target.closest('[data-action]') : null;
        if (!el) {
          return;
        }
        const action = el.getAttribute('data-action') || '';
        if (SAFE_ACTIONS.has(action)) {
          return;
        }
        let need = null;
        if (DELETE_RE.test(action)) {
          need = 'delete';
        } else if (CREATE_RE.test(action)) {
          need = 'create';
        } else if (EDIT_RE.test(action)) {
          need = 'edit';
        }
        if (!need) {
          return;
        }
        const module = activeModule();
        if (!can(need, module)) {
          e.preventDefault();
          e.stopPropagation();
          if (typeof window.showToast === 'function') {
            window.showToast(
              `Akses ditolak — peran "${currentRole()}" tidak boleh ${ACTION_LABEL[need]} data ${MODULE_LABEL[module] || module}.`,
              'danger'
            );
          }
        }
      },
      true // capture
    );
  }

  // ── View button gating: hide create/delete buttons the role can't use ────────
  function guardView() {
    try {
      if (isAdmin()) {
        return;
      }
      const module = activeModule();
      const scope = document.querySelector('.main-content') || document.body;
      scope.querySelectorAll('[data-action]').forEach(el => {
        const action = el.getAttribute('data-action') || '';
        if (SAFE_ACTIONS.has(action)) {
          return;
        }
        let need = null;
        if (DELETE_RE.test(action)) {
          need = 'delete';
        } else if (CREATE_RE.test(action)) {
          need = 'create';
        } else if (EDIT_RE.test(action)) {
          need = 'edit';
        }
        if (need && !can(need, module)) {
          el.style.display = 'none';
        }
      });
    } catch (e) {
      console.warn('[RBAC] guardView failed:', e);
    }
  }

  // Hide whole sidebar menu groups the current role can't view. Applied from
  // rbac.js boot (which loads LAST) because nav.js's own gating runs during its
  // earlier eval, before window.RBAC exists. Idempotent.
  function applyNavGating() {
    try {
      document.querySelectorAll('.rail-item').forEach(btn => {
        const menuId = btn.dataset.menu;
        if (menuId && !canViewGroup(menuId)) {
          btn.style.display = 'none';
        }
      });
      // Hide a whole section header (Overview/Accounting/…) once all its rails
      // are gated out, so a restricted role doesn't see empty labelled groups.
      document.querySelectorAll('.nav-section').forEach(sec => {
        const rails = sec.querySelectorAll('.rail-item');
        if (!rails.length) {
          return;
        }
        const anyVisible = [...rails].some(b => b.style.display !== 'none');
        sec.style.display = anyVisible ? '' : 'none';
      });
    } catch (e) {
      console.warn('[RBAC] applyNavGating failed:', e);
    }
  }

  function installNavigateHook() {
    if (typeof window.navigate !== 'function') {
      return;
    }
    const _orig = window.navigate;
    window.navigate = function rbacNavigate() {
      const r = _orig.apply(this, arguments);
      // Run after the view renders.
      requestAnimationFrame(guardView);
      return r;
    };
  }

  // ── Boot ─────────────────────────────────────────────────────────────────────
  refreshSnapshot();
  installSaveHook();
  installClickGuard();
  installNavigateHook();
  applyNavGating();
  // The rail DOM may be (re)wired by nav.js slightly later; re-apply on the next
  // frame so gating wins regardless of init order.
  if (typeof requestAnimationFrame === 'function') {
    requestAnimationFrame(applyNavGating);
  }

  window.RBAC = {
    currentRole,
    isAdmin,
    can,
    canView,
    canWrite,
    canViewGroup,
    landingView,
    canManageUsers,
    canManageSettings,
    canPeriodLock,
    canPermanentDelete,
    refreshSnapshot,
    guardView,
    applyNavGating,
    PERMISSIONS,
    GROUP_MODULE,
    VIEW_MODULE,
  };

  console.log('[RBAC] active — role:', currentRole());
})();
