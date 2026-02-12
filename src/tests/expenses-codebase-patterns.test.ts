/**
 * Test Suite: Codebase Pattern Validation
 *
 * Static analysis tests that act as guardrails against regressions.
 * These read actual source files and verify codebase conventions are followed.
 *
 * Validates:
 * - No raw fetch() in expense/report hooks (must use ApiClient)
 * - No hardcoded "RM " currency strings (must use formatCurrency)
 * - CategoryBadge uses categoryName prop (not name)
 * - All hooks using React hooks have 'use client' directive
 * - All hooks use centralized queryKeys (not inline string arrays)
 * - No duplicate code blocks
 * - Correct imports (ApiClient, queryKeys, formatCurrency, useCurrency)
 */

import * as fs from 'fs';
import * as path from 'path';

// ============================================================================
// Helpers
// ============================================================================

const SRC_ROOT = path.resolve(__dirname, '..');

function readFile(relativePath: string): string {
  const fullPath = path.join(SRC_ROOT, relativePath);
  if (!fs.existsSync(fullPath)) {
    throw new Error(`File not found: ${fullPath}`);
  }
  return fs.readFileSync(fullPath, 'utf-8');
}

function getAllFilesInDir(dir: string, extension = '.ts'): string[] {
  const fullDir = path.join(SRC_ROOT, dir);
  if (!fs.existsSync(fullDir)) return [];
  return fs
    .readdirSync(fullDir)
    .filter((f) => f.endsWith(extension))
    .map((f) => path.join(dir, f));
}

// ============================================================================
// File lists
// ============================================================================

const EXPENSE_HOOKS = getAllFilesInDir('hooks/expenses');
const REPORT_HOOKS = getAllFilesInDir('hooks/reports');
const ALL_HOOKS = [...EXPENSE_HOOKS, ...REPORT_HOOKS];

// Components tested individually in Fix 3/4/7 sections below

// ============================================================================
// Fix 1: API endpoint exists
// ============================================================================

describe('Fix 1: Expenses Summary API Endpoint', () => {
  it('should have the summary route file', () => {
    const routePath = path.join(
      SRC_ROOT,
      'app/api/admin/expenses/summary/route.ts'
    );
    expect(fs.existsSync(routePath)).toBe(true);
  });

  it('should export a GET handler', () => {
    const content = readFile('app/api/admin/expenses/summary/route.ts');
    expect(content).toContain('export async function GET');
  });

  it('should use AuthServiceV2 for authentication', () => {
    const content = readFile('app/api/admin/expenses/summary/route.ts');
    expect(content).toContain('AuthServiceV2.validateToken');
  });

  it('should check for restaurant ownership (owner auth)', () => {
    const content = readFile('app/api/admin/expenses/summary/route.ts');
    expect(content).toContain("userType === 'restaurant_owner'");
    expect(content).toContain('prisma.restaurant.findFirst');
  });

  it('should check for expenses.view permission (staff auth)', () => {
    const content = readFile('app/api/admin/expenses/summary/route.ts');
    expect(content).toContain("'expenses.view'");
  });
});

// ============================================================================
// Fix 2: CategoryBadge prop name
// ============================================================================

describe('Fix 2: CategoryBadge Prop Names', () => {
  it('CategoryBadge interface should use categoryName (not name)', () => {
    const content = readFile('components/expenses/CategoryBadge.tsx');
    expect(content).toContain('categoryName: string');
    expect(content).not.toMatch(/^\s+name:\s+string/m);
  });

  it('CategoryManager should pass categoryName prop (not name)', () => {
    const content = readFile('components/expenses/CategoryManager.tsx');

    // Should use categoryName=
    const categoryNameMatches = content.match(
      /categoryName=\{category\.name\}/g
    );
    expect(categoryNameMatches).not.toBeNull();
    expect(categoryNameMatches!.length).toBeGreaterThanOrEqual(2);

    // Should NOT use bare name= for CategoryBadge
    expect(content).not.toMatch(
      /<CategoryBadge[\s\S]*?\bname=\{category\.name\}/
    );
  });

  it('ExpenseCard should pass categoryName prop', () => {
    const content = readFile('components/expenses/ExpenseCard.tsx');
    expect(content).toContain('categoryName={expense.category.name}');
    expect(content).not.toMatch(
      /<CategoryBadge[\s\S]*?\bname=\{expense\.category\.name\}/
    );
  });
});

// ============================================================================
// Fix 3: No hardcoded currency
// ============================================================================

describe('Fix 3: Dynamic Currency (No Hardcoded RM)', () => {
  const CURRENCY_FILES = [
    'components/expenses/ExpenseSummaryCards.tsx',
    'components/expenses/ExpenseCard.tsx',
    'components/expenses/ExpenseForm.tsx',
  ];

  CURRENCY_FILES.forEach((file) => {
    describe(file, () => {
      it('should NOT contain hardcoded "RM " currency prefix', () => {
        const content = readFile(file);
        // Match patterns like: RM {, RM ${, >RM , "RM "
        const hardcodedRM = content.match(/["'>}\s]RM\s*[\{$]/g);
        expect(hardcodedRM).toBeNull();
      });

      it('should import useCurrency hook', () => {
        const content = readFile(file);
        expect(content).toContain('useCurrency');
      });
    });
  });

  it('ExpenseSummaryCards should use formatCurrency()', () => {
    const content = readFile('components/expenses/ExpenseSummaryCards.tsx');
    expect(content).toContain('formatCurrency(card.amount, currency)');
    expect(content).toContain(
      "import { formatCurrency } from '@/lib/utils/currency-formatter'"
    );
  });

  it('ExpenseCard should use formatCurrency()', () => {
    const content = readFile('components/expenses/ExpenseCard.tsx');
    expect(content).toContain('formatCurrency(expense.amount, currency)');
    expect(content).toContain(
      "import { formatCurrency } from '@/lib/utils/currency-formatter'"
    );
  });

  it('ExpenseForm should pass dynamic currency to CurrencyInput', () => {
    const content = readFile('components/expenses/ExpenseForm.tsx');
    expect(content).toContain('currency={currency}');
    expect(content).not.toContain('currency="MYR"');
  });
});

// ============================================================================
// Fix 4: No duplicate loading state
// ============================================================================

describe('Fix 4: No Duplicate Loading State', () => {
  it('ExpenseSummaryCards should have exactly ONE isLoading check', () => {
    const content = readFile('components/expenses/ExpenseSummaryCards.tsx');
    const loadingMatches = content.match(/if\s*\(\s*isLoading\s*\)/g);
    expect(loadingMatches).not.toBeNull();
    expect(loadingMatches!.length).toBe(1);
  });
});

// ============================================================================
// Fix 5: All hooks use ApiClient (no raw fetch)
// ============================================================================

describe('Fix 5: ApiClient Usage (No Raw fetch)', () => {
  ALL_HOOKS.forEach((hookPath) => {
    const hookName = path.basename(hookPath, '.ts');

    describe(hookName, () => {
      it('should NOT contain raw fetch() calls', () => {
        const content = readFile(hookPath);
        // Match: await fetch(, fetch(, .fetch(
        // Exclude comments that mention fetch
        const lines = content.split('\n');
        const fetchLines = lines.filter(
          (line) =>
            !line.trim().startsWith('//') &&
            !line.trim().startsWith('*') &&
            /\bfetch\s*\(/.test(line)
        );
        expect(fetchLines).toEqual([]);
      });

      it('should import ApiClient', () => {
        const content = readFile(hookPath);
        expect(content).toContain("from '@/lib/api-client'");
      });
    });
  });
});

// ============================================================================
// Fix 6: Centralized query keys
// ============================================================================

describe('Fix 6: Centralized Query Keys', () => {
  it('query-client.ts should define expenses query keys', () => {
    const content = readFile('lib/query-client.ts');
    expect(content).toContain('expenses:');
    expect(content).toMatch(/expenses:\s*\{/);
    expect(content).toContain("all: ['expenses']");
    expect(content).toContain("'expenses', 'list'");
    expect(content).toContain("'expenses', 'summary'");
    expect(content).toContain("'expenses', 'categories'");
  });

  it('query-client.ts should define profitLoss query keys', () => {
    const content = readFile('lib/query-client.ts');
    expect(content).toContain('profitLoss:');
    expect(content).toContain("'profit-loss'");
  });

  ALL_HOOKS.forEach((hookPath) => {
    const hookName = path.basename(hookPath, '.ts');

    it(`${hookName} should import queryKeys from query-client`, () => {
      const content = readFile(hookPath);
      expect(content).toContain("from '@/lib/query-client'");
    });

    it(`${hookName} should NOT use inline query key string arrays`, () => {
      const content = readFile(hookPath);
      // Match inline arrays like: queryKey: ['expenses', ...] or queryKey: ['expense-categories'
      // but NOT inside import statements or type definitions
      const lines = content.split('\n');
      const inlineKeyLines = lines.filter(
        (line) =>
          /queryKey:\s*\[['"]/.test(line) && !line.includes('queryKeys.')
      );
      expect(inlineKeyLines).toEqual([]);
    });
  });
});

// ============================================================================
// Fix 7: 'use client' directives
// ============================================================================

describe("Fix 7: 'use client' Directives", () => {
  const FILES_NEEDING_USE_CLIENT = [
    // Hooks using React hooks
    ...ALL_HOOKS,
    // Components using hooks
    'components/expenses/ExpenseSummaryCards.tsx',
    'components/expenses/ExpenseCard.tsx',
    'components/expenses/ExpenseForm.tsx',
    'components/expenses/CategoryManager.tsx',
    'components/reports/ProfitLossHeader.tsx',
  ];

  FILES_NEEDING_USE_CLIENT.forEach((filePath) => {
    it(`${path.basename(filePath)} should have 'use client' directive`, () => {
      const content = readFile(filePath);
      const firstNonEmptyLine = content
        .split('\n')
        .find((line) => line.trim().length > 0);
      expect(firstNonEmptyLine?.trim()).toBe("'use client';");
    });
  });

  it("CategoryBadge should NOT have 'use client' (pure presentational)", () => {
    const content = readFile('components/expenses/CategoryBadge.tsx');
    expect(content).not.toMatch(/^['"]use client['"];?\s*$/m);
  });
});

// ============================================================================
// Additional: Import Consistency
// ============================================================================

describe('Import Consistency', () => {
  it('no expense hook should import from sonner without using toast', () => {
    ALL_HOOKS.forEach((hookPath) => {
      const content = readFile(hookPath);
      if (content.includes("from 'sonner'")) {
        // If importing sonner, must use toast
        expect(content).toMatch(/toast\.(success|error)\(/);
      }
    });
  });

  it('no unused React import in ExpenseSummaryCards', () => {
    const content = readFile('components/expenses/ExpenseSummaryCards.tsx');
    // Should NOT import React since it doesn't use React.*
    expect(content).not.toMatch(/^import React from ['"]react['"];?\s*$/m);
  });
});

// ============================================================================
// Summary endpoint matches auth pattern from expenses/route.ts
// ============================================================================

describe('Auth Pattern Consistency', () => {
  it('summary route should use same cookie names as expenses route', () => {
    const summaryContent = readFile('app/api/admin/expenses/summary/route.ts');
    const expensesContent = readFile('app/api/admin/expenses/route.ts');

    // Both should check qr_rbac_token and qr_auth_token
    expect(summaryContent).toContain('qr_rbac_token');
    expect(summaryContent).toContain('qr_auth_token');
    expect(expensesContent).toContain('qr_rbac_token');
    expect(expensesContent).toContain('qr_auth_token');
  });

  it('summary route should check same user types as expenses route', () => {
    const summaryContent = readFile('app/api/admin/expenses/summary/route.ts');

    expect(summaryContent).toContain("userType === 'restaurant_owner'");
    expect(summaryContent).toContain("userType === 'staff'");
    expect(summaryContent).toContain("'Invalid user type'");
  });
});
