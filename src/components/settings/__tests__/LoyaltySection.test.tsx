/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Rewards settings section states.
 *
 * `jest-environment-node` has no DOM, so these tests render the pure client
 * component to static markup. Hooks are mocked; the permission gate and the
 * new-cycle note are the behaviour under test.
 */

import React from 'react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';

const mockUseRole = jest.fn();

jest.mock('@/components/rbac/RoleProvider', () => ({
  useRole: () => mockUseRole(),
}));

jest.mock('@/lib/hooks/queries/useLoyaltySettings', () => {
  const actual = jest.requireActual('@/lib/hooks/queries/useLoyaltySettings');
  return {
    ...actual,
    useUpdateLoyaltySettings: () => ({
      mutateAsync: jest.fn(),
      isPending: false,
    }),
  };
});

const {
  LoyaltySection,
  LoyaltyPermissionDenied,
} = require('@/components/settings/LoyaltySection');

const initialData = {
  enabled: true,
  visitsRequired: '3',
  lookupLimitPerHour: '30',
  rewardType: 'PERCENT' as const,
  rewardValue: '10.00',
  maxDiscount: '15.00',
  minDailySpend: '20.00',
  rewardLabel: '10% off, max RM15',
  receiptLabel: 'REWARD 10%',
  termsText: '',
  noticeVersion: '2026-11',
  noticeText: 'We use your phone number to track visits.',
  privacyUrl: 'https://example.com/privacy',
};

describe('LoyaltySection states', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders a permission-denied state without the form', () => {
    mockUseRole.mockReturnValue({
      hasPermission: () => false,
      isLoading: false,
    });

    const markup = renderToStaticMarkup(
      <LoyaltySection initialData={initialData} onUpdate={() => {}} />
    );

    expect(markup).toContain('owner-only');
    expect(markup).toContain('loyalty:configure');
    expect(markup).not.toContain('Save rewards settings');
  });

  it('renders the form and the new-cycle note for an authorised owner', () => {
    mockUseRole.mockReturnValue({
      hasPermission: (permission: string) => permission === 'loyalty:configure',
      isLoading: false,
    });

    const markup = renderToStaticMarkup(
      <LoyaltySection initialData={initialData} onUpdate={() => {}} />
    );

    expect(markup).toContain('Changes apply to new visit card cycles');
    expect(markup).toContain('Enable rewards');
    expect(markup).toContain('Visits required');
    expect(markup).toContain('Loyalty orders per hour');
    expect(markup).toContain('contract minimum is 30');
    expect(markup).toContain('Receipt label');
    expect(markup).toContain('Save rewards settings');
  });

  it('renders the loading state while permissions load', () => {
    mockUseRole.mockReturnValue({
      hasPermission: () => false,
      isLoading: true,
    });

    const markup = renderToStaticMarkup(
      <LoyaltySection initialData={initialData} onUpdate={() => {}} />
    );

    expect(markup).toContain('Checking permissions');
  });

  it('exports a standalone permission-denied panel', () => {
    const markup = renderToStaticMarkup(<LoyaltyPermissionDenied />);
    expect(markup).toContain('owner-only');
  });

  it('uses high-contrast success and error banner text (L-01)', () => {
    const source = readFileSync(
      join(process.cwd(), 'src/components/settings/LoyaltySection.tsx'),
      'utf8'
    );

    expect(source).toContain('text-green-700');
    expect(source).not.toContain('text-green-600');
    expect(source).toContain('text-red-700');
    expect(source).not.toContain('text-red-600');
  });
});
