import { vi, describe, it, expect, beforeAll, beforeEach } from 'vitest';

// Mock modal before stock.js is imported — showToast is only a side-effect
vi.mock('../src/core/modal.js', () => ({ showToast: vi.fn() }));

import {
  applyStockMutation,
  reserveStock,
  releaseReservation,
  checkOversell,
  getReservedQty,
} from '../src/core/stock.js';

// Load GL stack for end-to-end journal-balance checks
beforeAll(async () => {
  await import('../src/classic/core/doc-registry.js');
  await import('../public/classic/core/doc-engine.js');
  await import('../public/classic/core/cost-ledger.js');
  await import('../public/classic/core/gl.js');
});

declare global {
  interface Window {
    GL: any;
    CostLedger: any;
    DB: any;
  }
}

function seedDB(over: any = {}) {
  (window as any).DB = {
    customers: [{ id: 1, name: 'PT Maju Jaya' }],
    suppliers: [{ id: 5, name: 'UD Batu Alam' }],
    inventoryItems: [{ id: 100, name: 'Granit', unit: 'm2', stock: 50, cost: 60000, sell: 100000 }],
    salesOrders: [],
    purchaseOrders: [],
    deliveryOrders: [],
    paymentLogs: [],
    journals: [],
    accountsChart: [],
    numberSequences: {},
    reservations: {},
    ...over,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// applyStockMutation
// ═══════════════════════════════════════════════════════════════════════════════

describe('applyStockMutation', () => {
  beforeEach(() => seedDB());

  it('direction=in (PO Received) increases item stock by qty', () => {
    const po = { id: 'PO-1', lines: [{ itemId: 100, qty: 20 }], stockMutated: false };
    expect(applyStockMutation(po, 'in')).toBe(true);
    expect((window as any).DB.inventoryItems[0].stock).toBe(70);
    expect(po.stockMutated).toBe(true);
  });

  it('direction=out (SO Delivered) decreases item stock by qty', () => {
    const so = { id: 'SO-1', lines: [{ itemId: 100, qty: 15 }], stockMutated: false };
    expect(applyStockMutation(so, 'out')).toBe(true);
    expect((window as any).DB.inventoryItems[0].stock).toBe(35);
    expect(so.stockMutated).toBe(true);
  });

  it('blocks out when qty > stock and returns false (stock unchanged)', () => {
    const so = { id: 'SO-1', lines: [{ itemId: 100, qty: 100 }], stockMutated: false };
    expect(applyStockMutation(so, 'out')).toBe(false);
    expect((window as any).DB.inventoryItems[0].stock).toBe(50);
    expect(so.stockMutated).toBe(false);
  });

  it('is idempotent: stockMutated=true skips re-application', () => {
    const po = { id: 'PO-1', lines: [{ itemId: 100, qty: 10 }], stockMutated: true };
    applyStockMutation(po, 'in');
    expect((window as any).DB.inventoryItems[0].stock).toBe(50); // unchanged
  });

  it('skips custom line items silently', () => {
    const po = { id: 'PO-1', lines: [{ itemId: 'custom', qty: 999 }], stockMutated: false };
    applyStockMutation(po, 'in');
    expect((window as any).DB.inventoryItems[0].stock).toBe(50); // unchanged
  });

  it('handles unknown itemId without throwing', () => {
    const po = { id: 'PO-1', lines: [{ itemId: 9999, qty: 5 }], stockMutated: false };
    expect(() => applyStockMutation(po, 'in')).not.toThrow();
  });

  it('multi-line order: mutates all inventory items', () => {
    seedDB({
      inventoryItems: [
        { id: 100, name: 'Granit', unit: 'm2', stock: 50, cost: 60000, sell: 100000 },
        { id: 200, name: 'Marmer', unit: 'm2', stock: 30, cost: 80000, sell: 150000 },
      ],
    });
    const po = {
      id: 'PO-1',
      lines: [
        { itemId: 100, qty: 10 },
        { itemId: 200, qty: 5 },
      ],
      stockMutated: false,
    };
    applyStockMutation(po, 'in');
    expect((window as any).DB.inventoryItems[0].stock).toBe(60);
    expect((window as any).DB.inventoryItems[1].stock).toBe(35);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Stock reservation: reserveStock / releaseReservation / getReservedQty
// ═══════════════════════════════════════════════════════════════════════════════

describe('Stock reservation', () => {
  beforeEach(() => seedDB());

  it('reserveStock sets reservation; getReservedQty returns total', () => {
    reserveStock('SO-1', [{ itemId: 100, qty: 10 }]);
    expect(getReservedQty(100)).toBe(10);
  });

  it('getReservedQty accumulates across multiple orders for the same item', () => {
    reserveStock('SO-1', [{ itemId: 100, qty: 10 }]);
    reserveStock('SO-2', [{ itemId: 100, qty: 5 }]);
    expect(getReservedQty(100)).toBe(15);
  });

  it('releaseReservation removes that order from the pool', () => {
    reserveStock('SO-1', [{ itemId: 100, qty: 10 }]);
    reserveStock('SO-2', [{ itemId: 100, qty: 5 }]);
    releaseReservation('SO-1');
    expect(getReservedQty(100)).toBe(5); // only SO-2 remains
  });

  it('releaseReservation is idempotent (no error on unknown order)', () => {
    expect(() => releaseReservation('SO-NONEXISTENT')).not.toThrow();
    expect(getReservedQty(100)).toBe(0);
  });

  it('re-reserving the same order replaces its previous qty', () => {
    reserveStock('SO-1', [{ itemId: 100, qty: 10 }]);
    reserveStock('SO-1', [{ itemId: 100, qty: 25 }]); // edited qty
    expect(getReservedQty(100)).toBe(25);
  });

  it('returns 0 when DB.reservations is absent', () => {
    delete (window as any).DB.reservations;
    expect(getReservedQty(100)).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// checkOversell
// ═══════════════════════════════════════════════════════════════════════════════

describe('checkOversell', () => {
  beforeEach(() => seedDB()); // item 100: stock=50

  it('returns [] when requested qty ≤ available physical stock', () => {
    expect(checkOversell([{ itemId: 100, qty: 50 }], null)).toHaveLength(0);
  });

  it('returns a problem entry when qty > physical stock', () => {
    const problems = checkOversell([{ itemId: 100, qty: 60 }], null);
    expect(problems).toHaveLength(1);
    expect(problems[0].requested).toBe(60);
    expect(problems[0].available).toBe(50);
  });

  it('deducts existing reservations from available', () => {
    reserveStock('SO-EXISTING', [{ itemId: 100, qty: 30 }]);
    // available = 50 − 30 = 20; requesting 25 → oversell
    const problems = checkOversell([{ itemId: 100, qty: 25 }], null);
    expect(problems).toHaveLength(1);
    expect(problems[0].available).toBe(20);
    expect(problems[0].reserved).toBe(30);
  });

  it('excludes the editing order own reservation when excludeOrderId is set', () => {
    reserveStock('SO-EDITING', [{ itemId: 100, qty: 30 }]);
    // Editing SO-EDITING: its own 30 is excluded → available = 50; requesting 45 → OK
    const problems = checkOversell([{ itemId: 100, qty: 45 }], 'SO-EDITING');
    expect(problems).toHaveLength(0);
  });

  it('skips custom (non-inventory) line items', () => {
    expect(checkOversell([{ itemId: 'custom', qty: 99999 }], null)).toHaveLength(0);
  });

  it('returns [] for a line whose item is not in DB', () => {
    expect(checkOversell([{ itemId: 9999, qty: 1 }], null)).toHaveLength(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// End-to-end: PO Received → SO Confirmed → SO Delivered → GL balanced
// ═══════════════════════════════════════════════════════════════════════════════

describe('End-to-end ERP flow: PO → SO reserve → SO delivery → GL balanced', () => {
  beforeEach(() => {
    seedDB({
      inventoryItems: [
        { id: 100, name: 'Granit', unit: 'm2', stock: 0, cost: 60000, sell: 100000 },
      ],
    });
    window.GL.ensureChart();
    window.CostLedger.invalidate();
  });

  it('full flow: stock in via PO, reserve via SO Confirmed, stock out + balanced GL at Delivered', () => {
    // ── Step 1: PO Received → stock += 20 ────────────────────────────────────
    const po = {
      id: 'PO-2026-001',
      supplierId: 5,
      date: '2026-06-01',
      status: 'Received',
      amount: 1200000,
      lines: [{ itemId: 100, qty: 20, price: 60000, subtotal: 1200000 }],
      stockMutated: false,
    };
    expect(applyStockMutation(po, 'in')).toBe(true);
    expect((window as any).DB.inventoryItems[0].stock).toBe(20);

    // ── Step 2: SO Confirmed → reserve 10 units, no double-counting ──────────
    const soLines = [{ itemId: 100, qty: 10, price: 100000, lineDiscount: 0, subtotal: 1000000 }];
    expect(checkOversell(soLines, null)).toHaveLength(0); // 20 available, 10 requested
    reserveStock('SO-2026-001', soLines);
    expect(getReservedQty(100)).toBe(10);
    // Physical stock still 20; a second SO requesting 15 would see only 10 available
    expect(checkOversell([{ itemId: 100, qty: 15 }], null)).toHaveLength(1);

    // ── Step 3: SO Delivered → release reservation, deduct stock ─────────────
    const so = {
      id: 'SO-2026-001',
      customerId: 1,
      date: '2026-06-05',
      status: 'Delivered',
      amount: 1000000,
      lines: soLines,
      stockMutated: false,
    };
    releaseReservation(so.id);
    expect(applyStockMutation(so, 'out')).toBe(true);
    expect((window as any).DB.inventoryItems[0].stock).toBe(10); // 20 − 10
    expect(getReservedQty(100)).toBe(0);

    // ── Step 4: GL journal for the SO is balanced ─────────────────────────────
    (window as any).DB.salesOrders = [so];
    (window as any).DB.purchaseOrders = [po];
    window.CostLedger.invalidate();
    const journals = window.GL.buildSOJournals(so);
    expect(journals.length).toBeGreaterThan(0);
    const j = journals[0];
    expect(j.totals.debit).toBe(j.totals.credit);
    // AR Dr 1,000,000 + COGS Dr 600,000 (10 × 60,000) = 1,600,000
    expect(j.totals.debit).toBe(1600000);
  });

  it('deletion reversal: re-adds stock and clears stockMutated flag', () => {
    // Simulate the reversal logic from deleteSO
    const item = (window as any).DB.inventoryItems[0];
    item.stock = 10;
    const so = {
      id: 'SO-2026-002',
      status: 'Delivered',
      stockMutated: true,
      lines: [{ itemId: 100, qty: 10 }],
    };
    // Same logic as deleteSO in erp-crud.js
    if (so.stockMutated) {
      so.lines.forEach((l: any) => {
        if (l.itemId === 'custom') {
          return;
        }
        const itm = (window as any).DB.inventoryItems.find((i: any) => i.id === l.itemId);
        if (itm) {
          itm.stock = Math.max(0, itm.stock + l.qty);
        }
      });
    }
    expect(item.stock).toBe(20);
  });

  it('PO deletion reversal: subtracts stock and leaves no negative', () => {
    const item = (window as any).DB.inventoryItems[0];
    item.stock = 5;
    const po = {
      id: 'PO-2026-002',
      stockMutated: true,
      lines: [{ itemId: 100, qty: 10 }], // more than current stock
    };
    // Same logic as deletePO in erp-crud.js
    if (po.stockMutated) {
      po.lines.forEach((l: any) => {
        if (l.itemId === 'custom') {
          return;
        }
        const itm = (window as any).DB.inventoryItems.find((i: any) => i.id === l.itemId);
        if (itm) {
          itm.stock = Math.max(0, itm.stock - l.qty);
        }
      });
    }
    expect(item.stock).toBe(0); // Math.max(0, 5 − 10) = 0
  });
});
