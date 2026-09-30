import { describe, it, expect, beforeEach } from 'vitest';
import { t, getLang, setLang, toggleLang, translateTree } from '../src/core/i18n.js';

beforeEach(() => {
  setLang('id');
  document.body.innerHTML = '';
});

describe('t()', () => {
  it('returns Indonesian source unchanged in id mode', () => {
    setLang('id');
    expect(t('Simpan')).toBe('Simpan');
  });

  it('translates known phrases in en mode', () => {
    setLang('en');
    expect(t('Simpan')).toBe('Save');
    expect(t('Pelanggan')).toBe('Customer');
    expect(t('Aksi')).toBe('Actions');
  });

  it('passes through unknown phrases (dynamic data)', () => {
    setLang('en');
    expect(t('PT Sumber Batu Alam')).toBe('PT Sumber Batu Alam');
    expect(t('Rp 1.500.000')).toBe('Rp 1.500.000');
  });
});

describe('setLang / getLang / toggleLang', () => {
  it('persists and toggles', () => {
    setLang('en');
    expect(getLang()).toBe('en');
    expect(toggleLang()).toBe('id');
    expect(getLang()).toBe('id');
  });
});

describe('translateTree', () => {
  it('translates text nodes and preserves surrounding whitespace', () => {
    document.body.innerHTML =
      '<button>  Simpan  </button><table><thead><tr><th>Pelanggan</th></tr></thead></table>';
    setLang('en');
    translateTree(document.body);
    expect(document.querySelector('button')!.textContent).toBe('  Save  ');
    expect(document.querySelector('th')!.textContent).toBe('Customer');
  });

  it('translates placeholder / title / aria-label attributes', () => {
    document.body.innerHTML = '<input placeholder="Tanggal" title="Cari" aria-label="Hapus">';
    setLang('en');
    translateTree(document.body);
    const el = document.querySelector('input')!;
    expect(el.getAttribute('placeholder')).toBe('Date');
    expect(el.getAttribute('title')).toBe('Search');
    expect(el.getAttribute('aria-label')).toBe('Delete');
  });

  it('leaves dynamic content (names, numbers) untouched', () => {
    document.body.innerHTML =
      '<table><tbody><tr><td>Budi Santoso</td><td>Rp 2.000.000</td></tr></tbody></table>';
    setLang('en');
    translateTree(document.body);
    const tds = document.querySelectorAll('td');
    expect(tds[0].textContent).toBe('Budi Santoso');
    expect(tds[1].textContent).toBe('Rp 2.000.000');
  });

  it('restores the original when switching back to id (base→target, not target→target)', () => {
    document.body.innerHTML = '<button>Batal</button>';
    const btn = document.querySelector('button')!;
    setLang('en');
    translateTree(document.body);
    expect(btn.textContent).toBe('Cancel');
    setLang('id'); // setLang re-translates the whole document.body
    expect(btn.textContent).toBe('Batal');
  });

  it('does not translate inside CODE/SCRIPT/TEXTAREA', () => {
    document.body.innerHTML = '<code>Simpan</code><textarea>Batal</textarea>';
    setLang('en');
    translateTree(document.body);
    expect(document.querySelector('code')!.textContent).toBe('Simpan');
    expect(document.querySelector('textarea')!.textContent).toBe('Batal');
  });
});
