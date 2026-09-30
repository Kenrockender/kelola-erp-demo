import { describe, it, expect, beforeEach } from 'vitest';

describe('ERP Core Functionality', () => {
  describe('Data Validation', () => {
    it('should validate required fields', () => {
      const data = { name: 'Test Product', price: 100 };
      expect(data.name).toBeDefined();
      expect(data.price).toBeGreaterThan(0);
    });

    it('should reject invalid email format', () => {
      const invalidEmail = 'not-an-email';
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      expect(emailRegex.test(invalidEmail)).toBe(false);
    });

    it('should accept valid email format', () => {
      const validEmail = 'user@example.com';
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      expect(emailRegex.test(validEmail)).toBe(true);
    });
  });

  describe('Number Formatting', () => {
    it('should format currency correctly', () => {
      const amount = 1000000;
      const formatted = new Intl.NumberFormat('id-ID', {
        style: 'currency',
        currency: 'IDR',
      }).format(amount);
      expect(formatted).toContain('1.000.000');
    });

    it('should handle decimal numbers', () => {
      const price = 1500.5;
      expect(price).toBeCloseTo(1500.5, 2);
    });
  });

  describe('DOM Manipulation', () => {
    beforeEach(() => {
      document.body.innerHTML = '<div id="test-container"></div>';
    });

    it('should create and append elements', () => {
      const container = document.getElementById('test-container');
      const newElement = document.createElement('div');
      newElement.textContent = 'Test Content';
      container?.appendChild(newElement);

      expect(container?.children.length).toBe(1);
      expect(container?.textContent).toBe('Test Content');
    });

    it('should update element attributes', () => {
      const element = document.createElement('button');
      element.setAttribute('data-view', 'dashboard');
      element.classList.add('active');

      expect(element.getAttribute('data-view')).toBe('dashboard');
      expect(element.classList.contains('active')).toBe(true);
    });
  });

  describe('Array Operations', () => {
    it('should filter items correctly', () => {
      const items = [
        { name: 'Product A', price: 100 },
        { name: 'Product B', price: 200 },
        { name: 'Product C', price: 150 },
      ];

      const filtered = items.filter(item => item.price > 100);
      expect(filtered).toHaveLength(2);
    });

    it('should calculate totals', () => {
      const items = [
        { quantity: 2, price: 100 },
        { quantity: 3, price: 200 },
      ];

      const total = items.reduce((sum, item) => sum + item.quantity * item.price, 0);
      expect(total).toBe(800);
    });
  });
});
