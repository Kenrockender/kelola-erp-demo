// ═══════════════════════════════════════════════════════════════════════════════
// KELOLA ERP (DEMO) — User Identity & Role Resolution  (user-role.js)
//
// Real multi-user RBAC lives in three layers:
//   1. Identity  (this file)   — maps each signed-in account to a role via a
//                                Firestore `users/{uid}` document.
//   2. Server    (firestore.rules) — the real boundary: rules read users/{uid}
//                                and allow writes only for permitted modules.
//   3. Client    (classic/core/rbac.js) — hides menus/buttons + a saveDB safety
//                                net so the UI matches what the server allows.
//
// This module is the bridge: after auth it resolves the active user's role,
// auto-provisioning a `pending` user document on first login (so an admin can
// later assign a real role) and exposes admin helpers to list users / set roles.
//
// Bootstrap: BOOTSTRAP_ADMINS are always treated as `admin`, even before a
// users/{uid} document exists — this prevents a chicken-and-egg lockout where
// nobody can grant the first role. Keep this list in sync with firestore.rules.
//
// Local-fallback mode (no Firebase): there is no shared database and a single
// operator owns the machine, so the local user is treated as `admin`. Real
// server enforcement only applies in Firebase mode.
// ═══════════════════════════════════════════════════════════════════════════════

import { doc, getDoc, setDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import {
  db as fbDb,
  auth as fbAuth,
  functions as fbFunctions,
  isFirebaseConfigured,
} from '../config/firebase.js';
import { getCurrentUser, getAuthMode } from './auth.js';
import {
  listLocalUsers,
  setUserRoleLocal,
  setUserActive,
  addUser as addLocalUser,
  setUserPassword as setLocalUserPassword,
  deleteUser as deleteLocalUser,
} from './local-users.js';

// Always-admin accounts (matched case-insensitively against the auth email).
// This demo build has no Firebase backend, so this list is unused (the local
// auth path in resolveUserRole() below always treats the signed-in local user
// as admin) — kept as a generic placeholder, not a real address.
export const BOOTSTRAP_ADMINS = ['admin@example.com'];

// The fixed preset roles. Order = display order in the role picker.
export const ROLES = ['admin', 'manajer', 'akunting', 'penjualan', 'viewer'];

export const ROLE_LABELS = {
  admin: 'Admin / Owner',
  manajer: 'Manajer',
  akunting: 'Akunting',
  penjualan: 'Penjualan',
  viewer: 'Viewer (hanya lihat)',
  pending: 'Menunggu persetujuan',
};

function isBootstrap(email) {
  return !!email && BOOTSTRAP_ADMINS.includes(String(email).toLowerCase());
}

function userRef(uid) {
  return doc(fbDb, 'users', uid);
}

/**
 * Resolve the active user's role. Returns
 *   { uid, email, displayName, role, active, mode, source }
 * and never throws — on any failure it degrades to a safe, low-privilege role
 * so a transient Firestore error can't escalate access.
 */
export async function resolveUserRole() {
  const user = getCurrentUser();
  const mode = getAuthMode();

  if (!user) {
    return {
      uid: null,
      email: null,
      displayName: null,
      role: 'pending',
      active: false,
      mode,
      source: 'none',
    };
  }

  const email = user.email || '';
  const displayName = user.displayName || (email ? email.split('@')[0] : 'user');

  // Local auth mode: the role comes from the signed-in local user account.
  if (mode !== 'firebase' || !isFirebaseConfigured || !fbDb) {
    return {
      uid: user.uid,
      email,
      displayName,
      role: user.role || 'admin',
      active: true,
      mode: 'local',
      source: 'local',
    };
  }

  const bootstrap = isBootstrap(email);

  // Username → custom-token session: the role is a claim on the Firebase ID
  // token (set by the loginWithUsername Cloud Function) — authoritative and
  // identical to what the Firestore rules enforce. These users have no
  // users/{uid} document, so trust the claim directly and skip the doc lookup.
  try {
    if (fbAuth && fbAuth.currentUser) {
      const tok = await fbAuth.currentUser.getIdTokenResult();
      const claimRole = tok && tok.claims && tok.claims.role;
      if (claimRole) {
        return {
          uid: user.uid,
          email,
          displayName,
          role: bootstrap ? 'admin' : claimRole,
          active: true,
          mode: 'firebase',
          source: 'claim',
        };
      }
    }
  } catch (_) {
    /* fall through to the users/{uid} document path */
  }

  try {
    const ref = userRef(user.uid);
    const snap = await getDoc(ref);

    if (snap.exists()) {
      const data = snap.data() || {};
      // Heal the bootstrap admin's document if it was downgraded somehow.
      if (bootstrap && (data.role !== 'admin' || data.active === false)) {
        try {
          await updateDoc(ref, { role: 'admin', active: true });
        } catch (_) {
          /* rules will still treat them as admin via email */
        }
        return {
          uid: user.uid,
          email,
          displayName,
          role: 'admin',
          active: true,
          mode: 'firebase',
          source: 'doc',
        };
      }
      const role = bootstrap ? 'admin' : data.role || 'pending';
      const active = bootstrap ? true : data.active !== false;
      return { uid: user.uid, email, displayName, role, active, mode: 'firebase', source: 'doc' };
    }

    // First login → self-provision a document. Bootstrap admins get `admin`,
    // everyone else gets an inactive `pending` role until an admin assigns one.
    const role = bootstrap ? 'admin' : 'pending';
    const active = bootstrap;
    try {
      await setDoc(ref, {
        email,
        displayName,
        role,
        active,
        createdAt: serverTimestamp(),
      });
    } catch (e) {
      console.warn('[UserRole] could not create users/{uid} document:', e);
    }
    return {
      uid: user.uid,
      email,
      displayName,
      role,
      active,
      mode: 'firebase',
      source: 'provisioned',
    };
  } catch (e) {
    console.warn('[UserRole] role resolution failed, defaulting to viewer:', e);
    // Safe degrade: read-only. Bootstrap admins stay admin (token-based in rules).
    return {
      uid: user.uid,
      email,
      displayName,
      role: bootstrap ? 'admin' : 'viewer',
      active: true,
      mode: 'firebase',
      source: 'error',
    };
  }
}

// ── Admin helpers (User Management UI) ─────────────────────────────────────────

/** Whether the app is running on local (non-Firebase) auth. */
function isLocalMode() {
  return getAuthMode() !== 'firebase' || !isFirebaseConfigured || !fbDb;
}

// Invoke an admin auth callable (adminListUsers, adminCreateUser, …). Unwraps
// the Cloud Function's HttpsError into a plain Error with its (Indonesian)
// message so the User Management UI can show it verbatim.
async function callAdmin(name, data) {
  try {
    const res = await httpsCallable(fbFunctions, name)(data || {});
    return res.data;
  } catch (e) {
    throw new Error((e && e.message) || 'Operasi gagal', { cause: e });
  }
}

/**
 * List every known user. Cloud mode reads the server-only authUsers store via
 * the admin callable; local mode reads the browser store. Both key `uid` by
 * username so the rest of the UI (which passes uid back to the mutators) works
 * uniformly.
 */
export async function listUsers() {
  if (isLocalMode()) {
    return listLocalUsers().map(u => ({
      uid: u.username,
      username: u.username,
      email: u.username,
      displayName: u.displayName,
      role: u.role,
      active: u.active,
      mustChangePassword: u.mustChangePassword,
      local: true,
    }));
  }
  const { users } = await callAdmin('adminListUsers');
  return (users || []).map(u => ({
    uid: u.username,
    username: u.username,
    email: u.username,
    displayName: u.displayName,
    role: u.role,
    active: u.active,
    mustChangePassword: u.mustChangePassword,
    twoFactorEnabled: u.twoFactorEnabled,
  }));
}

/** Set a user's role and active flag. Admin-only. (uid == username.) */
export async function setUserRole(uid, role, active = true) {
  if (!uid) {
    throw new Error('uid wajib diisi');
  }
  if (!ROLES.includes(role) && role !== 'pending') {
    throw new Error(`Role tidak dikenal: ${role}`);
  }
  if (isLocalMode()) {
    setUserRoleLocal(uid, role);
    setUserActive(uid, !!active);
    return true;
  }
  await callAdmin('adminSetRole', { username: uid, role });
  await callAdmin('adminSetActive', { username: uid, active: !!active });
  return true;
}

/** Create a new user. */
export async function createUser(username, displayName, password, role = 'viewer') {
  if (isLocalMode()) {
    return addLocalUser(username, displayName, password, role);
  }
  await callAdmin('adminCreateUser', { username, displayName, password, role });
  return true;
}

/** Reset a user's password. */
export async function resetUserPassword(username, newPassword) {
  if (isLocalMode()) {
    return setLocalUserPassword(username, newPassword);
  }
  await callAdmin('adminSetPassword', { username, password: newPassword });
  return true;
}

/** Remove a user. */
export async function removeUser(username) {
  if (isLocalMode()) {
    return deleteLocalUser(username);
  }
  await callAdmin('adminDeleteUser', { username });
  return true;
}

/**
 * Server-enforced audit trail (accessLog): who created/updated/deleted which
 * record, and every login/logout/failed-login — written by Cloud Functions via
 * the Admin SDK, so no client can edit or erase it (see functions/access-log.js).
 * Admin-only; unavailable in local (non-Firebase) mode since there is no server.
 */
export async function listAccessLog(limit = 200) {
  if (isLocalMode()) {
    return [];
  }
  const { entries } = await callAdmin('adminListAccessLog', { limit });
  return entries || [];
}
