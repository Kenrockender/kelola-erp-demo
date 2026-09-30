// ═══════════════════════════════════════════════════════════════════════════════
// KELOLA ERP (DEMO) — TOTP (RFC 6238) two-factor helper
// -----------------------------------------------------------------------------
// Zero-dependency, offline: base32 + HMAC-SHA1 via WebCrypto. Compatible with
// Google Authenticator, Authy, Microsoft Authenticator, 1Password, etc.
//
// This is an *app-level* second factor. The secret lives next to the local
// per-user credential (local-users.js), so it gates the app UI after a correct
// password. It does not replace Firebase MFA. For the local-first, per-operator
// deployment this is the right threat model; documented in README.
// ═══════════════════════════════════════════════════════════════════════════════

const B32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/** Encode bytes → RFC 4648 base32 (no padding). */
export function base32Encode(bytes) {
  let bits = 0;
  let value = 0;
  let out = '';
  for (let i = 0; i < bytes.length; i++) {
    value = (value << 8) | bytes[i];
    bits += 8;
    while (bits >= 5) {
      out += B32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) {
    out += B32_ALPHABET[(value << (5 - bits)) & 31];
  }
  return out;
}

/** Decode an RFC 4648 base32 string → Uint8Array. Tolerates spaces / padding / case. */
export function base32Decode(str) {
  const clean = String(str).toUpperCase().replace(/=+$/, '').replace(/\s+/g, '');
  let bits = 0;
  let value = 0;
  const out = [];
  for (let i = 0; i < clean.length; i++) {
    const idx = B32_ALPHABET.indexOf(clean[i]);
    if (idx === -1) {
      throw new Error('Karakter base32 tidak valid: ' + clean[i]);
    }
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return new Uint8Array(out);
}

/** Cryptographically random base32 secret (default 20 bytes / 160 bits). */
export function generateSecret(byteLen = 20) {
  const a = new Uint8Array(byteLen);
  crypto.getRandomValues(a);
  return base32Encode(a);
}

// 8-byte big-endian counter for HOTP.
function counterBytes(counter) {
  const buf = new Uint8Array(8);
  // JS bitwise is 32-bit; split into high/low words to stay exact.
  let hi = Math.floor(counter / 0x100000000);
  let lo = counter >>> 0;
  for (let i = 7; i >= 4; i--) {
    buf[i] = lo & 0xff;
    lo = Math.floor(lo / 256);
  }
  for (let i = 3; i >= 0; i--) {
    buf[i] = hi & 0xff;
    hi = Math.floor(hi / 256);
  }
  return buf;
}

async function hmacSha1(keyBytes, msgBytes) {
  const key = await crypto.subtle.importKey(
    'raw',
    keyBytes,
    { name: 'HMAC', hash: 'SHA-1' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, msgBytes);
  return new Uint8Array(sig);
}

/** RFC 4226 HOTP value as a zero-padded string of `digits` length. */
export async function hotp(secretBytes, counter, digits = 6) {
  const h = await hmacSha1(secretBytes, counterBytes(counter));
  const offset = h[h.length - 1] & 0x0f;
  const bin =
    ((h[offset] & 0x7f) << 24) |
    ((h[offset + 1] & 0xff) << 16) |
    ((h[offset + 2] & 0xff) << 8) |
    (h[offset + 3] & 0xff);
  const code = bin % 10 ** digits;
  return String(code).padStart(digits, '0');
}

/** RFC 6238 TOTP for a base32 `secret`. `time` in ms (defaults to now). */
export async function totp(secret, { time = Date.now(), step = 30, digits = 6 } = {}) {
  const counter = Math.floor(time / 1000 / step);
  return hotp(base32Decode(secret), counter, digits);
}

/**
 * Verify a user-entered `token` against `secret`, allowing ±`window` time steps
 * to absorb clock drift. Returns true on match.
 */
export async function verifyTOTP(
  secret,
  token,
  { time = Date.now(), step = 30, digits = 6, window = 1 } = {}
) {
  const clean = String(token || '').replace(/\s+/g, '');
  if (!/^\d+$/.test(clean) || clean.length !== digits) {
    return false;
  }
  const secretBytes = base32Decode(secret);
  const counter = Math.floor(time / 1000 / step);
  for (let w = -window; w <= window; w++) {
    const candidate = await hotp(secretBytes, counter + w, digits);
    if (candidate === clean) {
      return true;
    }
  }
  return false;
}

/** Build an otpauth:// URI (encode into a QR for authenticator enrollment). */
export function otpauthURL(
  secret,
  { issuer = 'KELOLA ERP (DEMO)', account = 'admin', digits = 6, step = 30 } = {}
) {
  const label = encodeURIComponent(issuer + ':' + account);
  const params = new URLSearchParams({
    secret,
    issuer,
    algorithm: 'SHA1',
    digits: String(digits),
    period: String(step),
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}
