import { createHash } from 'node:crypto';
import { buildCounterOrderRequestHash } from '@/lib/services/counter-order-service';

jest.mock('@/lib/database', () => ({ prisma: {} }));

const tableId = '550e8400-e29b-41d4-a716-446655440002';
const itemId = '550e8400-e29b-41d4-a716-446655440003';
const phone = '+60123456789';

const input = {
  orderType: 'DINE_IN' as const,
  tableId,
  customerName: 'Aina',
  customerPhone: phone,
  specialInstructions: null,
  items: [
    {
      menuItemId: itemId,
      quantity: 1,
      optionIds: [] as string[],
      notes: null,
    },
  ],
};

/**
 * The exact payload `buildCounterOrderRequestHash` feeds into the HMAC. Kept in
 * the test only to prove the persisted digest is not the old unkeyed SHA-256.
 */
function unkeyedPayload(): string {
  return JSON.stringify({
    orderType: input.orderType,
    tableId: input.tableId,
    customerName: input.customerName,
    customerPhone: input.customerPhone,
    specialInstructions: input.specialInstructions,
    items: input.items.map((item) => ({
      menuItemId: item.menuItemId,
      quantity: item.quantity,
      optionIds: item.optionIds,
      notes: item.notes,
    })),
  });
}

describe('buildCounterOrderRequestHash — P7b-1 keyed HMAC', () => {
  const originalKey = process.env.LOYALTY_PHONE_HMAC_KEY;

  afterEach(() => {
    if (originalKey === undefined) {
      delete process.env.LOYALTY_PHONE_HMAC_KEY;
    } else {
      process.env.LOYALTY_PHONE_HMAC_KEY = originalKey;
    }
  });

  it('is stable for the same request', () => {
    process.env.LOYALTY_PHONE_HMAC_KEY = 'key-a';
    expect(buildCounterOrderRequestHash(input)).toBe(
      buildCounterOrderRequestHash(input)
    );
  });

  it('produces different digests for the same phone under different keys', () => {
    process.env.LOYALTY_PHONE_HMAC_KEY = 'key-a';
    const withKeyA = buildCounterOrderRequestHash(input);

    process.env.LOYALTY_PHONE_HMAC_KEY = 'key-b';
    const withKeyB = buildCounterOrderRequestHash(input);

    expect(withKeyA).not.toBe(withKeyB);
    expect(withKeyA).toMatch(/^[a-f0-9]{64}$/);
    expect(withKeyB).toMatch(/^[a-f0-9]{64}$/);
  });

  it('is not the old unkeyed SHA-256 of the payload', () => {
    process.env.LOYALTY_PHONE_HMAC_KEY = 'key-a';

    const digest = buildCounterOrderRequestHash(input);
    const unkeyed = createHash('sha256')
      .update(unkeyedPayload(), 'utf8')
      .digest('hex');

    expect(digest).not.toBe(unkeyed);
  });

  it('does not throw when the key is absent and omits phone and name', () => {
    process.env.LOYALTY_PHONE_HMAC_KEY = 'key-a';
    const keyed = buildCounterOrderRequestHash(input);

    delete process.env.LOYALTY_PHONE_HMAC_KEY;

    const withoutKey = buildCounterOrderRequestHash(input);
    const otherPhone = buildCounterOrderRequestHash({
      ...input,
      customerName: 'Different Name',
      customerPhone: '+60123456780',
    });

    expect(withoutKey).toMatch(/^[a-f0-9]{64}$/);
    expect(otherPhone).toBe(withoutKey);
    expect(withoutKey).not.toBe(keyed);
    // No PII digest: the fallback is not the unkeyed hash of the full payload.
    expect(withoutKey).not.toBe(
      createHash('sha256').update(unkeyedPayload(), 'utf8').digest('hex')
    );
  });

  it('still changes when the customer phone changes with a key present', () => {
    process.env.LOYALTY_PHONE_HMAC_KEY = 'key-a';
    const digest = buildCounterOrderRequestHash(input);

    expect(
      buildCounterOrderRequestHash({ ...input, customerPhone: '+60123456780' })
    ).not.toBe(digest);
  });
});
