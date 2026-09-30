// ═══════════════════════════════════════════════════════════════════════════════
// REKAP importer — parser tests
//
// Guards the client's real "REKAP TMA-<lokasi>.xlsx" layout, which differs from
// every other sheet the app ingests:
//   • the header spans TWO rows ("No"/"GJIB", "No"/"Surat Jalan", …),
//   • one sheet per material, the sheet name being the material,
//   • per-date subtotal rows and a grand "SUBTOTAL … Ton" row interleaved with
//     the data,
//   • weights written Indonesian-style in KILOGRAMS — "43.220" is 43,220 kg.
//
// That last one is the expensive mistake: reading the dot as a decimal point
// understates every load by 1000× and corrupts every invoice derived from it,
// so it gets explicit coverage below.
// ═══════════════════════════════════════════════════════════════════════════════
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const ROOT = resolve(__dirname, '..');

let RekapImport: any;

// Header exactly as it appears in the client's workbooks.
const HEADER_A = [
  'No',
  'No',
  'No',
  'No',
  'No',
  'SUPIR',
  'Tanggal',
  'Isi(kg)',
  'Kosong(Kg)',
  'Qty(kg)',
  'Material',
  'Keterangan',
  'No',
];
const HEADER_B = ['', 'GJIB', 'DO', 'Surat Jalan', 'Polisi', '', '', '', '', '', '', '', 'PO'];

function sheet(rows: any[][]) {
  return [HEADER_A, HEADER_B, ...rows];
}

// Verbatim rows from REKAP TMA-CKD.xlsx, sheet "SPLITE 1-2".
const R1 = [
  '1',
  '37308',
  '37157',
  '001',
  'BG8906OH',
  'IRIYANTO',
  '13-Dec-25',
  '43.220',
  '12.670',
  '30.550',
  'Splite 1-2',
  'TRIAS CIKANDE',
  '133',
];
const R2 = [
  '2',
  '37309',
  '37158',
  '002',
  'A9129ZY',
  'EBI',
  '13-Dec-25',
  '43.820',
  '12.150',
  '31.670',
  'Splite 1-2',
  'TRIAS CIKANDE',
  '133',
];
const R3 = [
  '3',
  '37310',
  '37156',
  '003',
  'A9810A',
  'YANA',
  '13-Dec-25',
  '43.100',
  '11.930',
  '31.170',
  'Splite 1-2',
  'TRIAS CIKANDE',
  '133',
];
const R4 = [
  '4',
  '37312',
  '37155',
  '004',
  'B9197PYX',
  'ULUNG',
  '13-Dec-25',
  '41.430',
  '11.750',
  '29.680',
  'Splite 1-2',
  'TRIAS CIKANDE',
  '133',
];
// The 13-Dec-25 group's own subtotal cell, covering R1..R4.
const SUBTOTAL_ROW = ['', '', '', '', '', '', '', '', '', '123.070', '', '', ''];
const GRAND_ROW = ['', '', '', '', '', '', 'SUBTOTAL', '', '', '', '', '', ''];
// The line the grand total actually sits on in REKAP TMA-CKD.xlsx: the word
// SUBTOTAL is on the row above, so this one is caught only by the date and
// identifier gates, not by a keyword match.
const GRAND_VALUE_ROW = ['', '', '', '', '', '', 'Splite 1-2', '', '=', '2920.410', 'Ton', '', ''];

beforeAll(() => {
  // The module is a classic IIFE that publishes window.RekapImport.
  (globalThis as any).window = globalThis;
  const src = readFileSync(resolve(ROOT, 'public/classic/core/rekap-import.js'), 'utf8');
  // eslint-disable-next-line no-new-func
  new Function(src)();
  RekapImport = (globalThis as any).window.RekapImport;
});

describe('number parsing', () => {
  it('reads a dot before exactly three digits as a thousands separator', () => {
    expect(RekapImport._num('43.220')).toBe(43220);
    expect(RekapImport._num('12.670')).toBe(12670);
    expect(RekapImport._num('1.234.567')).toBe(1234567);
  });

  it('keeps a dot as a decimal point when it is not a thousands group', () => {
    expect(RekapImport._num('48.89')).toBe(48.89);
    expect(RekapImport._num('7.5')).toBe(7.5);
  });

  it('accepts a comma as the decimal separator', () => {
    expect(RekapImport._num('48,89')).toBe(48.89);
  });

  it('converts kilogram weights to tonnes', () => {
    expect(RekapImport._toTon('43.220')).toBe(43.22);
    expect(RekapImport._toTon('12.670')).toBe(12.67);
  });

  it('leaves sub-1000 values alone so hand-typed tonnes still work', () => {
    expect(RekapImport._toTon('48,89')).toBe(48.89);
  });
});

describe('date parsing', () => {
  it('reads the "13-Dec-25" style used throughout the rekap', () => {
    expect(RekapImport._date('13-Dec-25')).toBe('2025-12-13');
    expect(RekapImport._date('7-Jan-26')).toBe('2026-01-07');
    expect(RekapImport._date('25-Jul-26')).toBe('2026-07-25');
  });

  it('reads the Indonesian month abbreviations', () => {
    expect(RekapImport._date('4-Mei-26')).toBe('2026-05-04');
    expect(RekapImport._date('7-Agu-26')).toBe('2026-08-07');
    expect(RekapImport._date('13-Des-25')).toBe('2025-12-13');
  });

  // Regression: V8's Date constructor parses "Splite 1-2" as 2 Jan 2001 and
  // "ABU 0-5" as 1 May 2000. A permissive fallback therefore let each sheet's
  // grand-total row through as a truckload and doubled every material's
  // tonnage. Material names must never parse as dates.
  it('rejects material names that V8 would otherwise accept as dates', () => {
    expect(RekapImport._date('Splite 1-2')).toBeNull();
    expect(RekapImport._date('SCREENING 5-10')).toBeNull();
    expect(RekapImport._date('ABU 0-5')).toBeNull();
    expect(RekapImport._date('SUBTOTAL')).toBeNull();
  });
});

describe('material normalisation', () => {
  it('folds spelling and casing variants together', () => {
    expect(RekapImport._normMaterial('Splite 1-2')).toBe(RekapImport._normMaterial('SPLITE 1-2'));
    expect(RekapImport._normMaterial('  Screening  5-10 ')).toBe('SCREENING 5-10');
  });
});

describe('header detection', () => {
  it('maps the two-row header onto distinct fields', () => {
    const hdr = RekapImport._findHeader(sheet([R1]));
    expect(hdr).not.toBeNull();
    expect(hdr.idx.weighNo).toBe(1);
    expect(hdr.idx.externalDoNo).toBe(2);
    expect(hdr.idx.suratJalanNo).toBe(3);
    expect(hdr.idx.vehicle).toBe(4);
    expect(hdr.idx.driver).toBe(5);
    expect(hdr.idx.date).toBe(6);
    expect(hdr.idx.gross).toBe(7);
    expect(hdr.idx.tare).toBe(8);
    expect(hdr.idx.netto).toBe(9);
    expect(hdr.idx.material).toBe(10);
    expect(hdr.idx.keterangan).toBe(11);
    expect(hdr.idx.supplierPoNo).toBe(12);
  });

  it('does not confuse "No DO" with "No Surat Jalan" or "No PO"', () => {
    const hdr = RekapImport._findHeader(sheet([R1]));
    expect(hdr.idx.externalDoNo).not.toBe(hdr.idx.suratJalanNo);
    expect(hdr.idx.externalDoNo).not.toBe(hdr.idx.supplierPoNo);
  });
});

describe('sheet parsing', () => {
  it('extracts a truckload with the weights converted to tonnes', () => {
    const { rows } = RekapImport._parseSheet(sheet([R1]), 'SPLITE 1-2');
    expect(rows).toHaveLength(1);
    const r = rows[0];
    expect(r.date).toBe('2025-12-13');
    expect(r.weighNo).toBe('37308');
    expect(r.externalDoNo).toBe('37157');
    expect(r.suratJalanNo).toBe('001');
    expect(r.vehicle).toBe('BG8906OH');
    expect(r.driver).toBe('IRIYANTO');
    expect(r.gross).toBe(43.22);
    expect(r.tare).toBe(12.67);
    expect(r.netto).toBe(30.55);
    expect(r.site).toBe('TRIAS CIKANDE');
    expect(r.supplierPoNo).toBe('133');
    expect(r._errors).toHaveLength(0);
  });

  it('skips per-date subtotal rows and the grand total row', () => {
    const res = RekapImport._parseSheet(sheet([R1, R2, SUBTOTAL_ROW, GRAND_ROW]), 'SPLITE 1-2');
    expect(res.rows).toHaveLength(2);
    expect(res.skipped).toBe(2);
  });

  // The strongest available check that the kg→tonne reading is right: the
  // client's own subtotal cell is the ground truth.
  it("agrees with the sheet's own per-date subtotal", () => {
    const { rows } = RekapImport._parseSheet(sheet([R1, R2, R3, R4, SUBTOTAL_ROW]), 'SPLITE 1-2');
    expect(rows).toHaveLength(4);
    const sum = rows.reduce((s: number, r: any) => s + r.netto, 0);
    // Subtotal cell reads "123.070" kg = 123.07 t.
    expect(Math.round(sum * 100) / 100).toBe(123.07);
  });

  it('does not count the grand-total row as a truckload', () => {
    const res = RekapImport._parseSheet(sheet([R1, R2, GRAND_ROW, GRAND_VALUE_ROW]), 'SPLITE 1-2');
    expect(res.rows).toHaveLength(2);
    const sum = res.rows.reduce((s: number, r: any) => s + r.netto, 0);
    expect(Math.round(sum * 100) / 100).toBe(62.22);
  });

  it('ignores a row that has a date but no GJIB, DO, surat jalan or plate', () => {
    const orphan = ['', '', '', '', '', '', '13-Dec-25', '', '', '99.999', '', '', ''];
    const res = RekapImport._parseSheet(sheet([R1, orphan]), 'SPLITE 1-2');
    expect(res.rows).toHaveLength(1);
  });

  it('falls back to the sheet name when the Material cell is blank', () => {
    const blank = [...R1];
    blank[10] = '';
    const { rows } = RekapImport._parseSheet(sheet([blank]), 'SPLITE 1-2');
    expect(rows[0].material).toBe('SPLITE 1-2');
  });

  it('flags a load whose gross weight is not above its tare', () => {
    const bad = [...R1];
    bad[7] = '12.000';
    const { rows } = RekapImport._parseSheet(sheet([bad]), 'SPLITE 1-2');
    expect(rows[0]._errors.length).toBeGreaterThan(0);
  });

  it("warns when the file's Qty column disagrees with isi − kosong", () => {
    const mismatch = [...R1];
    mismatch[9] = '99.999';
    const { rows } = RekapImport._parseSheet(sheet([mismatch]), 'SPLITE 1-2');
    expect(rows[0]._warnings.join(' ')).toMatch(/Qty di file/);
    // The computed netto still wins over the file's own column.
    expect(rows[0].netto).toBe(30.55);
  });

  it('warns when the PO column is empty', () => {
    const noPo = [...R1];
    noPo[12] = '';
    const { rows } = RekapImport._parseSheet(sheet([noPo]), 'SPLITE 1-2');
    expect(rows[0]._warnings.join(' ')).toMatch(/No PO kosong/);
  });

  it('reports an unrecognised sheet instead of throwing', () => {
    const res = RekapImport._parseSheet(
      [
        ['nothing', 'useful'],
        ['a', 'b'],
      ],
      'X'
    );
    expect(res.error).toBeTruthy();
    expect(res.rows).toHaveLength(0);
  });
});
