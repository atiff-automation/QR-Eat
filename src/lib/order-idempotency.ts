/**
 * Durable idempotency for order/item mutations.
 *
 * A retry must return the first response, not re-apply the work. The receipt is
 * written after the mutation; a crash between them is safe for status writes
 * because setting the same status is idempotent.
 */

import type { NextRequest } from 'next/server';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/database';

export const ORDER_ACTION = {
  ITEM_STATUS: 'item.status',
  ORDER_READY: 'order.ready',
} as const;

export type OrderAction = (typeof ORDER_ACTION)[keyof typeof ORDER_ACTION];

export interface StoredResponse {
  statusCode: number;
  body: Prisma.JsonValue;
}

export function idempotencyKeyFrom(request: NextRequest): string | null {
  const key = request.headers.get('idempotency-key')?.trim();
  if (!key) return null;
  return key.slice(0, 200);
}

export async function findReceipt(
  restaurantId: string,
  action: OrderAction,
  key: string
): Promise<StoredResponse | null> {
  const receipt = await prisma.orderActionReceipt.findUnique({
    where: {
      restaurantId_action_idempotencyKey: {
        restaurantId,
        action,
        idempotencyKey: key,
      },
    },
    select: { statusCode: true, response: true },
  });
  if (!receipt) return null;
  return { statusCode: receipt.statusCode, body: receipt.response };
}

export async function saveReceipt(input: {
  restaurantId: string;
  action: OrderAction;
  key: string;
  orderId?: string | null;
  statusCode?: number;
  body: object;
}): Promise<StoredResponse> {
  const statusCode = input.statusCode ?? 200;
  try {
    const receipt = await prisma.orderActionReceipt.create({
      data: {
        restaurantId: input.restaurantId,
        action: input.action,
        idempotencyKey: input.key,
        orderId: input.orderId ?? null,
        statusCode,
        response: input.body as Prisma.InputJsonValue,
      },
      select: { statusCode: true, response: true },
    });
    return { statusCode: receipt.statusCode, body: receipt.response };
  } catch (error) {
    if (
      error &&
      typeof error === 'object' &&
      'code' in error &&
      error.code === 'P2002'
    ) {
      const existing = await findReceipt(
        input.restaurantId,
        input.action,
        input.key
      );
      if (existing) return existing;
    }
    throw error;
  }
}
