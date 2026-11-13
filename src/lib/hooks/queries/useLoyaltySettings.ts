/**
 * Loyalty Settings Hooks - TanStack Query
 *
 * Owner dashboard hooks for `GET/PATCH /api/settings/restaurant/loyalty`
 * (§18.20.7). Mirrors `useRestaurantSettings`: one query, one mutation, cache
 * invalidation on success.
 *
 * Every PATCH sends a fresh `Idempotency-Key`. The body never contains
 * `noticeTextHash`; the server derives it from `noticeText` (§18.20.14 B).
 *
 * Client-side validation mirrors the server bounds so the database CHECK
 * constraints cannot fire. Money values are formatted as 2dp strings; no
 * money arithmetic happens in the browser.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ApiClient } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-client';

const MONEY_PATTERN = /^(?:0|[1-9]\d{0,7})(?:\.\d{1,2})?$/;
const ASCII_PATTERN = /^[\x20-\x7e]*$/;
const MAX_MONEY = 99999999.99;
const MAX_DAILY_SPEND = 1000;

export type LoyaltyRewardType = 'PERCENT' | 'FIXED';

export interface LoyaltySettings {
  enabled: boolean;
  visitsRequired: number;
  rewardType: LoyaltyRewardType;
  rewardValue: string;
  maxDiscount: string;
  minDailySpend: string;
  rewardLabel: string;
  termsText: string | null;
  receiptLabel: string | null;
  privacyUrl: string | null;
  noticeVersion: string | null;
  noticeText: string | null;
  noticeTextHash: string | null;
  updatedBy: string | null;
  updatedAt: string | null;
}

/**
 * Form state. Money is kept as strings and only normalised to 2dp when the
 * payload is built. `visitsRequired` is a string so an empty input can be
 * represented while editing.
 */
export interface LoyaltySettingsFormValues {
  enabled: boolean;
  visitsRequired: string;
  rewardType: LoyaltyRewardType;
  rewardValue: string;
  maxDiscount: string;
  minDailySpend: string;
  rewardLabel: string;
  receiptLabel: string;
  termsText: string;
  noticeVersion: string;
  noticeText: string;
  privacyUrl: string;
}

export type LoyaltySettingsField = keyof LoyaltySettingsFormValues | 'form';

export type LoyaltySettingsErrors = Partial<
  Record<LoyaltySettingsField, string>
>;

/**
 * PATCH body. `noticeTextHash` is deliberately absent: the server derives it
 * and ignores a client-supplied value.
 */
export interface LoyaltySettingsPatchPayload {
  enabled: boolean;
  visitsRequired: number;
  rewardType: LoyaltyRewardType;
  rewardValue: string;
  maxDiscount: string;
  minDailySpend: string;
  rewardLabel: string;
  receiptLabel: string | null;
  termsText: string | null;
  noticeVersion: string | null;
  noticeText: string | null;
  privacyUrl: string | null;
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

function nullIfEmpty(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/** Convert a server view into editable form values. */
export function buildLoyaltySettingsForm(
  settings: LoyaltySettings
): LoyaltySettingsFormValues {
  return {
    enabled: settings.enabled,
    visitsRequired: String(settings.visitsRequired),
    rewardType: settings.rewardType,
    rewardValue: settings.rewardValue,
    maxDiscount: settings.maxDiscount,
    minDailySpend: settings.minDailySpend,
    rewardLabel: settings.rewardLabel,
    receiptLabel: settings.receiptLabel ?? '',
    termsText: settings.termsText ?? '',
    noticeVersion: settings.noticeVersion ?? '',
    noticeText: settings.noticeText ?? '',
    privacyUrl: settings.privacyUrl ?? '',
  };
}

/**
 * Validate the form against the server bounds.
 *
 * Mirrors `LoyaltySettingsPatchSchema` and
 * `validateEffectiveLoyaltySettings`: visits 2–10, daily spend 0–1000,
 * PERCENT 0–100, FIXED > 0, receipt label ASCII ≤20, reward label ≤24, terms
 * ≤140, and a complete notice before loyalty can be enabled.
 */
export function validateLoyaltySettingsForm(
  form: LoyaltySettingsFormValues
): LoyaltySettingsErrors {
  const errors: LoyaltySettingsErrors = {};

  const visits = Number(form.visitsRequired);
  if (
    form.visitsRequired.trim() === '' ||
    !Number.isInteger(visits) ||
    visits < 2 ||
    visits > 10
  ) {
    errors.visitsRequired =
      'Visits required must be a whole number from 2 to 10';
  }

  const maxDiscount = form.maxDiscount.trim();
  if (!isMoney(maxDiscount)) {
    errors.maxDiscount = 'Enter an amount with at most 2 decimals';
  } else if (Number(maxDiscount) < 0) {
    errors.maxDiscount = 'Maximum discount cannot be negative';
  } else if (Number(maxDiscount) > MAX_MONEY) {
    errors.maxDiscount = 'Maximum discount is too large';
  }

  const minDailySpend = form.minDailySpend.trim();
  if (!isMoney(minDailySpend)) {
    errors.minDailySpend = 'Enter an amount with at most 2 decimals';
  } else if (
    Number(minDailySpend) < 0 ||
    Number(minDailySpend) > MAX_DAILY_SPEND
  ) {
    errors.minDailySpend = 'Minimum daily spend must be between 0 and 1000';
  }

  const rewardValue = form.rewardValue.trim();
  if (!isMoney(rewardValue)) {
    errors.rewardValue = 'Enter an amount with at most 2 decimals';
  } else if (form.rewardType === 'PERCENT') {
    const percent = Number(rewardValue);
    if (percent < 0 || percent > 100) {
      errors.rewardValue = 'A percentage reward must be between 0 and 100';
    }
  } else if (Number(rewardValue) <= 0) {
    errors.rewardValue = 'A fixed reward must be greater than 0';
  }

  const rewardLabel = form.rewardLabel.trim();
  if (rewardLabel.length < 1 || rewardLabel.length > 24) {
    errors.rewardLabel = 'Reward label must be 1 to 24 characters';
  }

  const receiptLabel = form.receiptLabel.trim();
  if (receiptLabel.length > 20) {
    errors.receiptLabel = 'Receipt label must be at most 20 characters';
  } else if (!ASCII_PATTERN.test(receiptLabel)) {
    errors.receiptLabel = 'Receipt label must use ASCII characters only';
  }

  if (form.termsText.trim().length > 140) {
    errors.termsText = 'Terms must be at most 140 characters';
  }

  const privacyUrl = form.privacyUrl.trim();
  if (privacyUrl.length > 0) {
    if (privacyUrl.length > 500) {
      errors.privacyUrl = 'Privacy URL must be at most 500 characters';
    } else {
      try {
        new URL(privacyUrl);
      } catch {
        errors.privacyUrl = 'Enter a valid privacy URL';
      }
    }
  }

  if (form.noticeVersion.trim().length > 50) {
    errors.noticeVersion = 'Notice version must be at most 50 characters';
  }
  if (form.noticeText.trim().length > 5000) {
    errors.noticeText = 'Notice text must be at most 5000 characters';
  }

  if (form.enabled) {
    const missing: string[] = [];
    if (form.noticeVersion.trim().length === 0) missing.push('notice version');
    if (form.noticeText.trim().length === 0) missing.push('notice text');
    if (form.privacyUrl.trim().length === 0) missing.push('privacy URL');
    if (missing.length > 0) {
      errors.form = `Rewards cannot be enabled until the customer notice is complete: add ${missing.join(
        ', '
      )}.`;
    }
  }

  return errors;
}

/**
 * Build the PATCH body. Assumes validation has already passed.
 */
export function buildLoyaltySettingsPayload(
  form: LoyaltySettingsFormValues
): LoyaltySettingsPatchPayload {
  return {
    enabled: form.enabled,
    visitsRequired: Number(form.visitsRequired),
    rewardType: form.rewardType,
    rewardValue: toMoneyString(form.rewardValue),
    maxDiscount: toMoneyString(form.maxDiscount),
    minDailySpend: toMoneyString(form.minDailySpend),
    rewardLabel: form.rewardLabel.trim(),
    receiptLabel: nullIfEmpty(form.receiptLabel),
    termsText: nullIfEmpty(form.termsText),
    noticeVersion: nullIfEmpty(form.noticeVersion),
    noticeText: nullIfEmpty(form.noticeText),
    privacyUrl: nullIfEmpty(form.privacyUrl),
  };
}

export interface QueryEnabledOptions {
  enabled?: boolean;
}

export function useLoyaltySettings(options: QueryEnabledOptions = {}) {
  return useQuery({
    queryKey: queryKeys.loyalty.settings,
    queryFn: async () => {
      const data = await ApiClient.get<{ settings: LoyaltySettings }>(
        '/settings/restaurant/loyalty'
      );
      return data.settings;
    },
    enabled: options.enabled ?? true,
    staleTime: 60 * 1000,
    gcTime: 10 * 60 * 1000,
    refetchOnWindowFocus: true,
  });
}

export function useUpdateLoyaltySettings() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: LoyaltySettingsPatchPayload) => {
      return ApiClient.patch<{ success: true; settings: LoyaltySettings }>(
        '/settings/restaurant/loyalty',
        payload,
        {
          headers: {
            // A fresh key per submit; retries of the same submit are not
            // automatic for mutations, so a new key is correct here.
            'Idempotency-Key': crypto.randomUUID(),
          },
        }
      );
    },
    onSuccess: (data) => {
      if (data?.settings) {
        queryClient.setQueryData(queryKeys.loyalty.settings, data.settings);
      }
      queryClient.invalidateQueries({ queryKey: queryKeys.loyalty.settings });
    },
  });
}
