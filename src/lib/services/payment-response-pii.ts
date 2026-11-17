/**
 * Payment-response PII scrubber.
 *
 * Payment responses embed the takeaway order's customer name and phone for the
 * live Counter response. A receipt must carry no name or phone (§18.20.8), and
 * the 24h `PaymentBatch.response`/`IdempotencyRecord.responseJson` snapshots
 * must not retain them either. Callers return the live response and persist the
 * scrubbed copy.
 */

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function stripCustomerPiiFromPaymentResponse<T>(response: T): T {
  const clone = JSON.parse(JSON.stringify(response)) as T;
  if (!isRecord(clone)) return clone;

  const payment = clone.payment;
  if (!isRecord(payment)) return clone;

  const order = payment.order;
  if (!isRecord(order)) return clone;

  delete order.customerName;
  delete order.customerPhone;
  delete order.customerEmail;
  return clone;
}
