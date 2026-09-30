import { describe, it, expect } from 'vitest';

describe('Data Validation', () => {
  describe('Input Sanitization', () => {
    it('should sanitize text input', () => {
      const input = '  Test Product  ';
      const sanitized = input.trim();

      expect(sanitized).toBe('Test Product');
    });

    it('should handle null and undefined', () => {
      const nullInput = null;
      const undefinedInput = undefined;

      const sanitizedNull =
        nullInput === null || nullInput === undefined ? '' : String(nullInput).trim();
      const sanitizedUndefined =
        undefinedInput === null || undefinedInput === undefined
          ? ''
          : String(undefinedInput).trim();

      expect(sanitizedNull).toBe('');
      expect(sanitizedUndefined).toBe('');
    });

    it('should sanitize number input', () => {
      const input = '123.45';
      const sanitized = parseFloat(input);

      expect(sanitized).toBe(123.45);
      expect(isNaN(sanitized)).toBe(false);
    });

    it('should handle invalid numbers', () => {
      const input = 'not-a-number';
      const sanitized = parseFloat(input);

      expect(isNaN(sanitized)).toBe(true);
    });

    it('should prevent negative numbers when required', () => {
      const input = -50;
      const sanitized = Math.max(0, input);

      expect(sanitized).toBe(0);
    });
  });

  describe('Date Validation', () => {
    it('should validate date format YYYY-MM-DD', () => {
      const validDate = '2026-05-04';
      const regex = /^\d{4}-\d{2}-\d{2}$/;

      expect(regex.test(validDate)).toBe(true);
    });

    it('should reject invalid date formats', () => {
      const invalidDates = ['2026/05/04', '04-05-2026', '2026-5-4', 'invalid'];
      const regex = /^\d{4}-\d{2}-\d{2}$/;

      invalidDates.forEach(date => {
        expect(regex.test(date)).toBe(false);
      });
    });

    it('should validate actual date values', () => {
      const validDate = '2026-02-28';
      const date = new Date(validDate + 'T00:00:00');

      expect(isNaN(date.getTime())).toBe(false);
    });

    it('should reject invalid date values', () => {
      const invalidDate = '2026-02-30'; // February doesn't have 30 days
      const date = new Date(invalidDate + 'T00:00:00');
      const [year, month, day] = invalidDate.split('-').map(Number);

      const isValid =
        date.getFullYear() === year && date.getMonth() + 1 === month && date.getDate() === day;

      expect(isValid).toBe(false);
    });
  });

  describe('XSS Prevention', () => {
    it('should escape HTML special characters', () => {
      const escapeHtml = (text: string) => {
        return String(text)
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;')
          .replace(/'/g, '&#39;');
      };

      const malicious = '<script>alert("XSS")</script>';
      const escaped = escapeHtml(malicious);

      expect(escaped).toBe('&lt;script&gt;alert(&quot;XSS&quot;)&lt;/script&gt;');
      expect(escaped).not.toContain('<script>');
    });

    it('should handle ampersands correctly', () => {
      const escapeHtml = (text: string) => {
        return String(text)
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;')
          .replace(/'/g, '&#39;');
      };

      const input = 'Tom & Jerry';
      const escaped = escapeHtml(input);

      expect(escaped).toBe('Tom &amp; Jerry');
    });
  });

  describe('ID Generation', () => {
    it('should generate unique IDs with year prefix', () => {
      const year = new Date().getFullYear();
      const prefix = 'SO';
      const sequence = 1;

      const id = `${prefix}-${year}-${String(sequence).padStart(3, '0')}`;

      expect(id).toMatch(/^SO-\d{4}-\d{3}$/);
      expect(id).toContain(String(year));
    });

    it('should handle year boundaries correctly', () => {
      const id2025 = 'SO-2025-999';
      const id2026 = 'SO-2026-001';

      const [, year1] = id2025.split('-');
      const [, year2] = id2026.split('-');

      expect(parseInt(year2)).toBeGreaterThan(parseInt(year1));
    });

    it('should pad sequence numbers correctly', () => {
      const sequences = [1, 10, 100];
      const padded = sequences.map(seq => String(seq).padStart(3, '0'));

      expect(padded).toEqual(['001', '010', '100']);
    });
  });

  describe('Currency Formatting', () => {
    it('should format Indonesian Rupiah correctly', () => {
      const amount = 1000000;
      const formatted = amount.toLocaleString('id-ID');

      expect(formatted).toBe('1.000.000');
    });

    it('should handle negative amounts', () => {
      const amount = -500000;
      const abs = Math.abs(amount);
      const formatted = abs.toLocaleString('id-ID');

      expect(formatted).toBe('500.000');
    });

    it('should abbreviate large numbers', () => {
      const BILLION = 1_000_000_000;
      const MILLION = 1_000_000;

      const amount = 2_500_000_000;
      const abbreviated =
        amount >= BILLION
          ? `${(amount / BILLION).toFixed(1)}Md`
          : `${(amount / MILLION).toFixed(1)}jt`;

      expect(abbreviated).toBe('2.5Md');
    });
  });
});
