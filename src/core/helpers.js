// ═══════════════════════════════════════════════════════════════════════════════
// KELOLA ERP (DEMO) — Helper Functions
// Formatting, validation, security helpers
// ═══════════════════════════════════════════════════════════════════════════════

// ── Constants ────────────────────────────────────────────────────────────────
const TRILLION = 1_000_000_000_000;
const BILLION = 1_000_000_000;
const MILLION = 1_000_000;
const THOUSAND = 1_000;

// ── Security Helpers ─────────────────────────────────────────────────────────
export function escapeHtml(text) {
  if (text === null || text === undefined) {
    return '';
  }
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function sanitizeInput(value, type = 'text') {
  if (value === null || value === undefined) {
    return '';
  }

  switch (type) {
    case 'number': {
      const num = parseFloat(value);
      return isNaN(num) ? 0 : Math.max(0, num);
    }
    case 'text':
      return String(value).trim();
    case 'date': {
      const dateStr = String(value).trim();
      if (!dateStr) {
        return '';
      }

      // Check format YYYY-MM-DD
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
        return '';
      }

      // Validate it's a real date
      const date = new Date(dateStr + 'T00:00:00');
      if (isNaN(date.getTime())) {
        return '';
      }

      // Ensure the parsed date matches input
      const [year, month, day] = dateStr.split('-').map(Number);
      if (date.getFullYear() !== year || date.getMonth() + 1 !== month || date.getDate() !== day) {
        return '';
      }

      return dateStr;
    }
    default:
      return String(value).trim();
  }
}

// ── Formatting Helpers ───────────────────────────────────────────────────────
// Full Rupiah (no Md/jt abbreviation) so figures match Accurate's display exactly and
// are easy to compare. Use idrShort() if a compact form is ever needed.
export function idr(v) {
  const neg = v < 0;
  return `${neg ? '-' : ''}Rp ${Math.round(Math.abs(v || 0)).toLocaleString('id-ID')}`;
}

// Abbreviated form for tight spaces (mobile cards, summary lines).
// Tiers: T (triliun), M (miliar), jt (juta), rb (ribu). Indonesian decimal comma.
export function idrShort(v) {
  const n = Number(v);
  if (!Number.isFinite(n) || n === 0) {
    return 'Rp 0';
  }
  const neg = n < 0;
  const abs = Math.abs(n);
  const fmt = (value, decimals) => value.toFixed(decimals).replace('.', ',');
  let body;
  if (abs >= TRILLION) {
    body = `${fmt(abs / TRILLION, 2)} T`;
  } else if (abs >= BILLION) {
    body = `${fmt(abs / BILLION, 2)} M`;
  } else if (abs >= MILLION) {
    body = `${fmt(abs / MILLION, 0)} jt`;
  } else if (abs >= THOUSAND) {
    body = `${fmt(abs / THOUSAND, 0)} rb`;
  } else {
    body = `${Math.round(abs)}`;
  }
  return `${neg ? '-' : ''}Rp ${body}`;
}

export function idrFull(v) {
  const neg = v < 0;
  return `${neg ? '-' : ''}Rp ${Math.abs(v).toLocaleString('id-ID')}`;
}

export function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// ── Badge Helper ─────────────────────────────────────────────────────────────
export function badge(status) {
  const map = {
    Draft: { bg: '#F3F4F6', color: '#374151', label: 'Draft' },
    Confirmed: { bg: '#EFF6FF', color: '#1D4ED8', label: 'Dikonfirmasi' },
    Delivered: { bg: '#F0FDF4', color: '#166534', label: 'Terkirim' },
    Paid: { bg: '#DCFCE7', color: '#166534', label: 'Lunas' },
    Received: { bg: '#F0FDF4', color: '#166534', label: 'Diterima' },
    Outstanding: { bg: '#FEF3C7', color: '#92400E', label: 'Belum Lunas' },
    Posted: { bg: '#DBEAFE', color: '#1D4ED8', label: 'Diposting' },
    Pending: { bg: '#FFFBEB', color: '#92400E', label: 'Pending' },
    'In Transit': { bg: '#EFF6FF', color: '#1D4ED8', label: 'Dalam Pengiriman' },
    Low: { bg: '#FFF1F0', color: '#C0392B', label: 'Stok Rendah' },
    OK: { bg: '#F0FDF4', color: '#166534', label: 'Normal' },
    Maintenance: { bg: '#FDF4FF', color: '#6B21A8', label: 'Servis/Perbaikan' },
    Approved: { bg: '#D1FAE5', color: '#065F46', label: 'Disetujui' },
    Rejected: { bg: '#FEE2E2', color: '#991B1B', label: 'Ditolak' },
    'PO Dibuat': { bg: '#DBEAFE', color: '#1D4ED8', label: 'PO Dibuat' },
    Open: { bg: '#FFFBEB', color: '#92400E', label: 'Open' },
    Closed: { bg: '#F3F4F6', color: '#374151', label: 'Selesai' },
    Cancelled: { bg: '#FEE2E2', color: '#991B1B', label: 'Dibatalkan' },
    // Accurate order-processing statuses (SO/PO)
    'Waiting on Process': { bg: '#FFFBEB', color: '#92400E', label: 'Menunggu Proses' },
    'Partially Processed': { bg: '#EFF6FF', color: '#1D4ED8', label: 'Diproses Sebagian' },
    Processed: { bg: '#F0FDF4', color: '#166534', label: 'Diproses' },
    // Accurate delivery/invoicing statuses (DO)
    Sent: { bg: '#EFF6FF', color: '#1D4ED8', label: 'Terkirim' },
    Invoiced: { bg: '#DCFCE7', color: '#166534', label: 'Difakturkan' },
    'Partially invoiced': { bg: '#FEF3C7', color: '#92400E', label: 'Faktur Sebagian' },
  };
  const s = map[status] || map.Draft;
  return `<span class="badge" style="background:${s.bg};color:${s.color}">${escapeHtml(s.label)}</span>`;
}

// ── UI Helpers ───────────────────────────────────────────────────────────────
export function secHdr(title, sub, btnLabel, btnAction) {
  return `<div class="sec-hdr">
    <div>
      <h1>${escapeHtml(title)}</h1>
      ${sub ? `<p>${escapeHtml(sub)}</p>` : ''}
    </div>
    ${
      btnLabel
        ? `<button class="btn" data-action="${btnAction || ''}">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
      </svg> ${escapeHtml(btnLabel)}
    </button>`
        : ''
    }
  </div>`;
}

export function statRow(items) {
  return `<div class="stat-row" style="grid-template-columns:repeat(${items.length},1fr)">
    ${items
      .map(
        s => `<div class="card stat-card">
      <div class="stat-label">${escapeHtml(s.label)}</div>
      <div class="stat-val" style="color:${s.color || 'var(--text)'}">${escapeHtml(s.value)}</div>
      <div class="stat-sub">${escapeHtml(s.sub)}</div>
    </div>`
      )
      .join('')}
  </div>`;
}

export function tblHdr(cols) {
  return `<thead><tr>${cols.map(c => `<th>${escapeHtml(c)}</th>`).join('')}</tr></thead>`;
}

export function actionBtns(type, id) {
  return `<div style="display:flex;gap:6px;justify-content:center">
    <button data-action="edit${type}" data-id="${escapeHtml(id)}" title="Edit" style="display:inline-flex;align-items:center;justify-content:center;gap:4px;padding:6px 12px;background:transparent;border:1px solid var(--primary);border-radius:6px;cursor:pointer;color:var(--primary);font-size:12px;font-weight:600;transition:all .2s ease;font-family:inherit" onmouseover="this.style.background='var(--primary)';this.style.color='#fff'" onmouseout="this.style.background='transparent';this.style.color='var(--primary)'">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
      </svg>
      Edit
    </button>
  </div>`;
}

export function detailRow(label, value) {
  return `<div class="detail-item">
    <div class="detail-label">${escapeHtml(label)}</div>
    <div class="detail-value">${value}</div>
  </div>`;
}

// ── ID Generation ────────────────────────────────────────────────────────────
export function nextId(prefix, arr, field) {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const base = prefix.split(/[-.]/)[0];
  const prefixWithYM = `${base}.${year}.${month}`;

  let max = 0;
  arr.forEach(item => {
    const id = String(item[field || 'id']);
    if (!id.startsWith(prefixWithYM + '.')) {
      return;
    }
    const parts = id.split('.');
    const n = parseInt(parts[parts.length - 1], 10);
    if (!isNaN(n) && n > max) {
      max = n;
    }
  });

  const existingIds = new Set(arr.map(item => String(item[field || 'id'])));
  let candidate;
  do {
    max++;
    candidate = `${prefixWithYM}.${String(max).padStart(3, '0')}`;
  } while (existingIds.has(candidate));

  return candidate;
}

// Active per-view filter state. Lives in erp-core.js (not loaded), so the
// render functions in erp-view.js (sales/purchase/inventory/logistics) would
// throw "filters is not defined" without this. Seed it here, before those
// classic scripts run.
if (typeof window.filters === 'undefined') {
  window.filters = { sales: 'all', purchase: 'all', inventory: 'all', logistics: 'all' };
}

// Make helpers globally available
window.escapeHtml = escapeHtml;
window.sanitizeInput = sanitizeInput;
window.idr = idr;
window.idrFull = idrFull;
window.idrShort = idrShort;
window.today = today;
window.badge = badge;
window.secHdr = secHdr;
window.statRow = statRow;
window.tblHdr = tblHdr;
window.actionBtns = actionBtns;
window.detailRow = detailRow;
window.nextId = nextId;
