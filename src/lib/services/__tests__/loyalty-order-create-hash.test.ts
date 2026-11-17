import { createHash } from 'node:crypto';
import { LoyaltyConfigurationError } from '@/lib/loyalty/phone';
import { orderCreateRequestHash } from '@/lib/services/loyalty-qr-service';

jest.mock('@/lib/database', () => ({ prisma: {} }));

const base = {
  restaurantId: 'restaurant-1',
  tableId: 'table-1',
  sessionId: 'session-1',
  quoteId: 'quote-1',
  expectedTotal: '55.68',
  customerInfo: {
    phone: '+60123456789',
    consent: true,
    consentVersion: 'v1',
    consentTextHash: 'hash',
  },
};

/**
 * The exact payload `orderCreateRequestHash` feeds into the HMAC. Kept in the
 * test only to prove the persisted digest is not the old unkeyed SHA-256.
 */
function unkeyedPayload(): string {
  return JSON.stringify({
    restaurantId: base.restaurantId,
    tableId: base.tableId,
    sessionId: base.sessionId,
    quoteId: base.quoteId,
    expectedTotal: base.expectedTotal,
    customerInfo: {
      name: null,
      phone: base.customerInfo.phone,
      email: null,
      consent: base.customerInfo.consent,
      consentVersion: base.customerInfo.consentVersion,
      consentTextHash: base.customerInfo.consentTextHash,
    },
  });
}

describe('orderCreateRequestHash — F-08 keyed HMAC', () => {
  const originalKey = process.env.LOYALTY_PHONE_HMAC_KEY;

  afterEach(() => {
    if (originalKey === undefined) {
      delete process.env.LOYALTY_PHONE_HMAC_KEY;
    } else {
      process.env.LOYALTY_PHONE_HMAC_KEY = originalKey;
    }
  });

  it('produces different digests for the same phone under different keys', () => {
    process.env.LOYALTY_PHONE_HMAC_KEY = 'key-a';
    const withKeyA = orderCreateRequestHash(base);

    process.env.LOYALTY_PHONE_HMAC_KEY = 'key-b';
    const withKeyB = orderCreateRequestHash(base);

    expect(withKeyA).not.toBe(withKeyB);
    expect(withKeyA).toMatch(/^[a-f0-9]{64}$/);
    expect(withKeyB).toMatch(/^[a-f0-9]{64}$/);
  });

  it('is not the old unkeyed SHA-256 of the payload', () => {
    process.env.LOYALTY_PHONE_HMAC_KEY = 'key-a';

    const digest = orderCreateRequestHash(base);
    const unkeyed = createHash('sha256')
      .update(unkeyedPayload(), 'utf8')
      .digest('hex');

    expect(digest).not.toBe(unkeyed);
  });

  it('cannot reproduce the digest without the key (fails closed)', () => {
    process.env.LOYALTY_PHONE_HMAC_KEY = 'key-a';
    const digest = orderCreateRequestHash(base);

    delete process.env.LOYALTY_PHONE_HMAC_KEY;

    expect(() => orderCreateRequestHash(base)).toThrow(
      LoyaltyConfigurationError
    );
    expect(digest).toMatch(/^[a-f0-9]{64}$/);
  });

  it('still changes when a non-phone field changes', () => {
    process.env.LOYALTY_PHONE_HMAC_KEY = 'key-a';
    const digest = orderCreateRequestHash(base);

    expect(
      orderCreateRequestHash({ ...base, expectedTotal: '55.69' })
    ).not.toBe(digest);
  });
});
