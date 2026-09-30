// ═══════════════════════════════════════════════════════════════════════════════
// Outstanding view — AR/AP row selection and ageing
//
// The screen answers "which orders are still unpaid and by how much", so the
// arithmetic is the whole point: an order that looks settled but isn't (or the
// reverse) is a real cash-flow error for the client. These tests pin the owing
// basis against the same rules the dashboard's Outstanding card uses.
// ═══════════════════════════════════════════════════════════════════════════════
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

declare global {
  interface Window {
    OutstandingView: any;
    DB: any;
  }
}

const ROOT = resolve(__dirname, '..');
let OV: any;

function iso(offsetDays: number) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

beforeAll(() => {
  // happy-dom already provides window/document; the module only needs its
  // globals reachable the way the classic bundle sees them.
  const src = readFileSync(resolve(ROOT, 'public/classic/core/outstanding-view.js'), 'utf8');
  // eslint-disable-next-line no-new-func
  new Function(src)();
  OV = window.OutstandingView;
});

beforeEach(() => {
  OV.setState({ showSettled: false, sortBy: 'age' });
  window.DB = {
    salesOrders: [
      {
        id: 'SO.1',
        number: 'SO.1',
        customer: 'Trias Cikande',
        amount: 100000,
        paid: 0,
        dueDate: iso(-40),
        status: 'Confirmed',
      },
      {
        id: 'SO.2',
        number: 'SO.2',
        customer: 'Trias Serang',
        amount: 50000,
        paid: 50000,
        dueDate: iso(-5),
        status: 'Confirmed',
      },
      {
        id: 'SO.3',
        number: 'SO.3',
        customer: 'Trias Cikande',
        amount: 80000,
        paid: 30000,
        dueDate: iso(7),
        status: 'Confirmed',
      },
      {
        id: 'SO.4',
        number: 'SO.4',
        customer: 'Belum jadi',
        amount: 999999,
        paid: 0,
        dueDate: iso(-90),
        status: 'Draft',
      },
    ],
    purchaseOrders: [
      {
        id: 'PO.1',
        number: 'PO.1',
        supplier: 'Batu Anugrah',
        amount: 70000,
        paid: 20000,
        dueDate: iso(-3),
        status: 'Confirmed',
      },
      {
        id: 'PO.2',
        number: 'PO.2',
        supplier: 'Batu Anugrah',
        amount: 40000,
        paid: 0,
        dueDate: '',
        status: 'Confirmed',
      },
    ],
  };
});

describe('owing basis', () => {
  it('prefers an explicit owing field over amount − paid', () => {
    expect(OV._owing({ amount: 100, paid: 10, owing: 55 })).toBe(55);
    expect(OV._owing({ amount: 100, paid: 10 })).toBe(90);
  });

  it('never reports a negative balance on an overpayment', () => {
    expect(OV._owing({ amount: 100, paid: 150 })).toBe(0);
  });
});

describe('row selection', () => {
  it('excludes drafts — they are not money owed yet', () => {
    const rows = OV._rows('salesOrders', 'customer');
    expect(rows.map((r: any) => r.id)).not.toContain('SO.4');
  });

  it('hides fully settled orders by default', () => {
    const rows = OV._rows('salesOrders', 'customer');
    expect(rows.map((r: any) => r.id)).toEqual(['SO.1', 'SO.3']);
  });

  it('shows settled orders when asked', () => {
    OV.setState({ showSettled: true });
    const rows = OV._rows('salesOrders', 'customer');
    expect(rows.map((r: any) => r.id)).toContain('SO.2');
  });

  it('carries the remaining balance per order', () => {
    const rows = OV._rows('salesOrders', 'customer');
    expect(rows.find((r: any) => r.id === 'SO.3').owing).toBe(50000);
  });

  it('reads the purchase side off the supplier field', () => {
    const rows = OV._rows('purchaseOrders', 'supplier');
    expect(rows).toHaveLength(2);
    expect(rows.every((r: any) => r.party === 'Batu Anugrah')).toBe(true);
  });
});

describe('ageing', () => {
  it('counts days past the due date', () => {
    expect(OV._ageDays({ dueDate: iso(-40) })).toBe(40);
    expect(OV._ageDays({ dueDate: iso(7) })).toBe(-7);
  });

  it('returns null when the document has no due date', () => {
    expect(OV._ageDays({})).toBeNull();
  });
});

describe('sorting', () => {
  it('puts the most overdue first by default', () => {
    const rows = OV._rows('salesOrders', 'customer');
    expect(rows[0].id).toBe('SO.1');
  });

  it('sorts by outstanding amount when asked', () => {
    OV.setState({ sortBy: 'amount' });
    const rows = OV._rows('salesOrders', 'customer');
    expect(rows.map((r: any) => r.owing)).toEqual([100000, 50000]);
  });

  it('keeps undated documents last when sorting by age', () => {
    const rows = OV._rows('purchaseOrders', 'supplier');
    expect(rows[rows.length - 1].id).toBe('PO.2');
  });
});
