// ═══════════════════════════════════════════════════════════════════════════════
// REKAP exporter — round-trip test
//
// The export exists so the client keeps working in the shape they already use,
// and so an exported file can be fed straight back in. That makes a round trip
// the honest test: build a workbook from delivery orders, re-read it with the
// REAL importer, and require the loads to come back identical.
//
// It also pins the two things most likely to drift apart between the two
// modules — the kg/tonne convention and the "13-Dec-25" date format.
// ═══════════════════════════════════════════════════════════════════════════════
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import * as XLSX from '@e965/xlsx';

const ROOT = resolve(__dirname, '..');

let RekapExport: any;
let RekapImport: any;
let NSAXlsx: any;

function load(file: string) {
  const src = readFileSync(resolve(ROOT, file), 'utf8');
  // eslint-disable-next-line no-new-func
  new Function(src)();
}

// Three loads on two dates, one material — enough to exercise a per-date
// subtotal, the grand total, and the numeric conversions.
const LOADS = [
  {
    id: 'DO.1',
    date: '2025-12-13',
    site: 'TRIAS CIKANDE',
    vehicle: 'BG8906OH',
    driver: 'IRIYANTO',
    weighNo: '37308',
    externalDoNo: '37157',
    suratJalanNo: '001',
    supplierPoNo: '133',
    grossWeight: 43.22,
    tareWeight: 12.67,
    lines: [{ itemId: 1, itemName: 'Splite 1-2', qty: 30.55, unit: 'Ton' }],
  },
  {
    id: 'DO.2',
    date: '2025-12-13',
    site: 'TRIAS CIKANDE',
    vehicle: 'A9129ZY',
    driver: 'EBI',
    weighNo: '37309',
    externalDoNo: '37158',
    suratJalanNo: '002',
    supplierPoNo: '133',
    grossWeight: 43.82,
    tareWeight: 12.15,
    lines: [{ itemId: 1, itemName: 'Splite 1-2', qty: 31.67, unit: 'Ton' }],
  },
  {
    id: 'DO.3',
    date: '2025-12-15',
    site: 'TRIAS CIKANDE',
    vehicle: 'BG8906OH',
    driver: 'IRIYANTO',
    weighNo: '37316',
    externalDoNo: '37154',
    suratJalanNo: '005',
    supplierPoNo: '133',
    grossWeight: 43.99,
    tareWeight: 12.74,
    lines: [{ itemId: 1, itemName: 'Splite 1-2', qty: 31.25, unit: 'Ton' }],
  },
];

beforeAll(() => {
  (globalThis as any).window = globalThis;
  (globalThis as any).window.DB = {
    deliveryOrders: LOADS,
    settings: {},
    suppliers: [],
    purchaseOrders: [],
  };
  load('public/classic/core/xlsx-export.js');
  load('public/classic/core/rekap-import.js');
  load('public/classic/core/rekap-export.js');
  RekapExport = (globalThis as any).window.RekapExport;
  RekapImport = (globalThis as any).window.RekapImport;
  NSAXlsx = (globalThis as any).window.NSAXlsx;
});

describe('column addressing', () => {
  it('maps indices onto spreadsheet letters', () => {
    expect(RekapExport.colLetter(0)).toBe('A');
    expect(RekapExport.colLetter(12)).toBe('M');
    expect(RekapExport.colLetter(25)).toBe('Z');
    expect(RekapExport.colLetter(26)).toBe('AA');
  });
});

describe('date formatting', () => {
  it('writes the client\'s "13-Dec-25" form', () => {
    expect(RekapExport.fmtDate('2025-12-13')).toBe('13-Dec-25');
    expect(RekapExport.fmtDate('2026-01-07')).toBe('7-Jan-26');
  });

  it("is the exact inverse of the importer's date parser", () => {
    ['2025-12-13', '2026-01-07', '2026-07-25', '2026-03-05'].forEach(iso => {
      expect(RekapImport._date(RekapExport.fmtDate(iso))).toBe(iso);
    });
  });
});

describe('sheet layout', () => {
  it('emits the two-row header the importer looks for', () => {
    const sheet = RekapExport._rekapSheet(
      'Splite 1-2',
      RekapExport._byMaterial(LOADS).get('Splite 1-2')
    );
    const at = (c: string) => sheet.cells.find((x: any) => x.c === c)?.v;
    expect(at('F1')).toBe('SUPIR');
    expect(at('G1')).toBe('Tanggal');
    expect(at('B2')).toBe('GJIB');
    expect(at('D2')).toBe('Surat Jalan');
    expect(at('M2')).toBe('PO');
  });

  it('writes weights in kilograms', () => {
    const sheet = RekapExport._rekapSheet(
      'Splite 1-2',
      RekapExport._byMaterial(LOADS).get('Splite 1-2')
    );
    const at = (c: string) => sheet.cells.find((x: any) => x.c === c)?.v;
    expect(at('H3')).toBe(43220);
    expect(at('I3')).toBe(12670);
    expect(at('J3')).toBe(30550);
  });

  it('totals each date group and the sheet', () => {
    const sheet = RekapExport._rekapSheet(
      'Splite 1-2',
      RekapExport._byMaterial(LOADS).get('Splite 1-2')
    );
    // 13-Dec group: 30550 + 31670 = 62220, on the row after its two loads.
    expect(sheet.cells.find((x: any) => x.c === 'J5')?.v).toBe(62220);
    expect(sheet._totalKg).toBe(93470);
  });
});

describe('round trip through the real importer', () => {
  let reparsed: any[];

  beforeAll(() => {
    const sheet = RekapExport._rekapSheet(
      'Splite 1-2',
      RekapExport._byMaterial(LOADS).get('Splite 1-2')
    );
    const bytes = NSAXlsx.buildBytes([sheet]);
    const wb = XLSX.read(bytes, { type: 'array', cellDates: true });
    const aoa = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], {
      header: 1,
      raw: false,
      defval: '',
    });
    reparsed = RekapImport._parseSheet(aoa, 'Splite 1-2').rows;
  });

  it('reads back exactly the loads that went in', () => {
    expect(reparsed).toHaveLength(LOADS.length);
  });

  it('preserves every identifying field', () => {
    LOADS.forEach((src, i) => {
      const got = reparsed[i];
      expect(got.date).toBe(src.date);
      expect(got.weighNo).toBe(src.weighNo);
      expect(got.externalDoNo).toBe(src.externalDoNo);
      expect(got.suratJalanNo).toBe(src.suratJalanNo);
      expect(got.vehicle).toBe(src.vehicle);
      expect(got.driver).toBe(src.driver);
      expect(got.site).toBe(src.site);
      expect(got.supplierPoNo).toBe(src.supplierPoNo);
    });
  });

  it('preserves the weights without a factor-of-1000 drift', () => {
    LOADS.forEach((src, i) => {
      expect(reparsed[i].gross).toBe(src.grossWeight);
      expect(reparsed[i].tare).toBe(src.tareWeight);
      expect(reparsed[i].netto).toBe(src.lines[0].qty);
    });
  });

  it('does not read the subtotal or grand-total rows back as loads', () => {
    const total = reparsed.reduce((s, r) => s + r.netto, 0);
    expect(Math.round(total * 100) / 100).toBe(93.47);
  });
});

describe('site filtering', () => {
  it('keeps only the requested site', () => {
    (globalThis as any).window.DB.deliveryOrders = [
      ...LOADS,
      { ...LOADS[0], id: 'DO.9', site: 'TRIAS SERANG', suratJalanNo: '060' },
    ];
    expect(RekapExport._loads('', '', 'TRIAS CIKANDE')).toHaveLength(3);
    expect(RekapExport._loads('', '', 'TRIAS SERANG')).toHaveLength(1);
    (globalThis as any).window.DB.deliveryOrders = LOADS;
  });

  it('honours the date range', () => {
    expect(RekapExport._loads('2025-12-14', '2025-12-31', '')).toHaveLength(1);
  });
});
