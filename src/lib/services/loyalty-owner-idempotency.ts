/**
 * Durable idempotency for owner loyalty/promotion mutations.
 *
 * The contract requires every mutating owner endpoint to take an
 * `Idempotency-Key` (§18.20.7). `IdempotencyRecord` only models the order,
 * member-change and payment scopes, and the P6 task forbids schema changes, so
 * the existing generic `order_action_receipts` table is reused as the durable
 * store. It is keyed by `(restaurantId, action, idempotencyKey)` and already
 * survives process restarts.
 *
 * The receipt is written in the same transaction as the mutation, so a failed
 * mutation leaves no receipt and a retry can re-run safely. The stored response
 * is an envelope carrying the request hash: a reused key with a different body
 * is rejected with `IDEMPOTENCY_MISMATCH` instead of returning the wrong body.
 */

import { createHash } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { prisma, type TransactionClient } from '@/lib/database';

/** Retention for owner idempotency receipts (24 hours, §18.20.7/§18.20.14). */
export const OWNER_IDEMPOTENCY_RETENTION_MS = 24 * 60 * 60 * 1000;

export class OwnerIdempotencyMismatchError extends Error {
  readonly code = 'IDEMPOTENCY_MISMATCH';
  readonly statusCode = 409;

  constructor() {
    super('The Idempotency-Key was already used with a different request');
    this.name = 'OwnerIdempotencyMismatchError';
  }
}

interface ReceiptEnvelope {
  requestHash: string;
  statusCode: number;
  body: unknown;
}

export interface OwnerIdempotentResult<T> {
  body: T;
  statusCode: number;
  replayed: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isReceiptEnvelope(value: unknown): value is ReceiptEnvelope {
  return (
    isRecord(value) &&
    typeof value.requestHash === 'string' &&
    typeof value.statusCode === 'number' &&
    'body' in value
  );
}

/**
 * Stable JSON hash: object keys are sorted recursively so the same semantic
 * request produces the same hash regardless of property order.
 */
export function stableRequestHash(value: unknown): string {
  return createHash('sha256')
    .update(stableStringify(value), 'utf8')
    .digest('hex');
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value) ?? 'null';
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`;
  }
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, entry]) => entry !== undefined)
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0));
  return `{${entries
    .map(([key, entry]) => `${JSON.stringify(key)}:${stableStringify(entry)}`)
    .join(',')}}`;
}

function isUniqueViolation(error: unknown): boolean {
  return (
    isRecord(error) && typeof error.code === 'string' && error.code === 'P2002'
  );
}

function replay<T>(
  response: Prisma.JsonValue,
  requestHash: string
): OwnerIdempotentResult<T> {
  if (!isReceiptEnvelope(response)) {
    // A receipt written by another feature (or a corrupt row) cannot be
    // replayed safely; fail closed rather than return an arbitrary payload.
    throw new Error('Unrecognised idempotency receipt');
  }
  if (response.requestHash !== requestHash) {
    throw new OwnerIdempotencyMismatchError();
  }
  return {
    body: response.body as T,
    statusCode: response.statusCode,
    replayed: true,
  };
}

export interface RunIdempotentOwnerMutationInput<T> {
  restaurantId: string;
  /** Stable action name, e.g. `settings.loyalty.update`. */
  action: string;
  key: string;
  requestHash: string;
  execute: (tx: TransactionClient) => Promise<{ body: T; statusCode?: number }>;
}

/**
 * Run an owner mutation exactly once per `(restaurantId, action, key)`.
 *
 * The receipt is created first inside the transaction, so two concurrent
 * requests with the same key cannot both mutate: the loser hits the unique
 * constraint, the transaction rolls back, and the committed receipt is
 * replayed.
 */
export async function runIdempotentOwnerMutation<T>(
  input: RunIdempotentOwnerMutationInput<T>
): Promise<OwnerIdempotentResult<T>> {
  const where = {
    restaurantId_action_idempotencyKey: {
      restaurantId: input.restaurantId,
      action: input.action,
      idempotencyKey: input.key,
    },
  };

  const existing = await prisma.orderActionReceipt.findUnique({ where });
  if (existing) {
    const age = Date.now() - new Date(existing.createdAt).getTime();
    if (age < OWNER_IDEMPOTENCY_RETENTION_MS) {
      return replay<T>(existing.response, input.requestHash);
    }
    // Expired receipts are not authoritative; remove and run again.
    await prisma.orderActionReceipt.delete({ where: { id: existing.id } });
  }

  try {
    return await prisma.$transaction(async (tx) => {
      const placeholder: ReceiptEnvelope = {
        requestHash: input.requestHash,
        statusCode: 200,
        body: null,
      };
      await tx.orderActionReceipt.create({
        data: {
          restaurantId: input.restaurantId,
          action: input.action,
          idempotencyKey: input.key,
          statusCode: 200,
          response: placeholder as unknown as Prisma.InputJsonValue,
        },
      });

      const result = await input.execute(tx);
      const statusCode = result.statusCode ?? 200;
      const envelope: ReceiptEnvelope = {
        requestHash: input.requestHash,
        statusCode,
        body: result.body,
      };
      await tx.orderActionReceipt.update({
        where,
        data: {
          statusCode,
          response: envelope as unknown as Prisma.InputJsonValue,
        },
      });

      return { body: result.body, statusCode, replayed: false };
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      const raced = await prisma.orderActionReceipt.findUnique({ where });
      if (raced) {
        return replay<T>(raced.response, input.requestHash);
      }
    }
    throw error;
  }
}
