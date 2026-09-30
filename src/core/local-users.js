// ═══════════════════════════════════════════════════════════════════════════════
// KELOLA ERP (DEMO) — Local multi-user store  (local-users.js)
//
// Username/password authentication held in localStorage. Replaces the old
// single-credential local auth so multiple named operators can each log in
// with their own username. Passwords are stored as PBKDF2/SHA-256 hashes with
// a per-user salt — never in plain text.
//
// Also keeps a login activity log (who logged in / out, when) for the
// "Log Aktivitas User" screen.
// ═══════════════════════════════════════════════════════════════════════════════

const USERS_KEY = 'erp_users_v1';
const LOG_KEY = 'erp_login_log_v1';
const LOG_CAP = 500;
// OWASP-recommended cost for PBKDF2-HMAC-SHA256. Records hashed before this bump
// carry no `iterations` field (or a lower one) and verify at their stored count,
// then get transparently re-hashed to the current cost on the next good login.
const PBKDF2_ITERATIONS = 600000;
const PBKDF2_ITERATIONS_LEGACY = 100000;

// First-run demo accounts, all admins. Default password is "<username>123"
// and each is flagged mustChangePassword so operators are nudged to set
// their own on first login.
const SEED_USERS = [
  { username: 'admin', displayName: 'Administrator' },
  { username: 'sales', displayName: 'Sales Demo' },
  { username: 'gudang', displayName: 'Gudang Demo' },
  { username: 'akunting', displayName: 'Akunting Demo' },
];

// ── hashing ────────────────────────────────────────────────────────────────────
function bufToHex(buf) {
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}
function hexToBytes(hex) {
  return Uint8Array.from(hex.match(/.{1,2}/g).map(h => parseInt(h, 16)));
}
export function randomSalt() {
  const a = new Uint8Array(16);
  crypto.getRandomValues(a);
  return bufToHex(a.buffer);
}
export async function hashPassword(password, saltHex, iterations = PBKDF2_ITERATIONS) {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, [
    'deriveBits',
  ]);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: hexToBytes(saltHex), iterations, hash: 'SHA-256' },
    keyMaterial,
    256
  );
  return bufToHex(bits);
}

/**
 * Salted SHA-256 hash for 2FA backup codes. Backup codes are lower-entropy than
 * passwords, but we still salt+hash them so a leaked store doesn't expose usable
 * codes. A single SHA-256 pass (not PBKDF2) keeps login-time verification cheap
 * when looping over the unused codes.
 */
export async function hashBackupCode(code, saltHex) {
  const enc = new TextEncoder();
  const data = enc.encode(saltHex + ':' + String(code).replace(/\s+/g, '').toUpperCase());
  const digest = await crypto.subtle.digest('SHA-256', data);
  return bufToHex(digest);
}

// ── persistence ──────────────────────────────────────────────────────────────
function readUsers() {
  try {
    const raw = localStorage.getItem(USERS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.users)) {
        return parsed.users;
      }
    }
  } catch (_) {
    /* ignore */
  }
  return null;
}
function writeUsers(users) {
  localStorage.setItem(USERS_KEY, JSON.stringify({ users }));
}

function normUsername(u) {
  const s = String(u || '')
    .trim()
    .toLowerCase();
  // Tolerate the old email-style login (and browser-autofilled emails): map
  // "admin@kelola.example" → "admin". Usernames never contain "@".
  const at = s.indexOf('@');
  return at > 0 ? s.slice(0, at) : s;
}

/**
 * Ensure the user store exists, seeding the default accounts on first run.
 * Migrates the legacy single-credential store (erp_auth_creds) into an `admin`
 * user so an existing local install isn't locked out.
 */
export async function ensureUsers() {
  let users = readUsers();
  if (users && users.length) {
    return users;
  }

  users = [];
  // Migrate legacy single credential, if present, as the admin account.
  try {
    const legacyRaw = localStorage.getItem('erp_auth_creds');
    if (legacyRaw) {
      const legacy = JSON.parse(legacyRaw);
      if (legacy && legacy.passwordHash && legacy.salt) {
        users.push({
          username: 'admin',
          displayName: 'Administrator',
          role: 'admin',
          salt: legacy.salt,
          passwordHash: legacy.passwordHash,
          active: true,
          mustChangePassword: !!legacy.mustChangePassword,
          createdAt: Date.now(),
        });
      }
    }
  } catch (_) {
    /* ignore */
  }

  for (const seed of SEED_USERS) {
    if (users.some(u => u.username === seed.username)) {
      continue;
    }
    const salt = randomSalt();
    const passwordHash = await hashPassword(`${seed.username}123`, salt);
    users.push({
      username: seed.username,
      displayName: seed.displayName,
      role: 'admin',
      salt,
      passwordHash,
      iterations: PBKDF2_ITERATIONS,
      active: true,
      mustChangePassword: true,
      createdAt: Date.now(),
    });
  }
  writeUsers(users);
  return users;
}

export function listLocalUsers() {
  const users = readUsers() || [];
  // Strip secrets before handing to the UI.
  return users.map(u => ({
    username: u.username,
    displayName: u.displayName,
    role: u.role,
    active: u.active !== false,
    mustChangePassword: !!u.mustChangePassword,
    createdAt: u.createdAt || null,
  }));
}

export function findUser(username) {
  const users = readUsers() || [];
  const key = normUsername(username);
  return users.find(u => u.username === key) || null;
}

/** Verify a username/password pair. Returns the user (without secrets) or null. */
export async function verifyUser(username, password) {
  await ensureUsers();
  const user = findUser(username);
  if (!user || user.active === false) {
    return null;
  }
  // Records predating the 600k bump carry a lower (or missing) `iterations`
  // field; verify at whatever cost they were hashed with.
  const iterations = user.iterations || PBKDF2_ITERATIONS_LEGACY;
  const hash = await hashPassword(password || '', user.salt, iterations);
  if (hash !== user.passwordHash) {
    return null;
  }
  // Lazy cost upgrade: now that we hold the correct plaintext, re-hash at the
  // current iteration count so the stored hash strengthens on next login.
  if (iterations < PBKDF2_ITERATIONS) {
    try {
      const salt = randomSalt();
      const passwordHash = await hashPassword(password || '', salt);
      const users = readUsers() || [];
      const u = users.find(x => x.username === user.username);
      if (u) {
        u.salt = salt;
        u.passwordHash = passwordHash;
        u.iterations = PBKDF2_ITERATIONS;
        writeUsers(users);
      }
    } catch (e) {
      console.warn('[LocalUsers] PBKDF2 cost upgrade failed — keeping old hash:', e && e.message);
    }
  }
  return {
    username: user.username,
    displayName: user.displayName,
    role: user.role,
    mustChangePassword: !!user.mustChangePassword,
  };
}

/** Create a new local user. Throws on duplicate username. */
export async function addUser(username, displayName, password, role = 'admin') {
  await ensureUsers();
  const key = normUsername(username);
  if (!key) {
    throw new Error('Username wajib diisi');
  }
  if (!/^[a-z0-9._-]+$/.test(key)) {
    throw new Error('Username hanya boleh huruf, angka, titik, garis, dan garis bawah');
  }
  if (!password || password.length < 6) {
    throw new Error('Password minimal 6 karakter');
  }
  const users = readUsers() || [];
  if (users.some(u => u.username === key)) {
    throw new Error('Username sudah dipakai');
  }
  const salt = randomSalt();
  const passwordHash = await hashPassword(password, salt);
  users.push({
    username: key,
    displayName: displayName || username,
    role,
    salt,
    passwordHash,
    iterations: PBKDF2_ITERATIONS,
    active: true,
    mustChangePassword: false,
    createdAt: Date.now(),
  });
  writeUsers(users);
  return true;
}

/** Set a user's password (admin reset or self change). */
export async function setUserPassword(username, newPassword) {
  if (!newPassword || newPassword.length < 6) {
    throw new Error('Password minimal 6 karakter');
  }
  const users = readUsers() || [];
  const key = normUsername(username);
  const u = users.find(x => x.username === key);
  if (!u) {
    throw new Error('User tidak ditemukan');
  }
  u.salt = randomSalt();
  u.passwordHash = await hashPassword(newPassword, u.salt);
  u.iterations = PBKDF2_ITERATIONS;
  u.mustChangePassword = false;
  writeUsers(users);
  return true;
}

export function setUserRoleLocal(username, role) {
  const users = readUsers() || [];
  const u = users.find(x => x.username === normUsername(username));
  if (!u) {
    throw new Error('User tidak ditemukan');
  }
  u.role = role;
  writeUsers(users);
  return true;
}

export function setUserActive(username, active) {
  const users = readUsers() || [];
  const u = users.find(x => x.username === normUsername(username));
  if (!u) {
    throw new Error('User tidak ditemukan');
  }
  u.active = !!active;
  writeUsers(users);
  return true;
}

export function deleteUser(username) {
  let users = readUsers() || [];
  const key = normUsername(username);
  if (key === 'admin') {
    throw new Error('Akun admin utama tidak dapat dihapus');
  }
  const before = users.length;
  users = users.filter(u => u.username !== key);
  if (users.length === before) {
    throw new Error('User tidak ditemukan');
  }
  writeUsers(users);
  return true;
}

// ── two-factor (TOTP) per-user config ──────────────────────────────────────────
// Stored on the user record as:
//   user.twoFactor = { enabled, secret, backupCodes: [{ salt, hash, used }] }
// The secret + backup-code hashes never leave localStorage; listLocalUsers()
// strips them so the UI only ever sees the enabled flag (via userHasTwoFactor).

/** Raw 2FA config for a user (includes the secret). null when none/off. */
export function getUserTwoFactor(username) {
  const u = findUser(username);
  return (u && u.twoFactor) || null;
}

/** True when the user has a verified secret and 2FA switched on. */
export function userHasTwoFactor(username) {
  const tf = getUserTwoFactor(username);
  return !!(tf && tf.enabled && tf.secret);
}

/**
 * Persist (or clear) a user's 2FA config. Pass null/undefined to disable.
 * Returns true on success; throws when the user is unknown.
 */
export function saveUserTwoFactor(username, twoFactor) {
  const users = readUsers() || [];
  const u = users.find(x => x.username === normUsername(username));
  if (!u) {
    throw new Error('User tidak ditemukan');
  }
  if (twoFactor == null) {
    delete u.twoFactor;
  } else {
    u.twoFactor = twoFactor;
  }
  writeUsers(users);
  return true;
}

// ── login activity log ─────────────────────────────────────────────────────────
export function recordLoginEvent(username, displayName, event, mode) {
  try {
    let log = [];
    const raw = localStorage.getItem(LOG_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        log = parsed;
      }
    }
    log.unshift({
      username,
      displayName: displayName || username,
      event: event || 'login',
      mode: mode || 'local',
      ts: Date.now(),
    });
    if (log.length > LOG_CAP) {
      log = log.slice(0, LOG_CAP);
    }
    localStorage.setItem(LOG_KEY, JSON.stringify(log));
  } catch (_) {
    /* logging must never break auth */
  }
}

export function getLoginLog() {
  try {
    const raw = localStorage.getItem(LOG_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed;
      }
    }
  } catch (_) {
    /* ignore */
  }
  return [];
}

export function clearLoginLog() {
  try {
    localStorage.removeItem(LOG_KEY);
  } catch (_) {
    /* ignore */
  }
}
