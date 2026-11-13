/**
 * Promotions Hooks - TanStack Query
 *
 * Owner dashboard hooks for `/api/promotions` (§18.20.7). List, create,
 * update and soft delete. Every mutation sends a fresh `Idempotency-Key`; the
 * server writes the audit row in the same transaction.
 *
 * Money is sent as 2dp strings. `startsAt`/`endsAt` are sent as date-only
 * strings (`YYYY-MM-DD`); the server expands `endsAt` to the restaurant-local
 * end of day.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ApiClient } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-client';

const MONEY_PATTERN = /^(?:0|[1-9]\d{0,7})(?:\.\d{1,2})?$/;
const ASCII_PATTERN = /^[\x20-\x7e]*$/;
const DATE_ONLY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const MAX_MONEY = 99999999.99;

export type PromotionType = 'PERCENT' | 'FIXED';
export type PromotionScope = 'ORDER' | 'CATEGORY' | 'ITEM';
export type PromotionStatus = 'active' | 'scheduled' | 'expired' | 'inactive';

export interface Promotion {
  id: string;
  name: string;
  receiptLabel: string;
  type: PromotionType;
  value: string;
  scope: PromotionScope;
  categoryIds: string[];
  itemIds: string[];
  minSpend: string;
  maxDiscount: string;
  startsAt: string;
  endsAt: string;
  isActive: boolean;
  deletedAt: string | null;
  createdBy: string | null;
  updatedBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PromotionFormValues {
  name: string;
  receiptLabel: string;
  type: PromotionType;
  value: string;
  scope: PromotionScope;
  categoryIds: string[];
  itemIds: string[];
  minSpend: string;
  maxDiscount: string;
  startsAt: string;
  endsAt: string;
  isActive: boolean;
}

export type PromotionField = keyof PromotionFormValues | 'form';
export type PromotionErrors = Partial<Record<PromotionField, string>>;

export interface PromotionInputPayload {
  name: string;
  receiptLabel: string;
  type: PromotionType;
  value: string;
  scope: PromotionScope;
  categoryIds?: string[];
  itemIds?: string[];
  minSpend: string;
  maxDiscount: string;
  startsAt: string;
  endsAt: string;
  isActive: boolean;
}

export interface PromotionListFilters {
  scope?: PromotionScope;
  status?: PromotionStatus;
}

/** Format a money-ish input as a 2dp string without arithmetic. */
export function toMoneyString(value: string | number): string {
  const text = typeof value === 'number' ? value.toFixed(2) : value.trim();
  if (!MONEY_PATTERN.test(text)) return text;
  const [whole, fraction = ''] = text.split('.');
  return `${whole}.${(fraction + '00').slice(0, 2)}`;
}

function isMoney(value: string): boolean {
  return MONEY_PATTERN.test(value.trim());
}

export function isRealDateOnly(value: string): boolean {
  const match = DATE_ONLY_PATTERN.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

/**
 * Format an ISO instant as a `YYYY-MM-DD` value for a date input, using the
 * restaurant's timezone so a stored end-of-day does not shift a day.
 */
export function isoToDateInput(
  iso: string,
  timezone = 'Asia/Kuala_Lumpur'
): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso.slice(0, 10);
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(date);
    const part = (type: string) =>
      parts.find((entry) => entry.type === type)?.value ?? '';
    return `${part('year')}-${part('month')}-${part('day')}`;
  } catch {
    return iso.slice(0, 10);
  }
}

/** Convert a server promotion into editable form values. */
export function buildPromotionForm(
  promotion: Promotion,
  timezone = 'Asia/Kuala_Lumpur'
): PromotionFormValues {
  return {
    name: promotion.name,
    receiptLabel: promotion.receiptLabel,
    type: promotion.type,
    value: promotion.value,
    scope: promotion.scope,
    categoryIds: [...promotion.categoryIds],
    itemIds: [...promotion.itemIds],
    minSpend: promotion.minSpend,
    maxDiscount: promotion.maxDiscount,
    startsAt: isoToDateInput(promotion.startsAt, timezone),
    endsAt: isoToDateInput(promotion.endsAt, timezone),
    isActive: promotion.isActive,
  };
}

/**
 * Build the create/update body. Assumes validation has already passed.
 * `endsAt` stays a date; the server stores the restaurant-local end of day.
 */
export function buildPromotionPayload(
  form: PromotionFormValues
): PromotionInputPayload {
  return {
    name: form.name.trim(),
    receiptLabel: form.receiptLabel.trim(),
    type: form.type,
    value: toMoneyString(form.value),
    scope: form.scope,
    // Always send both arrays. The server's PATCH merge keeps an omitted array
    // from the existing row, so switching CATEGORY/ITEM -> ORDER must clear it.
    categoryIds: form.scope === 'CATEGORY' ? form.categoryIds : [],
    itemIds: form.scope === 'ITEM' ? form.itemIds : [],
    minSpend: toMoneyString(form.minSpend),
    maxDiscount: toMoneyString(form.maxDiscount),
    startsAt: form.startsAt,
    endsAt: form.endsAt,
    isActive: form.isActive,
  };
}

/**
 * Validate the promotion form against the server bounds.
 *
 * Mirrors `PromotionInputSchema` and `normaliseInput`: name ≤80, receipt
 * label ASCII ≤20, PERCENT 0–100, FIXED > 0, scope membership, money to 2dp,
 * and `endsAt` after `startsAt`.
 */
export function validatePromotionForm(
  form: PromotionFormValues
): PromotionErrors {
  const errors: PromotionErrors = {};

  const name = form.name.trim();
  if (name.length < 1 || name.length > 80) {
    errors.name = 'Name must be 1 to 80 characters';
  }

  const receiptLabel = form.receiptLabel.trim();
  if (receiptLabel.length > 20) {
    errors.receiptLabel = 'Receipt label must be at most 20 characters';
  } else if (!ASCII_PATTERN.test(receiptLabel)) {
    errors.receiptLabel = 'Receipt label must use ASCII characters only';
  }

  const value = form.value.trim();
  if (!isMoney(value)) {
    errors.value = 'Enter an amount with at most 2 decimals';
  } else if (form.type === 'PERCENT') {
    const percent = Number(value);
    if (percent < 0 || percent > 100) {
      errors.value = 'A percentage promotion must be between 0 and 100';
    }
  } else if (Number(value) <= 0) {
    errors.value = 'A fixed promotion must be greater than 0';
  }

  const minSpend = form.minSpend.trim();
  if (!isMoney(minSpend)) {
    errors.minSpend = 'Enter an amount with at most 2 decimals';
  } else if (Number(minSpend) > MAX_MONEY) {
    errors.minSpend = 'Minimum spend is too large';
  }

  const maxDiscount = form.maxDiscount.trim();
  if (!isMoney(maxDiscount)) {
    errors.maxDiscount = 'Enter an amount with at most 2 decimals';
  } else if (Number(maxDiscount) < 0) {
    errors.maxDiscount = 'Maximum discount cannot be negative';
  } else if (Number(maxDiscount) > MAX_MONEY) {
    errors.maxDiscount = 'Maximum discount is too large';
  }

  if (form.scope === 'CATEGORY' && form.categoryIds.length === 0) {
    errors.categoryIds = 'Choose at least one category';
  }
  if (form.scope === 'ITEM' && form.itemIds.length === 0) {
    errors.itemIds = 'Choose at least one item';
  }

  if (!isRealDateOnly(form.startsAt)) {
    errors.startsAt = 'Choose a start date';
  }
  if (!isRealDateOnly(form.endsAt)) {
    errors.endsAt = 'Choose an end date';
  } else if (isRealDateOnly(form.startsAt) && form.endsAt <= form.startsAt) {
    errors.endsAt = 'End date must be after the start date';
  }

  return errors;
}

export interface PromotionQueryOptions {
  enabled?: boolean;
}

export function usePromotions(
  filters: PromotionListFilters = {},
  options: PromotionQueryOptions = {}
) {
  return useQuery({
    queryKey: queryKeys.promotions.list({ ...filters }),
    queryFn: async () => {
      const data = await ApiClient.get<{ promotions: Promotion[] }>(
        '/promotions',
        {
          params: {
            scope: filters.scope,
            status: filters.status,
          },
        }
      );
      return data.promotions;
    },
    enabled: options.enabled ?? true,
    staleTime: 60 * 1000,
    gcTime: 10 * 60 * 1000,
    refetchOnWindowFocus: true,
  });
}

export function useCreatePromotion() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: PromotionInputPayload) => {
      return ApiClient.post<{ success: true; promotion: Promotion }>(
        '/promotions',
        payload,
        {
          headers: { 'Idempotency-Key': crypto.randomUUID() },
        }
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.promotions.all });
    },
  });
}

export function useUpdatePromotion() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      payload,
    }: {
      id: string;
      payload: PromotionInputPayload;
    }) => {
      return ApiClient.patch<{ success: true; promotion: Promotion }>(
        `/promotions/${id}`,
        payload,
        {
          headers: { 'Idempotency-Key': crypto.randomUUID() },
        }
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.promotions.all });
    },
  });
}

export function useDeletePromotion() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      return ApiClient.delete<{ success: true; promotion: Promotion }>(
        `/promotions/${id}`,
        {
          headers: { 'Idempotency-Key': crypto.randomUUID() },
        }
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.promotions.all });
    },
  });
}
