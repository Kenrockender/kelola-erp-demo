import { describe, it, expect, beforeEach } from 'vitest';

// cost-ledger.js is a classic <script> (IIFE) that attaches window.CostLedger.
beforeEach(() => {
  (window as any).DB = {
    inventoryItems: [],
    purchaseOrders: [],
    salesOrders: [],
    itemAdjustments: [],
  };
});

beforeEach(async () => {
  await import('../public/classic/core/cost-ledger.js');
  // Each test mutates DB then must see fresh numbers.
  window.CostLedger.invalidate();
});

declare global {
  interface Window {
    CostLedger: any;
    DB: any;
  }
}

function item(over: any) {
  return {
    id: 1,
    name: 'Item',
    category: 'X',
    unit: 'pcs',
    stock: 0,
    min: 0,
    cost: 0,
    sell: 0,
    ...over,
  };
}

describe('CostLedger — opening layer', () => {
  it('values an item with stock but no movement history at item.cost', () => {
    window.DB.inventoryItems = [item({ id: 1, stock: 10, cost: 5000 })];
    window.CostLedger.invalidate();
    expect(window.CostLedger.costOf(1)).toBe(5000);
    expect(window.CostLedger.stateOf(1)).toEqual({ qty: 10, value: 50000, avg: 5000 });
  });

  it('falls back to item.cost for an item not in the ledger', () => {
    window.DB.inventoryItems = [item({ id: 1, stock: 0, cost: 7000 })];
    window.CostLedger.invalidate();
    expect(window.CostLedger.costOf(1)).toBe(7000);
  });
});

describe('CostLedger — moving average across receipts', () => {
  it('blends opening stock with a later purchase at a different price', () => {
    // Opening 10 @ 1000 = 10000; receive 10 @ 2000 = 20000 → 20 @ 1500.
    window.DB.inventoryItems = [item({ id: 1, stock: 20, cost: 1000 })];
    window.DB.purchaseOrders = [
      {
        id: 'PO-1',
        status: 'Received',
        date: '2026-05-10',
        lines: [{ itemId: 1, qty: 10, price: 2000, subtotal: 20000 }],
      },
    ];
    window.CostLedger.invalidate();
    // netRecorded = +10, so opening = 20 - 10 = 10 @ 1000.
    expect(window.CostLedger.costOf(1)).toBe(1500);
    expect(window.CostLedger.stateOf(1).qty).toBe(20);
    expect(window.CostLedger.stateOf(1).value).toBe(30000);
  });

  it('uses net unit cost (after line discount) for receipts', () => {
    // Receive 10 with subtotal 18000 (price 2000 − 2000 line discount) → 1800/unit.
    window.DB.inventoryItems = [item({ id: 1, stock: 10, cost: 0 })];
    window.DB.purchaseOrders = [
      {
        id: 'PO-1',
        status: 'Received',
        date: '2026-05-10',
        lines: [{ itemId: 1, qty: 10, price: 2000, lineDiscount: 2000, subtotal: 18000 }],
      },
    ];
    window.CostLedger.invalidate();
    // opening = 10 - 10 = 0, so cost is purely the receipt: 18000/10 = 1800.
    expect(window.CostLedger.costOf(1)).toBe(1800);
  });
});

describe('CostLedger — COGS on SO delivery', () => {
  it('captures COGS at the moving average in effect at delivery', () => {
    // Opening 10 @ 1000, receive 10 @ 2000 → avg 1500. Deliver 5 → COGS 7500.
    window.DB.inventoryItems = [item({ id: 1, stock: 15, cost: 1000 })];
    window.DB.purchaseOrders = [
      {
        id: 'PO-1',
        status: 'Received',
        date: '2026-05-10',
        lines: [{ itemId: 1, qty: 10, price: 2000, subtotal: 20000 }],
      },
    ];
    window.DB.salesOrders = [
      {
        id: 'SO-1',
        status: 'Delivered',
        date: '2026-05-20',
        lines: [{ itemId: 1, qty: 5, price: 3000, subtotal: 15000 }],
      },
    ];
    window.CostLedger.invalidate();
    // netRecorded = +10 (PO) −5 (SO) = +5; opening = 15 − 5 = 10 @ 1000.
    // After PO: 20 @ 1500. Deliver 5 @ 1500 = 7500.
    expect(window.CostLedger.cogsForSO('SO-1')).toBe(7500);
    expect(window.CostLedger.stateOf(1).qty).toBe(15);
  });

  it('returns null COGS for an SO that is not delivered / has no movement', () => {
    window.DB.inventoryItems = [item({ id: 1, stock: 10, cost: 1000 })];
    window.DB.salesOrders = [
      {
        id: 'SO-1',
        status: 'Confirmed',
        date: '2026-05-20',
        lines: [{ itemId: 1, qty: 5, price: 3000, subtotal: 15000 }],
      },
    ];
    window.CostLedger.invalidate();
    expect(window.CostLedger.cogsForSO('SO-1')).toBeNull();
  });

  it('ignores custom (non-inventory) lines', () => {
    window.DB.inventoryItems = [item({ id: 1, stock: 10, cost: 1000 })];
    window.DB.salesOrders = [
      {
        id: 'SO-1',
        status: 'Delivered',
        date: '2026-05-20',
        lines: [
          { itemId: 1, qty: 2, price: 3000, subtotal: 6000 },
          { itemId: 'custom', itemName: 'Jasa', qty: 1, price: 5000, subtotal: 5000 },
        ],
      },
    ];
    window.CostLedger.invalidate();
    // Only the inventory line contributes: 2 @ 1000 = 2000.
    expect(window.CostLedger.cogsForSO('SO-1')).toBe(2000);
  });
});

describe('CostLedger — item adjustments', () => {
  it('an OUT adjustment removes value at the moving average', () => {
    window.DB.inventoryItems = [item({ id: 1, stock: 8, cost: 1000 })];
    window.DB.itemAdjustments = [
      { id: 'ADJ-1', date: '2026-05-15', lines: [{ itemId: 1, type: 'out', qty: 2 }] },
    ];
    window.CostLedger.invalidate();
    // netRecorded = −2; opening = 8 − (−2) = 10 @ 1000. Out 2 @ 1000 = −2000.
    expect(window.CostLedger.valueForAdjustment('ADJ-1')).toBe(-2000);
    expect(window.CostLedger.stateOf(1).qty).toBe(8);
    expect(window.CostLedger.costOf(1)).toBe(1000);
  });

  it('an IN adjustment adds value at its unit cost', () => {
    window.DB.inventoryItems = [item({ id: 1, stock: 12, cost: 1000 })];
    window.DB.itemAdjustments = [
      {
        id: 'ADJ-1',
        date: '2026-05-15',
        lines: [{ itemId: 1, type: 'in', qty: 2, unitCost: 1500 }],
      },
    ];
    window.CostLedger.invalidate();
    // netRecorded = +2; opening = 12 − 2 = 10 @ 1000 = 10000; +2 @ 1500 = 3000.
    expect(window.CostLedger.valueForAdjustment('ADJ-1')).toBe(3000);
    expect(window.CostLedger.stateOf(1).qty).toBe(12);
    expect(window.CostLedger.stateOf(1).value).toBe(13000);
  });
});

describe('CostLedger — caching', () => {
  it('invalidate() forces a recompute after a DB change', () => {
    window.DB.inventoryItems = [item({ id: 1, stock: 10, cost: 1000 })];
    window.CostLedger.invalidate();
    expect(window.CostLedger.costOf(1)).toBe(1000);
    window.DB.inventoryItems = [item({ id: 1, stock: 10, cost: 2000 })];
    window.CostLedger.invalidate();
    expect(window.CostLedger.costOf(1)).toBe(2000);
  });
});
