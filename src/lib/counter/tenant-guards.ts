/**
 * Small, pure tenant checks shared by server routes and tests.
 *
 * Keep these fail-closed: a missing restaurant id is never a wildcard.
 */
export function canReceiveRestaurantEvent(
  connectionRestaurantId: string | undefined,
  eventRestaurantId: string | undefined
): boolean {
  return (
    !!connectionRestaurantId &&
    !!eventRestaurantId &&
    connectionRestaurantId === eventRestaurantId
  );
}

export function canReadRestaurantPaymentBatch(
  contextRestaurantId: string | undefined,
  batchRestaurantId: string | undefined
): boolean {
  return (
    !!contextRestaurantId &&
    !!batchRestaurantId &&
    contextRestaurantId === batchRestaurantId
  );
}
