import { describe, it, expect, beforeEach, vi } from 'vitest';

// auth.js imports the Firebase config, which initialises the SDK at module load.
// Force the local-auth path so the flow runs without a real Firebase project.
vi.mock('../src/config/firebase.js', () => ({
  auth: null,
  db: null,
  isFirebaseConfigured: false,
}));

import {
  login,
  logout,
  getCurrentUser,
  begin2FAEnrollment,
  enable2FA,
  disable2FA,
  is2FAEnabled,
  get2FAStatus,
  completeSecondFactor,
  regenerateBackupCodes,
} from '../src/core/auth.js';
import { ensureUsers } from '../src/core/local-users.js';
import { totp } from '../src/core/totp.js';

// End-to-end 2FA flow over the real local-users store + real WebCrypto (no
// stubbed crypto — the TOTP codes here are genuine RFC 6238 values). `logout()`
// calls window.location.reload() in the browser; jsdom makes that a harmless
// no-op, so each step below runs without navigation.

describe('2FA login flow (local users)', () => {
  beforeEach(async () => {
    localStorage.clear();
    sessionStorage.clear();
    await ensureUsers(); // seed admin / sales / gudang / akunting
  });

  it('enables 2FA, then requires a second factor on the next login', async () => {
    // 1. Password login (no 2FA yet) succeeds outright.
    const first = await login('admin', 'admin123');
    expect(first.ok).toBe(true);
    expect(getCurrentUser()?.username).toBe('admin');

    // 2. Enroll: verify a live TOTP, receive backup codes, 2FA switches on.
    const { secret } = begin2FAEnrollment();
    const enrollCode = await totp(secret);
    const { backupCodes } = await enable2FA(secret, enrollCode);
    expect(backupCodes).toHaveLength(8);
    expect(is2FAEnabled()).toBe(true);
    expect(await get2FAStatus()).toMatchObject({ enabled: true, backupCodesRemaining: 8 });

    // 3. Re-login now stops at the password step and asks for the second factor.
    logout();
    const step1 = await login('admin', 'admin123');
    expect(step1.ok).toBe(false);
    expect(step1.twoFactor).toBe(true);
    expect(getCurrentUser()).toBeNull(); // no session until 2FA clears

    // 4. A valid TOTP completes the login.
    const step2 = await completeSecondFactor(await totp(secret));
    expect(step2.ok).toBe(true);
    expect(getCurrentUser()?.username).toBe('admin');
  });

  it('rejects a wrong code and accepts a one-time backup code (burned after use)', async () => {
    await login('admin', 'admin123');
    const { secret } = begin2FAEnrollment();
    const { backupCodes } = await enable2FA(secret, await totp(secret));
    logout();

    // Wrong code is rejected and no session is created.
    await login('admin', 'admin123');
    const bad = await completeSecondFactor('000000');
    expect(bad.ok).toBe(false);
    expect(getCurrentUser()).toBeNull();

    // A backup code works…
    const ok = await completeSecondFactor(backupCodes[0]);
    expect(ok.ok).toBe(true);
    expect((await get2FAStatus()).backupCodesRemaining).toBe(7);

    // …but the same backup code cannot be reused.
    logout();
    await login('admin', 'admin123');
    const reused = await completeSecondFactor(backupCodes[0]);
    expect(reused.ok).toBe(false);
  });

  it('regenerates backup codes and disables 2FA with the password', async () => {
    await login('admin', 'admin123');
    const { secret } = begin2FAEnrollment();
    const { backupCodes: original } = await enable2FA(secret, await totp(secret));

    const { backupCodes: fresh } = await regenerateBackupCodes();
    expect(fresh).toHaveLength(8);
    expect(fresh[0]).not.toBe(original[0]);
    expect((await get2FAStatus()).backupCodesRemaining).toBe(8);

    await disable2FA('admin123'); // password confirms
    expect(is2FAEnabled()).toBe(false);

    // With 2FA off, a plain password login goes straight through again.
    logout();
    const relogin = await login('admin', 'admin123');
    expect(relogin.ok).toBe(true);
  });
});
