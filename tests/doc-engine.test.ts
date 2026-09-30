import { describe, it, expect, beforeAll } from 'vitest';

// doc-registry.js is an ES module (src/classic/core/) — importing it sets
// window.DocRegistry as a side effect.
// doc-engine.js is still a classic IIFE (public/classic/core/) — importing it
// for side effects populates window.DocEngine.
beforeAll(async () => {
  await import('../src/classic/core/doc-registry.js'); // ES module (migrated from public/)
  await import('../public/classic/core/doc-engine.js');
});

declare global {
  interface Window {
    DocRegistry: any;
    DocEngine: any;
  }
}

describe('DocRegistry', () => {
  it('exposes all registered document types', () => {
    const types = window.DocRegistry.list().sort();
    // All phases: SO, PO, DO, SI, PI, SR, PP, SQ, PQ, SRN, PRN, IT.
    expect(types).toEqual([
      'DO',
      'IT',
      'PI',
      'PO',
      'PP',
      'PQ',
      'PRN',
      'SI',
      'SO',
      'SQ',
      'SR',
      'SRN',
    ]);
  });

  it('returns config for a known type and null for unknown', () => {
    const so = window.DocRegistry.get('SO');
    expect(so.collection).toBe('salesOrders');
    expect(so.party).toBe('customer');
    expect(so.priceField).toBe('sell');
    expect(window.DocRegistry.get('NOPE')).toBeNull();
  });

  it('mirrors the current SO status values', () => {
    expect(window.DocRegistry.statusValues('SO')).toEqual([
      'Draft',
      'Confirmed',
      'Paid',
      'Delivered',
    ]);
  });
});

describe('DocEngine.nextNumber', () => {
  it('formats as PREFIX.YYYY.MM.NNNNN and starts at 1 for an empty store', () => {
    const sequences = {};
    const n = window.DocEngine.nextNumber('SO', '2026-05-30', { sequences });
    expect(n).toBe('SO.2026.05.00001');
  });

  it('is pure unless commit:true is passed', () => {
    const sequences = {};
    window.DocEngine.nextNumber('SO', '2026-05-30', { sequences });
    // no commit → store untouched → still 00001
    expect(window.DocEngine.nextNumber('SO', '2026-05-30', { sequences })).toBe('SO.2026.05.00001');
  });

  it('advances the counter when commit:true', () => {
    const sequences = {};
    const a = window.DocEngine.nextNumber('SO', '2026-05-30', { sequences, commit: true });
    const b = window.DocEngine.nextNumber('SO', '2026-05-30', { sequences, commit: true });
    expect(a).toBe('SO.2026.05.00001');
    expect(b).toBe('SO.2026.05.00002');
    expect(sequences).toEqual({ SO: { period: '2026-05', next: 3 } });
  });

  it('resets the sequence on a new month', () => {
    const sequences = {};
    window.DocEngine.nextNumber('SO', '2026-05-30', { sequences, commit: true });
    const next = window.DocEngine.nextNumber('SO', '2026-06-01', { sequences, commit: true });
    expect(next).toBe('SO.2026.06.00001');
  });

  it('uses the per-type prefix from the registry', () => {
    const sequences = {};
    expect(window.DocEngine.nextNumber('PO', '2026-05-01', { sequences })).toBe('PO.2026.05.00001');
    expect(window.DocEngine.nextNumber('DO', '2026-05-01', { sequences })).toBe('DO.2026.05.00001');
  });
});

describe('DocEngine.computeTotals', () => {
  it('sums line subtotals when there is no discount or tax', () => {
    const lines = [
      { qty: 2, price: 100, subtotal: 200 },
      { qty: 1, price: 50, subtotal: 50 },
    ];
    expect(window.DocEngine.computeTotals(lines)).toEqual({
      subTotal: 250,
      discount: 0,
      tax: 0,
      grandTotal: 250,
    });
  });

  it('applies a header discount and tax rate (exclusive)', () => {
    const lines = [{ qty: 1, price: 1000, subtotal: 1000 }];
    expect(window.DocEngine.computeTotals(lines, { discount: 100, taxRate: 0.11 })).toEqual({
      subTotal: 1000,
      discount: 100,
      tax: 99, // round(900 * 0.11)
      grandTotal: 999,
    });
  });

  it('adds no tax on top when tax-inclusive', () => {
    const lines = [{ qty: 1, price: 1000, subtotal: 1000 }];
    const t = window.DocEngine.computeTotals(lines, { taxRate: 0.11, taxInclusive: true });
    expect(t.tax).toBe(0);
    expect(t.grandTotal).toBe(1000);
  });

  it('derives subtotal from qty/price/lineDiscount when subtotal is absent', () => {
    const lines = [{ qty: 3, price: 100, lineDiscount: 50 }];
    expect(window.DocEngine.computeTotals(lines).subTotal).toBe(250);
  });

  it('handles empty / non-array input', () => {
    expect(window.DocEngine.computeTotals([]).grandTotal).toBe(0);
    expect(window.DocEngine.computeTotals(undefined as any).grandTotal).toBe(0);
  });
});

describe('DocEngine.canTransition', () => {
  it('allows a valid forward move', () => {
    expect(window.DocEngine.canTransition('SO', 'Draft', 'Confirmed')).toBe(true);
  });

  it('treats a same-status save as allowed', () => {
    expect(window.DocEngine.canTransition('SO', 'Paid', 'Paid')).toBe(true);
  });

  it('rejects an undefined transition and unknown types', () => {
    expect(window.DocEngine.canTransition('DO', 'Pending', 'Paid')).toBe(false);
    expect(window.DocEngine.canTransition('NOPE', 'Draft', 'Confirmed')).toBe(false);
  });
});

describe('DocEngine.statusLabel & getFromSources', () => {
  it('maps a status value to its Indonesian label', () => {
    expect(window.DocEngine.statusLabel('SO', 'Delivered')).toBe('Terkirim');
    expect(window.DocEngine.statusLabel('PO', 'Received')).toBe('Diterima');
  });

  it('falls back to the raw value for unknown status', () => {
    expect(window.DocEngine.statusLabel('SO', 'Mystery')).toBe('Mystery');
  });

  it('reports Get-From sources', () => {
    // DO can be created from either a Sales Order or a Purchase Order.
    expect(window.DocEngine.getFromSources('DO')).toEqual(['SO', 'PO']);
    // SO now has getFrom: ['SQ'] (Sales Quotation → Sales Order).
    expect(window.DocEngine.getFromSources('SO')).toEqual(['SQ']);
  });
});

describe('DocEngine.resolvePartyId (Phase 1)', () => {
  beforeAll(() => {
    (window as any).DB = {
      customers: [
        { id: 1, name: 'PT Maju Jaya' },
        { id: 2, name: 'CV Sukses' },
      ],
      suppliers: [{ id: 5, name: 'UD Batu Alam' }],
    };
  });

  it('resolves a customer id for SO and DO via the customers collection', () => {
    expect(window.DocEngine.resolvePartyId('SO', 'PT Maju Jaya')).toBe(1);
    expect(window.DocEngine.resolvePartyId('DO', 'CV Sukses')).toBe(2);
  });

  it('resolves a supplier id for PO via the suppliers collection', () => {
    expect(window.DocEngine.resolvePartyId('PO', 'UD Batu Alam')).toBe(5);
  });

  it('returns null for an unknown party name (free-text shim case)', () => {
    expect(window.DocEngine.resolvePartyId('SO', 'Someone New')).toBeNull();
  });

  it('returns null for empty name or unknown docType', () => {
    expect(window.DocEngine.resolvePartyId('SO', '')).toBeNull();
    expect(window.DocEngine.resolvePartyId('NOPE', 'PT Maju Jaya')).toBeNull();
  });
});
