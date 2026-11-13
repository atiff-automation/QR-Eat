/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Promotions hooks and form helpers.
 *
 * Node test environment, so hook tests inspect TanStack Query config rather
 * than rendering. Payload builder tests cover 2dp money and date-only endsAt.
 */

const mockUseQuery = jest.fn();
const mockUseMutation = jest.fn();
const mockInvalidateQueries = jest.fn();

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
    setQueryData: jest.fn(),
  }),
}));

jest.mock('@/lib/api-client', () => ({
  ApiClient: {
    get: jest.fn(),
    post: jest.fn(),
    patch: jest.fn(),
    delete: jest.fn(),
  },
}));

import { ApiClient } from '@/lib/api-client';

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
  name: 'Lunch 20%',
  receiptLabel: 'Lunch 20%',
  type: 'PERCENT' as const,
  value: '20',
  scope: 'CATEGORY' as const,
  categoryIds: ['category-1'],
  itemIds: [],
  minSpend: '0',
  maxDiscount: '15',
  startsAt: '2026-11-01',
  endsAt: '2026-12-31',
  isActive: true,
};

describe('promotion payload builder', () => {
  it('formats money as 2dp strings and sends endsAt as a date', () => {
    const {
      buildPromotionPayload,
    } = require('@/lib/hooks/queries/usePromotions');

    const payload = buildPromotionPayload({
      ...baseForm,
      value: '20',
      minSpend: '10.5',
      maxDiscount: '15',
    });

    expect(payload.value).toBe('20.00');
    expect(payload.minSpend).toBe('10.50');
    expect(payload.maxDiscount).toBe('15.00');
    expect(payload.endsAt).toBe('2026-12-31');
    expect(payload.endsAt).not.toContain('T');
    expect(payload.startsAt).toBe('2026-11-01');
  });

  it('clears ids that do not match the scope', () => {
    const {
      buildPromotionPayload,
    } = require('@/lib/hooks/queries/usePromotions');

    expect(
      buildPromotionPayload({ ...baseForm, scope: 'ORDER' })
    ).toMatchObject({ categoryIds: [], itemIds: [] });
    expect(
      buildPromotionPayload({ ...baseForm, scope: 'CATEGORY' })
    ).toMatchObject({ categoryIds: ['category-1'], itemIds: [] });
    expect(
      buildPromotionPayload({ ...baseForm, scope: 'ITEM', itemIds: ['item-1'] })
    ).toMatchObject({ categoryIds: [], itemIds: ['item-1'] });
  });
});

describe('promotion form validation', () => {
  const {
    validatePromotionForm,
  } = require('@/lib/hooks/queries/usePromotions');

  it('accepts a valid promotion', () => {
    expect(validatePromotionForm(baseForm)).toEqual({});
  });

  it('rejects PERCENT outside 0–100 and FIXED at or below 0', () => {
    expect(
      validatePromotionForm({ ...baseForm, value: '100.01' }).value
    ).toBeTruthy();
    expect(
      validatePromotionForm({ ...baseForm, value: '100' }).value
    ).toBeUndefined();
    expect(
      validatePromotionForm({
        ...baseForm,
        type: 'FIXED',
        value: '0.00',
      }).value
    ).toBeTruthy();
    expect(
      validatePromotionForm({
        ...baseForm,
        type: 'FIXED',
        value: '0.01',
      }).value
    ).toBeUndefined();
  });

  it('rejects receipt labels that are non-ASCII or over 20 characters', () => {
    expect(
      validatePromotionForm({ ...baseForm, receiptLabel: 'CAFÉ' }).receiptLabel
    ).toBeTruthy();
    expect(
      validatePromotionForm({
        ...baseForm,
        receiptLabel: '123456789012345678901',
      }).receiptLabel
    ).toBeTruthy();
    expect(
      validatePromotionForm({
        ...baseForm,
        receiptLabel: '12345678901234567890',
      }).receiptLabel
    ).toBeUndefined();
  });

  it('requires scope membership', () => {
    expect(
      validatePromotionForm({
        ...baseForm,
        scope: 'CATEGORY',
        categoryIds: [],
      }).categoryIds
    ).toBeTruthy();
    expect(
      validatePromotionForm({
        ...baseForm,
        scope: 'ITEM',
        itemIds: [],
      }).itemIds
    ).toBeTruthy();
  });

  it('rejects endsAt on or before startsAt', () => {
    expect(
      validatePromotionForm({ ...baseForm, endsAt: '2026-11-01' }).endsAt
    ).toBeTruthy();
    expect(
      validatePromotionForm({ ...baseForm, endsAt: '2026-10-31' }).endsAt
    ).toBeTruthy();
    expect(
      validatePromotionForm({ ...baseForm, endsAt: '2026-11-02' }).endsAt
    ).toBeUndefined();
  });

  it('rejects malformed money and dates', () => {
    expect(
      validatePromotionForm({ ...baseForm, value: '10.001' }).value
    ).toBeTruthy();
    expect(
      validatePromotionForm({ ...baseForm, minSpend: '-1.00' }).minSpend
    ).toBeTruthy();
    expect(
      validatePromotionForm({ ...baseForm, startsAt: '2026-13-01' }).startsAt
    ).toBeTruthy();
  });
});

describe('promotion date helpers', () => {
  it('converts a stored end-of-day instant back to the local date', () => {
    const { isoToDateInput } = require('@/lib/hooks/queries/usePromotions');
    // 2026-12-31T23:59:59.999+08:00 is 2026-12-31T15:59:59.999Z.
    expect(
      isoToDateInput('2026-12-31T15:59:59.999Z', 'Asia/Kuala_Lumpur')
    ).toBe('2026-12-31');
  });

  it('builds an edit form with date-only values', () => {
    const { buildPromotionForm } = require('@/lib/hooks/queries/usePromotions');
    const form = buildPromotionForm(
      {
        ...baseForm,
        id: 'promo-1',
        value: '20.00',
        minSpend: '0.00',
        maxDiscount: '15.00',
        startsAt: '2026-11-01T00:00:00.000+08:00',
        endsAt: '2026-12-31T23:59:59.999+08:00',
        deletedAt: null,
        createdBy: null,
        updatedBy: null,
        createdAt: '2026-11-01T00:00:00.000Z',
        updatedAt: '2026-11-01T00:00:00.000Z',
      },
      'Asia/Kuala_Lumpur'
    );
    expect(form.startsAt).toBe('2026-11-01');
    expect(form.endsAt).toBe('2026-12-31');
  });
});

describe('promotion query and mutation config', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('reads GET /promotions with scope/status filters', () => {
    const { usePromotions } = require('@/lib/hooks/queries/usePromotions');
    const config = getQueryConfig(() =>
      usePromotions({ scope: 'ITEM', status: 'active' })
    );
    expect(config.queryKey).toEqual([
      'promotions',
      'list',
      { scope: 'ITEM', status: 'active' },
    ]);
  });

  it('creates with a fresh Idempotency-Key', async () => {
    const {
      useCreatePromotion,
      buildPromotionPayload,
    } = require('@/lib/hooks/queries/usePromotions');
    const config = getMutationConfig(useCreatePromotion);
    const payload = buildPromotionPayload(baseForm);

    await config.mutationFn(payload);
    await config.mutationFn(payload);

    expect(ApiClient.post).toHaveBeenCalledTimes(2);
    const first = (ApiClient.post as jest.Mock).mock.calls[0];
    const second = (ApiClient.post as jest.Mock).mock.calls[1];
    expect(first[0]).toBe('/promotions');
    expect(first[1]).toEqual(payload);
    expect(first[2].headers['Idempotency-Key']).toBeTruthy();
    expect(first[2].headers['Idempotency-Key']).not.toBe(
      second[2].headers['Idempotency-Key']
    );
  });

  it('updates with a fresh Idempotency-Key', async () => {
    const {
      useUpdatePromotion,
      buildPromotionPayload,
    } = require('@/lib/hooks/queries/usePromotions');
    const config = getMutationConfig(useUpdatePromotion);
    const payload = buildPromotionPayload(baseForm);

    await config.mutationFn({ id: 'promo-1', payload });

    const call = (ApiClient.patch as jest.Mock).mock.calls[0];
    expect(call[0]).toBe('/promotions/promo-1');
    expect(call[1]).toEqual(payload);
    expect(call[2].headers['Idempotency-Key']).toBeTruthy();
  });

  it('soft-deletes with a fresh Idempotency-Key', async () => {
    const { useDeletePromotion } = require('@/lib/hooks/queries/usePromotions');
    const config = getMutationConfig(useDeletePromotion);

    await config.mutationFn('promo-1');

    const call = (ApiClient.delete as jest.Mock).mock.calls[0];
    expect(call[0]).toBe('/promotions/promo-1');
    expect(call[1].headers['Idempotency-Key']).toBeTruthy();
  });
});
