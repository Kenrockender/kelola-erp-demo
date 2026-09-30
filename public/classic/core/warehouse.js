// ═══════════════════════════════════════════════════════════════════════════════
// KELOLA ERP (DEMO) — Warehouse & Multi-Warehouse Stock  (warehouse.js)
// Phase 3b: per-warehouse stock tracking + Item Transfer.
//
// BACKWARD-COMPATIBLE: item.stock (scalar) remains the total across all
// warehouses. item.warehouseStock = { whId: qty, ... } is the per-warehouse
// breakdown. All stock mutations go through this module which keeps both in
// sync. Existing code that reads item.stock sees the same total as before.
//
// Global-scope rule: classic <script>, IIFE-wrapped, exposes window.Warehouse.
// ═══════════════════════════════════════════════════════════════════════════════
(function () {
  'use strict';

  var DEFAULT_WH_ID = 'WH-DEFAULT';
  var DEFAULT_WH = { id: DEFAULT_WH_ID, name: 'Gudang Utama', location: 'Default', active: true };

  function db() {
    return window.DB || {};
  }

  // ── Warehouse CRUD ────────────────────────────────────────────────────────
  function ensureWarehouses() {
    var data = db();
    if (!Array.isArray(data.warehouses) || data.warehouses.length === 0) {
      data.warehouses = [Object.assign({}, DEFAULT_WH)];
    }
    return data.warehouses;
  }

  function getWarehouses() {
    return ensureWarehouses().filter(function (w) {
      return w.active !== false;
    });
  }

  function getWarehouse(id) {
    return (
      ensureWarehouses().find(function (w) {
        return w.id === id;
      }) || null
    );
  }

  function warehouseName(id) {
    var w = getWarehouse(id);
    return w ? w.name : id;
  }

  function addWarehouse(name, location) {
    var data = db();
    ensureWarehouses();
    var id = 'WH-' + Date.now();
    var wh = { id: id, name: name, location: location || '', active: true };
    data.warehouses.push(wh);
    return wh;
  }

  function updateWarehouse(id, updates) {
    var wh = getWarehouse(id);
    if (!wh) return null;
    if (updates.name !== undefined) wh.name = updates.name;
    if (updates.location !== undefined) wh.location = updates.location;
    if (updates.active !== undefined) wh.active = updates.active;
    return wh;
  }

  // ── Per-warehouse stock helpers ───────────────────────────────────────────
  // Ensure item has warehouseStock map. If it only has scalar stock, migrate it
  // to the default warehouse.
  function ensureItemWH(item) {
    if (!item) return;
    if (!item.warehouseStock || typeof item.warehouseStock !== 'object') {
      item.warehouseStock = {};
      // Migrate scalar stock to default warehouse
      var total = Number(item.stock) || 0;
      if (total > 0) {
        item.warehouseStock[DEFAULT_WH_ID] = total;
      }
    }
    return item.warehouseStock;
  }

  // Get stock at a specific warehouse
  function stockAt(item, whId) {
    if (!item) return 0;
    ensureItemWH(item);
    return Number(item.warehouseStock[whId]) || 0;
  }

  // Get total stock across all warehouses
  function totalStock(item) {
    if (!item) return 0;
    ensureItemWH(item);
    var total = 0;
    var whs = item.warehouseStock;
    for (var k in whs) {
      if (Object.prototype.hasOwnProperty.call(whs, k)) {
        total += Number(whs[k]) || 0;
      }
    }
    return total;
  }

  // Sync item.stock from warehouseStock (call after any mutation)
  function syncTotal(item) {
    if (!item) return;
    item.stock = totalStock(item);
  }

  // ── Stock mutations ───────────────────────────────────────────────────────
  // Add stock to a warehouse. Also updates item.stock total.
  function addStock(item, whId, qty) {
    if (!item || qty <= 0) return;
    whId = whId || DEFAULT_WH_ID;
    ensureItemWH(item);
    item.warehouseStock[whId] = (Number(item.warehouseStock[whId]) || 0) + qty;
    syncTotal(item);
  }

  // Remove stock from a warehouse. Clamps to 0. Also updates item.stock total.
  function removeStock(item, whId, qty) {
    if (!item || qty <= 0) return;
    whId = whId || DEFAULT_WH_ID;
    ensureItemWH(item);
    var current = Number(item.warehouseStock[whId]) || 0;
    item.warehouseStock[whId] = Math.max(0, current - qty);
    syncTotal(item);
  }

  // Transfer stock between warehouses. Returns true on success.
  function transferStock(item, fromWhId, toWhId, qty) {
    if (!item || qty <= 0 || fromWhId === toWhId) return false;
    ensureItemWH(item);
    var available = Number(item.warehouseStock[fromWhId]) || 0;
    if (available < qty) return false;
    item.warehouseStock[fromWhId] = available - qty;
    item.warehouseStock[toWhId] = (Number(item.warehouseStock[toWhId]) || 0) + qty;
    syncTotal(item);
    return true;
  }

  // Set stock at a warehouse to an absolute value. Updates total.
  function setStock(item, whId, qty) {
    if (!item) return;
    whId = whId || DEFAULT_WH_ID;
    ensureItemWH(item);
    item.warehouseStock[whId] = Math.max(0, qty);
    syncTotal(item);
  }

  // Get per-warehouse breakdown: [{ whId, whName, qty }]
  function breakdown(item) {
    if (!item) return [];
    ensureItemWH(item);
    var result = [];
    var whs = item.warehouseStock;
    for (var k in whs) {
      if (Object.prototype.hasOwnProperty.call(whs, k)) {
        var q = Number(whs[k]) || 0;
        if (q > 0) {
          result.push({ whId: k, whName: warehouseName(k), qty: q });
        }
      }
    }
    return result;
  }

  // ── Migration: seed warehouseStock for all items that don't have it ───────
  function migrateAll() {
    ensureWarehouses();
    (db().inventoryItems || []).forEach(function (item) {
      ensureItemWH(item);
    });
  }

  // ── Expose ────────────────────────────────────────────────────────────────
  var Warehouse = {
    DEFAULT_WH_ID: DEFAULT_WH_ID,
    ensureWarehouses: ensureWarehouses,
    getWarehouses: getWarehouses,
    getWarehouse: getWarehouse,
    warehouseName: warehouseName,
    addWarehouse: addWarehouse,
    updateWarehouse: updateWarehouse,
    ensureItemWH: ensureItemWH,
    stockAt: stockAt,
    totalStock: totalStock,
    addStock: addStock,
    removeStock: removeStock,
    transferStock: transferStock,
    setStock: setStock,
    breakdown: breakdown,
    migrateAll: migrateAll,
  };

  window.Warehouse = Warehouse;
  try {
    if (!window.ERP) window.ERP = {};
    window.ERP.warehouse = Warehouse;
  } catch (e) {
    /* */
  }
})();
