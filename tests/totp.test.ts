import { describe, it, expect } from 'vitest';
import {
  base32Encode,
  base32Decode,
  generateSecret,
  totp,
  verifyTOTP,
  otpauthURL,
} from '../src/core/totp.js';

// RFC 6238 Appendix B uses the ASCII seed "12345678901234567890".
const RFC_SECRET = base32Encode(new TextEncoder().encode('12345678901234567890'));

describe('base32', () => {
  it('round-trips arbitrary bytes', () => {
    const bytes = new Uint8Array([0, 1, 2, 253, 254, 255, 42, 99]);
    expect(Array.from(base32Decode(base32Encode(bytes)))).toEqual(Array.from(bytes));
  });

  it('encodes the RFC seed to the known base32', () => {
    expect(RFC_SECRET).toBe('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ');
  });

  it('tolerates spaces, padding and lower-case on decode', () => {
    const a = base32Decode('gezd gnbv gy3t qojq');
    const b = base32Decode('GEZDGNBVGY3TQOJQ');
    expect(Array.from(a)).toEqual(Array.from(b));
  });

  it('rejects invalid characters', () => {
    expect(() => base32Decode('018!')).toThrow();
  });
});

describe('TOTP — RFC 6238 test vectors (SHA-1, 6 digits)', () => {
  const vectors: Array<[number, string]> = [
    [59, '287082'],
    [1111111109, '081804'],
    [1111111111, '050471'],
    [1234567890, '005924'],
    [2000000000, '279037'],
    [20000000000, '353130'],
  ];
  for (const [seconds, expected] of vectors) {
    it(`T=${seconds}s → ${expected}`, async () => {
      const code = await totp(RFC_SECRET, { time: seconds * 1000 });
      expect(code).toBe(expected);
    });
  }
});

describe('verifyTOTP', () => {
  it('accepts the current code', async () => {
    const secret = generateSecret();
    const time = Date.now();
    const code = await totp(secret, { time });
    expect(await verifyTOTP(secret, code, { time })).toBe(true);
  });

  it('accepts a code from the previous step (clock drift, window=1)', async () => {
    const secret = generateSecret();
    const time = 1_700_000_000_000;
    const prev = await totp(secret, { time: time - 30_000 });
    expect(await verifyTOTP(secret, prev, { time, window: 1 })).toBe(true);
  });

  it('rejects a code two steps away with window=1', async () => {
    const secret = generateSecret();
    const time = 1_700_000_000_000;
    const old = await totp(secret, { time: time - 90_000 });
    expect(await verifyTOTP(secret, old, { time, window: 1 })).toBe(false);
  });

  it('rejects malformed / wrong-length tokens', async () => {
    const secret = generateSecret();
    expect(await verifyTOTP(secret, '12ab56', {})).toBe(false);
    expect(await verifyTOTP(secret, '12345', {})).toBe(false);
    expect(await verifyTOTP(secret, '', {})).toBe(false);
  });
});

describe('generateSecret + otpauthURL', () => {
  it('generates decodable secrets of the requested length', () => {
    const s = generateSecret(20);
    expect(base32Decode(s).length).toBe(20);
  });

  it('builds an otpauth URI carrying the secret and issuer', () => {
    const url = otpauthURL('JBSWY3DPEHPK3PXP', {
      issuer: 'Kelola ERP',
      account: 'admin',
    });
    expect(url).toMatch(/^otpauth:\/\/totp\//);
    expect(url).toContain('secret=JBSWY3DPEHPK3PXP');
    expect(url).toContain('issuer=Kelola+ERP');
  });
});
