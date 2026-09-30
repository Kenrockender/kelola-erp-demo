// ═══════════════════════════════════════════════════════════════════════════════
// KELOLA ERP (DEMO) — Runtime Data Backfills  (doc-migrate.js)
// Phase 1 of the V4 plan (see docs/ARCHITECTURE_ERP_V4.md).
//
// Runs ONCE per load, after loadDB() (it is in the main.js scriptQueue, which is
// loaded only after the DB is ready). Idempotent: it only fills fields that are
// missing, and persists only if something actually changed.
//
// Phase 1 backfill: stamp customerId / supplierId onto existing SO / PO / DO by
// matching the denormalized party name against the master records. The name field
// stays authoritative for display (name-sync shim); the id is additive.
//
// Phase 2 backfill (2026-06-07): normalize Accurate migration field names.
//   - customerName → customer  (Accurate export uses customerName, UI reads customer)
//   - supplierName → supplier  (same issue for PO)
//   - number from window.defaultData via _accurateId lookup (in case number is empty)
//
// Global-scope rule: classic <script>, IIFE-wrapped, declares no top-level names.
// ═══════════════════════════════════════════════════════════════════════════════
(function () {
  'use strict';

  if (!window.DB) {
    return;
  }

  function isUnset(v) {
    return v === null || v === undefined;
  }

  function idByName(collection, name) {
    if (!name) {
      return null;
    }
    const rec = (window.DB[collection] || []).find(p => p && p.name === name);
    return rec ? rec.id : null;
  }

  // ── Phase 2: build lookup maps from window.defaultData (accurate-data.json) ──
  // defaultData uses _accurateId as the bridge between re-migration UIDs.
  const soByAccurateId = {};
  const poByAccurateId = {};
  if (window.defaultData) {
    (window.defaultData.salesOrders || []).forEach(o => {
      if (o._accurateId != null) soByAccurateId[o._accurateId] = o;
    });
    (window.defaultData.purchaseOrders || []).forEach(o => {
      if (o._accurateId != null) poByAccurateId[o._accurateId] = o;
    });
  }

  let changed = 0;

  // Phase 3 remap tables: old random uid → new structured id
  const soIdRemap = {};
  const poIdRemap = {};

  // ── SO backfills ──────────────────────────────────────────────────────────────
  const soIds = new Set((window.DB.salesOrders || []).map(o => o.id));
  (window.DB.salesOrders || []).forEach(o => {
    // Phase 2a: customerName → customer
    if (!o.customer && o.customerName) {
      o.customer = o.customerName;
      changed++;
    }
    // Phase 2b: fill number from defaultData if missing
    if (!o.number && o._accurateId != null && soByAccurateId[o._accurateId]) {
      o.number = soByAccurateId[o._accurateId].number || '';
      if (o.number) changed++;
    }
    // Phase 3: replace random uid id with structured number (SI→SO prefix)
    if (o.number && o.id !== o.number && !/^SO[.\-]/.test(o.id) && !/^SI[.\-]/.test(o.id)) {
      const newId = o.number;
      if (!soIds.has(newId)) {
        const oldId = o.id;
        soIds.delete(oldId);
        o.id = newId;
        soIds.add(newId);
        soIdRemap[oldId] = newId;
        changed++;
      }
    }
    // Phase 1: stamp customerId
    if (isUnset(o.customerId) && o.customer) {
      const id = idByName('customers', o.customer);
      if (!isUnset(id)) {
        o.customerId = id;
        changed++;
      }
    }
  });

  // ── DO backfills ──────────────────────────────────────────────────────────────
  // Phase 4 (2026-06-12): normalize Accurate-imported DOs so they are editable
  // and print correctly:
  //   - raw Accurate statuses (SENT / INVOICED / PARTIAL_INVOICED / DRAFT) are
  //     now surfaced as their real Accurate labels (Sent / Invoiced / Partially
  //     invoiced) so the UI matches the source documents; DRAFT → Pending.
  //     The canonical Accurate status is preserved in _accurateStatus, and we
  //     derive `status` from it so DBs migrated under the old (→Delivered) map
  //     self-heal to the correct label on next load.
  //   - destination was never imported; DO notes follow the Accurate convention
  //     "item description\ndestination" — backfill from notes line 2, falling
  //     back to the customer's master address.
  const DO_RAW_STATUS = {
    SENT: 'Sent',
    INVOICED: 'Invoiced',
    PARTIAL_INVOICED: 'Partially invoiced',
    'PARTIALLY INVOICED': 'Partially invoiced',
    DRAFT: 'Pending',
  };
  function destFromNotes(notes) {
    const ls = String(notes || '')
      .split('\n')
      .map(function (x) {
        return x.trim();
      })
      .filter(Boolean);
    return ls.length >= 2 ? ls[1] : '';
  }
  function addrByName(name) {
    const c = (window.DB.customers || []).find(p => p && p.name === name);
    return (c && c.address) || '';
  }
  (window.DB.deliveryOrders || []).forEach(o => {
    if (!o.customer && o.customerName) {
      o.customer = o.customerName;
      changed++;
    }
    if (isUnset(o.customerId) && o.customer) {
      const id = idByName('customers', o.customer);
      if (!isUnset(id)) {
        o.customerId = id;
        changed++;
      }
    }
    // Prefer the canonical Accurate status (set on first import) so that DBs
    // migrated under the old →Delivered map re-derive the correct label.
    const raw = String(o._accurateStatus || o.status || '').toUpperCase();
    const mapped = DO_RAW_STATUS[raw];
    if (mapped) {
      o._accurateStatus = o._accurateStatus || o.status;
      if (o.status !== mapped) {
        o.status = mapped;
        changed++;
      }
    }
    if (!o.destination) {
      const dest = destFromNotes(o.notes) || addrByName(o.customer || o.customerName);
      if (dest) {
        o.destination = dest;
        changed++;
      }
    }
  });

  // ── PO backfills ──────────────────────────────────────────────────────────────
  const poIds = new Set((window.DB.purchaseOrders || []).map(o => o.id));
  (window.DB.purchaseOrders || []).forEach(o => {
    // Phase 2a: supplierName → supplier
    if (!o.supplier && o.supplierName) {
      o.supplier = o.supplierName;
      changed++;
    }
    // Phase 2b: fill number from defaultData if missing
    if (!o.number && o._accurateId != null && poByAccurateId[o._accurateId]) {
      o.number = poByAccurateId[o._accurateId].number || '';
      if (o.number) changed++;
    }
    // Phase 3: replace random uid id with structured number (PI→PO prefix)
    if (o.number && o.id !== o.number && !/^PO[.\-]/.test(o.id) && !/^PI[.\-]/.test(o.id)) {
      const newId = o.number;
      if (!poIds.has(newId)) {
        const oldId = o.id;
        poIds.delete(oldId);
        o.id = newId;
        poIds.add(newId);
        poIdRemap[oldId] = newId;
        changed++;
      }
    }
    // Phase 1: stamp supplierId
    if (isUnset(o.supplierId) && o.supplier) {
      const id = idByName('suppliers', o.supplier);
      if (!isUnset(id)) {
        o.supplierId = id;
        changed++;
      }
    }
  });

  // Phase 1b: backfill missing `number` on SO, PO, DO. Documents created before
  // the V4 numbering engine was wired up only have an `id` (e.g. "DO-2026-039")
  // but no Accurate-style `number` (e.g. "DO.2026.06.00001"). Generate one now
  // using DocEngine.nextNumber() so the display is consistent.
  var DE = window.DocEngine;
  if (DE) {
    [
      ['salesOrders', 'SO'],
      ['purchaseOrders', 'PO'],
      ['deliveryOrders', 'DO'],
    ].forEach(function (pair) {
      var coll = pair[0],
        docType = pair[1];
      (window.DB[coll] || []).forEach(function (o) {
        if (!o.number) {
          o.number = DE.nextNumber(docType, o.date, { commit: true });
          changed++;
        }
      });
    });
  }

  // ── Phase 3: fix DO cross-references to renamed SO/PO ids ──────────────────
  (window.DB.deliveryOrders || []).forEach(o => {
    if (o.soId && soIdRemap[o.soId]) {
      o.soId = soIdRemap[o.soId];
      changed++;
    }
    if (o.poId && poIdRemap[o.poId]) {
      o.poId = poIdRemap[o.poId];
      changed++;
    }
  });

  if (changed > 0 && typeof window.saveDB === 'function') {
    try {
      window.saveDB();
    } catch {
      /* persistence is best-effort; fields are already set in memory */
    }
    console.warn(`[ERP] Data backfill: normalized ${changed} field(s) (customer/supplier/number)`);
  }
})();
