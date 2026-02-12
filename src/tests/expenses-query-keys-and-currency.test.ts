/**
 * Test Suite: Query Keys Factory & Currency Formatter
 *
 * Unit tests for:
 * - queryKeys.expenses.* factory functions (type safety, uniqueness, structure)
 * - queryKeys.profitLoss.* factory functions
 * - formatCurrency() output for various currencies
 * - formatCurrencySimple() output
 * - getCurrencySymbol() lookup
 * - Edge cases (negative amounts, zero, large numbers, unknown currencies)
 */

import { queryKeys } from '@/lib/query-client';
import {
  formatCurrency,
  getCurrencySymbol,
  formatCurrencySimple,
} from '@/lib/utils/currency-formatter';

// ============================================================================
// Query Keys Tests
// ============================================================================

describe('queryKeys.expenses', () => {
  describe('all', () => {
    it('should return static array', () => {
      expect(queryKeys.expenses.all).toEqual(['expenses']);
    });

    it('should be a tuple with "expenses" as first element', () => {
      expect(queryKeys.expenses.all).toHaveLength(1);
      expect(queryKeys.expenses.all[0]).toBe('expenses');
    });
  });

  describe('list', () => {
    it('should include filters in the key', () => {
      const filters = { restaurantId: 'r1', startDate: '2025-01-01' };
      const key = queryKeys.expenses.list(filters);
      expect(key).toEqual(['expenses', 'list', filters]);
    });

    it('should produce different keys for different filters', () => {
      const key1 = queryKeys.expenses.list({ restaurantId: 'r1' });
      const key2 = queryKeys.expenses.list({ restaurantId: 'r2' });
      expect(key1).not.toEqual(key2);
    });

    it('should start with expenses.all prefix for invalidation', () => {
      const key = queryKeys.expenses.list({ restaurantId: 'r1' });
      expect(key[0]).toBe(queryKeys.expenses.all[0]);
    });
  });

  describe('summary', () => {
    it('should include params in the key', () => {
      const params = {
        restaurantId: 'r1',
        startDate: '2025-01-01',
        endDate: '2025-01-31',
      };
      const key = queryKeys.expenses.summary(params);
      expect(key).toEqual(['expenses', 'summary', params]);
    });

    it('should produce different keys for different date ranges', () => {
      const key1 = queryKeys.expenses.summary({
        restaurantId: 'r1',
        startDate: '2025-01-01',
      });
      const key2 = queryKeys.expenses.summary({
        restaurantId: 'r1',
        startDate: '2025-02-01',
      });
      expect(key1).not.toEqual(key2);
    });
  });

  describe('categories', () => {
    it('should include restaurantId in the key', () => {
      const key = queryKeys.expenses.categories('rest-123');
      expect(key).toEqual(['expenses', 'categories', 'rest-123']);
    });

    it('should produce different keys for different restaurants', () => {
      const key1 = queryKeys.expenses.categories('rest-1');
      const key2 = queryKeys.expenses.categories('rest-2');
      expect(key1).not.toEqual(key2);
    });
  });

  describe('cache invalidation hierarchy', () => {
    it('invalidating expenses.all should match list, summary, and categories keys', () => {
      // TanStack Query invalidates by prefix matching.
      // All expense keys should start with 'expenses' so that
      // invalidating queryKeys.expenses.all matches them all.
      const allPrefix = queryKeys.expenses.all[0];
      const listKey = queryKeys.expenses.list({ r: '1' });
      const summaryKey = queryKeys.expenses.summary({ r: '1' });
      const catKey = queryKeys.expenses.categories('r1');

      expect(listKey[0]).toBe(allPrefix);
      expect(summaryKey[0]).toBe(allPrefix);
      expect(catKey[0]).toBe(allPrefix);
    });
  });
});

describe('queryKeys.profitLoss', () => {
  describe('report', () => {
    it('should include params in the key', () => {
      const params = { restaurantId: 'r1', startDate: '2025-01-01' };
      const key = queryKeys.profitLoss.report(params);
      expect(key).toEqual(['profit-loss', params]);
    });

    it('should produce different keys for different params', () => {
      const key1 = queryKeys.profitLoss.report({ restaurantId: 'r1' });
      const key2 = queryKeys.profitLoss.report({ restaurantId: 'r2' });
      expect(key1).not.toEqual(key2);
    });
  });
});

// ============================================================================
// Currency Formatter Tests
// ============================================================================

describe('formatCurrency', () => {
  it('should format MYR amounts correctly', () => {
    const result = formatCurrency(12.5, 'MYR');
    // Intl.NumberFormat with en-MY locale for MYR
    expect(result).toContain('12.50');
    expect(result).toMatch(/RM/);
  });

  it('should format USD amounts correctly', () => {
    const result = formatCurrency(99.99, 'USD');
    expect(result).toContain('99.99');
    expect(result).toMatch(/\$/);
  });

  it('should format EUR amounts correctly', () => {
    const result = formatCurrency(1000, 'EUR');
    expect(result).toMatch(/€|EUR/);
    expect(result).toContain('1,000');
  });

  it('should default to MYR when currency is not provided', () => {
    const result = formatCurrency(50);
    expect(result).toMatch(/RM/);
    expect(result).toContain('50.00');
  });

  it('should handle zero amount', () => {
    const result = formatCurrency(0, 'MYR');
    expect(result).toContain('0.00');
  });

  it('should handle negative amounts', () => {
    const result = formatCurrency(-25.5, 'MYR');
    expect(result).toContain('25.50');
    expect(result).toMatch(/-/);
  });

  it('should handle string amounts', () => {
    const result = formatCurrency('123.45', 'MYR');
    expect(result).toContain('123.45');
  });

  it('should handle large amounts with proper grouping', () => {
    const result = formatCurrency(1234567.89, 'MYR');
    expect(result).toContain('1,234,567.89');
  });

  it('should handle very small decimal amounts', () => {
    const result = formatCurrency(0.01, 'MYR');
    expect(result).toContain('0.01');
  });
});

describe('getCurrencySymbol', () => {
  it('should return RM for MYR', () => {
    expect(getCurrencySymbol('MYR')).toBe('RM');
  });

  it('should return $ for USD', () => {
    expect(getCurrencySymbol('USD')).toBe('$');
  });

  it('should return S$ for SGD', () => {
    expect(getCurrencySymbol('SGD')).toBe('S$');
  });

  it('should return € for EUR', () => {
    expect(getCurrencySymbol('EUR')).toBe('€');
  });

  it('should return the currency code itself for unknown currencies', () => {
    expect(getCurrencySymbol('XYZ')).toBe('XYZ');
  });

  it('should handle all major Asian currencies', () => {
    expect(getCurrencySymbol('JPY')).toBe('¥');
    expect(getCurrencySymbol('KRW')).toBe('₩');
    expect(getCurrencySymbol('THB')).toBe('฿');
    expect(getCurrencySymbol('IDR')).toBe('Rp');
    expect(getCurrencySymbol('PHP')).toBe('₱');
    expect(getCurrencySymbol('INR')).toBe('₹');
  });
});

describe('formatCurrencySimple', () => {
  it('should format as "SYMBOL AMOUNT" pattern', () => {
    const result = formatCurrencySimple(12.5, 'MYR');
    expect(result).toBe('RM 12.50');
  });

  it('should format USD correctly', () => {
    const result = formatCurrencySimple(99.99, 'USD');
    expect(result).toBe('$ 99.99');
  });

  it('should handle zero', () => {
    const result = formatCurrencySimple(0, 'MYR');
    expect(result).toBe('RM 0.00');
  });

  it('should always show 2 decimal places', () => {
    const result = formatCurrencySimple(100, 'MYR');
    expect(result).toBe('RM 100.00');
  });

  it('should use currency code for unknown currencies', () => {
    const result = formatCurrencySimple(50, 'XYZ');
    expect(result).toBe('XYZ 50.00');
  });
});
