import { describe, it, expect, beforeEach, beforeAll } from 'vitest';

// gl.js is a classic <script> (IIFE) that attaches window.GL. Import for side
// effects under happy-dom. It depends on window.DB at call time, which each test
// sets up fresh.
beforeAll(async () => {
  await import('../src/classic/core/doc-registry.js');
  await import('../public/classic/core/doc-engine.js');
  // cost-ledger must load before gl so window.CostLedger exists for the
  // moving-average COGS + adjustment-value regression tests.
  await import('../public/classic/core/cost-ledger.js');
  await import('../public/classic/core/gl.js');
});

declare global {
  interface Window {
    GL: any;
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
    paymentLogs: [],
    journals: [],
    accountsChart: [],
    numberSequences: {},
    ...over,
  };
}

describe('GL.ensureChart', () => {
  beforeEach(() => seedDB());
  it('seeds the default Accurate-style chart when empty', () => {
    window.GL.ensureChart();
    const chart = window.DB.accountsChart;
    expect(chart.length).toBeGreaterThan(10);
    const sales = chart.find((a: any) => a.no === '400001');
    expect(sales).toMatchObject({ name: 'Penjualan', type: 'REVENUE', currency: 'IDR' });
  });
});

describe('GL.resolveAccount (3-layer)', () => {
  beforeEach(() => seedDB());
  it('falls back to the company default', () => {
    expect(window.GL.resolveAccount('sales')).toBe('400001');
    expect(window.GL.resolveAccount('inventory')).toBe('110401');
  });
  it('prefers a per-item accountMap, then a per-party override', () => {
    expect(window.GL.resolveAccount('sales', { item: { accountMap: { sales: '400099' } } })).toBe(
      '400099'
    );
    expect(window.GL.resolveAccount('sales', { party: { glOverrides: { sales: '400088' } } })).toBe(
      '400088'
    );
  });
});

describe('SO posting', () => {
  beforeEach(() => seedDB());

  it('posts revenue + COGS when Delivered (and balances)', () => {
    const so = {
      id: 'SO-2026-001',
      customerId: 1,
      date: '2026-05-30',
      status: 'Delivered',
      amount: 1000000,
      lines: [{ itemId: 100, qty: 10, price: 100000, lineDiscount: 0, subtotal: 1000000 }],
    };
    const [j] = window.GL.buildSOJournals(so);
    expect(j.totals.debit).toBe(j.totals.credit);
    // AR 1,000,000 + COGS 600,000 debit; Sales 1,000,000 + Inventory 600,000 credit
    expect(j.totals.debit).toBe(1600000);
    const ar = j.lines.find((l: any) => l.accountNo === '110201');
    const sales = j.lines.find((l: any) => l.accountNo === '400001');
    const cogs = j.lines.find((l: any) => l.accountNo === '510101');
    const inv = j.lines.find((l: any) => l.accountNo === '110401');
    expect(ar.debit).toBe(1000000);
    expect(sales.credit).toBe(1000000);
    expect(cogs.debit).toBe(600000);
    expect(inv.credit).toBe(600000);
  });

  it('splits a line discount into the Sales Discount account, still balanced', () => {
    const so = {
      id: 'SO-2026-002',
      customerId: 1,
      date: '2026-05-30',
      status: 'Delivered',
      amount: 850000,
      lines: [{ itemId: 100, qty: 10, price: 100000, lineDiscount: 150000, subtotal: 850000 }],
    };
    const [j] = window.GL.buildSOJournals(so);
    const ar = j.lines.find((l: any) => l.accountNo === '110201');
    const disc = j.lines.find((l: any) => l.accountNo === '400004');
    const sales = j.lines.find((l: any) => l.accountNo === '400001');
    expect(ar.debit).toBe(850000); // net to receivable
    expect(disc.debit).toBe(150000); // discount
    expect(sales.credit).toBe(1000000); // gross sales
    expect(j.totals.debit).toBe(j.totals.credit);
  });

  it('does not post revenue before Delivered', () => {
    const so = {
      id: 'SO-2026-003',
      customerId: 1,
      date: '2026-05-30',
      status: 'Confirmed',
      amount: 1000000,
      lines: [{ itemId: 100, qty: 10, price: 100000, subtotal: 1000000 }],
    };
    expect(window.GL.buildSOJournals(so)).toEqual([]);
  });

  it('posts a cash receipt per payment log (Dr cash / Cr receivable)', () => {
    seedDB({
      paymentLogs: [
        {
          id: 1,
          type: 'SO',
          orderId: 'SO-2026-004',
          date: '2026-05-30',
          amount: 400000,
          method: 'Transfer BCA',
        },
      ],
    });
    const so = {
      id: 'SO-2026-004',
      customerId: 1,
      date: '2026-05-30',
      status: 'Delivered',
      amount: 1000000,
      lines: [{ itemId: 100, qty: 10, price: 100000, subtotal: 1000000 }],
    };
    const journals = window.GL.buildSOJournals(so);
    expect(journals).toHaveLength(2); // revenue + 1 payment
    const pay = journals.find((j: any) => j.id.includes(':pay:'));
    const bca = pay.lines.find((l: any) => l.accountNo === '110102');
    const ar = pay.lines.find((l: any) => l.accountNo === '110201');
    expect(bca.debit).toBe(400000);
    expect(ar.credit).toBe(400000);
  });
});

describe('PO posting', () => {
  beforeEach(() => seedDB());

  it('posts inventory + payable when Received (and balances)', () => {
    const po = {
      id: 'PO-2026-001',
      supplierId: 5,
      date: '2026-05-30',
      status: 'Received',
      amount: 600000,
      lines: [{ itemId: 100, qty: 10, price: 60000, subtotal: 600000 }],
    };
    const [j] = window.GL.buildPOJournals(po);
    const inv = j.lines.find((l: any) => l.accountNo === '110401');
    const ap = j.lines.find((l: any) => l.accountNo === '210101');
    expect(inv.debit).toBe(600000);
    expect(ap.credit).toBe(600000);
    expect(j.totals.debit).toBe(j.totals.credit);
  });

  it('routes custom (non-inventory) lines to the expense account', () => {
    const po = {
      id: 'PO-2026-002',
      supplierId: 5,
      date: '2026-05-30',
      status: 'Received',
      amount: 200000,
      lines: [
        { itemId: 'custom', itemName: 'Ongkos kirim', qty: 1, price: 200000, subtotal: 200000 },
      ],
    };
    const [j] = window.GL.buildPOJournals(po);
    const exp = j.lines.find((l: any) => l.accountNo === '610101');
    const ap = j.lines.find((l: any) => l.accountNo === '210101');
    expect(exp.debit).toBe(200000);
    expect(ap.credit).toBe(200000);
  });
});

describe('GL.reconcileAll', () => {
  it('rebuilds auto-journals idempotently and preserves manual ones', () => {
    seedDB({
      salesOrders: [
        {
          id: 'SO-2026-010',
          customerId: 1,
          date: '2026-05-30',
          status: 'Delivered',
          amount: 1000000,
          lines: [{ itemId: 100, qty: 10, price: 100000, subtotal: 1000000 }],
        },
      ],
      journals: [
        {
          id: 'J:JV:manual1',
          number: 'JV.2026.05.00001',
          source: 'manual',
          lines: [],
          totals: { debit: 0, credit: 0 },
        },
      ],
    });
    const n1 = window.GL.reconcileAll();
    const count1 = window.DB.journals.length;
    const n2 = window.GL.reconcileAll();
    const count2 = window.DB.journals.length;
    expect(n1).toBe(n2); // idempotent
    expect(count1).toBe(count2);
    // manual journal survived
    expect(window.DB.journals.some((j: any) => j.id === 'J:JV:manual1')).toBe(true);
  });
});

describe('GL.trialBalance', () => {
  beforeEach(() => {
    seedDB({
      salesOrders: [
        {
          id: 'SO-2026-020',
          customerId: 1,
          date: '2026-05-30',
          status: 'Delivered',
          amount: 1000000,
          lines: [{ itemId: 100, qty: 10, price: 100000, subtotal: 1000000 }],
        },
      ],
      paymentLogs: [
        {
          id: 1,
          type: 'SO',
          orderId: 'SO-2026-020',
          date: '2026-05-30',
          amount: 1000000,
          method: 'Tunai',
        },
      ],
    });
    window.GL.reconcileAll();
  });

  it('balances (total debit === total credit)', () => {
    const tb = window.GL.trialBalance();
    expect(tb.balanced).toBe(true);
    expect(tb.totalDebit).toBe(tb.totalCredit);
  });

  it('nets receivable to zero once fully paid', () => {
    const tb = window.GL.trialBalance();
    const ar = tb.rows.find((r: any) => r.no === '110201');
    // AR debited 1,000,000 at delivery, credited 1,000,000 by payment → not shown
    expect(ar).toBeUndefined();
    const cash = tb.rows.find((r: any) => r.no === '110101');
    expect(cash.debit).toBe(1000000);
  });
});

describe('GL.postJournalVoucher', () => {
  beforeEach(() => seedDB());

  it('accepts a balanced manual entry', () => {
    const j = window.GL.postJournalVoucher(
      '2026-05-30',
      [
        { accountNo: '110101', debit: 500000 },
        { accountNo: '310101', credit: 500000 },
      ],
      'Setoran modal'
    );
    expect(j.totals.debit).toBe(500000);
    expect(j.source).toBe('manual');
    expect(window.DB.journals).toContain(j);
  });

  it('rejects an unbalanced manual entry', () => {
    expect(() =>
      window.GL.postJournalVoucher('2026-05-30', [
        { accountNo: '110101', debit: 500000 },
        { accountNo: '310101', credit: 400000 },
      ])
    ).toThrow(/tidak seimbang/);
  });

  it('survives a reconcile (manual JV preserved)', () => {
    window.GL.postJournalVoucher('2026-05-30', [
      { accountNo: '110101', debit: 1000 },
      { accountNo: '310101', credit: 1000 },
    ]);
    window.GL.reconcileAll();
    expect(window.DB.journals.some((j: any) => j.source === 'manual')).toBe(true);
  });
});
