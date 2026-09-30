// ═══════════════════════════════════════════════════════════════════════════════
// KELOLA ERP (DEMO) — Authentication Module (Firebase Auth + local fallback)
// Primary: Firebase Authentication (email/password) — populates request.auth so
// Firestore security rules pass and multi-device sync works.
// Fallback: the original PBKDF2/localStorage auth, used automatically when
// Firebase is not configured or Firebase Auth is unreachable (offline PWA, or
// before the Email/Password provider is enabled in the console). This keeps the
// app usable and prevents lock-out during/after the migration.
// ═══════════════════════════════════════════════════════════════════════════════

import {
  signInWithCustomToken,
  sendEmailVerification,
  signOut,
  onAuthStateChanged,
} from 'firebase/auth';
import { httpsCallable } from 'firebase/functions';
import {
  auth as fbAuth,
  functions as fbFunctions,
  isFirebaseConfigured,
} from '../config/firebase.js';
import {
  ensureUsers,
  verifyUser,
  setUserPassword,
  recordLoginEvent,
  getUserTwoFactor,
  userHasTwoFactor,
  saveUserTwoFactor,
  hashBackupCode,
  randomSalt,
} from './local-users.js';
import { generateSecret, verifyTOTP, otpauthURL } from './totp.js';

// Number of one-time backup codes issued when 2FA is enabled.
const BACKUP_CODE_COUNT = 8;
// Holds a password-verified user awaiting their second factor (login step 2).
let _pending2FA = null;

// Use Firebase Auth when credentials are present and the SDK initialised.
const _useFirebase = isFirebaseConfigured && !!fbAuth;
// Tracks which path authenticated the active session: 'firebase' | 'local'.
let _activeMode = null;

// Resolve the first auth-state callback (the persisted user on reload), with a
// safety timeout so boot never hangs if the SDK stalls.
function firstAuthState() {
  return new Promise(resolve => {
    let done = false;
    const finish = v => {
      if (done) {
        return;
      }
      done = true;
      resolve(v);
    };
    try {
      const unsub = onAuthStateChanged(
        fbAuth,
        u => {
          try {
            unsub();
          } catch (_) {
            /* ignore */
          }
          finish(u);
        },
        () => finish(null)
      );
    } catch (_) {
      finish(null);
    }
    setTimeout(() => finish(fbAuth && fbAuth.currentUser ? fbAuth.currentUser : null), 5000);
  });
}

// Session timeout (30 minutes of inactivity)
const SESSION_TIMEOUT = 30 * 60 * 1000;
const SESSION_KEY = 'erp_session';
// Set once an online (Firebase custom-token) login has succeeded on this device.
// After that, the untouched default local account is a backdoor and is refused.
const FB_SEEN_KEY = 'erp_fb_login_seen';

// First-run default login (username-based local auth). Each seeded user's
// password is "<username>123" (see local-users.js). Shown as a hint on the
// login screen until the password is changed.
const DEFAULT_USERNAME = 'admin';

let sessionTimer = null;
let currentUser = null;

// ── Session ──────────────────────────────────────────────────────────────────
function getSession() {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (raw) {
      return JSON.parse(raw);
    }
  } catch (_) {
    /* ignore */
  }
  return null;
}

function isSessionValid(s) {
  return Boolean(s) && Date.now() - (s.lastActivity || 0) <= SESSION_TIMEOUT;
}

function createSession(u) {
  const s = {
    username: u.username,
    displayName: u.displayName || u.username,
    role: u.role || 'admin',
    mustChangePassword: !!u.mustChangePassword,
    loginTime: Date.now(),
    lastActivity: Date.now(),
  };
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(s));
}

function clearSession() {
  sessionStorage.removeItem(SESSION_KEY);
}

function userFromSession(s) {
  const username = s.username || 'user';
  return {
    uid: username,
    // email mirrors username so existing display/role code keeps working without
    // an actual email address (full local auth — no email).
    email: username,
    username,
    displayName: s.displayName || username,
    role: s.role || 'admin',
    mustChangePassword: !!s.mustChangePassword,
  };
}

function startSessionTimer() {
  if (sessionTimer) {
    clearTimeout(sessionTimer);
  }
  sessionTimer = setTimeout(() => {
    logout('Sesi Anda telah berakhir karena tidak aktif. Silakan login kembali.');
  }, SESSION_TIMEOUT);
}

// Reset session timer on activity (called from main.js activity listeners)
export function resetSessionTimer() {
  if (!currentUser) {
    return;
  }
  const s = getSession();
  if (s) {
    s.lastActivity = Date.now();
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(s));
  }
  startSessionTimer();
}

// ── Public API ─────────────────────────────────────────────────────────────────
/**
 * Initialize auth. Returns true when a valid session exists (user stays logged
 * in), false when login is required.
 */
export async function initAuth() {
  await ensureUsers(); // seed the default accounts on first run

  // Full local auth (username/password). A valid local session keeps the user
  // logged in across reloads.
  const s = getSession();
  if (isSessionValid(s)) {
    currentUser = userFromSession(s);
    startSessionTimer();
    // Restore the persisted Firebase custom-token session (if any) BEFORE the app
    // loads data, so loadDB() reads Firestore with request.auth set (online)
    // instead of racing an unauthenticated read into the local fallback.
    if (_useFirebase) {
      const fbUser = await firstAuthState();
      _activeMode = fbUser ? 'firebase' : 'local';
    } else {
      _activeMode = 'local';
    }
    return true;
  }
  clearSession();
  return false;
}

/**
 * Authenticate with Firebase Auth, transparently falling back to local auth when
 * Firebase is unavailable. Returns { ok, mode, msg }.
 *
 * SECURITY: there is intentionally NO self-service account creation here. The
 * old first-run bootstrap (auto-creating admin@kelola.example when someone typed the
 * default credentials) let any visitor on the public deployment mint a Firebase
 * account with write access. Firebase accounts must be created from the
 * Firebase Console / Admin SDK.
 */
// Cloud Functions error codes that mean "the server rejected these credentials"
// (or the account can't log in via cloud) — surface the message, do NOT fall
// back to local auth (which could accept a stale local password).
const _AUTH_DENY_CODES = new Set([
  'functions/unauthenticated', // wrong username/password
  'functions/permission-denied',
  'functions/failed-precondition', // e.g. 2FA account (not yet supported in cloud)
  'functions/invalid-argument',
]);

// Verify credentials on the server (Cloud Function). Returns either the token
// payload { token, mustChangePassword, role } or { twoFactor: true } when the
// account needs a second factor. Does NOT sign in — the caller decides, so the
// 2FA challenge can be shown before a session is created. Throws the FirebaseError
// on failure so callers can distinguish "rejected" from "unreachable".
async function serverLogin(username, password, totp) {
  const payload = { username, password };
  if (totp) {
    payload.totp = totp;
  }
  const { data } = await httpsCallable(fbFunctions, 'loginWithUsername')(payload);
  return data;
}

// True when 2FA management should go through the server (Firebase session).
function twoFactorOnServer() {
  return _activeMode === 'firebase' && _useFirebase && !!fbFunctions;
}

// Invoke a 2FA callable, surfacing its (Indonesian) HttpsError message as a
// plain Error so the settings UI can show it verbatim.
async function call2FA(name, payload) {
  try {
    const { data } = await httpsCallable(fbFunctions, name)(payload || {});
    return data;
  } catch (e) {
    throw new Error((e && e.message) || 'Operasi 2FA gagal', { cause: e });
  }
}

// Create the app session for a server-authenticated user (Firebase custom token).
function finishServerLogin(username, data) {
  const u = {
    username: String(username).trim().toLowerCase(),
    displayName: String(username).trim(),
    role: data.role || 'viewer',
    mustChangePassword: !!data.mustChangePassword,
  };
  currentUser = userFromSession(u);
  createSession(u);
  _activeMode = 'firebase';
  try {
    localStorage.setItem(FB_SEEN_KEY, '1');
  } catch (_) {
    /* ignore */
  }
  startSessionTimer();
  recordLoginEvent(u.username, u.displayName, 'login', 'firebase');
}

export async function login(username, password) {
  // Prefer server auth (Firebase custom token) so the session is online on every
  // device. Fall back to the local store only when the server is unreachable.
  if (_useFirebase && fbFunctions) {
    try {
      const data = await serverLogin(username, password);
      if (data && data.twoFactor) {
        // Password accepted; hold the credentials to complete step 2 server-side.
        _pending2FA = { firebase: true, username, password };
        return { ok: false, twoFactor: true, username };
      }
      await signInWithCustomToken(fbAuth, data.token);
      finishServerLogin(username, data);
      return { ok: true, mode: 'firebase' };
    } catch (e) {
      const code = e && e.code;
      if (_AUTH_DENY_CODES.has(code)) {
        return { ok: false, msg: (e && e.message) || 'Username atau password salah' };
      }
      // Offline / unavailable / internal → degrade to local auth so the app
      // still works (mode 'local'); the badge will read "Lokal" until online.
      console.warn(
        '[Auth] Server login unavailable, falling back to local:',
        code || (e && e.message)
      );
    }
  }
  return localLogin(username, password);
}

async function localLogin(username, password) {
  const u = await verifyUser(username, password);
  if (!u) {
    return { ok: false, msg: 'Username atau password salah' };
  }
  // Once an online login has succeeded on this device, an untouched default
  // account (still flagged mustChangePassword) is a backdoor — refuse it. A
  // local account whose password was changed keeps working offline.
  let fbSeen = false;
  try {
    fbSeen = localStorage.getItem(FB_SEEN_KEY) === '1';
  } catch (_) {
    /* ignore */
  }
  if (fbSeen && u.mustChangePassword) {
    return {
      ok: false,
      msg: 'Login default lokal dinonaktifkan di perangkat ini — gunakan akun cloud Anda.',
    };
  }
  // Second factor: when the account has 2FA switched on, hold the verified
  // identity and require a TOTP/backup code before creating the session.
  if (userHasTwoFactor(u.username)) {
    _pending2FA = { user: u };
    return { ok: false, twoFactor: true, username: u.username };
  }
  finishLocalLogin(u);
  return { ok: true, mode: 'local' };
}

// Create the session for an already-verified local user (post-password and, when
// applicable, post-2FA).
function finishLocalLogin(u) {
  currentUser = userFromSession(u);
  createSession(u);
  _activeMode = 'local';
  recordLoginEvent(u.username, u.displayName, 'login', 'local');
}

// ── Two-factor (TOTP) ──────────────────────────────────────────────────────────
// 2FA config lives on each local user record (local-users.js):
//   twoFactor = { enabled, secret, backupCodes: [{ salt, hash, used }] }
// This gates the app UI after a correct password. See src/core/totp.js for the
// threat-model note.

// Verify a submitted value as EITHER a valid TOTP code OR an unused backup code.
// A matched backup code is burned (marked used) so it can't be reused.
async function verifySecondFactorValue(username, value) {
  const tf = getUserTwoFactor(username);
  if (!tf || !tf.secret) {
    return false;
  }
  if (await verifyTOTP(tf.secret, value)) {
    return true;
  }
  const codes = tf.backupCodes || [];
  for (const entry of codes) {
    if (entry.used) {
      continue;
    }
    const hash = await hashBackupCode(value, entry.salt);
    if (hash === entry.hash) {
      entry.used = true;
      saveUserTwoFactor(username, tf);
      return true;
    }
  }
  return false;
}

/**
 * Complete a login's second factor for the user held from the password step.
 * Returns { ok, msg }. On success the local session is created.
 */
export async function completeSecondFactor(token) {
  // Server (Firebase) path: re-call the login function with the 2FA code, which
  // verifies it server-side and returns the token on success.
  if (_pending2FA && _pending2FA.firebase) {
    const { username, password } = _pending2FA;
    try {
      const data = await serverLogin(username, password, token);
      if (!data || data.twoFactor || !data.token) {
        return { ok: false, msg: 'Kode 2FA salah atau sudah dipakai' };
      }
      await signInWithCustomToken(fbAuth, data.token);
      _pending2FA = null;
      finishServerLogin(username, data);
      return { ok: true };
    } catch (e) {
      return { ok: false, msg: (e && e.message) || 'Kode 2FA salah atau sudah dipakai' };
    }
  }
  if (!_pending2FA || !_pending2FA.user) {
    return { ok: false, msg: 'Tidak ada proses login yang menunggu verifikasi 2FA' };
  }
  const u = _pending2FA.user;
  const ok = await verifySecondFactorValue(u.username, token);
  if (!ok) {
    return { ok: false, msg: 'Kode 2FA salah atau sudah dipakai' };
  }
  _pending2FA = null;
  finishLocalLogin(u);
  return { ok: true };
}

/** Whether a second factor is pending (password accepted, awaiting 2FA code). */
export function isAwaitingSecondFactor() {
  return !!_pending2FA;
}

/** Discard a pending second factor (e.g. the user backs out of the 2FA step). */
export function cancelSecondFactor() {
  _pending2FA = null;
}

/**
 * True when the signed-in user has 2FA switched on. Synchronous — for the
 * server (Firebase) session it reflects the cached login flag; the settings UI
 * uses the async get2FAStatus() for the authoritative enroll/manage decision.
 */
export function is2FAEnabled() {
  if (twoFactorOnServer()) {
    return !!(currentUser && currentUser.twoFactorEnabled);
  }
  return !!(currentUser && userHasTwoFactor(currentUser.username));
}

/** Status snapshot for the settings UI. Async: cloud mode queries the server. */
export async function get2FAStatus() {
  if (twoFactorOnServer()) {
    try {
      const data = await call2FA('get2FAStatus', {});
      if (currentUser) {
        currentUser.twoFactorEnabled = !!data.enabled;
      }
      return {
        enabled: !!data.enabled,
        backupCodesRemaining: data.backupCodesRemaining || 0,
      };
    } catch (_) {
      return { enabled: false, backupCodesRemaining: 0 };
    }
  }
  const tf = currentUser ? getUserTwoFactor(currentUser.username) : null;
  return {
    enabled: !!(tf && tf.enabled),
    backupCodesRemaining: tf && tf.backupCodes ? tf.backupCodes.filter(c => !c.used).length : 0,
  };
}

/** Start enrollment: returns a fresh secret + otpauth:// URL (encode into a QR). */
export function begin2FAEnrollment() {
  const secret = generateSecret();
  const account = (currentUser && currentUser.username) || 'admin';
  return { secret, otpauthUrl: otpauthURL(secret, { issuer: 'Kelola ERP', account }) };
}

function newBackupCodes(n = BACKUP_CODE_COUNT) {
  const codes = [];
  for (let i = 0; i < n; i++) {
    const a = new Uint8Array(5);
    crypto.getRandomValues(a);
    const hex = [...a]
      .map(b => b.toString(16).padStart(2, '0'))
      .join('')
      .toUpperCase();
    codes.push(hex.slice(0, 5) + '-' + hex.slice(5, 10)); // XXXXX-XXXXX
  }
  return codes;
}

async function encodeBackupCodes(plainCodes) {
  return Promise.all(
    plainCodes.map(async code => {
      const salt = randomSalt();
      return { salt, hash: await hashBackupCode(code, salt), used: false };
    })
  );
}

/**
 * Finish enrollment: verify a live TOTP for `secret`, then switch 2FA on and
 * issue one-time backup codes. Returns { backupCodes } (shown once).
 */
export async function enable2FA(secret, token) {
  if (!currentUser || !currentUser.username) {
    throw new Error('Tidak ada sesi aktif');
  }
  if (twoFactorOnServer()) {
    const data = await call2FA('enable2FA', { secret, token });
    currentUser.twoFactorEnabled = true;
    return { backupCodes: data.backupCodes };
  }
  if (!(await verifyTOTP(secret, token))) {
    throw new Error('Kode salah — pastikan jam perangkat & authenticator sinkron.');
  }
  const plainCodes = newBackupCodes();
  saveUserTwoFactor(currentUser.username, {
    enabled: true,
    secret,
    backupCodes: await encodeBackupCodes(plainCodes),
  });
  return { backupCodes: plainCodes };
}

/** Turn 2FA off. Requires the current password OR a valid 2FA/backup code. */
export async function disable2FA(confirmValue) {
  if (!currentUser || !currentUser.username) {
    throw new Error('Tidak ada sesi aktif');
  }
  if (twoFactorOnServer()) {
    await call2FA('disable2FA', { confirm: confirmValue });
    currentUser.twoFactorEnabled = false;
    return true;
  }
  const okPassword = !!(await verifyUser(currentUser.username, confirmValue || ''));
  const ok2fa = !okPassword && (await verifySecondFactorValue(currentUser.username, confirmValue));
  if (!okPassword && !ok2fa) {
    throw new Error('Konfirmasi salah — masukkan password atau kode 2FA yang benar.');
  }
  saveUserTwoFactor(currentUser.username, null);
  return true;
}

/** Issue a new batch of backup codes (invalidates the old ones). Returns them. */
export async function regenerateBackupCodes() {
  if (!currentUser || !currentUser.username) {
    throw new Error('Tidak ada sesi aktif');
  }
  if (twoFactorOnServer()) {
    const data = await call2FA('regenerateBackupCodes', {});
    return { backupCodes: data.backupCodes };
  }
  const tf = getUserTwoFactor(currentUser.username);
  if (!tf || !tf.enabled) {
    throw new Error('2FA belum aktif.');
  }
  const plainCodes = newBackupCodes();
  saveUserTwoFactor(currentUser.username, {
    ...tf,
    backupCodes: await encodeBackupCodes(plainCodes),
  });
  return { backupCodes: plainCodes };
}

export function getCurrentUser() {
  return currentUser;
}

/** Auth backend that authenticated the active session: 'firebase' | 'local' | null. */
export function getAuthMode() {
  return _activeMode;
}

/**
 * Whether the active user is allowed to write to the cloud database.
 * In local mode, writes go to localStorage and there is no verification gate,
 * so this is always true. In Firebase mode it mirrors the user's verified
 * state, which the Firestore security rules require for any write.
 */
export function isEmailVerified() {
  // Email verification is no longer required (the Firestore rules' verified()
  // helper was relaxed to signedIn()). Always report verified so the cloud-write
  // gate and the "belum diverifikasi" banner stay out of the way.
  return true;
}

/**
 * Re-fetch the Firebase user so a verification that just happened (the user
 * clicked the email link in another tab) is reflected without a full re-login.
 * Returns the up-to-date verified state.
 */
export async function reloadVerification() {
  if (_activeMode !== 'firebase' || !fbAuth || !fbAuth.currentUser) {
    return true;
  }
  try {
    await fbAuth.currentUser.reload();
    if (currentUser) {
      currentUser.emailVerified = !!fbAuth.currentUser.emailVerified;
    }
  } catch (e) {
    console.warn('[Auth] verification reload failed:', e);
  }
  return !!fbAuth.currentUser.emailVerified;
}

/**
 * (Re)send the verification email to the signed-in Firebase user. No-op (returns
 * true) when already verified. Throws on local sessions or transport errors.
 */
export async function resendVerification() {
  if (_activeMode !== 'firebase' || !fbAuth || !fbAuth.currentUser) {
    throw new Error('Verifikasi email hanya berlaku untuk login cloud (Firebase).');
  }
  if (fbAuth.currentUser.emailVerified) {
    return true;
  }
  await sendEmailVerification(fbAuth.currentUser);
  return true;
}

/** Whether the active user is still on their first-run default password. */
export function mustChangePassword() {
  return Boolean(currentUser && currentUser.mustChangePassword);
}

/**
 * Wire up the login screen defined in index.html (#login-screen / #login-form)
 * and show it. On a successful login the page reloads so boot re-runs with a
 * valid session.
 */
export function setupLoginScreen() {
  const loginScreen = document.getElementById('login-screen');
  const appContainer = document.getElementById('app-container');
  if (appContainer) {
    appContainer.style.display = 'none';
  }
  if (!loginScreen) {
    return;
  }
  loginScreen.style.display = '';

  // Theme toggle on the login screen (in-app toggle lives in nav.js, which
  // only loads after login). Uses the same 'erp_theme' key + data-theme attr.
  const themeBtn = document.getElementById('login-theme-toggle');
  if (themeBtn) {
    themeBtn.addEventListener('click', () => {
      const next =
        document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      try {
        localStorage.setItem('erp_theme', next);
      } catch (_) {
        /* ignore */
      }
    });
  }

  const form = document.getElementById('login-form');
  const errorBox = document.getElementById('login-error');
  const emailInput = document.getElementById('login-email');

  const pwInput = document.getElementById('login-password');
  const pwToggle = document.getElementById('login-toggle-pw');
  if (pwInput && pwToggle) {
    const eyeOpen =
      '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>';
    const eyeClosed =
      '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>';
    pwToggle.addEventListener('click', () => {
      const show = pwInput.type === 'password';
      pwInput.type = show ? 'text' : 'password';
      pwToggle.innerHTML = show ? eyeClosed : eyeOpen;
      pwToggle.title = show ? 'Sembunyikan password' : 'Tampilkan password';
    });
  }

  const showError = msg => {
    if (!errorBox) {
      return;
    }
    errorBox.style.display = 'block';
    errorBox.style.background = 'var(--danger-bg)';
    errorBox.style.color = 'var(--danger)';
    errorBox.style.borderColor = 'var(--danger)';
    errorBox.textContent = msg;
  };

  // Prefill the default username for convenience.
  if (emailInput && !emailInput.value) {
    emailInput.value = DEFAULT_USERNAME;
  }

  if (!form) {
    return;
  }

  form.addEventListener('submit', async e => {
    e.preventDefault();
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;
    const submitBtn = form.querySelector('button[type="submit"]');

    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Memproses...';
    }

    const markReturningAndReload = () => {
      // Mark this browser as a returning user so the landing page's inline
      // smart-skip script sends them straight to /app on future visits.
      try {
        localStorage.setItem('cf-returning', '1');
      } catch (_) {
        /* ignore (private mode / storage disabled) */
      }
      window.location.reload();
    };

    try {
      if (form.dataset.step === '2fa') {
        // Step 2 — verify the second factor for the password-verified user.
        const code = (document.getElementById('login-2fa') || {}).value || '';
        const res = await completeSecondFactor(code);
        if (res.ok) {
          markReturningAndReload();
          return;
        }
        showError(res.msg || 'Kode 2FA salah');
      } else {
        // Step 1 — username + password.
        const result = await login(email, password);
        if (result.ok) {
          markReturningAndReload();
          return;
        }
        if (result.twoFactor) {
          // Password accepted — reveal the second-factor step.
          form.dataset.step = '2fa';
          const twoFaGroup = document.getElementById('login-2fa-group');
          if (twoFaGroup) {
            twoFaGroup.style.display = '';
          }
          document.getElementById('login-email')?.setAttribute('disabled', 'disabled');
          document.getElementById('login-password')?.setAttribute('disabled', 'disabled');
          if (errorBox) {
            errorBox.style.display = 'block';
            errorBox.style.background = 'var(--surface)';
            errorBox.style.color = 'var(--muted)';
            errorBox.style.borderColor = 'var(--border)';
            errorBox.textContent =
              'Masukkan kode 6 digit dari aplikasi authenticator (atau kode cadangan).';
          }
          const codeInput = document.getElementById('login-2fa');
          if (codeInput) {
            codeInput.value = '';
            codeInput.focus();
          }
          if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Verifikasi';
          }
          return;
        }
        showError(result.msg || 'Email atau password salah');
      }
    } catch (err) {
      console.error('Login error:', err);
      showError('Terjadi kesalahan saat login');
    }

    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = form.dataset.step === '2fa' ? 'Verifikasi' : 'Sign In';
    }
  });

  const emailField = document.getElementById('login-email');
  if (emailField) {
    emailField.focus();
  }
}

export async function logout(message) {
  if (sessionTimer) {
    clearTimeout(sessionTimer);
    sessionTimer = null;
  }
  if (currentUser && currentUser.username) {
    recordLoginEvent(currentUser.username, currentUser.displayName, 'logout', 'local');
  }
  clearSession();
  currentUser = null;
  _pending2FA = null;
  if (_useFirebase && fbAuth) {
    // Best-effort server-side audit entry — must run before signOut() drops the
    // ID token the callable needs to identify the caller.
    if (fbFunctions && fbAuth.currentUser) {
      try {
        await httpsCallable(fbFunctions, 'recordLogout')();
      } catch (e) {
        console.warn('[Auth] recordLogout failed:', e);
      }
    }
    try {
      await signOut(fbAuth);
    } catch (e) {
      console.warn('[Auth] Firebase signOut failed:', e);
    }
  }
  _activeMode = null;
  if (message) {
    alert(message);
  }
  window.location.reload();
}

/**
 * Change the login password. Verifies the current password first.
 * Called as changePassword(currentPassword, newPassword) from settings.js.
 */
export async function changePassword(currentPassword, newPassword) {
  if (!newPassword || newPassword.length < 6) {
    throw new Error('Password baru harus minimal 6 karakter');
  }
  if (!currentUser || !currentUser.username) {
    throw new Error('Tidak ada sesi aktif');
  }
  if (_activeMode === 'firebase' && _useFirebase && fbFunctions) {
    // Server-authenticated session: change the password server-side (re-verifies
    // the old one there). The password hash never leaves the server.
    const call = httpsCallable(fbFunctions, 'changeMyPassword');
    try {
      await call({ oldPassword: currentPassword, newPassword });
    } catch (e) {
      throw new Error((e && e.message) || 'Gagal mengganti password', { cause: e });
    }
  } else {
    // Local (offline) session: verify + set against the browser store.
    const ok = await verifyUser(currentUser.username, currentPassword || '');
    if (!ok) {
      throw new Error('Password lama salah');
    }
    await setUserPassword(currentUser.username, newPassword);
  }
  currentUser.mustChangePassword = false;
  // Reflect the cleared flag in the persisted session too.
  const s = getSession();
  if (s) {
    s.mustChangePassword = false;
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(s));
  }
  return true;
}
