/* ═══════════════════════════════════════════════════════════════════════════════
   KELOLA ERP (DEMO) — Landing page behaviour
   · Scroll-zoom hero (Mercury-style), rAF-throttled, ~no library
   · EN / ID language toggle (persisted)
   · Scroll-in reveals
   All effects are gated by prefers-reduced-motion.
   ═══════════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ── 1. Scroll-zoom hero ──────────────────────────────────────────────────────
  // Map scroll progress through the tall .hero-scroll region (while .hero-stage is
  // pinned) to a 0→1 value, and feed it to the mockup's --p custom property. CSS
  // turns that into the rotateX → flat / scale-up / brighten + chart line draw.
  const mock = document.querySelector('[data-mock]');
  const scrollRegion = document.querySelector('.hero-scroll');

  if (mock && scrollRegion && !reduceMotion) {
    const clamp01 = v => (v < 0 ? 0 : v > 1 ? 1 : v);
    let ticking = false;

    function update() {
      ticking = false;
      const rect = scrollRegion.getBoundingClientRect();
      // Animation plays over the first 60% of a viewport height of scrolling,
      // starting when the region's top reaches the top of the viewport.
      const distance = window.innerHeight * 0.6;
      const p = clamp01(-rect.top / distance);
      mock.style.setProperty('--p', p.toFixed(4));
    }

    function onScroll() {
      if (!ticking) {
        ticking = true;
        requestAnimationFrame(update);
      }
    }

    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });
    update();
  } else if (mock) {
    // Reduced motion (or no region): render the mockup flat & bright immediately.
    mock.style.setProperty('--p', '1');
  }

  // ── 2. Scroll-in reveals ─────────────────────────────────────────────────────
  const revealEls = document.querySelectorAll('.reveal');
  if (reduceMotion || !('IntersectionObserver' in window)) {
    revealEls.forEach(el => el.classList.add('in'));
  } else {
    const io = new IntersectionObserver(
      (entries, obs) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            entry.target.classList.add('in');
            obs.unobserve(entry.target);
          }
        });
      },
      { rootMargin: '0px 0px -10% 0px', threshold: 0.1 }
    );
    revealEls.forEach(el => io.observe(el));
  }

  // ── 3. Language toggle (EN / ID) ─────────────────────────────────────────────
  const dict = {
    id: {
      'nav.open': 'Buka aplikasi',
      'hero.badge': 'Gratis · Privat · Offline',
      'hero.title': 'ERP modern untuk <span class="accent">seluruh bisnis</span> Anda',
      'hero.sub':
        'Penjualan, pembelian, persediaan, buku besar, dan laporan — dalam satu aplikasi yang cepat, bekerja offline, dan menyimpan data Anda secara lokal.',
      'hero.cta': 'Buka aplikasi',
      'hero.cta2': 'Lihat fitur',
      'hero.note': 'Tanpa pemasangan. Login default sudah disiapkan untuk mulai mencoba.',
      'feat.eyebrow': 'Satu aplikasi, semua modul',
      'feat.title': 'Semua yang dibutuhkan untuk menjalankan operasional',
      'feat.sub':
        'Modul akuntansi dan operasional yang saling terhubung — bukan kumpulan alat terpisah.',
      'feat.1.t': 'Penjualan & Pembelian',
      'feat.1.d':
        'Penawaran, pesanan, faktur, dan surat jalan — alur dokumen yang saling terhubung dari kuotasi hingga pembayaran.',
      'feat.2.t': 'Persediaan & Gudang',
      'feat.2.d':
        'Stok multi-gudang, penyesuaian, dan retur dengan kartu stok yang selalu seimbang dengan buku besar.',
      'feat.3.t': 'Buku Besar & Keuangan',
      'feat.3.d':
        'Pembukuan double-entry, kas & bank, aset tetap, dan pajak — terbukukan otomatis dari setiap transaksi.',
      'feat.4.t': 'Laporan & Ekspor',
      'feat.4.d':
        'Laba rugi, neraca, dan arus kas. Ekspor ke Excel dan impor data kapan pun Anda butuhkan.',
      'trust.title': 'Dibangun dengan prinsip yang benar',
      'trust.sub': 'Tanpa janji kosong — hanya hal yang memang benar tentang aplikasi ini.',
      'trust.1.t': 'Local-first',
      'trust.1.d': 'Data tersimpan di perangkat Anda',
      'trust.2.t': 'Bekerja offline',
      'trust.2.d': 'PWA penuh, bisa dipasang',
      'trust.3.t': 'Gratis untuk mulai',
      'trust.3.d': 'Login default siap pakai',
      'trust.4.t': 'Dwibahasa',
      'trust.4.d': 'Antarmuka Indonesia & Inggris',
      'close.title': 'Siap merapikan pembukuan Anda?',
      'close.sub': 'Buka aplikasi dan mulai dalam hitungan detik — tidak ada yang perlu dipasang.',
      'close.cta': 'Buka aplikasi',
      'foot.tag': 'ERP modern untuk manajemen bisnis.',
    },
    en: {
      'nav.open': 'Open app',
      'hero.badge': 'Free · Private · Offline',
      'hero.title': 'A modern ERP for <span class="accent">your whole business</span>',
      'hero.sub':
        'Sales, purchasing, inventory, general ledger, and reports — in one fast app that works offline and keeps your data on your device.',
      'hero.cta': 'Open app',
      'hero.cta2': 'See features',
      'hero.note':
        'No install required. A default login is ready so you can start trying it right away.',
      'feat.eyebrow': 'One app, every module',
      'feat.title': 'Everything you need to run operations',
      'feat.sub': 'Connected accounting and operations modules — not a pile of separate tools.',
      'feat.1.t': 'Sales & Purchasing',
      'feat.1.d':
        'Quotations, orders, invoices, and delivery notes — a connected document flow from quote to payment.',
      'feat.2.t': 'Inventory & Warehouse',
      'feat.2.d':
        'Multi-warehouse stock, adjustments, and returns with stock cards that always reconcile to the ledger.',
      'feat.3.t': 'Ledger & Finance',
      'feat.3.d':
        'Double-entry bookkeeping, cash & bank, fixed assets, and tax — posted automatically from every transaction.',
      'feat.4.t': 'Reports & Export',
      'feat.4.d':
        'Profit & loss, balance sheet, and cash flow. Export to Excel and import data whenever you need.',
      'trust.title': 'Built on the right principles',
      'trust.sub': 'No empty promises — only things that are genuinely true about this app.',
      'trust.1.t': 'Local-first',
      'trust.1.d': 'Your data stays on your device',
      'trust.2.t': 'Works offline',
      'trust.2.d': 'A full, installable PWA',
      'trust.3.t': 'Free to start',
      'trust.3.d': 'Default login ready to go',
      'trust.4.t': 'Bilingual',
      'trust.4.d': 'Indonesian & English interface',
      'close.title': 'Ready to tidy up your books?',
      'close.sub': 'Open the app and get started in seconds — there is nothing to install.',
      'close.cta': 'Open app',
      'foot.tag': 'A modern ERP for managing your business.',
    },
  };

  const htmlKeys = new Set(['hero.title']); // values that contain markup

  function applyLang(lang) {
    const table = dict[lang] || dict.id;
    document.documentElement.lang = lang;
    document.querySelectorAll('[data-i18n]').forEach(el => {
      const key = el.getAttribute('data-i18n');
      const val = table[key];
      if (val == null) {
        return;
      }
      if (htmlKeys.has(key)) {
        el.innerHTML = val;
      } else {
        el.textContent = val;
      }
    });
    document.querySelectorAll('.lang-toggle button').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.lang === lang);
    });
    try {
      localStorage.setItem('cf-lang', lang);
    } catch (_) {
      /* ignore */
    }
  }

  let initial = 'id';
  try {
    const saved = localStorage.getItem('cf-lang');
    if (saved === 'en' || saved === 'id') {
      initial = saved;
    } else if (navigator.language && navigator.language.toLowerCase().startsWith('en')) {
      initial = 'en';
    }
  } catch (_) {
    /* ignore */
  }

  document.querySelectorAll('.lang-toggle button').forEach(btn => {
    btn.addEventListener('click', () => applyLang(btn.dataset.lang));
  });

  applyLang(initial);
})();
