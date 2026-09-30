/* eslint-disable no-console -- app boot sequence is traced to the console by design */
// Import core modules
import {
  initAuth,
  resetSessionTimer,
  logout,
  changePassword,
  getCurrentUser,
  setupLoginScreen,
  getAuthMode,
  isEmailVerified,
  resendVerification,
  reloadVerification,
  is2FAEnabled,
  get2FAStatus,
  begin2FAEnrollment,
  enable2FA,
  disable2FA,
  regenerateBackupCodes,
} from './core/auth.js';
import { showToast } from './core/modal.js';
import {
  initBackup,
  exportToFile,
  importFromFile,
  getBackupList,
  restoreFromBackup,
  getBackupStatus,
  forceBackup,
} from './core/backup.js';
import { loadDB } from './core/db.js';
import {
  resolveUserRole,
  listUsers,
  setUserRole,
  createUser,
  resetUserPassword,
  removeUser,
  listAccessLog,
  ROLES,
  ROLE_LABELS,
} from './core/user-role.js';
import { getLoginLog, clearLoginLog } from './core/local-users.js';
import { initMobileEnhancements, triggerHaptic, getDeviceType } from './mobile-enhancements.js';

// Import new v3.0 features
import { idb } from './core/indexeddb.js';
import { initIntersectionObservers } from './core/intersection-observer.js';
import { supportsViewTransitions, setupViewTransitionNames } from './core/view-transitions.js';
import { performanceMonitor } from './core/performance-monitor.js';

// Import helpers
import './core/helpers.js';
import './core/stock.js';

// SheetJS (xlsx) — exposed on window for the classic-layer "Import dari Excel"
// feature (public/classic/core/excel-import.js). The classic bundle is plain
// IIFE concatenation with no module system, so the parser is bridged via window.
// Uses the maintained @e965/xlsx fork (same API) — the stock npm `xlsx@0.18.5` is
// frozen with unpatched Prototype-Pollution + ReDoS advisories.
import * as XLSX from '@e965/xlsx';
if (typeof window !== 'undefined') {
  window.XLSX = XLSX;
}

// Notification scheduler
import { initNotifications } from './core/notifications.js';

// i18n (Indonesian ⇄ English) — a DOM-sweep translator. Started before the
// classic bundle renders so the MutationObserver catches every view. Exposes
// window.I18N for the nav language toggle.
import { initI18n } from './core/i18n.js';
initI18n();

// PWA: service worker (offline cache) + install-prompt capture (window.erpPwa,
// consumed by the "Install Aplikasi" card in Pengaturan). Importing the module
// installs the beforeinstallprompt listener as a side effect.
import { registerServiceWorker } from './pwa-register.js';
registerServiceWorker();

// Classic modules migrated to ES modules — must run before classic/bundle.js
import './classic/core/doc-registry.js';

// Chart.js from npm — exposes window.Chart so classic scripts can use `new Chart(...)`.
// chart.js/auto auto-registers all built-in controllers, elements, scales, and plugins.
import Chart from 'chart.js/auto';
window.Chart = Chart;

// Make functions globally available
window.erpAuth = {
  logout,
  changePassword,
  getCurrentUser,
  resetSessionTimer,
  getAuthMode,
  isEmailVerified,
  resendVerification,
  reloadVerification,
  // Two-factor (TOTP) — consumed by the settings 2FA UI.
  is2FAEnabled,
  get2FAStatus,
  begin2FAEnrollment,
  enable2FA,
  disable2FA,
  regenerateBackupCodes,
};
window.erpBackup = {
  exportToFile,
  importFromFile,
  getBackupList,
  restoreFromBackup,
  getBackupStatus,
  forceBackup,
};
window.erpMobile = { triggerHaptic, getDeviceType };

// User management (admin-only at the rules layer). Exposed so the classic
// settings module can render the User Management screen. window.__ERP_USER is
// populated during startApp() once the role has been resolved.
window.erpUsers = {
  list: listUsers,
  setRole: setUserRole,
  create: createUser,
  resetPassword: resetUserPassword,
  remove: removeUser,
  roles: ROLES,
  roleLabels: ROLE_LABELS,
  loginLog: getLoginLog,
  clearLoginLog,
  accessLog: listAccessLog,
};

// Make v3.0 features globally available
window.erpV3 = {
  idb,
  performanceMonitor,
  supportsViewTransitions: supportsViewTransitions(),
};

// Performance mark - app start
performanceMonitor.mark('app-init-start');

// Initialize mobile enhancements
initMobileEnhancements();

// Initialize IndexedDB
console.log('[ERP v3.0] Initializing IndexedDB...');
await idb.init().catch(err => {
  console.warn('[ERP v3.0] IndexedDB initialization failed:', err);
});

// Setup View Transitions
if (supportsViewTransitions()) {
  console.log('[ERP v3.0] View Transitions API supported');
  setupViewTransitionNames();
} else {
  console.log('[ERP v3.0] View Transitions API not supported, using fallback');
}

// Initialize Intersection Observers
console.log('[ERP v3.0] Setting up Intersection Observers...');
initIntersectionObservers();

function loadClassicScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.async = false;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(`Failed to load script: ${src}`));
    document.head.appendChild(s);
  });
}

// Initialize authentication first
let isAuthenticated = false;
try {
  isAuthenticated = await initAuth();
} catch (e) {
  console.warn('[ERP] Auth init failed, continuing without auth:', e);
}

if (!isAuthenticated) {
  // Not logged in — show the login screen and stop. The app boots after a
  // successful login (which reloads the page).
  console.log('[ERP] Not authenticated — showing login screen');
  setupLoginScreen();
} else {
  await startApp();
}

async function startApp() {
  // Show the app container
  const appContainer = document.getElementById('app-container');
  if (appContainer) {
    appContainer.style.display = '';
  }

  // Hide login screen from index.html
  const loginScreen = document.getElementById('login-screen');
  if (loginScreen) {
    loginScreen.style.display = 'none';
  }

  // Business data loads from Firestore (auth-gated). The GL seed (Accurate
  // journals + chart of accounts) is read from the glSeed collection by
  // db.js loadGlSeed(). The old public accurate-data.json was removed — Vercel
  // served it without auth, exposing the full financials.

  // Load database (use defaults if Firestore unavailable)
  try {
    await loadDB();
  } catch (e) {
    console.warn('[ERP] loadDB failed, using default data:', e);
  }

  // Resolve the active user's RBAC role BEFORE the classic bundle (rbac.js)
  // loads, so menu/button gating and the saveDB safety net have a role to work
  // with from the first render. Never blocks boot — degrades to a safe role.
  try {
    window.__ERP_USER = await resolveUserRole();
    console.log('[ERP] Active role:', window.__ERP_USER.role, `(${window.__ERP_USER.source})`);
  } catch (e) {
    console.warn('[ERP] role resolution failed:', e);
    window.__ERP_USER = { role: 'viewer', active: true, mode: 'local', source: 'error' };
  }

  // Sync with IndexedDB for offline support
  console.log('[ERP v3.0] Syncing data to IndexedDB...');
  try {
    const syncStatus = await idb.getSyncStatus();
    console.log('[ERP v3.0] Sync status:', syncStatus);
  } catch (err) {
    console.warn('[ERP v3.0] IndexedDB sync failed:', err);
  }

  // Initialize backup system
  try {
    initBackup();
  } catch (e) {
    console.warn('[ERP] Backup init failed:', e);
  }

  // Performance mark - data loaded
  performanceMonitor.mark('data-loaded');
  performanceMonitor.measure('data-load-time', 'app-init-start', 'data-loaded');

  // Set up activity tracking for session timeout
  ['mousedown', 'keydown', 'scroll', 'touchstart'].forEach(event => {
    document.addEventListener(event, resetSessionTimer, { passive: true });
  });

  // Load all classic scripts as a single pre-concatenated bundle (served by the
  // Vite dev middleware in development, emitted as a minified asset in production).
  // window.Chart is already set from the npm import above.
  try {
    await loadClassicScript('/classic/bundle.js');

    // Performance mark - app ready
    performanceMonitor.mark('app-ready');
    performanceMonitor.measure('total-init-time', 'app-init-start', 'app-ready');

    // Navigate to the landing view on initial load. The `lapangan` (field) role
    // has no dashboard — its account exists only to record surat jalan, so it
    // lands straight on that form instead of an empty, permission-denied page.
    if (typeof navigate === 'function') {
      const landing = window.RBAC?.landingView?.() || 'dashboard';
      navigate(landing);
    }

    // Cloud sync requires a verified email to write (Firestore rules). Nudge the
    // user with a banner if they're signed in via Firebase but not yet verified.
    maybeShowVerifyBanner();

    // Start notification scheduler (checks overdue invoices + low stock)
    initNotifications();

    console.log('[ERP v3.0] Application loaded successfully');
    console.log('[ERP v3.0] Features enabled:', {
      viewTransitions: supportsViewTransitions(),
      indexedDB: !!window.indexedDB,
      serviceWorker: 'serviceWorker' in navigator,
      intersectionObserver: 'IntersectionObserver' in window,
      webWorkers: typeof Worker !== 'undefined',
    });

    // Log performance report after 3 seconds
    setTimeout(() => {
      performanceMonitor.logReport();
    }, 3000);
  } catch (err) {
    const el = document.getElementById('view-dashboard');
    if (el) {
      el.innerHTML = `
      <div style="padding:24px;background:#FFF1F0;border:1px solid #FFD8D3;border-radius:12px">
        <div style="font-size:16px;font-weight:800;color:#B42318;margin-bottom:8px">Gagal memuat aplikasi</div>
        <div style="font-size:13px;color:#912018;font-family:monospace;white-space:pre-wrap">${String(err?.stack || err?.message || err)}</div>
      </div>
    `;
    }
  }
}

/**
 * Show a dismissible banner when the user is signed in via Firebase but hasn't
 * verified their email. Firestore security rules block all writes until the
 * email is verified, so without this the app silently fails to save to the cloud.
 * Offers "resend link" and "I've verified" (re-check) actions.
 */
function maybeShowVerifyBanner() {
  try {
    if (getAuthMode() !== 'firebase' || isEmailVerified()) {
      return;
    }
    if (document.getElementById('verify-banner')) {
      return;
    }

    const bar = document.createElement('div');
    bar.id = 'verify-banner';
    bar.setAttribute('role', 'alert');
    bar.style.cssText =
      'position:fixed;left:0;right:0;bottom:0;z-index:9999;background:#FEF3C7;color:#92400E;' +
      'border-top:1px solid #FCD34D;padding:10px 16px;display:flex;gap:12px;align-items:center;' +
      'flex-wrap:wrap;font-size:13px;box-shadow:0 -2px 8px rgba(0,0,0,.08)';

    const user = getCurrentUser();
    const email = (user && user.email) || 'akun ini';
    bar.innerHTML =
      `<span style="flex:1;min-width:200px">⚠️ Email <strong>${email}</strong> belum diverifikasi. ` +
      `Sinkronisasi cloud tidak akan menyimpan data sampai email diverifikasi.</span>` +
      `<button id="verify-resend" style="cursor:pointer;border:0;border-radius:8px;padding:7px 12px;` +
      `font-weight:700;background:#92400E;color:#fff">Kirim ulang email</button>` +
      `<button id="verify-recheck" style="cursor:pointer;border:1px solid #92400E;border-radius:8px;` +
      `padding:7px 12px;font-weight:700;background:transparent;color:#92400E">Saya sudah verifikasi</button>`;
    document.body.appendChild(bar);

    bar.querySelector('#verify-resend').addEventListener('click', async () => {
      try {
        await resendVerification();
        showToast('Email verifikasi terkirim. Cek kotak masuk (dan folder spam).', 'success');
      } catch (e) {
        showToast(e?.message || 'Gagal mengirim email verifikasi', 'danger');
      }
    });

    bar.querySelector('#verify-recheck').addEventListener('click', async () => {
      const verified = await reloadVerification();
      if (verified) {
        bar.remove();
        showToast('Email terverifikasi — sinkronisasi cloud aktif.', 'success');
      } else {
        showToast('Email masih belum terverifikasi. Klik link di email lalu coba lagi.', 'warning');
      }
    });
  } catch (e) {
    console.warn('[ERP] verify banner failed:', e);
  }
}
