/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Loyalty report page states and rendering.
 *
 * Node environment, so the page is rendered to static markup with its hooks
 * mocked. The fixture deliberately makes `net` inconsistent with
 * `gross - discounts` to prove the view renders the server string and never
 * recomputes it.
 */

import React from 'react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';

const mockUseRole = jest.fn();
const mockUseLoyaltyReport = jest.fn();

jest.mock('@/components/rbac/RoleProvider', () => ({
  useRole: () => mockUseRole(),
}));

jest.mock('@/lib/hooks/queries/useLoyaltyReport', () => {
  const actual = jest.requireActual('@/lib/hooks/queries/useLoyaltyReport');
  return {
    ...actual,
    useLoyaltyReport: (...args: unknown[]) => mockUseLoyaltyReport(...args),
  };
});

const LoyaltyReportPage =
  require('@/app/dashboard/reports/loyalty/page').default;

const report = {
  range: {
    from: '2026-11-01',
    to: '2026-11-07',
    timezone: 'Asia/Kuala_Lumpur',
    currency: 'MYR',
  },
  gross: '100.00',
  discounts: {
    total: '20.00',
    bySource: {
      PROMOTION: '12.00',
      LOYALTY_REWARD: '8.00',
    },
  },
  // Deliberately not 100.00 - 20.00. The view must render 79.99.
  net: '79.99',
  refunds: '5.00',
  visits: {
    count: 4,
    uniqueMembers: 3,
    repeatMembers: 1,
    repeatRate: '0.3333',
  },
  rewards: {
    applied: 1,
    amount: '8.00',
  },
  promotionRedemptions: {
    total: 2,
    byScope: {
      ORDER: { count: 1, amount: '7.00' },
      CATEGORY: { count: 1, amount: '5.00' },
      ITEM: { count: 0, amount: '0.00' },
    },
  },
  members: {
    total: 10,
    active: 9,
    anonymized: 1,
    newInRange: 2,
    marketingOptIn: 4,
  },
};

function authorisedRole() {
  return {
    hasPermission: (permission: string) => permission === 'loyalty:report',
    isLoading: false,
  };
}

function renderPage() {
  return renderToStaticMarkup(<LoyaltyReportPage />);
}

describe('LoyaltyReportPage states', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseRole.mockReturnValue(authorisedRole());
    mockUseLoyaltyReport.mockReturnValue({
      data: report,
      isLoading: false,
      isError: false,
      error: null,
      refetch: jest.fn(),
    });
  });

  it('renders a permission-denied state and keeps the query disabled', () => {
    mockUseRole.mockReturnValue({
      hasPermission: () => false,
      isLoading: false,
    });

    const markup = renderPage();

    expect(markup).toContain('owner-managed');
    expect(markup).toContain('loyalty:report');
    expect(markup).not.toContain('Apply range');
    expect(mockUseLoyaltyReport).toHaveBeenCalledWith(expect.any(Object), {
      enabled: false,
    });
  });

  it('renders a loading state', () => {
    mockUseLoyaltyReport.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
      error: null,
      refetch: jest.fn(),
    });

    expect(renderPage()).toContain('Loading loyalty report...');
  });

  it('renders an error state with a retry action', () => {
    mockUseLoyaltyReport.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: new Error('Could not load the loyalty report'),
      refetch: jest.fn(),
    });

    const markup = renderPage();

    expect(markup).toContain('Could not load the loyalty report');
    expect(markup).toContain('Retry');
  });

  it('renders the empty state for a range with no activity', () => {
    mockUseLoyaltyReport.mockReturnValue({
      data: {
        ...report,
        gross: '0.00',
        discounts: {
          total: '0.00',
          bySource: { PROMOTION: '0.00', LOYALTY_REWARD: '0.00' },
        },
        net: '0.00',
        refunds: '0.00',
        visits: {
          count: 0,
          uniqueMembers: 0,
          repeatMembers: 0,
          repeatRate: '0.0000',
        },
        rewards: { applied: 0, amount: '0.00' },
        promotionRedemptions: {
          total: 0,
          byScope: {
            ORDER: { count: 0, amount: '0.00' },
            CATEGORY: { count: 0, amount: '0.00' },
            ITEM: { count: 0, amount: '0.00' },
          },
        },
        members: {
          total: 10,
          active: 9,
          anonymized: 1,
          newInRange: 0,
          marketingOptIn: 4,
        },
      },
      isLoading: false,
      isError: false,
      error: null,
      refetch: jest.fn(),
    });

    expect(renderPage()).toContain('No loyalty activity in this range');
  });
});

describe('Loyalty report rendering', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseRole.mockReturnValue(authorisedRole());
    mockUseLoyaltyReport.mockReturnValue({
      data: report,
      isLoading: false,
      isError: false,
      error: null,
      refetch: jest.fn(),
    });
  });

  it('renders money exactly as the server returns it, never recomputed', () => {
    const markup = renderPage();

    expect(markup).toContain('MYR 100.00');
    expect(markup).toContain('MYR 20.00');
    expect(markup).toContain('MYR 79.99');
    expect(markup).not.toContain('MYR 80.00');
    expect(markup).toContain('MYR 5.00');
  });

  it('renders discounts by source and redemptions by scope', () => {
    const markup = renderPage();

    expect(markup).toContain('MYR 12.00');
    expect(markup).toContain('MYR 8.00');
    expect(markup).toContain('Whole order');
    expect(markup).toContain('Category');
    expect(markup).toContain('Item');
    expect(markup).toContain('1 · MYR 7.00');
    expect(markup).toContain('1 · MYR 5.00');
    expect(markup).toContain('0 · MYR 0.00');
  });

  it('renders visits, rewards and member counts', () => {
    const markup = renderPage();

    expect(markup).toContain('Visits');
    expect(markup).toContain('Repeat rate (ratio)');
    expect(markup).toContain('0.3333');
    expect(markup).toContain('Rewards applied');
    expect(markup).toContain('Marketing opt-in');
    expect(markup).not.toMatch(/points|stamps|cashback/i);
  });

  it('does not contain client-side money arithmetic', () => {
    const source = readFileSync(
      join(
        process.cwd(),
        'src/app/dashboard/reports/loyalty/LoyaltyReportStates.tsx'
      ),
      'utf8'
    );

    expect(source).not.toMatch(/report\.gross\s*[-+]/);
    expect(source).not.toMatch(/report\.discounts\.total\s*[-+]/);
  });
});
