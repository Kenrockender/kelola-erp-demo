// ═══════════════════════════════════════════════════════════════════════════════
// Surat Jalan input screen (field operator)
//
// This form is used on a phone, at a weighbridge, by whoever is on shift under a
// SHARED login. Two things therefore matter more than usual:
//   • the kg → tonne conversion, because the operator reads kilograms off the
//     scale and every downstream invoice is priced per tonne;
//   • the correction path, because a shared account must be able to REPORT a
//     mistake without being able to rewrite the record.
// ═══════════════════════════════════════════════════════════════════════════════
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

declare global {
  interface Window {
    SuratJalanView: any;
    renderSuratJalan: () => string;
    DB: any;
  }
}

const ROOT = resolve(__dirname, '..');
let SJ: any;

const TODAY = new Date().toISOString().slice(0, 10);

beforeAll(() => {
  const src = readFileSync(resolve(ROOT, 'public/classic/core/surat-jalan-view.js'), 'utf8');
  // eslint-disable-next-line no-new-func
  new Function(src)();
  SJ = window.SuratJalanView;
});

beforeEach(() => {
  (window as any).DB = {
    deliveryOrders: [],
    inventoryItems: [{ id: 7, name: 'Splite 1-2', unit: 'Ton' }],
  };
  (window as any).saveDB = vi.fn();
  (window as any).showToast = vi.fn();
  (window as any).navigate = vi.fn();
  (window as any).invalidateView = vi.fn();
  (window as any).nextId = () => 'DO.TEST.1';
  document.body.innerHTML = '';
});

/** Render the real form into the DOM and fill it like an operator would. */
function fillForm(over: Record<string, string> = {}) {
  document.body.innerHTML = `<div id="host">${window.renderSuratJalan()}</div>`;
  const values: Record<string, string> = {
    'sj-operator': 'Pak Rudi',
    'sj-date': TODAY,
    'sj-site': 'TRIAS CIKANDE',
    'sj-vehicle': 'A9128ZY',
    'sj-driver': 'CAMONG',
    'sj-material': 'Splite 1-2',
    'sj-po': '054',
    'sj-gjib': '40699',
    'sj-do': '40539',
    'sj-no': '421',
    'sj-gross': '48890',
    'sj-tare': '12470',
    ...over,
  };
  Object.entries(values).forEach(([id, v]) => {
    const el = document.getElementById(id) as HTMLInputElement | null;
    if (el) {
      el.value = v;
    }
  });
}

describe('weighbridge arithmetic', () => {
  it('treats a reading of 1000 or more as kilograms', () => {
    expect(SJ.kgToTon(48890)).toBe(48.89);
    expect(SJ.kgToTon(12470)).toBe(12.47);
  });

  it('leaves a sub-1000 reading as tonnes, so either habit works', () => {
    expect(SJ.kgToTon(48.89)).toBe(48.89);
  });

  it('computes netto from the two readings', () => {
    expect(SJ.netto(48.89, 12.47)).toBe(36.42);
  });

  it('returns nothing when a reading is missing', () => {
    expect(SJ.netto(48.89, null)).toBeNull();
  });
});

describe('saving a load', () => {
  it('stores tonnes even though kilograms were typed', () => {
    fillForm();
    const doc = SJ.save();
    expect(doc).not.toBeNull();
    expect(doc.grossWeight).toBe(48.89);
    expect(doc.tareWeight).toBe(12.47);
    expect(doc.lines[0].qty).toBe(36.42);
    expect(doc.lines[0].unit).toBe('Ton');
  });

  it('links the material to the item master when the name matches', () => {
    fillForm();
    const doc = SJ.save();
    expect(doc.lines[0].itemId).toBe(7);
  });

  it('records who was on shift, since the login is shared', () => {
    fillForm();
    const doc = SJ.save();
    expect(doc.recordedBy).toBe('Pak Rudi');
  });

  it('keeps all three document numbers apart', () => {
    fillForm();
    const doc = SJ.save();
    expect(doc.weighNo).toBe('40699');
    expect(doc.externalDoNo).toBe('40539');
    expect(doc.suratJalanNo).toBe('421');
  });

  it('starts life with no correction pending', () => {
    fillForm();
    expect(SJ.save().needsCorrection).toBe(false);
  });

  it('refuses a load with no surat jalan number', () => {
    fillForm({ 'sj-no': '' });
    expect(SJ.save()).toBeNull();
    expect(window.DB.deliveryOrders).toHaveLength(0);
  });

  it('refuses a load with no operator name', () => {
    fillForm({ 'sj-operator': '' });
    expect(SJ.save()).toBeNull();
  });

  it('refuses a load whose gross weight is not above its tare', () => {
    fillForm({ 'sj-gross': '12000', 'sj-tare': '12470' });
    expect(SJ.save()).toBeNull();
    expect(window.DB.deliveryOrders).toHaveLength(0);
  });

  it('refuses a load with no weights at all', () => {
    fillForm({ 'sj-gross': '', 'sj-tare': '' });
    expect(SJ.save()).toBeNull();
  });
});

describe("today's list", () => {
  it('shows only loads recorded today', () => {
    window.DB.deliveryOrders = [
      { id: 'A', date: TODAY, suratJalanNo: '1' },
      { id: 'B', date: '2020-01-01', suratJalanNo: '2' },
    ];
    expect(SJ._todayLoads().map((d: any) => d.id)).toEqual(['A']);
  });
});

describe('correction request', () => {
  beforeEach(() => {
    (window as any).openModal = (_t: string, body: string, footer: string) => {
      document.body.innerHTML = `<div class="modal-body">${body}</div><div>${footer}</div>`;
    };
    (window as any).closeModal = vi.fn();
  });

  it("flags the record and keeps the operator's note", async () => {
    window.DB.deliveryOrders = [
      { id: 'DO-1', date: TODAY, suratJalanNo: '421', needsCorrection: false },
    ];
    SJ.flag('DO-1');
    await new Promise(r => setTimeout(r, 80));
    (document.getElementById('sj-flag-note') as HTMLTextAreaElement).value =
      'berat kosong salah, seharusnya 12470';
    (document.getElementById('sj-flag-save') as HTMLButtonElement).click();

    const d = window.DB.deliveryOrders[0];
    expect(d.needsCorrection).toBe(true);
    expect(d.correctionNote).toBe('berat kosong salah, seharusnya 12470');
    expect(d.correctionAt).toBeTruthy();
  });

  it('does not alter the load itself — only the office may fix it', async () => {
    window.DB.deliveryOrders = [
      { id: 'DO-1', date: TODAY, suratJalanNo: '421', grossWeight: 48.89, tareWeight: 99 },
    ];
    SJ.flag('DO-1');
    await new Promise(r => setTimeout(r, 80));
    (document.getElementById('sj-flag-note') as HTMLTextAreaElement).value = 'salah timbang';
    (document.getElementById('sj-flag-save') as HTMLButtonElement).click();

    const d = window.DB.deliveryOrders[0];
    expect(d.grossWeight).toBe(48.89);
    expect(d.tareWeight).toBe(99); // untouched, wrong or not
  });

  it('rejects an empty note', async () => {
    window.DB.deliveryOrders = [{ id: 'DO-1', date: TODAY, suratJalanNo: '421' }];
    SJ.flag('DO-1');
    await new Promise(r => setTimeout(r, 80));
    (document.getElementById('sj-flag-save') as HTMLButtonElement).click();
    expect(window.DB.deliveryOrders[0].needsCorrection).toBeFalsy();
  });
});

describe('no money on screen', () => {
  it('never renders a rupiah figure', () => {
    window.DB.deliveryOrders = [
      {
        id: 'DO-1',
        date: TODAY,
        suratJalanNo: '421',
        vehicle: 'A9128ZY',
        grossWeight: 48.89,
        tareWeight: 12.47,
        amount: 123456789,
        lines: [{ itemName: 'Splite 1-2', qty: 36.42, price: 155000 }],
      },
    ];
    const html = window.renderSuratJalan();
    expect(html).not.toMatch(/Rp/);
    expect(html).not.toMatch(/155000|123456789/);
  });
});
