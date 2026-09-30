// ═══════════════════════════════════════════════════════════════════════════════
// KELOLA ERP (DEMO) — Lightweight i18n (Indonesian ⇄ English)
// -----------------------------------------------------------------------------
// The classic bundle renders thousands of hardcoded Indonesian strings across
// ~30 files. Rather than thread a t() call through every one, this module
// translates the *rendered DOM*: a base(Indonesian)→English dictionary plus a
// tree sweep that runs on load and on every view render (via MutationObserver).
//
// Design notes:
//   • Indonesian is the source of truth. The dictionary maps ID phrases → EN.
//     Switching to EN translates; switching back restores the cached original.
//   • Only *exact, trimmed* text-node matches are translated, so dynamic data
//     (names, numbers, dates) passes through untouched.
//   • Coverage is the common UI chrome (buttons, headers, labels, menus) and
//     grows by adding entries to DICT — no code changes needed.
// ═══════════════════════════════════════════════════════════════════════════════

const LANG_KEY = 'erp_lang';
const ATTRS = ['placeholder', 'title', 'aria-label'];

// Indonesian → English. Keys are matched against trimmed text/attr values.
const DICT_EN = {
  // Actions / buttons
  Simpan: 'Save',
  Batal: 'Cancel',
  Hapus: 'Delete',
  Tutup: 'Close',
  Edit: 'Edit',
  Tambah: 'Add',
  Ubah: 'Change',
  Cari: 'Search',
  Pilih: 'Select',
  Kembali: 'Back',
  Lanjut: 'Next',
  Ya: 'Yes',
  Tidak: 'No',
  Cetak: 'Print',
  Ekspor: 'Export',
  Impor: 'Import',
  Muat: 'Load',
  Terapkan: 'Apply',
  Reset: 'Reset',
  Salin: 'Copy',
  'Salin Semua': 'Copy All',
  Verifikasi: 'Verify',
  Aktifkan: 'Enable',
  Nonaktifkan: 'Disable',
  'Buat Ulang Kode': 'Regenerate Codes',
  Logout: 'Sign Out',
  'Ganti Password': 'Change Password',
  'Kelola Backup': 'Manage Backup',
  'Edit Profil': 'Edit Profile',
  'Install Aplikasi': 'Install App',
  'Manajemen Pengguna': 'User Management',
  'Verifikasi 2 Langkah': 'Two-Factor Authentication',
  AKTIF: 'ON',

  // Common column / field labels
  Tanggal: 'Date',
  Status: 'Status',
  Keterangan: 'Description',
  Catatan: 'Notes',
  Aksi: 'Actions',
  Kategori: 'Category',
  Jumlah: 'Amount',
  'Jumlah (Rp)': 'Amount (Rp)',
  Nama: 'Name',
  'Nama Lengkap': 'Full Name',
  'Nama Kategori': 'Category Name',
  'Nama Barang': 'Item Name',
  'Nama Akun': 'Account Name',
  'Nama Aset': 'Asset Name',
  'Nama Satuan': 'Unit Name',
  'Kode Barang': 'Item Code',
  Total: 'Total',
  'Total Qty': 'Total Qty',
  'Sub Total': 'Subtotal',
  Subtotal: 'Subtotal',
  Pelanggan: 'Customer',
  Supplier: 'Supplier',
  Periode: 'Period',
  Metode: 'Method',
  Diskon: 'Discount',
  Tipe: 'Type',
  Telepon: 'Phone',
  Lokasi: 'Location',
  Harga: 'Price',
  Dari: 'From',
  'Alamat / Kota': 'Address / City',
  Alamat: 'Address',
  Aset: 'Asset',
  Satuan: 'Unit',
  Kredit: 'Credit',
  Debit: 'Debit',
  Kode: 'Code',
  Jabatan: 'Position',
  Departemen: 'Department',
  Akun: 'Account',
  Saldo: 'Balance',
  Referensi: 'Reference',
  Realisasi: 'Actual',
  Pencapaian: 'Achievement',
  Nomor: 'Number',
  Waktu: 'Time',
  'Nilai Perolehan': 'Acquisition Value',
  'Tanggal Perolehan': 'Acquisition Date',
  'Kategori Fiskal': 'Fiscal Category',
  'Jumlah DP': 'Down Payment',
  'Rekening Bank': 'Bank Account',
  Normal: 'Normal',

  // Statuses / misc
  Aktif: 'Active',
  'Tidak Aktif': 'Inactive',
  'Belum Bayar': 'Unpaid',
  Lunas: 'Paid',
  'Belum diproses': 'Not processed',
  Semua: 'All',
  Pengaturan: 'Settings',
  Keamanan: 'Security',
  'Sign in to continue': 'Sign in to continue',

  // Documents / finance / inventory chrome
  Detail: 'Detail',
  Dokumen: 'Document',
  Draft: 'Draft',
  Kirim: 'Send',
  'Jatuh Tempo': 'Due Date',
  'Metode Pembayaran': 'Payment Method',
  Anggaran: 'Budget',
  Varians: 'Variance',
  Umur: 'Age',
  'Bulan Ini': 'This Month',
  'bulan lalu': 'last month',
  'Tahun Ini': 'This Year',
  'Hari Ini': 'Today',
  Sat: 'Unit',
  Dilepas: 'Disposed',
  'Servis/Perbaikan': 'Service/Repair',
  'Wilayah Layanan': 'Service Area',
  Driver: 'Driver',
  'Simpan Perubahan': 'Save Changes',
  'Tambah Baru': 'Add New',
  'Belum ada data': 'No data yet',
  'Belum ada kategori.': 'No categories yet.',
  'Tidak ada data': 'No data',
  'Pilih...': 'Select...',
  Jenis: 'Type',
  Gudang: 'Warehouse',
  Stok: 'Stock',
  Masuk: 'In',
  Keluar: 'Out',
  Pembayaran: 'Payment',
  Penerimaan: 'Receipt',
  Pengiriman: 'Delivery',
  Penjualan: 'Sales',
  Pembelian: 'Purchases',
  Persediaan: 'Inventory',
  Laporan: 'Reports',
  Ringkasan: 'Summary',
  Grafik: 'Chart',
  'Ekspor Excel': 'Export Excel',
  'Ekspor PDF': 'Export PDF',
  'Ekspor CSV': 'Export CSV',
};

// Build the reverse (identity) map for Indonesian so setLang('id') restores.
const DICTS = { id: null, en: DICT_EN };

let _lang = 'id';
let _observer = null;
let _applying = false;
// Cache each translated text node's ORIGINAL (Indonesian) content so language
// switches always translate from the source, never target→target.
const _origText = new WeakMap();
const _origAttr = new WeakMap(); // node → { attr: originalValue }

export function getLang() {
  return _lang;
}

export function t(phrase) {
  const dict = DICTS[_lang];
  if (!dict) {
    return phrase;
  }
  const key = String(phrase).trim();
  return Object.prototype.hasOwnProperty.call(dict, key) ? dict[key] : phrase;
}

function translateTextNode(node) {
  const original = _origText.has(node) ? _origText.get(node) : node.nodeValue;
  const trimmed = original.trim();
  if (!trimmed) {
    return;
  }
  const translated = t(trimmed);
  if (translated === trimmed && !_origText.has(node)) {
    return; // nothing to do and nothing cached
  }
  if (!_origText.has(node)) {
    _origText.set(node, original);
  }
  // Preserve leading/trailing whitespace around the phrase.
  const lead = original.match(/^\s*/)[0];
  const tail = original.match(/\s*$/)[0];
  const next = lead + translated + tail;
  if (node.nodeValue !== next) {
    node.nodeValue = next;
  }
}

function translateAttrs(el) {
  for (const attr of ATTRS) {
    if (!el.hasAttribute(attr)) {
      continue;
    }
    let cache = _origAttr.get(el);
    const current = el.getAttribute(attr);
    const original = cache && cache[attr] != null ? cache[attr] : current;
    const trimmed = original.trim();
    if (!trimmed) {
      continue;
    }
    const translated = t(trimmed);
    if (translated === trimmed && !(cache && cache[attr] != null)) {
      continue;
    }
    if (!cache) {
      cache = {};
      _origAttr.set(el, cache);
    }
    if (cache[attr] == null) {
      cache[attr] = original;
    }
    if (current !== translated) {
      el.setAttribute(attr, translated);
    }
  }
}

const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEXTAREA', 'CODE', 'PRE']);

export function translateTree(root) {
  if (!root) {
    return;
  }
  _applying = true;
  try {
    // Element attributes.
    const els = root.nodeType === 1 ? [root, ...root.querySelectorAll('*')] : [];
    for (const el of els) {
      if (!SKIP_TAGS.has(el.tagName)) {
        translateAttrs(el);
      }
    }
    // Text nodes.
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(n) {
        const p = n.parentNode;
        if (p && SKIP_TAGS.has(p.tagName)) {
          return NodeFilter.FILTER_REJECT;
        }
        return n.nodeValue && n.nodeValue.trim()
          ? NodeFilter.FILTER_ACCEPT
          : NodeFilter.FILTER_SKIP;
      },
    });
    const nodes = [];
    let cur = walker.nextNode();
    while (cur) {
      nodes.push(cur);
      cur = walker.nextNode();
    }
    nodes.forEach(translateTextNode);
  } finally {
    _applying = false;
  }
}

let _queued = [];
let _timer = null;
function scheduleTranslate(nodes) {
  _queued.push(...nodes);
  if (_timer) {
    return;
  }
  // setTimeout (not rAF) so translation still runs when the tab is backgrounded
  // — rAF is paused for hidden tabs, which would leave freshly-rendered views
  // untranslated until the tab regains focus.
  _timer = setTimeout(() => {
    _timer = null;
    const batch = _queued;
    _queued = [];
    batch.forEach(n => n.isConnected !== false && translateTree(n));
  }, 0);
}

function startObserver() {
  if (_observer || typeof MutationObserver === 'undefined') {
    return;
  }
  _observer = new MutationObserver(records => {
    if (_applying || _lang === 'id') {
      return;
    }
    const added = [];
    for (const r of records) {
      r.addedNodes.forEach(n => {
        if (n.nodeType === 1) {
          added.push(n);
        } else if (n.nodeType === 3 && n.parentNode) {
          added.push(n.parentNode);
        }
      });
    }
    if (added.length) {
      scheduleTranslate(added);
    }
  });
  _observer.observe(document.body, { childList: true, subtree: true });
}

export function setLang(lang) {
  const next = lang === 'en' ? 'en' : 'id';
  _lang = next;
  try {
    localStorage.setItem(LANG_KEY, next);
  } catch (_) {
    /* ignore */
  }
  document.documentElement.setAttribute('lang', next === 'en' ? 'en' : 'id');
  // Re-translate the whole document from cached originals.
  translateTree(document.body);
  return next;
}

export function toggleLang() {
  return setLang(_lang === 'en' ? 'id' : 'en');
}

export function initI18n() {
  try {
    const saved = localStorage.getItem(LANG_KEY);
    if (saved === 'en' || saved === 'id') {
      _lang = saved;
    }
  } catch (_) {
    /* ignore */
  }
  document.documentElement.setAttribute('lang', _lang === 'en' ? 'en' : 'id');
  const apply = () => {
    if (_lang === 'en') {
      translateTree(document.body);
    }
    startObserver();
  };
  if (document.body) {
    apply();
  } else {
    document.addEventListener('DOMContentLoaded', apply, { once: true });
  }
}

// Expose for the classic bundle (nav toggle, ad-hoc t() in classic scripts).
if (typeof window !== 'undefined') {
  window.I18N = { t, getLang, setLang, toggleLang, translateTree, initI18n, DICT: DICTS };
}
