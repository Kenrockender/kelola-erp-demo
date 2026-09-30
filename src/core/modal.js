// ═══════════════════════════════════════════════════════════════════════════════
// KELOLA ERP (DEMO) — Modal System
// Modal dialogs and toast notifications
// ═══════════════════════════════════════════════════════════════════════════════

import { escapeHtml } from './helpers.js';

let modalEl = null;

/**
 * Ensure modal element exists
 */
function ensureModal() {
  if (modalEl) {
    return;
  }
  modalEl = document.createElement('div');
  modalEl.className = 'modal-overlay';
  modalEl.id = 'modalOverlay';
  document.body.appendChild(modalEl);

  modalEl.addEventListener('click', e => {
    if (e.target === modalEl) {
      closeModal();
    }
  });

  // Toast container
  const tw = document.createElement('div');
  tw.className = 'toast-wrap';
  tw.id = 'toastWrap';
  document.body.appendChild(tw);
}

/**
 * Open modal dialog
 */
export function openModal(title, bodyHtml, footerHtml, wide) {
  ensureModal();
  const safeTitle = escapeHtml(title);
  modalEl.innerHTML = `<div class="modal${wide ? ' wide' : ''}" role="dialog" aria-labelledby="modalTitle" aria-modal="true">
    <div class="modal-header">
      <h2 id="modalTitle">${safeTitle}</h2>
      <button class="modal-close" data-action="closeModal" aria-label="Tutup modal">×</button>
    </div>
    <div class="modal-body">${bodyHtml}</div>
    ${footerHtml ? `<div class="modal-footer">${footerHtml}</div>` : ''}
  </div>`;
  requestAnimationFrame(() => {
    modalEl.classList.add('active');
    const firstInput = modalEl.querySelector('input, select, textarea, button');
    if (firstInput) {
      firstInput.focus();
    }
  });
}

/**
 * Close modal dialog
 */
export function closeModal() {
  if (!modalEl) {
    return;
  }
  modalEl.classList.remove('active');
  setTimeout(() => {
    modalEl.innerHTML = '';
  }, 250);
}

// Feather-style toast icons per type (24×24 viewBox, stroke = theme token).
const TOAST_ICONS = {
  success: ['<polyline points="20 6 9 17 4 12"/>', 'var(--success)'],
  danger: [
    '<circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>',
    'var(--danger)',
  ],
  warning: [
    '<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>',
    'var(--warning)',
  ],
  info: [
    '<circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>',
    'var(--info)',
  ],
};

/** SVG icon element for a toast type (null for unknown/default type). */
function toastIcon(type) {
  const def = TOAST_ICONS[type];
  if (!def) {
    return null;
  }
  const span = document.createElement('span');
  span.style.cssText = 'display:flex;align-items:center;flex-shrink:0';
  span.setAttribute('aria-hidden', 'true');
  span.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="${def[1]}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">${def[0]}</svg>`;
  return span;
}

/**
 * Show toast notification
 */
export function showToast(msg, type) {
  ensureModal();
  const wrap = document.getElementById('toastWrap');
  const t = document.createElement('div');
  t.className = `toast ${type || ''}`;
  t.setAttribute('role', 'alert');
  const icon = toastIcon(type);
  if (icon) {
    t.appendChild(icon);
  }
  const text = document.createElement('span');
  text.textContent = msg;
  t.appendChild(text);
  wrap.appendChild(t);
  setTimeout(() => t.remove(), 3200);
}

/**
 * Show undo toast with callback
 */
export function showUndoToast(msg, onUndo, duration) {
  ensureModal();
  const wrap = document.getElementById('toastWrap');
  const t = document.createElement('div');
  t.className = 'toast danger';
  t.setAttribute('role', 'alert');
  t.style.cssText = 'display:flex;align-items:center;gap:12px;justify-content:space-between';

  const icon = toastIcon('danger');
  if (icon) {
    t.appendChild(icon);
  }

  const span = document.createElement('span');
  span.textContent = msg;
  span.style.flex = '1';

  const btn = document.createElement('button');
  btn.textContent = 'Undo';
  btn.style.cssText = [
    'background:rgba(255,255,255,0.25)',
    'border:1px solid rgba(255,255,255,0.5)',
    'color:#fff',
    'border-radius:5px',
    'padding:2px 10px',
    'font-size:11px',
    'font-weight:700',
    'cursor:pointer',
    'white-space:nowrap',
    'flex-shrink:0',
  ].join(';');

  t.appendChild(span);
  t.appendChild(btn);
  wrap.appendChild(t);

  const timer = setTimeout(() => t.remove(), duration || 4500);

  btn.addEventListener('click', () => {
    clearTimeout(timer);
    t.remove();
    onUndo();
  });
}

/**
 * Confirm dialog
 */
export function confirmDialog(title, msg, onConfirm) {
  openModal(
    title,
    `<div class="confirm-body">
      <div class="confirm-icon">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#FF3B30" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
        </svg>
      </div>
      <p>${escapeHtml(msg)}</p>
    </div>`,
    `<button class="btn-ghost" data-action="closeModal">Batal</button>
     <button class="btn-danger" id="confirmBtn">Hapus</button>`
  );
  setTimeout(() => {
    const btn = document.getElementById('confirmBtn');
    if (btn) {
      btn.addEventListener('click', () => {
        onConfirm();
        closeModal();
      });
    }
  }, 50);
}

// Make functions globally available
window.openModal = openModal;
window.closeModal = closeModal;
window.showToast = showToast;
window.showUndoToast = showUndoToast;
window.confirmDialog = confirmDialog;
