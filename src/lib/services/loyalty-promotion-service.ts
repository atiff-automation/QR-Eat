/**
 * Promotion CRUD for the owner API (§18.20.2, §18.20.7, §18.20.14 J).
 *
 * Scope membership lives in the `PromotionCategory`/`PromotionItem` join
 * tables. Every scope rewrite locks the promotion row and replaces the join
 * rows delete-then-insert inside one transaction, so an eligibility read never
 * sees a half-written scope (REVIEW-03 N-10). The composite tenant foreign keys
 * make a cross-restaurant id unstorable; references are also pre-validated so
 * the API returns a clean 400 instead of a 500.
 *
 * Soft delete only: historical receipts reprint from `promotionSnapshot`, and
 * the eligibility engine already filters `deletedAt: null`.
 */

import Decimal from 'decimal.js';
import { z } from 'zod';
import { prisma, type TransactionClient } from '@/lib/database';
import { zonedDateTimeToUtc } from '@/lib/time/business-day';
import {
  runIdempotentOwnerMutation,
  stableRequestHash,
} from '@/lib/services/loyalty-owner-idempotency';

const MONEY_PATTERN = /^(?:0|[1-9]\d{0,7})(?:\.\d{1,2})?$/;
const ASCII_PATTERN = /^[\x20-\x7e]*$/;
const DATE_ONLY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const MAX_MONEY = new Decimal('99999999.99');

export class PromotionValidationError extends Error {
  readonly code = 'PROMOTION_INVALID';
  readonly statusCode = 400;

  constructor(message: string) {
    super(message);
    this.name = 'PromotionValidationError';
  }
}

export class PromotionNotFoundError extends Error {
  readonly code = 'NOT_FOUND';
  readonly statusCode = 404;

  constructor() {
    super('Promotion not found');
    this.name = 'PromotionNotFoundError';
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

function isRealDateOnly(value: string): boolean {
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

function dateInput(label: string) {
  return z
    .string()
    .trim()
    .min(1)
    .max(64)
    .refine(
      (value) =>
        isRealDateOnly(value) || !Number.isNaN(new Date(value).getTime()),
      { message: `${label} must be a date or an ISO date-time` }
    );
}

const scopeArray = z.array(z.string().uuid()).max(500);

const PromotionObjectSchema = z.object({
  name: z.string().trim().min(1).max(80),
  receiptLabel: z
    .string()
    .max(20)
    .refine((value) => ASCII_PATTERN.test(value), {
      message: 'receiptLabel must be ASCII',
    }),
  type: z.enum(['PERCENT', 'FIXED']),
  value: moneyInput('value'),
  scope: z.enum(['ORDER', 'CATEGORY', 'ITEM']),
  categoryIds: scopeArray.optional(),
  itemIds: scopeArray.optional(),
  minSpend: moneyInput('minSpend').optional(),
  maxDiscount: moneyInput('maxDiscount'),
  startsAt: dateInput('startsAt'),
  endsAt: dateInput('endsAt'),
  isActive: z.boolean().optional(),
});

/**
 * Create body. The value bounds depend on `type`, so they are checked on the
 * whole object. Date ordering is checked after timezone normalisation in the
 * service (a date-only `endsAt` means end of day).
 */
export const PromotionInputSchema = PromotionObjectSchema.superRefine(
  (data, context) => {
    const value = new Decimal(data.value);
    if (data.type === 'PERCENT' && (value.lt(0) || value.gt(100))) {
      context.addIssue({
        code: 'custom',
        path: ['value'],
        message: 'A PERCENT promotion value must be between 0 and 100',
      });
    }
    if (data.type === 'FIXED' && value.lte(0)) {
      context.addIssue({
        code: 'custom',
        path: ['value'],
        message: 'A FIXED promotion value must be greater than 0',
      });
    }
  }
);

export const PromotionPatchSchema = PromotionObjectSchema.partial();

export type PromotionInput = z.infer<typeof PromotionInputSchema>;
export type PromotionPatch = z.infer<typeof PromotionPatchSchema>;

export interface PromotionView {
  id: string;
  name: string;
  receiptLabel: string;
  type: 'PERCENT' | 'FIXED';
  value: string;
  scope: 'ORDER' | 'CATEGORY' | 'ITEM';
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

interface PromotionRow {
  id: string;
  name: string;
  receiptLabel: string;
  type: 'PERCENT' | 'FIXED';
  value: Decimal | string | number;
  scope: 'ORDER' | 'CATEGORY' | 'ITEM';
  minSpend: Decimal | string | number;
  maxDiscount: Decimal | string | number;
  startsAt: Date | string;
  endsAt: Date | string;
  isActive: boolean;
  deletedAt: Date | string | null;
  createdBy: string | null;
  updatedBy: string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
  promotionCategories?: readonly { categoryId: string }[];
  promotionItems?: readonly { itemId: string }[];
}

interface NormalisedPromotion {
  name: string;
  receiptLabel: string;
  type: 'PERCENT' | 'FIXED';
  value: string;
  scope: 'ORDER' | 'CATEGORY' | 'ITEM';
  categoryIds: string[];
  itemIds: string[];
  minSpend: string;
  maxDiscount: string;
  startsAt: Date;
  endsAt: Date;
  isActive: boolean;
}

function unique(ids: readonly string[]): string[] {
  return [...new Set(ids)];
}

function iso(value: Date | string | null): string | null {
  if (value === null) return null;
  return value instanceof Date
    ? value.toISOString()
    : new Date(value).toISOString();
}

function toView(row: PromotionRow): PromotionView {
  return {
    id: row.id,
    name: row.name,
    receiptLabel: row.receiptLabel,
    type: row.type,
    value: new Decimal(row.value).toFixed(2),
    scope: row.scope,
    categoryIds: (row.promotionCategories ?? []).map(
      (entry) => entry.categoryId
    ),
    itemIds: (row.promotionItems ?? []).map((entry) => entry.itemId),
    minSpend: new Decimal(row.minSpend).toFixed(2),
    maxDiscount: new Decimal(row.maxDiscount).toFixed(2),
    startsAt: iso(row.startsAt) as string,
    endsAt: iso(row.endsAt) as string,
    isActive: row.isActive,
    deletedAt: iso(row.deletedAt),
    createdBy: row.createdBy,
    updatedBy: row.updatedBy,
    createdAt: iso(row.createdAt) as string,
    updatedAt: iso(row.updatedAt) as string,
  };
}

/**
 * Convert a client date to the stored instant. A date-only `endsAt` is stored
 * as the restaurant-local end of day (23:59:59.999) because the engine window
 * is half-open `[startsAt, endsAt)`; a date-only end would otherwise kill the
 * promotion a day early.
 */
export function normalisePromotionDate(
  value: string,
  edge: 'start' | 'end',
  timezone: string
): Date {
  if (isRealDateOnly(value)) {
    if (edge === 'start') {
      return zonedDateTimeToUtc(value, '00:00', timezone);
    }
    return new Date(
      zonedDateTimeToUtc(value, '23:59', timezone).getTime() + 59_999
    );
  }
  return new Date(value);
}

function validateValueAndCap(
  type: 'PERCENT' | 'FIXED',
  value: string,
  maxDiscount: string
): void {
  const amount = new Decimal(value);
  if (type === 'PERCENT' && (amount.lt(0) || amount.gt(100))) {
    throw new PromotionValidationError(
      'A PERCENT promotion value must be between 0 and 100'
    );
  }
  if (type === 'FIXED' && amount.lte(0)) {
    throw new PromotionValidationError(
      'A FIXED promotion value must be greater than 0'
    );
  }
  if (new Decimal(maxDiscount).lt(0)) {
    throw new PromotionValidationError('maxDiscount cannot be negative');
  }
}

function validateScope(
  scope: 'ORDER' | 'CATEGORY' | 'ITEM',
  categoryIds: string[],
  itemIds: string[]
): void {
  if (scope === 'ORDER') {
    if (categoryIds.length > 0 || itemIds.length > 0) {
      throw new PromotionValidationError(
        'An ORDER promotion cannot target categories or items'
      );
    }
    return;
  }
  if (scope === 'CATEGORY') {
    if (categoryIds.length === 0) {
      throw new PromotionValidationError(
        'A CATEGORY promotion requires at least one category id'
      );
    }
    if (itemIds.length > 0) {
      throw new PromotionValidationError(
        'A CATEGORY promotion cannot target item ids'
      );
    }
    return;
  }
  if (itemIds.length === 0) {
    throw new PromotionValidationError(
      'An ITEM promotion requires at least one item id'
    );
  }
  if (categoryIds.length > 0) {
    throw new PromotionValidationError(
      'An ITEM promotion cannot target category ids'
    );
  }
}

function normaliseInput(
  input: PromotionInput,
  timezone: string
): NormalisedPromotion {
  const categoryIds = unique(input.categoryIds ?? []);
  const itemIds = unique(input.itemIds ?? []);
  const minSpend = input.minSpend ?? '0.00';
  const scope = input.scope;

  validateValueAndCap(input.type, input.value, input.maxDiscount);
  validateScope(scope, categoryIds, itemIds);

  const startsAt = normalisePromotionDate(input.startsAt, 'start', timezone);
  const endsAt = normalisePromotionDate(input.endsAt, 'end', timezone);
  if (endsAt.getTime() <= startsAt.getTime()) {
    throw new PromotionValidationError('endsAt must be after startsAt');
  }

  return {
    name: input.name,
    receiptLabel: input.receiptLabel,
    type: input.type,
    value: input.value,
    scope,
    categoryIds,
    itemIds,
    minSpend,
    maxDiscount: input.maxDiscount,
    startsAt,
    endsAt,
    isActive: input.isActive ?? true,
  };
}

function mergePatch(
  row: PromotionRow,
  patch: PromotionPatch,
  timezone: string
): NormalisedPromotion {
  const categoryIds = unique(
    patch.categoryIds ??
      (row.promotionCategories ?? []).map((entry) => entry.categoryId)
  );
  const itemIds = unique(
    patch.itemIds ?? (row.promotionItems ?? []).map((entry) => entry.itemId)
  );
  const scope = patch.scope ?? row.scope;
  const type = patch.type ?? row.type;
  const value = patch.value ?? new Decimal(row.value).toFixed(2);
  const maxDiscount =
    patch.maxDiscount ?? new Decimal(row.maxDiscount).toFixed(2);
  const minSpend = patch.minSpend ?? new Decimal(row.minSpend).toFixed(2);

  validateValueAndCap(type, value, maxDiscount);
  validateScope(scope, categoryIds, itemIds);

  const startsAt =
    patch.startsAt !== undefined
      ? normalisePromotionDate(patch.startsAt, 'start', timezone)
      : new Date(row.startsAt);
  const endsAt =
    patch.endsAt !== undefined
      ? normalisePromotionDate(patch.endsAt, 'end', timezone)
      : new Date(row.endsAt);
  if (endsAt.getTime() <= startsAt.getTime()) {
    throw new PromotionValidationError('endsAt must be after startsAt');
  }

  return {
    name: patch.name ?? row.name,
    receiptLabel: patch.receiptLabel ?? row.receiptLabel,
    type,
    value,
    scope,
    categoryIds,
    itemIds,
    minSpend,
    maxDiscount,
    startsAt,
    endsAt,
    isActive: patch.isActive ?? row.isActive,
  };
}

async function getRestaurantTimezone(restaurantId: string): Promise<string> {
  const restaurant = await prisma.restaurant.findUnique({
    where: { id: restaurantId },
    select: { timezone: true },
  });
  if (!restaurant) throw new PromotionNotFoundError();
  return restaurant.timezone || 'Asia/Kuala_Lumpur';
}

async function assertScopeReferences(
  db: TransactionClient,
  restaurantId: string,
  input: NormalisedPromotion
): Promise<void> {
  if (input.scope === 'CATEGORY') {
    const rows = await db.menuCategory.findMany({
      where: { restaurantId, id: { in: input.categoryIds } },
      select: { id: true },
    });
    if (rows.length !== input.categoryIds.length) {
      throw new PromotionValidationError(
        'One or more category ids do not belong to this restaurant'
      );
    }
  }
  if (input.scope === 'ITEM') {
    const rows = await db.menuItem.findMany({
      where: { restaurantId, id: { in: input.itemIds } },
      select: { id: true },
    });
    if (rows.length !== input.itemIds.length) {
      throw new PromotionValidationError(
        'One or more item ids do not belong to this restaurant'
      );
    }
  }
}

async function lockPromotion(
  tx: TransactionClient,
  restaurantId: string,
  promotionId: string
): Promise<void> {
  const rows = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT "id" FROM "promotions"
    WHERE "id" = ${promotionId} AND "restaurantId" = ${restaurantId}
    FOR UPDATE
  `;
  if (rows.length === 0) throw new PromotionNotFoundError();
}

async function replaceScopeRows(
  tx: TransactionClient,
  restaurantId: string,
  promotionId: string,
  input: NormalisedPromotion
): Promise<void> {
  // Delete-then-insert in the same transaction as the row lock. This is the
  // REVIEW-03 N-10 requirement: a concurrent eligibility read sees either the
  // old scope or the new scope, never a half-written one.
  await tx.promotionCategory.deleteMany({
    where: { restaurantId, promotionId },
  });
  await tx.promotionItem.deleteMany({ where: { restaurantId, promotionId } });

  if (input.scope === 'CATEGORY' && input.categoryIds.length > 0) {
    await tx.promotionCategory.createMany({
      data: input.categoryIds.map((categoryId) => ({
        restaurantId,
        promotionId,
        categoryId,
      })),
    });
  }
  if (input.scope === 'ITEM' && input.itemIds.length > 0) {
    await tx.promotionItem.createMany({
      data: input.itemIds.map((itemId) => ({
        restaurantId,
        promotionId,
        itemId,
      })),
    });
  }
}

function isForeignKeyViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 'P2003'
  );
}

async function runPromotionMutation<T>(input: {
  restaurantId: string;
  action: string;
  idempotencyKey: string;
  requestHash: string;
  execute: (tx: TransactionClient) => Promise<{ body: T; statusCode?: number }>;
}): Promise<{ body: T; statusCode: number; replayed: boolean }> {
  try {
    return await runIdempotentOwnerMutation<T>({
      restaurantId: input.restaurantId,
      action: input.action,
      key: input.idempotencyKey,
      requestHash: input.requestHash,
      execute: input.execute,
    });
  } catch (error) {
    if (isForeignKeyViolation(error)) {
      throw new PromotionValidationError(
        'One or more category or item ids do not belong to this restaurant'
      );
    }
    throw error;
  }
}

export interface CreatePromotionInput {
  restaurantId: string;
  userId: string;
  userType?: string | null;
  input: PromotionInput;
  idempotencyKey: string;
}

export async function createPromotion(input: CreatePromotionInput): Promise<{
  promotion: PromotionView;
  replayed: boolean;
  statusCode: number;
}> {
  const timezone = await getRestaurantTimezone(input.restaurantId);
  const normalised = normaliseInput(input.input, timezone);
  const requestHash = stableRequestHash({
    restaurantId: input.restaurantId,
    input: input.input,
  });

  const result = await runPromotionMutation<{ promotion: PromotionView }>({
    restaurantId: input.restaurantId,
    action: 'promotions.create',
    idempotencyKey: input.idempotencyKey,
    requestHash,
    execute: async (tx) => {
      await assertScopeReferences(tx, input.restaurantId, normalised);

      const created = await tx.promotion.create({
        data: {
          restaurantId: input.restaurantId,
          name: normalised.name,
          receiptLabel: normalised.receiptLabel,
          type: normalised.type,
          value: normalised.value,
          scope: normalised.scope,
          minSpend: normalised.minSpend,
          maxDiscount: normalised.maxDiscount,
          startsAt: normalised.startsAt,
          endsAt: normalised.endsAt,
          isActive: normalised.isActive,
          createdBy: input.userId,
          updatedBy: input.userId,
        },
      });

      await replaceScopeRows(tx, input.restaurantId, created.id, normalised);

      await tx.auditLog.create({
        data: {
          tableName: 'promotions',
          recordId: created.id,
          operation: 'CREATE',
          newValues: {
            name: normalised.name,
            scope: normalised.scope,
            type: normalised.type,
            value: normalised.value,
            categoryIds: normalised.categoryIds,
            itemIds: normalised.itemIds,
            startsAt: normalised.startsAt.toISOString(),
            endsAt: normalised.endsAt.toISOString(),
          },
          changedBy: input.userId,
          changedByType: input.userType ?? null,
          restaurantId: input.restaurantId,
          category: 'promotions',
          description: 'Promotion created',
        },
      });

      return {
        body: {
          promotion: toView({
            ...(created as unknown as PromotionRow),
            promotionCategories: normalised.categoryIds.map((categoryId) => ({
              categoryId,
            })),
            promotionItems: normalised.itemIds.map((itemId) => ({ itemId })),
          }),
        },
        statusCode: 201,
      };
    },
  });

  return {
    promotion: result.body.promotion,
    replayed: result.replayed,
    statusCode: result.statusCode,
  };
}

export interface PromotionListFilters {
  scope?: 'ORDER' | 'CATEGORY' | 'ITEM';
  status?: 'active' | 'scheduled' | 'expired' | 'inactive';
}

export const PromotionListFiltersSchema = z.object({
  scope: z.enum(['ORDER', 'CATEGORY', 'ITEM']).optional(),
  status: z.enum(['active', 'scheduled', 'expired', 'inactive']).optional(),
});

export async function listPromotions(input: {
  restaurantId: string;
  filters?: PromotionListFilters;
  now?: Date;
}): Promise<PromotionView[]> {
  const now = input.now ?? new Date();
  const filters = input.filters ?? {};
  const where: Record<string, unknown> = {
    restaurantId: input.restaurantId,
    deletedAt: null,
  };

  if (filters.scope) where.scope = filters.scope;
  if (filters.status === 'active') {
    where.isActive = true;
    where.startsAt = { lte: now };
    where.endsAt = { gt: now };
  } else if (filters.status === 'scheduled') {
    where.isActive = true;
    where.startsAt = { gt: now };
  } else if (filters.status === 'expired') {
    where.endsAt = { lte: now };
  } else if (filters.status === 'inactive') {
    where.isActive = false;
  }

  const rows = await prisma.promotion.findMany({
    where,
    include: {
      promotionCategories: { select: { categoryId: true } },
      promotionItems: { select: { itemId: true } },
    },
    orderBy: [{ startsAt: 'desc' }, { createdAt: 'desc' }],
    take: 200,
  });

  return rows.map((row) => toView(row as unknown as PromotionRow));
}

export interface UpdatePromotionInput {
  restaurantId: string;
  promotionId: string;
  userId: string;
  userType?: string | null;
  patch: PromotionPatch;
  idempotencyKey: string;
}

export async function updatePromotion(input: UpdatePromotionInput): Promise<{
  promotion: PromotionView;
  replayed: boolean;
  statusCode: number;
}> {
  const timezone = await getRestaurantTimezone(input.restaurantId);
  const requestHash = stableRequestHash({
    restaurantId: input.restaurantId,
    promotionId: input.promotionId,
    patch: input.patch,
  });

  const result = await runPromotionMutation<{ promotion: PromotionView }>({
    restaurantId: input.restaurantId,
    action: `promotions.update:${input.promotionId}`,
    idempotencyKey: input.idempotencyKey,
    requestHash,
    execute: async (tx) => {
      await lockPromotion(tx, input.restaurantId, input.promotionId);

      const existing = await tx.promotion.findFirst({
        where: {
          restaurantId: input.restaurantId,
          id: input.promotionId,
          deletedAt: null,
        },
        include: {
          promotionCategories: { select: { categoryId: true } },
          promotionItems: { select: { itemId: true } },
        },
      });
      if (!existing) throw new PromotionNotFoundError();

      const current = existing as unknown as PromotionRow;
      const normalised = mergePatch(current, input.patch, timezone);
      await assertScopeReferences(tx, input.restaurantId, normalised);

      const updated = await tx.promotion.update({
        where: { id: input.promotionId },
        data: {
          name: normalised.name,
          receiptLabel: normalised.receiptLabel,
          type: normalised.type,
          value: normalised.value,
          scope: normalised.scope,
          minSpend: normalised.minSpend,
          maxDiscount: normalised.maxDiscount,
          startsAt: normalised.startsAt,
          endsAt: normalised.endsAt,
          isActive: normalised.isActive,
          updatedBy: input.userId,
        },
      });

      await replaceScopeRows(
        tx,
        input.restaurantId,
        input.promotionId,
        normalised
      );

      await tx.auditLog.create({
        data: {
          tableName: 'promotions',
          recordId: input.promotionId,
          operation: 'UPDATE',
          oldValues: {
            name: current.name,
            scope: current.scope,
            type: current.type,
            value: new Decimal(current.value).toFixed(2),
            categoryIds: (current.promotionCategories ?? []).map(
              (entry) => entry.categoryId
            ),
            itemIds: (current.promotionItems ?? []).map(
              (entry) => entry.itemId
            ),
            startsAt: iso(current.startsAt),
            endsAt: iso(current.endsAt),
            isActive: current.isActive,
          },
          newValues: {
            name: normalised.name,
            scope: normalised.scope,
            type: normalised.type,
            value: normalised.value,
            categoryIds: normalised.categoryIds,
            itemIds: normalised.itemIds,
            startsAt: normalised.startsAt.toISOString(),
            endsAt: normalised.endsAt.toISOString(),
            isActive: normalised.isActive,
          },
          changedBy: input.userId,
          changedByType: input.userType ?? null,
          restaurantId: input.restaurantId,
          category: 'promotions',
          description: 'Promotion updated',
        },
      });

      return {
        body: {
          promotion: toView({
            ...(updated as unknown as PromotionRow),
            promotionCategories: normalised.categoryIds.map((categoryId) => ({
              categoryId,
            })),
            promotionItems: normalised.itemIds.map((itemId) => ({ itemId })),
          }),
        },
        statusCode: 200,
      };
    },
  });

  return {
    promotion: result.body.promotion,
    replayed: result.replayed,
    statusCode: result.statusCode,
  };
}

export interface DeletePromotionInput {
  restaurantId: string;
  promotionId: string;
  userId: string;
  userType?: string | null;
  idempotencyKey: string;
}

export async function deletePromotion(input: DeletePromotionInput): Promise<{
  promotion: PromotionView;
  replayed: boolean;
  statusCode: number;
}> {
  const requestHash = stableRequestHash({
    restaurantId: input.restaurantId,
    promotionId: input.promotionId,
  });

  const result = await runPromotionMutation<{ promotion: PromotionView }>({
    restaurantId: input.restaurantId,
    action: `promotions.delete:${input.promotionId}`,
    idempotencyKey: input.idempotencyKey,
    requestHash,
    execute: async (tx) => {
      await lockPromotion(tx, input.restaurantId, input.promotionId);

      const existing = await tx.promotion.findFirst({
        where: { restaurantId: input.restaurantId, id: input.promotionId },
        include: {
          promotionCategories: { select: { categoryId: true } },
          promotionItems: { select: { itemId: true } },
        },
      });
      if (!existing) throw new PromotionNotFoundError();

      const current = existing as unknown as PromotionRow;
      if (current.deletedAt !== null) {
        // Already soft-deleted: the delete is idempotent and writes no second
        // audit row.
        return {
          body: { promotion: toView(current) },
          statusCode: 200,
        };
      }

      const deletedAt = new Date();
      const updated = await tx.promotion.update({
        where: { id: input.promotionId },
        data: { deletedAt, isActive: false, updatedBy: input.userId },
      });

      await tx.auditLog.create({
        data: {
          tableName: 'promotions',
          recordId: input.promotionId,
          operation: 'DELETE',
          oldValues: {
            name: current.name,
            scope: current.scope,
            isActive: current.isActive,
          },
          newValues: { deletedAt: deletedAt.toISOString(), isActive: false },
          changedBy: input.userId,
          changedByType: input.userType ?? null,
          restaurantId: input.restaurantId,
          category: 'promotions',
          description: 'Promotion soft-deleted',
        },
      });

      return {
        body: {
          promotion: toView({
            ...(updated as unknown as PromotionRow),
            promotionCategories: current.promotionCategories,
            promotionItems: current.promotionItems,
          }),
        },
        statusCode: 200,
      };
    },
  });

  return {
    promotion: result.body.promotion,
    replayed: result.replayed,
    statusCode: result.statusCode,
  };
}
