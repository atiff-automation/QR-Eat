/**
 * Loyalty settings for the owner API (§18.20.2, §18.20.7).
 *
 * The server derives `noticeTextHash` from `noticeText` with
 * `hashNoticeText()`; a client-supplied hash is ignored by the schema. Every
 * bound that the database CHECKs enforce is validated here first, so a bad
 * request returns 400 instead of a Postgres constraint error.
 *
 * Changing settings only writes `loyalty_settings` and the audit row. A card
 * already in progress keeps its snapshot: new settings apply to new cycles.
 */

import Decimal from 'decimal.js';
import { z } from 'zod';
import { prisma, type TransactionClient } from '@/lib/database';
import { hashNoticeText } from '@/lib/loyalty/consent';
import {
  runIdempotentOwnerMutation,
  stableRequestHash,
} from '@/lib/services/loyalty-owner-idempotency';

const MONEY_PATTERN = /^(?:0|[1-9]\d{0,7})(?:\.\d{1,2})?$/;
const ASCII_PATTERN = /^[\x20-\x7e]*$/;
const MAX_MONEY = new Decimal('99999999.99');

export class LoyaltySettingsValidationError extends Error {
  readonly code = 'INVALID_REQUEST';
  readonly statusCode = 400;

  constructor(message: string) {
    super(message);
    this.name = 'LoyaltySettingsValidationError';
  }
}

function moneyInput(label: string) {
  return z
    .union([z.string(), z.number()])
    .transform((value) => String(value).trim())
    .refine((value) => MONEY_PATTERN.test(value), {
      message: `${label} must be a non-negative amount with at most 2 decimals`,
    })
    .refine((value) => new Decimal(value).lte(MAX_MONEY), {
      message: `${label} is too large`,
    })
    .transform((value) => new Decimal(value).toFixed(2));
}

/**
 * PATCH body. `noticeTextHash` is deliberately absent: unknown keys are
 * stripped, so a client-sent hash can never reach the database.
 */
export const LoyaltySettingsPatchSchema = z.object({
  enabled: z.boolean().optional(),
  visitsRequired: z.number().int().min(2).max(10).optional(),
  rewardType: z.enum(['PERCENT', 'FIXED']).optional(),
  rewardValue: moneyInput('rewardValue').optional(),
  maxDiscount: moneyInput('maxDiscount').optional(),
  minDailySpend: moneyInput('minDailySpend')
    .refine((value) => new Decimal(value).lte(1000), {
      message: 'minDailySpend must be between 0 and 1000',
    })
    .optional(),
  rewardLabel: z.string().trim().min(1).max(24).optional(),
  termsText: z.string().max(140).nullable().optional(),
  receiptLabel: z
    .string()
    .max(20)
    .refine((value) => ASCII_PATTERN.test(value), {
      message: 'receiptLabel must be ASCII',
    })
    .nullable()
    .optional(),
  privacyUrl: z.string().trim().url().max(500).nullable().optional(),
  noticeVersion: z.string().trim().min(1).max(50).nullable().optional(),
  noticeText: z.string().trim().min(1).max(5000).nullable().optional(),
});

export type LoyaltySettingsPatch = z.infer<typeof LoyaltySettingsPatchSchema>;

interface EffectiveSettings {
  enabled: boolean;
  visitsRequired: number;
  rewardType: 'PERCENT' | 'FIXED';
  rewardValue: string;
  maxDiscount: string;
  minDailySpend: string;
  rewardLabel: string;
  termsText: string | null;
  receiptLabel: string | null;
  privacyUrl: string | null;
  noticeVersion: string | null;
  noticeText: string | null;
}

const DEFAULT_SETTINGS: EffectiveSettings = {
  enabled: false,
  visitsRequired: 3,
  rewardType: 'PERCENT',
  rewardValue: '10.00',
  maxDiscount: '15.00',
  minDailySpend: '20.00',
  rewardLabel: '10% off, max RM15',
  termsText: null,
  receiptLabel: null,
  privacyUrl: null,
  noticeVersion: null,
  noticeText: null,
};

export interface LoyaltySettingsView {
  enabled: boolean;
  visitsRequired: number;
  rewardType: 'PERCENT' | 'FIXED';
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

interface LoyaltySettingsRow {
  enabled: boolean;
  visitsRequired: number;
  rewardType: 'PERCENT' | 'FIXED';
  rewardValue: Decimal | string | number;
  maxDiscount: Decimal | string | number;
  minDailySpend: Decimal | string | number;
  rewardLabel: string;
  termsText: string | null;
  receiptLabel: string | null;
  privacyUrl: string | null;
  noticeVersion: string | null;
  noticeText: string | null;
  noticeTextHash: string | null;
  updatedBy: string | null;
  updatedAt: Date | string | null;
}

function moneyString(value: Decimal | string | number): string {
  return new Decimal(value).toFixed(2);
}

function toView(row: LoyaltySettingsRow): LoyaltySettingsView {
  return {
    enabled: row.enabled,
    visitsRequired: row.visitsRequired,
    rewardType: row.rewardType,
    rewardValue: moneyString(row.rewardValue),
    maxDiscount: moneyString(row.maxDiscount),
    minDailySpend: moneyString(row.minDailySpend),
    rewardLabel: row.rewardLabel,
    termsText: row.termsText,
    receiptLabel: row.receiptLabel,
    privacyUrl: row.privacyUrl,
    noticeVersion: row.noticeVersion,
    noticeText: row.noticeText,
    noticeTextHash: row.noticeTextHash,
    updatedBy: row.updatedBy,
    updatedAt:
      row.updatedAt instanceof Date
        ? row.updatedAt.toISOString()
        : (row.updatedAt ?? null),
  };
}

function defaultsView(): LoyaltySettingsView {
  return {
    ...DEFAULT_SETTINGS,
    noticeTextHash: null,
    updatedBy: null,
    updatedAt: null,
  };
}

function effectiveFromRow(row: LoyaltySettingsRow): EffectiveSettings {
  return {
    enabled: row.enabled,
    visitsRequired: row.visitsRequired,
    rewardType: row.rewardType,
    rewardValue: moneyString(row.rewardValue),
    maxDiscount: moneyString(row.maxDiscount),
    minDailySpend: moneyString(row.minDailySpend),
    rewardLabel: row.rewardLabel,
    termsText: row.termsText,
    receiptLabel: row.receiptLabel,
    privacyUrl: row.privacyUrl,
    noticeVersion: row.noticeVersion,
    noticeText: row.noticeText,
  };
}

function mergeSettings(
  base: EffectiveSettings,
  patch: LoyaltySettingsPatch
): EffectiveSettings {
  return {
    enabled: patch.enabled ?? base.enabled,
    visitsRequired: patch.visitsRequired ?? base.visitsRequired,
    rewardType: patch.rewardType ?? base.rewardType,
    rewardValue: patch.rewardValue ?? base.rewardValue,
    maxDiscount: patch.maxDiscount ?? base.maxDiscount,
    minDailySpend: patch.minDailySpend ?? base.minDailySpend,
    rewardLabel: patch.rewardLabel ?? base.rewardLabel,
    termsText: patch.termsText === undefined ? base.termsText : patch.termsText,
    receiptLabel:
      patch.receiptLabel === undefined ? base.receiptLabel : patch.receiptLabel,
    privacyUrl:
      patch.privacyUrl === undefined ? base.privacyUrl : patch.privacyUrl,
    noticeVersion:
      patch.noticeVersion === undefined
        ? base.noticeVersion
        : patch.noticeVersion,
    noticeText:
      patch.noticeText === undefined ? base.noticeText : patch.noticeText,
  };
}

/**
 * Validate the merged settings, including cross-field rules the per-field
 * schema cannot express. These mirror the database CHECK constraints.
 */
export function validateEffectiveLoyaltySettings(
  settings: EffectiveSettings
): void {
  if (
    !Number.isInteger(settings.visitsRequired) ||
    settings.visitsRequired < 2 ||
    settings.visitsRequired > 10
  ) {
    throw new LoyaltySettingsValidationError(
      'visitsRequired must be an integer between 2 and 10'
    );
  }

  const minDailySpend = new Decimal(settings.minDailySpend);
  if (minDailySpend.lt(0) || minDailySpend.gt(1000)) {
    throw new LoyaltySettingsValidationError(
      'minDailySpend must be between 0 and 1000'
    );
  }

  const maxDiscount = new Decimal(settings.maxDiscount);
  if (maxDiscount.lt(0)) {
    throw new LoyaltySettingsValidationError('maxDiscount cannot be negative');
  }

  const rewardValue = new Decimal(settings.rewardValue);
  if (settings.rewardType === 'PERCENT') {
    if (rewardValue.lt(0) || rewardValue.gt(100)) {
      throw new LoyaltySettingsValidationError(
        'A PERCENT rewardValue must be between 0 and 100'
      );
    }
  } else if (rewardValue.lte(0)) {
    throw new LoyaltySettingsValidationError(
      'A FIXED rewardValue must be greater than 0'
    );
  }

  if (
    settings.receiptLabel !== null &&
    !ASCII_PATTERN.test(settings.receiptLabel)
  ) {
    throw new LoyaltySettingsValidationError('receiptLabel must be ASCII');
  }

  // §18.20.15 B: consent is only valid when the notice is complete. Enabling
  // loyalty with a partial notice would make `resolveNotice()` return null and
  // leave the restaurant effectively disabled while GET reports enabled=true.
  if (settings.enabled) {
    const isPresent = (value: string | null): boolean =>
      typeof value === 'string' && value.trim().length > 0;
    const missing: string[] = [];
    if (!isPresent(settings.noticeVersion)) missing.push('noticeVersion');
    if (!isPresent(settings.noticeText)) missing.push('noticeText');
    if (!isPresent(settings.privacyUrl)) missing.push('privacyUrl');

    if (missing.length > 0) {
      throw new LoyaltySettingsValidationError(
        `Loyalty cannot be enabled until the rewards notice is complete: missing ${missing.join(
          ', '
        )}`
      );
    }
  }
}

/** Read the restaurant's settings, returning safe defaults when none exist. */
export async function getLoyaltySettings(
  restaurantId: string
): Promise<LoyaltySettingsView> {
  const row = await prisma.loyaltySettings.findUnique({
    where: { restaurantId },
  });
  return row ? toView(row as unknown as LoyaltySettingsRow) : defaultsView();
}

export interface UpdateLoyaltySettingsInput {
  restaurantId: string;
  userId: string;
  userType?: string | null;
  patch: LoyaltySettingsPatch;
  idempotencyKey: string;
}

export interface UpdateLoyaltySettingsResult {
  settings: LoyaltySettingsView;
  replayed: boolean;
  statusCode: number;
}

/**
 * Apply a settings patch. The global `LOYALTY_ENABLED` flag is intentionally
 * not consulted: an owner must be able to configure loyalty before enabling it.
 */
export async function updateLoyaltySettings(
  input: UpdateLoyaltySettingsInput
): Promise<UpdateLoyaltySettingsResult> {
  // Re-parse at the service boundary so callers that bypass the route still
  // get trimming, bounds, and the removal of a client-sent `noticeTextHash`.
  const patch = LoyaltySettingsPatchSchema.parse(input.patch);
  const requestHash = stableRequestHash({
    restaurantId: input.restaurantId,
    patch,
  });

  const result = await runIdempotentOwnerMutation<{
    settings: LoyaltySettingsView;
  }>({
    restaurantId: input.restaurantId,
    action: 'settings.loyalty.update',
    key: input.idempotencyKey,
    requestHash,
    execute: async (tx: TransactionClient) => {
      const existing = await tx.loyaltySettings.findUnique({
        where: { restaurantId: input.restaurantId },
      });
      const base = existing
        ? effectiveFromRow(existing as unknown as LoyaltySettingsRow)
        : DEFAULT_SETTINGS;
      const effective = mergeSettings(base, patch);
      validateEffectiveLoyaltySettings(effective);

      // Always server-derived; the client hash is not part of the schema.
      const noticeTextHash = effective.noticeText
        ? hashNoticeText(effective.noticeText)
        : null;

      const data = {
        ...effective,
        noticeTextHash,
        updatedBy: input.userId,
      };

      const saved = existing
        ? await tx.loyaltySettings.update({
            where: { restaurantId: input.restaurantId },
            data,
          })
        : await tx.loyaltySettings.create({
            data: { restaurantId: input.restaurantId, ...data },
          });

      await tx.auditLog.create({
        data: {
          tableName: 'loyalty_settings',
          recordId: input.restaurantId,
          operation: existing ? 'UPDATE' : 'CREATE',
          oldValues: existing
            ? {
                enabled: (existing as unknown as LoyaltySettingsRow).enabled,
                visitsRequired: (existing as unknown as LoyaltySettingsRow)
                  .visitsRequired,
                rewardType: (existing as unknown as LoyaltySettingsRow)
                  .rewardType,
                rewardValue: moneyString(
                  (existing as unknown as LoyaltySettingsRow).rewardValue
                ),
                maxDiscount: moneyString(
                  (existing as unknown as LoyaltySettingsRow).maxDiscount
                ),
                minDailySpend: moneyString(
                  (existing as unknown as LoyaltySettingsRow).minDailySpend
                ),
                noticeVersion: (existing as unknown as LoyaltySettingsRow)
                  .noticeVersion,
                noticeTextHash: (existing as unknown as LoyaltySettingsRow)
                  .noticeTextHash,
              }
            : undefined,
          newValues: {
            enabled: saved.enabled,
            visitsRequired: saved.visitsRequired,
            rewardType: saved.rewardType,
            rewardValue: moneyString(saved.rewardValue),
            maxDiscount: moneyString(saved.maxDiscount),
            minDailySpend: moneyString(saved.minDailySpend),
            noticeVersion: saved.noticeVersion,
            noticeTextHash: saved.noticeTextHash,
          },
          changedBy: input.userId,
          changedByType: input.userType ?? null,
          restaurantId: input.restaurantId,
          category: 'loyalty',
          description: existing
            ? 'Loyalty settings updated'
            : 'Loyalty settings created',
        },
      });

      return {
        body: {
          settings: toView(saved as unknown as LoyaltySettingsRow),
        },
        statusCode: 200,
      };
    },
  });

  return {
    settings: result.body.settings,
    replayed: result.replayed,
    statusCode: result.statusCode,
  };
}
