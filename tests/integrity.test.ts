// ═══════════════════════════════════════════════════════════════════════════════
// integrity.js — audit trail, period lock, ledger check
//
// Loads the real classic script (indirect eval, like the bundle) against a
// stubbed saveDB and asserts the three behaviours: mutations are diffed into
// DB.auditLog, locked-period mutations are rolled back and the save skipped,
// and verifyLedger flags unbalanced journals.
// ═══════════════════════════════════════════════════════════════════════════════
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const INTEGRITY_SRC = readFileSync(
  resolve(__dirname, '../public/classic/core/integrity.js'),
  'utf-8'
);

declare global {
  interface Window {
    DB: any;
    Integrity: any;
    saveDB: () => void;
  }
}

function freshDB() {
  return {
    salesOrders: [] as any[],
    purchaseOrders: [],
    deliveryOrders: [],
    salesInvoices: [],
    purchaseInvoices: [],
    salesReceipts: [],
    purchasePayments: [],
    salesQuotations: [],
    purchaseQuotations: [],
    salesReturns: [],
    purchaseReturns: [],
    itemTransfers: [],
    itemAdjustments: [],
    inventoryItems: [],
    customers: [],
    suppliers: [],
    employees: [],
    warehouses: [],
    budgets: [],
    budgetTransfers: [],
    payrollRuns: [],
    salesDownPayments: [],
    purchaseDownPayments: [],
    goodsReceipts: [],
    journals: [] as any[],
    auditLog: [] as any[],
    settings: {} as any,
  };
}

let persistedCount = 0;

function boot(db = freshDB()) {
  (window as any).DB = db;
  persistedCount = 0;
  (window as any).saveDB = () => {
    persistedCount++;
  };
  (window as any).showToast = vi.fn();
  (window as any).erpAuth = { getCurrentUser: () => ({ email: 'tester@nsa.local' }) };
  // Re-evaluate the IIFE: installs a fresh wrap around the stub saveDB and
  // re-baselines the snapshot from the current DB.
  // eslint-disable-next-line no-eval -- intentionally executing the real classic script in global scope
  (0, eval)(INTEGRITY_SRC);
  return db;
}

beforeEach(async () => {
  await import('../src/classic/core/doc-registry.js');
});

describe('audit trail', () => {
  it('records add / update / delete with user + timestamp', () => {
    const db = boot();

    db.salesOrders.push({ id: 'SO-1', number: 'SO.0001', date: '2026-06-01', status: 'Draft' });
    window.saveDB();
    expect(persistedCount).toBe(1);
    expect(db.auditLog).toHaveLength(1);
    expect(db.auditLog[0]).toMatchObject({
      action: 'add',
      collection: 'salesOrders',
      id: 'SO-1',
      user: 'tester@nsa.local',
    });

    db.salesOrders[0].amount = 500;
    window.saveDB();
    expect(db.auditLog[1]).toMatchObject({ action: 'update', id: 'SO-1' });

    db.salesOrders.pop();
    window.saveDB();
    expect(db.auditLog[2]).toMatchObject({ action: 'delete', id: 'SO-1' });
  });

  it('flags a status-only change as action "status" with from→to summary', () => {
    const db = boot();
    db.salesOrders.push({ id: 'SO-1', date: '2026-06-01', status: 'Draft' });
    window.saveDB();

    db.salesOrders[0].status = 'Confirmed';
    window.saveDB();
    const last = db.auditLog[db.auditLog.length - 1];
    expect(last.action).toBe('status');
    expect(last.summary).toBe('Draft → Confirmed');
  });

  it('caps the log at 2000 entries', () => {
    const db = boot();
    db.auditLog = new Array(1999).fill({ action: 'add' });
    window.Integrity.refreshSnapshot();
    db.salesOrders.push({ id: 'A', date: '2026-06-01' });
    window.saveDB();
    db.salesOrders.push({ id: 'B', date: '2026-06-01' });
    window.saveDB();
    expect(db.auditLog.length).toBe(2000);
  });
});

describe('period lock', () => {
  it('rolls back a mutation dated inside the locked period and skips the save', () => {
    const db = boot();
    db.salesOrders.push({ id: 'SO-old', date: '2026-01-15', status: 'Paid', amount: 100 });
    db.settings.periodLock = { lockedThrough: '2026-03-31' };
    window.Integrity.refreshSnapshot();

    db.salesOrders[0].amount = 999; // tamper with a locked-period record
    window.saveDB();

    expect(persistedCount).toBe(0); // save skipped
    expect(db.salesOrders[0].amount).toBe(100); // reverted
    expect((window as any).showToast).toHaveBeenCalled();
  });

  it('blocks deleting a locked-period record', () => {
    const db = boot();
    db.salesOrders.push({ id: 'SO-old', date: '2026-01-15', status: 'Paid' });
    db.settings.periodLock = { lockedThrough: '2026-03-31' };
    window.Integrity.refreshSnapshot();

    db.salesOrders.length = 0;
    window.saveDB();

    expect(persistedCount).toBe(0);
    expect(db.salesOrders).toHaveLength(1);
  });

  it('allows mutations dated after the lock', () => {
    const db = boot();
    db.settings.periodLock = { lockedThrough: '2026-03-31' };
    window.Integrity.refreshSnapshot();

    db.salesOrders.push({ id: 'SO-new', date: '2026-06-01', status: 'Draft' });
    window.saveDB();

    expect(persistedCount).toBe(1);
    expect(db.salesOrders).toHaveLength(1);
    expect(db.auditLog.some((e: any) => e.id === 'SO-new')).toBe(true);
  });

  it('reference data (customers) is audited but never locked', () => {
    const db = boot();
    db.settings.periodLock = { lockedThrough: '2026-12-31' }; // everything locked
    window.Integrity.refreshSnapshot();

    (db.customers as any[]).push({ id: 'C-1', name: 'PT Baru', date: '2026-01-01' });
    window.saveDB();

    expect(persistedCount).toBe(1); // not blocked
    expect(db.auditLog.some((e: any) => e.collection === 'customers')).toBe(true);
  });
});

describe('verifyLedger', () => {
  it('passes on balanced journals and flags unbalanced ones', () => {
    const db = boot();
    db.journals.push({
      id: 'J1',
      number: 'JV-1',
      lines: [
        { accountNo: '1100', debit: 100, credit: 0 },
        { accountNo: '4100', debit: 0, credit: 100 },
      ],
    });
    expect(window.Integrity.verifyLedger().ok).toBe(true);

    db.journals.push({
      id: 'J2',
      number: 'JV-2',
      lines: [{ accountNo: '1100', debit: 50, credit: 0 }],
    });
    const r = window.Integrity.verifyLedger();
    expect(r.ok).toBe(false);
    expect(r.unbalanced).toHaveLength(1);
    expect(r.unbalanced[0].number).toBe('JV-2');
  });
});

describe('isLocked', () => {
  it('compares ISO dates against settings.periodLock.lockedThrough', () => {
    const db = boot();
    expect(window.Integrity.isLocked('2026-01-01')).toBe(false); // no lock set
    db.settings.periodLock = { lockedThrough: '2026-03-31' };
    expect(window.Integrity.isLocked('2026-03-31')).toBe(true);
    expect(window.Integrity.isLocked('2026-04-01')).toBe(false);
    expect(window.Integrity.isLocked('')).toBe(false);
  });
});
