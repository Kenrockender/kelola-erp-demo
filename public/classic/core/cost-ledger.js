// ═══════════════════════════════════════════════════════════════════════════════
// KELOLA ERP (DEMO) — Perpetual Moving-Average Cost Ledger  (cost-ledger.js)
// Phase 3a of the V4 plan (see docs/ARCHITECTURE_ERP_V4.md).
//
// A DERIVED layer (like the GL): it never mutates DB. It replays stock movements in
// chronological order to compute, per item, the perpetual moving-average unit cost,
// and per Sales Order, the COGS that was in effect when its goods were delivered.
//
// Movement sources (each carries a value at the moving average of its moment):
//   • Opening layer  — reconciles the ledger to the authoritative item.stock:
//       openingQty = max(0, item.stock − netRecordedMovement), valued at item.cost.
//       This means a brand-new DB (only item.cost/item.stock, no PO history) values
//       COGS exactly as Phase 2 did, and moving-average refines it as POs arrive.
//   • PO 'Received'  — IN at net unit cost (line.subtotal / qty, i.e. after discount).
//   • Item Adjustment 'in'  — IN at the line's unitCost (or current avg if omitted).
//   • Item Adjustment 'out' — OUT at current moving average.
//   • SO 'Delivered' — OUT at current moving average (this is the COGS for that SO).
//
// Ordering: by date, then a within-day priority (opening → ins → outs) so issues
// always draw against receipts booked the same day, then by id for stability.
//
// Global-scope rule: classic <script>, IIFE-wrapped, exposes ONLY window.CostLedger.
// ═══════════════════════════════════════════════════════════════════════════════
(function () {
  'use strict';

  function db() {
    return window.DB || {};
  }

  function num(v) {
    return Number(v) || 0;
  }

  function isInventoryItem(itemId) {
    if (itemId === 'custom' || itemId === null || itemId === undefined) {
      return null;
    }
    return (db().inventoryItems || []).find(i => String(i.id) === String(itemId)) || null;
  }

  // Net recorded movement per inventory item across PO receipts, adjustments and
  // SO deliveries — used to derive the opening layer.
  function netRecordedByItem() {
    const net = new Map();
    const add = (itemId, q) => net.set(itemId, (net.get(itemId) || 0) + q);

    (db().purchaseOrders || []).forEach(o => {
      if (o.status !== 'Received') {
        return;
      }
      (o.lines || []).forEach(l => {
        if (isInventoryItem(l.itemId)) {
          add(l.itemId, num(l.qty));
        }
      });
    });

    (db().itemAdjustments || []).forEach(a => {
      (a.lines || []).forEach(l => {
        if (!isInventoryItem(l.itemId)) {
          return;
        }
        add(l.itemId, l.type === 'out' ? -num(l.qty) : num(l.qty));
      });
    });

    (db().salesOrders || []).forEach(o => {
      if (o.status !== 'Delivered') {
        return;
      }
      (o.lines || []).forEach(l => {
        if (isInventoryItem(l.itemId)) {
          add(l.itemId, -num(l.qty));
        }
      });
    });

    return net;
  }

  // Build the full chronological movement list.
  function buildMovements() {
    const moves = [];
    const net = netRecordedByItem();

    // Opening layer — priority 0, sentinel earliest date.
    (db().inventoryItems || []).forEach(item => {
      const openingQty = Math.max(0, num(item.stock) - (net.get(item.id) || 0));
      if (openingQty > 0) {
        moves.push({
          date: '0000-00-00',
          pr: 0,
          id: `open:${item.id}`,
          itemId: item.id,
          dir: 'in',
          qty: openingQty,
          unitCost: num(item.cost),
        });
      }
    });

    // PO receipts — IN at net unit cost.
    (db().purchaseOrders || []).forEach(o => {
      if (o.status !== 'Received') {
        return;
      }
      (o.lines || []).forEach((l, idx) => {
        if (!isInventoryItem(l.itemId)) {
          return;
        }
        const qty = num(l.qty);
        const unitCost = qty > 0 ? num(l.subtotal) / qty : num(l.price);
        moves.push({
          date: o.date,
          pr: 1,
          id: `${o.id}:${idx}`,
          itemId: l.itemId,
          dir: 'in',
          qty,
          unitCost,
        });
      });
    });

    // Item Adjustments — in (pr 1) at unitCost, out (pr 2) at avg.
    (db().itemAdjustments || []).forEach(a => {
      (a.lines || []).forEach((l, idx) => {
        if (!isInventoryItem(l.itemId)) {
          return;
        }
        const out = l.type === 'out';
        moves.push({
          date: a.date,
          pr: out ? 2 : 1,
          id: `${a.id}:${idx}`,
          itemId: l.itemId,
          dir: out ? 'out' : 'in',
          qty: num(l.qty),
          unitCost: out ? undefined : num(l.unitCost),
          adjId: a.id,
        });
      });
    });

    // SO deliveries — OUT at avg, priority 2, tagged with soId for COGS capture.
    (db().salesOrders || []).forEach(o => {
      if (o.status !== 'Delivered') {
        return;
      }
      (o.lines || []).forEach((l, idx) => {
        if (!isInventoryItem(l.itemId)) {
          return;
        }
        moves.push({
          date: o.date,
          pr: 2,
          id: `${o.id}:${idx}`,
          itemId: l.itemId,
          dir: 'out',
          qty: num(l.qty),
          soId: o.id,
        });
      });
    });

    moves.sort((a, b) => {
      if (a.date !== b.date) {
        return a.date < b.date ? -1 : 1;
      }
      if (a.pr !== b.pr) {
        return a.pr - b.pr;
      }
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    });

    return moves;
  }

  let _snap = null;

  // Replay all movements → per-item {qty, value, avg} and per-SO/per-adjustment COGS.
  function compute() {
    if (_snap) {
      return _snap;
    }
    const state = new Map(); // itemId -> { qty, value }
    const cogsBySO = new Map(); // soId -> cogs total
    const valueByAdj = new Map(); // adjId -> signed value (in +, out −)

    const getSt = id => {
      let st = state.get(id);
      if (!st) {
        st = { qty: 0, value: 0 };
        state.set(id, st);
      }
      return st;
    };

    buildMovements().forEach(m => {
      const st = getSt(m.itemId);
      if (m.dir === 'in') {
        const item = isInventoryItem(m.itemId);
        const unitCost =
          m.unitCost !== undefined && m.unitCost !== null
            ? m.unitCost
            : st.qty > 0
              ? st.value / st.qty
              : item
                ? num(item.cost)
                : 0;
        st.qty += m.qty;
        st.value += m.qty * unitCost;
        if (m.adjId) {
          valueByAdj.set(m.adjId, (valueByAdj.get(m.adjId) || 0) + m.qty * unitCost);
        }
      } else {
        // OUT at current moving average.
        const item = isInventoryItem(m.itemId);
        const avg = st.qty > 0 ? st.value / st.qty : item ? num(item.cost) : 0;
        const cost = m.qty * avg;
        st.qty -= m.qty;
        st.value -= cost;
        if (st.qty <= 0) {
          st.qty = Math.max(0, st.qty);
          st.value = Math.max(0, st.value);
        }
        if (m.soId) {
          cogsBySO.set(m.soId, (cogsBySO.get(m.soId) || 0) + cost);
        }
        if (m.adjId) {
          valueByAdj.set(m.adjId, (valueByAdj.get(m.adjId) || 0) - cost);
        }
      }
    });

    const avgByItem = new Map();
    state.forEach((st, id) => {
      avgByItem.set(id, st.qty > 0 ? st.value / st.qty : 0);
    });

    _snap = { state, cogsBySO, valueByAdj, avgByItem };
    return _snap;
  }

  // Invalidate the cached snapshot — call after any DB mutation that affects stock
  // (gl.reconcileAll does this at the start of every reconcile).
  function invalidate() {
    _snap = null;
  }

  // Current moving-average unit cost for an item (falls back to item.cost).
  function costOf(itemId) {
    const snap = compute();
    if (snap.avgByItem.has(itemId) && snap.avgByItem.get(itemId) > 0) {
      return snap.avgByItem.get(itemId);
    }
    const item = isInventoryItem(itemId);
    return item ? num(item.cost) : 0;
  }

  // Total COGS for a delivered SO (sum of its out-movement costs at moving average).
  function cogsForSO(soId) {
    const snap = compute();
    return snap.cogsBySO.has(soId) ? snap.cogsBySO.get(soId) : null;
  }

  // Signed inventory value change for an Item Adjustment (in +, out −).
  function valueForAdjustment(adjId) {
    const snap = compute();
    return snap.valueByAdj.has(adjId) ? snap.valueByAdj.get(adjId) : 0;
  }

  // On-hand snapshot for an item: { qty, value, avg }.
  function stateOf(itemId) {
    const snap = compute();
    const st = snap.state.get(itemId);
    if (!st) {
      return { qty: 0, value: 0, avg: 0 };
    }
    return { qty: st.qty, value: st.value, avg: st.qty > 0 ? st.value / st.qty : 0 };
  }

  const CostLedger = {
    compute,
    invalidate,
    costOf,
    cogsForSO,
    valueForAdjustment,
    stateOf,
  };

  window.CostLedger = CostLedger;
  try {
    if (!window.ERP) {
      window.ERP = {};
    }
    window.ERP.costLedger = CostLedger;
  } catch {
    /* window.CostLedger is the canonical handle */
  }
})();
