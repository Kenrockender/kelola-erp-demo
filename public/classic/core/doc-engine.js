// ═══════════════════════════════════════════════════════════════════════════════
// KELOLA ERP (DEMO) — Document Engine  (doc-engine.js)
// Phase 0 scaffolding for the V4 document-flow engine (see docs/ARCHITECTURE_ERP_V4.md).
//
// ADDITIVE & NON-BREAKING: pure helpers built on window.DocRegistry. This file does
// NOT mutate DB and does NOT touch the existing CRUD. Existing code keeps using
// helpers.js nextId(); DocEngine.nextNumber() is the opt-in V4 numbering for later
// phases.
//
// Global-scope rule: classic <script>, IIFE-wrapped, exposes ONLY window.DocEngine.
// ═══════════════════════════════════════════════════════════════════════════════
(function () {
  'use strict';

  function registry() {
    return window.DocRegistry || null;
  }

  function pad(n, w) {
    return String(n).padStart(w, '0');
  }

  // Accurate-style document number: PREFIX.YYYY.MM.NNNNN with the sequence resetting
  // each month. `sequences` shape: { [docType]: { period: 'YYYY-MM', next: Number } }.
  //
  // Pure by default — it reads (but does not mutate) the sequence store and returns
  // the next number. Pass { commit: true } to advance the counter in the store.
  // The store defaults to DB.numberSequences when present.
  function nextNumber(docType, dateStr, opts) {
    opts = opts || {};
    const reg = registry();
    const def = reg && reg.get(docType);
    const prefix = (def && def.numberPrefix) || docType;

    const d = dateStr ? new Date(dateStr + 'T00:00:00') : new Date();
    const year = d.getFullYear();
    const month = d.getMonth() + 1;
    const period = `${year}-${pad(month, 2)}`;

    const store = opts.sequences || (window.DB && window.DB.numberSequences) || {};
    const entry = store[docType];
    let cur = entry && entry.period === period ? entry.next : 1;

    // Multi-device safety: numberSequences syncs last-write-wins, so two
    // devices can hold the same counter and issue duplicate numbers. The
    // documents themselves are the real record of what was issued — scan this
    // type's collection for numbers already used in the period and start above
    // the highest one.
    const head = `${prefix}.${year}.${pad(month, 2)}.`;
    const docs = (def && def.collection && window.DB && window.DB[def.collection]) || [];
    let maxIssued = 0;
    for (let i = 0; i < docs.length; i++) {
      const num = docs[i] && docs[i].number;
      if (typeof num === 'string' && num.indexOf(head) === 0) {
        const seq = parseInt(num.slice(head.length), 10);
        if (seq > maxIssued) {
          maxIssued = seq;
        }
      }
    }
    if (maxIssued >= cur) {
      cur = maxIssued + 1;
    }

    const number = `${prefix}.${year}.${pad(month, 2)}.${pad(cur, 5)}`;

    if (opts.commit && store) {
      store[docType] = { period, next: cur + 1 };
    }
    return number;
  }

  // Totals for a set of lines. Forward-looking: it honours per-line `lineDiscount`
  // and an optional header discount + tax rate. With none of those present it simply
  // reproduces the current behaviour (sum of line subtotals).
  function computeTotals(lines, opts) {
    opts = opts || {};
    lines = Array.isArray(lines) ? lines : [];

    let subTotal = 0;
    lines.forEach(l => {
      const qty = Number(l.qty) || 0;
      const price = Number(l.price) || 0;
      const lineDisc = Number(l.lineDiscount) || 0;
      const hasSub = l.subtotal !== null && l.subtotal !== undefined;
      const sub = hasSub ? Number(l.subtotal) : qty * price - lineDisc;
      subTotal += sub;
    });

    const discount = Number(opts.discount) || 0;
    const taxable = Math.max(0, subTotal - discount);
    const taxRate = Number(opts.taxRate) || 0;
    // tax-inclusive prices already contain the tax, so no tax is added on top.
    const tax = opts.taxInclusive ? 0 : Math.round(taxable * taxRate);
    const grandTotal = taxable + tax;

    return { subTotal, discount, tax, grandTotal };
  }

  // Status engine: is `to` a valid next status for `from` under this docType?
  // Same status is always allowed (no-op save).
  function canTransition(docType, from, to) {
    const reg = registry();
    const def = reg && reg.get(docType);
    if (!def) {
      return false;
    }
    if (from === to) {
      return true;
    }
    const allowed = def.transitions && def.transitions[from];
    // Unknown `from` (legacy or Accurate-imported status not in the table):
    // allow any move so the document isn't stuck un-editable. A defined-but-
    // empty list (terminal status) still blocks.
    if (!allowed) {
      return true;
    }
    return allowed.indexOf(to) !== -1;
  }

  function statusLabel(docType, value) {
    const reg = registry();
    const list = reg ? reg.statuses(docType) : [];
    const hit = list.find(s => s[0] === value);
    return hit ? hit[1] : value;
  }

  // Which upstream document types can this type be created "from" (Get From chaining).
  function getFromSources(docType) {
    const reg = registry();
    const def = reg && reg.get(docType);
    return (def && def.getFrom) || [];
  }

  // Phase 1: resolve a party (customer/supplier) id from its name, using the
  // docType's party collection from the registry. Returns the id, or null when no
  // record matches (e.g. a free-text party typed in the form). The denormalized
  // name remains the authoritative display value (name-sync shim).
  function resolvePartyId(docType, name) {
    const reg = registry();
    const def = reg && reg.get(docType);
    if (!def || !def.partyCollection || !name) {
      return null;
    }
    const coll = (window.DB && window.DB[def.partyCollection]) || [];
    const hit = coll.find(p => p && p.name === name);
    return hit ? hit.id : null;
  }

  const DocEngine = {
    nextNumber,
    computeTotals,
    canTransition,
    statusLabel,
    getFromSources,
    resolvePartyId,
  };

  window.DocEngine = DocEngine;
  try {
    if (!window.ERP) {
      window.ERP = {};
    }
    window.ERP.docEngine = DocEngine;
  } catch {
    /* ERP namespace not available yet — window.DocEngine is the canonical handle */
  }
})();
