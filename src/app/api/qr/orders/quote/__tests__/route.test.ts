import { NextRequest } from 'next/server';
import Decimal from 'decimal.js';
import { prisma } from '@/lib/database';
import { getTableCart } from '@/lib/customer-session';
import { resolveOrCreateCustomer } from '@/lib/services/loyalty-customer-service';
import { issueQrQuote } from '@/lib/services/loyalty-qr-service';
import { hashNoticeText } from '@/lib/loyalty/consent';
import { hashPhone } from '@/lib/loyalty/phone';
import { POST as quote } from '@/app/api/qr/orders/quote/route';

jest.mock('@/lib/database', () => ({
  prisma: {
    table: { findUnique: jest.fn() },
    loyaltySettings: { findUnique: jest.fn() },
    securityEvent: {
      create: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
    },
    $queryRaw: jest.fn(),
    $transaction: jest.fn(),
  },
}));

jest.mock('@/lib/customer-session', () => ({
  getTableCart: jest.fn(),
}));

jest.mock('@/lib/services/loyalty-customer-service', () => ({
  resolveOrCreateCustomer: jest.fn(),
}));

jest.mock('@/lib/services/loyalty-qr-service', () => ({
  issueQrQuote: jest.fn(),
}));

const restaurantId = '550e8400-e29b-41d4-a716-446655440001';
const otherRestaurantId = '550e8400-e29b-41d4-a716-446655440099';
const tableId = '550e8400-e29b-41d4-a716-446655440002';
const sessionId = '550e8400-e29b-41d4-a716-446655440003';

const noticeText = 'Rewards notice v1';
const noticeTextHash = hashNoticeText(noticeText);

const settings = {
  restaurantId,
  enabled: true,
  visitsRequired: 3,
  lookupLimitPerHour: 30,
  rewardType: 'PERCENT',
  rewardValue: new Decimal('10.00'),
  maxDiscount: new Decimal('15.00'),
  minDailySpend: new Decimal('20.00'),
  rewardLabel: '10% off, max RM15',
  noticeVersion: 'v1',
  noticeText,
  noticeTextHash,
  privacyUrl: 'https://example.test/privacy',
  termsText: null,
};

const table = {
  id: tableId,
  restaurant: { id: restaurantId, isActive: true },
};

const cart = {
  sessionId,
  items: [
    {
      id: 'cart-item-1',
      menuItemId: '550e8400-e29b-41d4-a716-446655440005',
      quantity: 1,
      unitPrice: 60,
      subtotal: 60,
      specialInstructions: null,
      selectedOptions: [],
    },
  ],
  totalItems: 1,
  totalAmount: 60,
};

function computation(overrides: Record<string, unknown> = {}) {
  return {
    billRevision: 7,
    subtotal: new Decimal('60.00'),
    promotionDiscountAmount: new Decimal('12.00'),
    projectedRewardAmount: new Decimal('0.00'),
    discountAmount: new Decimal('12.00'),
    discountLines: [
      {
        source: 'PROMOTION',
        label: 'Lunch 20%',
        amount: new Decimal('12.00'),
      },
    ],
    discountedSubtotal: new Decimal('48.00'),
    taxAmount: new Decimal('2.88'),
    serviceCharge: new Decimal('4.80'),
    totalAmount: new Decimal('55.68'),
    projectedTotal: new Decimal('55.68'),
    cashPayable: new Decimal('55.70'),
    rewardLabel: '10% off, max RM15',
    rewardType: 'PERCENT',
    rewardValue: '10',
    maxDiscount: new Decimal('15.00'),
    promotionApplied: true,
    promotionScope: 'ITEM',
    promotionLabel: 'Lunch 20%',
    promotionItems: [{ itemId: 'item-1', name: 'Pasta' }],
    promotionIds: ['promo-1'],
    visitState: 'PROMOTION',
    completedVisits: 2,
    visitsRequired: 3,
    cartPromotion: null,
    cartPreRewardTotals: {},
    cartProjectedTotals: {},
    message:
      'Lunch 20% applied to Pasta. This visit will not count. Your card stays at 2 of 3.',
    ...overrides,
  };
}

function request(body: Record<string, unknown>) {
  return new NextRequest('http://localhost/api/qr/orders/quote', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

/**
 * In-memory counter for `rate_limit_counters`. The advisory-lock query from the
 * security-event recorder has a single value and returns no rows.
 */
function installCounterMock(): Map<string, number> {
  const counts = new Map<string, number>();
  (prisma.$queryRaw as jest.Mock).mockImplementation(
    async (
      _strings: TemplateStringsArray,
      ...values: unknown[]
    ): Promise<Array<{ count: number }>> => {
      if (values.length < 5) return [];
      const [, restaurant, scope, subject, start] = values;
      const key = [
        restaurant,
        scope,
        subject,
        (start as Date).toISOString(),
      ].join('|');
      const next = (counts.get(key) ?? 0) + 1;
      counts.set(key, next);
      return [{ count: next }];
    }
  );
  return counts;
}

describe('POST /api/qr/orders/quote', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.LOYALTY_ENABLED = 'true';
    process.env.LOYALTY_PHONE_HMAC_KEY = 'test-key';
    // Production runs behind Railway's edge, which sets X-Real-IP and replaces
    // X-Forwarded-For. Resolver tests cover the platform-off path.
    process.env.RAILWAY_ENVIRONMENT = 'production';

    (prisma.table.findUnique as jest.Mock).mockResolvedValue(table);
    (prisma.loyaltySettings.findUnique as jest.Mock).mockResolvedValue(
      settings
    );
    (prisma.$queryRaw as jest.Mock).mockResolvedValue([{ count: 1 }]);
    (prisma.$transaction as jest.Mock).mockImplementation(
      async (callback: (client: typeof prisma) => unknown) => callback(prisma)
    );
    (prisma.securityEvent.create as jest.Mock).mockResolvedValue({});
    (prisma.securityEvent.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.securityEvent.findFirst as jest.Mock).mockResolvedValue(null);
    (getTableCart as jest.Mock).mockResolvedValue(cart);
    (resolveOrCreateCustomer as jest.Mock).mockResolvedValue({
      customerId: 'customer-1',
      isNew: false,
      consentOk: true,
      loyaltyError: null,
    });
    (issueQrQuote as jest.Mock).mockResolvedValue({
      quoteId: 'quote-1',
      expiresAt: new Date('2026-11-13T10:10:00.000Z'),
      computation: computation(),
    });
  });

  afterAll(() => {
    delete process.env.LOYALTY_ENABLED;
    delete process.env.LOYALTY_PHONE_HMAC_KEY;
    delete process.env.RAILWAY_ENVIRONMENT;
  });

  it('returns LOYALTY_DISABLED without touching the database when the flag is off', async () => {
    delete process.env.LOYALTY_ENABLED;

    const response = await quote(
      request({
        tableId,
        sessionId,
        phone: '+60123456789',
        consent: true,
      })
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toMatchObject({
      success: false,
      code: 'LOYALTY_DISABLED',
    });
    expect(prisma.table.findUnique).not.toHaveBeenCalled();
    expect(prisma.loyaltySettings.findUnique).not.toHaveBeenCalled();
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
    expect(issueQrQuote).not.toHaveBeenCalled();
  });

  it('returns RATE_LIMITED before phone resolution and leaks no PII', async () => {
    installCounterMock();

    let response: Response | null = null;
    for (let attempt = 0; attempt < 11; attempt += 1) {
      response = await quote(
        request({
          tableId,
          sessionId,
          phone: '+60123456789',
          consent: true,
          consentVersion: 'v1',
          consentTextHash: noticeTextHash,
        })
      );
    }

    expect(response).not.toBeNull();
    const json = await response!.json();

    expect(response!.status).toBe(429);
    expect(response!.headers.get('retry-after')).toBe(
      String(json.retryAfterSeconds)
    );
    expect(json).toEqual({
      success: false,
      error: 'Please order at the counter — our staff will help.',
      code: 'RATE_LIMITED',
      retryAfterSeconds: expect.any(Number),
    });
    expect(json.retryAfterSeconds).toBeGreaterThan(0);
    // OWASP: the retry window is rounded, not a precise value to schedule on.
    expect(json.retryAfterSeconds % 10).toBe(0);
    expect(json).not.toHaveProperty('phone');
    expect(json).not.toHaveProperty('phoneHash');
    expect(json).not.toHaveProperty('visitState');
    expect(json).not.toHaveProperty('customerId');
    expect(JSON.stringify(json)).not.toContain('+60123456789');

    // The 11th attempt was refused before the member was resolved.
    expect(resolveOrCreateCustomer).toHaveBeenCalledTimes(10);
    expect(issueQrQuote).toHaveBeenCalledTimes(10);

    // One refusal event, tenant-scoped, carrying no raw phone.
    const refusalEvents = (prisma.securityEvent.create as jest.Mock).mock.calls
      .map(([arg]) => arg.data)
      .filter((data) => data.eventType === 'loyalty_rate_limited');
    expect(refusalEvents).toHaveLength(1);
    expect(refusalEvents[0]).toMatchObject({ restaurantId });
    expect(JSON.stringify(refusalEvents[0])).not.toContain('+60123456789');
  });

  it('does not count a guest quote at all (P7c)', async () => {
    const counts = installCounterMock();

    const response = await quote(request({ tableId, sessionId }));

    expect(response.status).toBe(200);
    expect(counts.size).toBe(0);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('fails open when the counter database errors', async () => {
    (prisma.$transaction as jest.Mock).mockRejectedValue(
      new Error('connection refused')
    );

    const response = await quote(
      request({
        tableId,
        sessionId,
        phone: '+60123456789',
        consent: true,
        consentVersion: 'v1',
        consentTextHash: noticeTextHash,
      })
    );

    expect(response.status).toBe(200);
    expect(issueQrQuote).toHaveBeenCalledTimes(1);

    // Fail-open is not a refusal: no refusal event is recorded.
    const refusalEvents = (prisma.securityEvent.create as jest.Mock).mock.calls
      .map(([arg]) => arg.data)
      .filter((data) => data.eventType === 'loyalty_rate_limited');
    expect(refusalEvents).toHaveLength(0);
  });

  it('limits on the X-Real-IP client address, not a spoofed X-Forwarded-For entry', async () => {
    const counts = installCounterMock();
    // Raise the tenant ceiling so the IP floor (120) is the first bucket to
    // trip; the default 30 would refuse first.
    (prisma.loyaltySettings.findUnique as jest.Mock).mockResolvedValue({
      ...settings,
      lookupLimitPerHour: 1000,
    });

    // Distinct sessions and phones so only the IP bucket can trip. The edge
    // sets X-Real-IP to the client; the X-Forwarded-For entries are internal
    // hops that rotate per connection and must never become the subject.
    let response: Response | null = null;
    for (let attempt = 0; attempt < 121; attempt += 1) {
      const attemptSession = `${sessionId}-${attempt}`;
      (getTableCart as jest.Mock).mockResolvedValue({
        ...cart,
        sessionId: attemptSession,
      });
      response = await quote(
        new NextRequest('http://localhost/api/qr/orders/quote', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-real-ip': '203.0.113.50',
            'x-forwarded-for': `10.0.0.${attempt}, 10.0.1.${attempt}`,
          },
          body: JSON.stringify({
            tableId,
            sessionId,
            phone: `+6012345${String(attempt).padStart(4, '0')}`,
            consent: true,
            consentVersion: 'v1',
            consentTextHash: noticeTextHash,
          }),
        })
      );
    }

    expect(response).not.toBeNull();
    expect(response!.status).toBe(429);
    const json = await response!.json();
    expect(json.code).toBe('RATE_LIMITED');

    const ipSubjects = [...counts.keys()]
      .filter((key) => key.split('|')[1] === 'EDGE_IP')
      .map((key) => key.split('|')[2]);
    expect(ipSubjects).toContain('203.0.113.50');
    expect(ipSubjects.some((subject) => subject.startsWith('10.0.0.'))).toBe(
      false
    );
    expect(ipSubjects.some((subject) => subject.startsWith('10.0.1.'))).toBe(
      false
    );
  });

  it('prices a member quote and omits every forbidden field', async () => {
    const response = await quote(
      request({
        tableId,
        sessionId,
        phone: '+60123456789',
        consent: true,
        consentVersion: 'v1',
        consentTextHash: noticeTextHash,
      })
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toMatchObject({
      success: true,
      quoteId: 'quote-1',
      quoteRevision: 7,
      subtotal: '60.00',
      promotionDiscountAmount: '12.00',
      projectedRewardAmount: '0.00',
      discountAmount: '12.00',
      discountedSubtotal: '48.00',
      taxAmount: '2.88',
      serviceCharge: '4.80',
      totalAmount: '55.68',
      projectedTotal: '55.68',
      cashPayable: '55.70',
      promotionApplied: true,
      promotionScope: 'ITEM',
      promotionLabel: 'Lunch 20%',
      visitState: 'PROMOTION',
      visit: { completedVisits: 2, visitsRequired: 3 },
    });
    expect(json.discountLines).toEqual([
      { source: 'PROMOTION', label: 'Lunch 20%', amount: '12.00' },
    ]);
    expect(json.discountLines[0]).not.toHaveProperty('orderId');
    expect(json).not.toHaveProperty('daySubtotal');
    expect(json).not.toHaveProperty('minDailySpend');
    expect(json).not.toHaveProperty('amountToMinimum');
    expect(json).not.toHaveProperty('customerId');
    expect(json).not.toHaveProperty('phone');
    expect(json).not.toHaveProperty('phoneHash');

    expect(issueQrQuote).toHaveBeenCalledWith(
      expect.objectContaining({
        restaurantId,
        tableId,
        sessionId,
        customerId: 'customer-1',
        guestReason: null,
      })
    );
    expect(resolveOrCreateCustomer).toHaveBeenCalledWith(
      expect.objectContaining({
        restaurantId,
        phone: '+60123456789',
        source: 'QR',
      })
    );
  });

  it('records a lookup miss with the phone hash, never the phone', async () => {
    (resolveOrCreateCustomer as jest.Mock).mockResolvedValue({
      customerId: 'customer-new',
      isNew: true,
      consentOk: true,
      loyaltyError: null,
    });

    const response = await quote(
      new NextRequest('http://localhost/api/qr/orders/quote', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-real-ip': '203.0.113.50',
          'x-forwarded-for': '203.0.113.50, 10.0.0.1',
        },
        body: JSON.stringify({
          tableId,
          sessionId,
          phone: '+60123456789',
          consent: true,
          consentVersion: 'v1',
          consentTextHash: noticeTextHash,
        }),
      })
    );

    expect(response.status).toBe(200);
    const created = (prisma.securityEvent.create as jest.Mock).mock.calls.map(
      ([arg]) => arg.data
    );
    const miss = created.find(
      (data) => data.eventType === 'loyalty_lookup_miss'
    );
    expect(miss).toMatchObject({
      severity: 'info',
      ipAddress: '203.0.113.50',
      requestPath: '/api/qr/orders/quote',
      eventData: { phoneHash: hashPhone('+60123456789') },
    });
    expect(JSON.stringify(miss)).not.toContain('+60123456789');
  });

  it('returns a guest quote when no phone is supplied', async () => {
    (issueQrQuote as jest.Mock).mockResolvedValue({
      quoteId: 'quote-guest',
      expiresAt: new Date('2026-11-13T10:10:00.000Z'),
      computation: computation({
        visitState: 'GUEST',
        promotionApplied: false,
        promotionScope: null,
        promotionLabel: null,
        promotionItems: [],
        promotionDiscountAmount: new Decimal(0),
        discountAmount: new Decimal(0),
        discountLines: [],
        message:
          'Guest order - no visit tracked; staff can attach at the counter.',
      }),
    });

    const response = await quote(request({ tableId, sessionId }));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.visitState).toBe('GUEST');
    expect(json.promotionApplied).toBe(false);
    expect(resolveOrCreateCustomer).not.toHaveBeenCalled();
    expect(issueQrQuote).toHaveBeenCalledWith(
      expect.objectContaining({
        customerId: null,
        phoneHash: null,
        guestReason: 'NO_PHONE',
      })
    );
  });

  it('returns a below-minimum quote without an amount', async () => {
    (issueQrQuote as jest.Mock).mockResolvedValue({
      quoteId: 'quote-below',
      expiresAt: new Date('2026-11-13T10:10:00.000Z'),
      computation: computation({
        visitState: 'BELOW_MINIMUM',
        promotionApplied: false,
        promotionScope: null,
        promotionLabel: null,
        promotionItems: [],
        promotionDiscountAmount: new Decimal(0),
        discountAmount: new Decimal(0),
        discountLines: [],
        message:
          'This visit needs the minimum daily spend. Staff can help at the counter.',
      }),
    });

    const response = await quote(
      request({
        tableId,
        sessionId,
        phone: '+60123456789',
        consent: true,
        consentVersion: 'v1',
        consentTextHash: noticeTextHash,
      })
    );
    const json = await response.json();

    expect(json.visitState).toBe('BELOW_MINIMUM');
    expect(json.message).not.toContain('RM');
    expect(json).not.toHaveProperty('minDailySpend');
    expect(json).not.toHaveProperty('amountToMinimum');
  });

  it('maps the member-resolution race to a generic guest reason (N-01)', async () => {
    (resolveOrCreateCustomer as jest.Mock).mockResolvedValue({
      customerId: null,
      isNew: false,
      consentOk: false,
      loyaltyError: { code: 'LOYALTY_DISABLED', message: 'not available' },
    });

    await quote(
      request({
        tableId,
        sessionId,
        phone: '+60123456789',
        consent: true,
        consentVersion: 'v1',
        consentTextHash: noticeTextHash,
      })
    );

    expect(issueQrQuote).toHaveBeenCalledWith(
      expect.objectContaining({
        customerId: null,
        guestReason: 'MEMBER_RESOLUTION_FAILED',
      })
    );
  });

  it('returns a guest quote for an invalid phone instead of a request error', async () => {
    (resolveOrCreateCustomer as jest.Mock).mockResolvedValue({
      customerId: null,
      isNew: false,
      consentOk: false,
      loyaltyError: { code: 'PHONE_INVALID', message: 'invalid' },
    });

    const response = await quote(
      request({
        tableId,
        sessionId,
        phone: '123',
        consent: true,
        consentVersion: 'v1',
        consentTextHash: noticeTextHash,
      })
    );

    expect(response.status).toBe(200);
    expect(issueQrQuote).toHaveBeenCalledWith(
      expect.objectContaining({
        customerId: null,
        guestReason: 'PHONE_INVALID',
      })
    );
  });

  it('scopes the table, settings and quote to the table restaurant', async () => {
    (prisma.table.findUnique as jest.Mock).mockResolvedValue({
      id: tableId,
      restaurant: { id: otherRestaurantId, isActive: true },
    });
    (prisma.loyaltySettings.findUnique as jest.Mock).mockResolvedValue({
      ...settings,
      restaurantId: otherRestaurantId,
    });

    await quote(request({ tableId, sessionId }));

    expect(prisma.table.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: tableId } })
    );
    expect(prisma.loyaltySettings.findUnique).toHaveBeenCalledWith({
      where: { restaurantId: otherRestaurantId },
    });
    expect(issueQrQuote).toHaveBeenCalledWith(
      expect.objectContaining({ restaurantId: otherRestaurantId })
    );
  });

  it('returns LOYALTY_DISABLED when the restaurant setting is off', async () => {
    (prisma.loyaltySettings.findUnique as jest.Mock).mockResolvedValue({
      ...settings,
      enabled: false,
    });

    const response = await quote(request({ tableId, sessionId }));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.code).toBe('LOYALTY_DISABLED');
    expect(getTableCart).not.toHaveBeenCalled();
    expect(issueQrQuote).not.toHaveBeenCalled();
  });

  it('returns LOYALTY_DISABLED when the notice is inconsistent', async () => {
    (prisma.loyaltySettings.findUnique as jest.Mock).mockResolvedValue({
      ...settings,
      noticeTextHash: 'not-the-hash',
    });

    const response = await quote(request({ tableId, sessionId }));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.code).toBe('LOYALTY_DISABLED');
    expect(issueQrQuote).not.toHaveBeenCalled();
  });

  it('returns 400 for an empty cart', async () => {
    (getTableCart as jest.Mock).mockResolvedValue({
      sessionId,
      items: [],
      totalItems: 0,
      totalAmount: 0,
    });

    const response = await quote(request({ tableId, sessionId }));
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.code).toBe('CART_EMPTY');
    expect(issueQrQuote).not.toHaveBeenCalled();
  });

  it('returns 400 for an invalid body', async () => {
    const response = await quote(request({ tableId: 'not-a-uuid' }));
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.code).toBe('INVALID_REQUEST');
  });
});
