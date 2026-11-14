/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Loyalty settings hooks and form helpers.
 *
 * The environment is jest-environment-node, so the hook tests inspect the
 * config passed to TanStack Query (the existing `expenses-hooks.test.ts`
 * pattern) rather than rendering React.
 */

const mockUseQuery = jest.fn();
const mockUseMutation = jest.fn();
const mockInvalidateQueries = jest.fn();
const mockSetQueryData = jest.fn();

jest.mock('@tanstack/react-query', () => ({
  QueryClient: jest.fn().mockImplementation(() => ({ defaultOptions: {} })),
  useQuery: (...args: unknown[]) => {
    mockUseQuery(...args);
    return { data: null, isLoading: false, error: null };
  },
  useMutation: (...args: unknown[]) => {
    mockUseMutation(...args);
    return { mutateAsync: jest.fn(), isPending: false };
  },
  useQueryClient: () => ({
    invalidateQueries: mockInvalidateQueries,
    setQueryData: mockSetQueryData,
  }),
}));

jest.mock('@/lib/api-client', () => ({
  ApiClient: {
    get: jest.fn(),
    patch: jest.fn(),
  },
}));

import { ApiClient } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-client';

function getQueryConfig(hookFn: (...args: unknown[]) => unknown) {
  mockUseQuery.mockClear();
  hookFn();
  return mockUseQuery.mock.calls[0]?.[0];
}

function getMutationConfig(hookFn: (...args: unknown[]) => unknown) {
  mockUseMutation.mockClear();
  hookFn();
  return mockUseMutation.mock.calls[0]?.[0];
}

const baseForm = {
  enabled: true,
  visitsRequired: '3',
  lookupLimitPerHour: '30',
  rewardType: 'PERCENT' as const,
  rewardValue: '10',
  maxDiscount: '15',
  minDailySpend: '20',
  rewardLabel: '10% off, max RM15',
  receiptLabel: 'REWARD 10%',
  termsText: 'One reward per card.',
  noticeVersion: '2026-11',
  noticeText: 'We use your phone number to track visits.',
  privacyUrl: 'https://example.com/privacy',
};

describe('loyalty settings payload builder', () => {
  it('formats money as 2dp strings and never sends noticeTextHash', () => {
    const {
      buildLoyaltySettingsPayload,
    } = require('@/lib/hooks/queries/useLoyaltySettings');

    const payload = buildLoyaltySettingsPayload({
      ...baseForm,
      rewardValue: '10',
      maxDiscount: '15.5',
      minDailySpend: '20',
    });

    expect(payload.rewardValue).toBe('10.00');
    expect(payload.maxDiscount).toBe('15.50');
    expect(payload.minDailySpend).toBe('20.00');
    expect(payload).not.toHaveProperty('noticeTextHash');
    expect(JSON.stringify(payload)).not.toContain('noticeTextHash');
  });

  it('sends null for optional fields left blank', () => {
    const {
      buildLoyaltySettingsPayload,
    } = require('@/lib/hooks/queries/useLoyaltySettings');

    const payload = buildLoyaltySettingsPayload({
      ...baseForm,
      receiptLabel: '   ',
      termsText: '',
      noticeVersion: '  ',
      noticeText: '',
      privacyUrl: '',
    });

    expect(payload.receiptLabel).toBeNull();
    expect(payload.termsText).toBeNull();
    expect(payload.noticeVersion).toBeNull();
    expect(payload.noticeText).toBeNull();
    expect(payload.privacyUrl).toBeNull();
  });
});

describe('loyalty settings form validation', () => {
  const {
    validateLoyaltySettingsForm,
  } = require('@/lib/hooks/queries/useLoyaltySettings');

  it('accepts the boundary values', () => {
    expect(
      validateLoyaltySettingsForm({
        ...baseForm,
        visitsRequired: '2',
        lookupLimitPerHour: '1',
        minDailySpend: '0.00',
        rewardValue: '0.00',
      })
    ).toEqual({});

    expect(
      validateLoyaltySettingsForm({
        ...baseForm,
        visitsRequired: '10',
        lookupLimitPerHour: '1000',
        minDailySpend: '1000.00',
        rewardValue: '100.00',
      })
    ).toEqual({});
  });

  it('rejects lookupLimitPerHour outside 1–1000 and non-integers', () => {
    for (const lookupLimitPerHour of ['0', '1001', '30.5', '']) {
      expect(
        validateLoyaltySettingsForm({ ...baseForm, lookupLimitPerHour })
          .lookupLimitPerHour
      ).toBeTruthy();
    }
  });

  it('rejects visitsRequired outside 2–10 and non-integers', () => {
    const {
      validateLoyaltySettingsForm,
    } = require('@/lib/hooks/queries/useLoyaltySettings');
    for (const visitsRequired of ['1', '11', '3.5', '']) {
      expect(
        validateLoyaltySettingsForm({ ...baseForm, visitsRequired })
          .visitsRequired
      ).toBeTruthy();
    }
  });

  it('rejects minDailySpend outside 0–1000', () => {
    expect(
      validateLoyaltySettingsForm({ ...baseForm, minDailySpend: '1000.01' })
        .minDailySpend
    ).toBeTruthy();
  });

  it('rejects PERCENT outside 0–100 and FIXED at or below 0', () => {
    expect(
      validateLoyaltySettingsForm({
        ...baseForm,
        rewardType: 'PERCENT',
        rewardValue: '100.01',
      }).rewardValue
    ).toBeTruthy();

    expect(
      validateLoyaltySettingsForm({
        ...baseForm,
        rewardType: 'FIXED',
        rewardValue: '0.00',
      }).rewardValue
    ).toBeTruthy();

    expect(
      validateLoyaltySettingsForm({
        ...baseForm,
        rewardType: 'FIXED',
        rewardValue: '0.01',
      }).rewardValue
    ).toBeUndefined();
  });

  it('rejects non-ASCII and over-long receipt labels', () => {
    expect(
      validateLoyaltySettingsForm({ ...baseForm, receiptLabel: 'CAFÉ' })
        .receiptLabel
    ).toBeTruthy();
    expect(
      validateLoyaltySettingsForm({
        ...baseForm,
        receiptLabel: '123456789012345678901',
      }).receiptLabel
    ).toBeTruthy();
    expect(
      validateLoyaltySettingsForm({
        ...baseForm,
        receiptLabel: '12345678901234567890',
      }).receiptLabel
    ).toBeUndefined();
  });

  it('rejects enabling without a complete customer notice', () => {
    const errors = validateLoyaltySettingsForm({
      ...baseForm,
      enabled: true,
      noticeVersion: '',
      noticeText: '',
      privacyUrl: '',
    });
    expect(errors.form).toContain('notice');
  });

  it('allows an incomplete notice while rewards are disabled', () => {
    expect(
      validateLoyaltySettingsForm({
        ...baseForm,
        enabled: false,
        noticeVersion: '',
        noticeText: '',
        privacyUrl: '',
      }).form
    ).toBeUndefined();
  });
});

describe('loyalty settings query and mutation config', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('reads GET /settings/restaurant/loyalty', () => {
    const {
      useLoyaltySettings,
    } = require('@/lib/hooks/queries/useLoyaltySettings');
    const config = getQueryConfig(useLoyaltySettings);
    expect(config.queryKey).toEqual(queryKeys.loyalty.settings);
  });

  it('sends a fresh Idempotency-Key per submit with no noticeTextHash', async () => {
    const {
      useUpdateLoyaltySettings,
      buildLoyaltySettingsPayload,
    } = require('@/lib/hooks/queries/useLoyaltySettings');
    const config = getMutationConfig(useUpdateLoyaltySettings);
    const payload = buildLoyaltySettingsPayload(baseForm);

    await config.mutationFn(payload);
    await config.mutationFn(payload);

    expect(ApiClient.patch).toHaveBeenCalledTimes(2);
    const first = (ApiClient.patch as jest.Mock).mock.calls[0];
    const second = (ApiClient.patch as jest.Mock).mock.calls[1];

    expect(first[0]).toBe('/settings/restaurant/loyalty');
    expect(first[1]).toEqual(payload);
    expect(first[1]).not.toHaveProperty('noticeTextHash');
    expect(first[2].headers['Idempotency-Key']).toBeTruthy();
    expect(second[2].headers['Idempotency-Key']).toBeTruthy();
    expect(first[2].headers['Idempotency-Key']).not.toBe(
      second[2].headers['Idempotency-Key']
    );
  });
});
