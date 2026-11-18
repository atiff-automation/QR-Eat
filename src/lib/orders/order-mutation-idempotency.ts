/**
 * Scoped idempotency for B3 order mutations.
 *
 * The receipt is scoped to `restaurantId + orderId + operation + client key`
 * and stores a canonical request hash. A retry with the same body replays the
 * stored response; the same key with a different body is rejected. Because the
 * scope includes the restaurant, a key cannot be replayed across tenants.
 */

import { createHash } from 'crypto';

export type OrderMutationOperation = 'ADD_ITEMS' | 'CANCEL';

export interface OrderMutationScope {
  restaurantId: string;
  orderId: string;
  operation: OrderMutationOperation;
  idempotencyKey: string;
}

/** Stable JSON: object keys sorted, undefined fields omitted, arrays in order. */
function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(',')}]`;
  }
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, entry]) => entry !== undefined)
      .sort(([left], [right]) => left.localeCompare(right));
    return `{${entries
      .map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

export function buildOrderMutationRequestHash(
  operation: OrderMutationOperation,
  orderId: string,
  body: unknown
): string {
  return createHash('sha256')
    .update(canonicalJson({ operation, orderId, body }))
    .digest('hex');
}

/**
 * `OrderModification.idempotencyKey` is globally unique. Prefixing with the
 * operation and order id keeps concurrent add-items/cancel mutations on
 * different orders from colliding on the same client key.
 */
export function deriveOrderModificationKey(
  operation: OrderMutationOperation,
  orderId: string,
  clientKey: string
): string {
  return `${operation}:${orderId}:${clientKey}`;
}
