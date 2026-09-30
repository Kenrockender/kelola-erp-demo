// ═══════════════════════════════════════════════════════════════════════════════
// KELOLA ERP (DEMO) — Stock Management
// Stock mutation, reservation, and availability tracking
// ═══════════════════════════════════════════════════════════════════════════════

import { showToast } from './modal.js';

/**
 * Apply stock mutation when order status changes
 * @param {object} order - Order object (SO or PO)
 * @param {string} direction - "out" for SO, "in" for PO
 */
export function applyStockMutation(order, direction) {
  if (!order.lines || order.stockMutated) {
    return false;
  }

  // Validate stock availability before applying mutations
  if (direction === 'out') {
    const problems = [];
    order.lines.forEach(line => {
      if (line.itemId === 'custom') {
        return;
      }
      const item = DB.inventoryItems.find(i => String(i.id) === String(line.itemId));
      if (!item) {
        return;
      }
      if (item.stock < line.qty) {
        problems.push({
          itemName: item.name,
          needed: line.qty,
          available: item.stock,
        });
      }
    });

    if (problems.length > 0) {
      const msg = problems
        .map(p => `${p.itemName}: butuh ${p.needed} tapi hanya tersedia ${p.available}`)
        .join('; ');
      showToast(`Stok tidak mencukupi: ${msg}`, 'danger');
      return false;
    }
  }

  // Apply mutations — route through Warehouse module when available
  const wh = window.Warehouse;
  const whId = order.warehouseId || (wh ? wh.DEFAULT_WH_ID : null);

  order.lines.forEach(line => {
    if (line.itemId === 'custom') {
      return;
    }
    const item = DB.inventoryItems.find(i => String(i.id) === String(line.itemId));
    if (!item) {
      return;
    }
    if (wh && whId) {
      if (direction === 'out') {
        wh.removeStock(item, whId, line.qty);
      } else if (direction === 'in') {
        wh.addStock(item, whId, line.qty);
      }
    } else {
      if (direction === 'out') {
        item.stock = Math.max(0, item.stock - line.qty);
      } else if (direction === 'in') {
        item.stock += line.qty;
      }
    }
  });

  order.stockMutated = true;
  return true;
}

/**
 * Get reserved quantity for an item
 */
export function getReservedQty(itemId) {
  if (!DB.reservations) {
    return 0;
  }
  let total = 0;
  Object.values(DB.reservations).forEach(lines => {
    lines.forEach(l => {
      if (l.itemId === itemId) {
        total += l.qty;
      }
    });
  });
  return total;
}

/**
 * Reserve stock for an order
 */
export function reserveStock(orderId, lines) {
  if (!DB.reservations) {
    DB.reservations = {};
  }
  DB.reservations[orderId] = lines.map(l => ({
    itemId: l.itemId,
    qty: l.qty,
  }));
}

/**
 * Release stock reservation
 */
export function releaseReservation(orderId) {
  if (!DB.reservations) {
    return;
  }
  delete DB.reservations[orderId];
}

/**
 * Check for oversell conditions
 */
export function checkOversell(lines, excludeOrderId) {
  const problems = [];
  lines.forEach(line => {
    if (line.itemId === 'custom') {
      return;
    }
    const item = DB.inventoryItems.find(i => String(i.id) === String(line.itemId));
    if (!item) {
      return;
    }

    // Calculate available stock (physical - reserved)
    let reserved = getReservedQty(line.itemId);

    // Exclude current order's reservation if editing
    if (excludeOrderId && DB.reservations && DB.reservations[excludeOrderId]) {
      const currentReservation = DB.reservations[excludeOrderId].find(
        r => r.itemId === line.itemId
      );
      if (currentReservation) {
        reserved -= currentReservation.qty;
      }
    }

    const available = item.stock - reserved;

    if (line.qty > available) {
      problems.push({
        itemName: item.name,
        requested: line.qty,
        available: available,
        physical: item.stock,
        reserved: reserved,
      });
    }
  });
  return problems;
}

/**
 * Get available stock for an item (physical - reserved)
 * Optionally scoped to a specific warehouse.
 */
export function getAvailableStock(itemId, warehouseId) {
  const item = DB.inventoryItems.find(i => String(i.id) === String(itemId));
  if (!item) {
    return 0;
  }
  const wh = window.Warehouse;
  const physical = wh && warehouseId ? wh.stockAt(item, warehouseId) : item.stock;
  const reserved = getReservedQty(itemId);
  return Math.max(0, physical - reserved);
}

// Make functions globally available
window.applyStockMutation = applyStockMutation;
window.getReservedQty = getReservedQty;
window.reserveStock = reserveStock;
window.releaseReservation = releaseReservation;
window.checkOversell = checkOversell;
window.getAvailableStock = getAvailableStock;
