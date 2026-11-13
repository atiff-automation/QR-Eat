import { prisma } from '@/lib/database';
import { hashNoticeText, type LoyaltyNotice } from '@/lib/loyalty/consent';
import { hashPhone } from '@/lib/loyalty/phone';
import {
  anonymiseCustomer,
  resolveOrCreateCustomer,
} from '@/lib/services/loyalty-customer-service';

jest.mock('@/lib/database', () => ({
  prisma: {
    customer: {
      findFirst: jest.fn(),
      create: jest.fn(),
      updateMany: jest.fn(),
    },
  },
}));

const restaurantId = '550e8400-e29b-41d4-a716-446655440001';
const otherRestaurantId = '550e8400-e29b-41d4-a716-446655440099';
const phone = '0123456789';
const e164 = '+60123456789';
const hmacKey = 'test-loyalty-hmac-key';
const noticeText =
  'We store your mobile number and visit count to run the rewards programme.';

const notice: LoyaltyNotice = {
  version: 'v1',
  text: noticeText,
  textHash: hashNoticeText(noticeText),
  privacyUrl: 'https://example.test/privacy',
  termsText: null,
};

const validConsent = {
  clientVersion: notice.version,
  clientTextHash: notice.textHash,
};

function baseInput(overrides: Record<string, unknown> = {}) {
  return {
    restaurantId,
    phone,
    consent: validConsent,
    notice,
    name: 'Aisyah',
    source: 'QR',
    ...overrides,
  };
}

describe('loyalty customer service', () => {
  const originalKey = process.env.LOYALTY_PHONE_HMAC_KEY;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.LOYALTY_PHONE_HMAC_KEY = hmacKey;
  });

  afterAll(() => {
    if (originalKey === undefined) {
      delete process.env.LOYALTY_PHONE_HMAC_KEY;
    } else {
      process.env.LOYALTY_PHONE_HMAC_KEY = originalKey;
    }
  });

  it('creates a customer with the server-derived consent on first use', async () => {
    const expectedHash = hashPhone(e164, hmacKey);
    (prisma.customer.findFirst as jest.Mock).mockResolvedValue(null);
    (prisma.customer.create as jest.Mock).mockResolvedValue({ id: 'cust-1' });

    const result = await resolveOrCreateCustomer(baseInput());

    expect(result).toEqual({
      customerId: 'cust-1',
      isNew: true,
      consentOk: true,
      loyaltyError: null,
    });
    expect(prisma.customer.findFirst).toHaveBeenCalledWith({
      where: { restaurantId, phoneHash: expectedHash, status: 'ACTIVE' },
    });
    expect(prisma.customer.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        restaurantId,
        phone: e164,
        phoneHash: expectedHash,
        name: 'Aisyah',
        consentVersion: notice.version,
        consentTextHash: notice.textHash,
        consentSource: 'QR',
        consentWithdrawnAt: null,
        status: 'ACTIVE',
      }),
    });
  });

  it('stores the server-derived hash, never the client string', async () => {
    (prisma.customer.findFirst as jest.Mock).mockResolvedValue(null);
    (prisma.customer.create as jest.Mock).mockResolvedValue({ id: 'cust-1' });

    await resolveOrCreateCustomer(
      baseInput({
        consent: {
          clientVersion: notice.version,
          clientTextHash: notice.textHash.toUpperCase(),
        },
      })
    );

    const create = (prisma.customer.create as jest.Mock).mock.calls[0][0] as {
      data: Record<string, unknown>;
    };
    expect(create.data.consentTextHash).toBe(notice.textHash);
    expect(create.data.consentTextHash).not.toBe(notice.textHash.toUpperCase());
  });

  it('reuses the ACTIVE row for the same restaurant and phone hash', async () => {
    (prisma.customer.findFirst as jest.Mock).mockResolvedValue({
      id: 'cust-1',
    });
    (prisma.customer.updateMany as jest.Mock).mockResolvedValue({ count: 1 });

    const result = await resolveOrCreateCustomer(
      baseInput({ name: null, source: 'COUNTER' })
    );

    expect(result).toEqual({
      customerId: 'cust-1',
      isNew: false,
      consentOk: true,
      loyaltyError: null,
    });
    expect(prisma.customer.create).not.toHaveBeenCalled();
    expect(prisma.customer.updateMany).toHaveBeenCalledWith({
      where: { id: 'cust-1', restaurantId, status: 'ACTIVE' },
      data: expect.objectContaining({
        consentAt: expect.any(Date),
        consentVersion: notice.version,
        consentTextHash: notice.textHash,
        consentSource: 'COUNTER',
        consentWithdrawnAt: null,
      }),
    });
  });

  it('falls back to guest when a concurrent anonymise removes the ACTIVE row', async () => {
    (prisma.customer.findFirst as jest.Mock)
      .mockResolvedValueOnce({ id: 'cust-1' })
      .mockResolvedValueOnce({ id: 'cust-1', status: 'ANONYMIZED' });
    (prisma.customer.updateMany as jest.Mock).mockResolvedValue({ count: 0 });

    const result = await resolveOrCreateCustomer(baseInput());

    expect(result).toEqual({
      customerId: null,
      isNew: false,
      consentOk: false,
      loyaltyError: {
        code: 'LOYALTY_DISABLED',
        message: 'Loyalty is not available.',
      },
    });
    expect(prisma.customer.updateMany).toHaveBeenCalledWith({
      where: { id: 'cust-1', restaurantId, status: 'ACTIVE' },
      data: expect.objectContaining({
        consentVersion: notice.version,
        consentTextHash: notice.textHash,
      }),
    });
    expect(prisma.customer.create).not.toHaveBeenCalled();
  });

  it('keeps the existing name when the caller does not supply one', async () => {
    (prisma.customer.findFirst as jest.Mock).mockResolvedValue({
      id: 'cust-1',
    });
    (prisma.customer.updateMany as jest.Mock).mockResolvedValue({ count: 1 });

    await resolveOrCreateCustomer(baseInput({ name: null }));

    const update = (prisma.customer.updateMany as jest.Mock).mock
      .calls[0][0] as { data: Record<string, unknown> };
    expect(update.data).not.toHaveProperty('name');
  });

  it('creates a separate customer for the same phone at another restaurant', async () => {
    (prisma.customer.findFirst as jest.Mock).mockResolvedValue(null);
    (prisma.customer.create as jest.Mock).mockImplementation(
      async ({ data }: { data: { restaurantId: string } }) => ({
        id: `cust-${data.restaurantId}`,
      })
    );

    const first = await resolveOrCreateCustomer(baseInput());
    const second = await resolveOrCreateCustomer(
      baseInput({ restaurantId: otherRestaurantId })
    );

    expect(first.customerId).toBe(`cust-${restaurantId}`);
    expect(second.customerId).toBe(`cust-${otherRestaurantId}`);
    expect(prisma.customer.findFirst).toHaveBeenNthCalledWith(1, {
      where: {
        restaurantId,
        phoneHash: hashPhone(e164, hmacKey),
        status: 'ACTIVE',
      },
    });
    expect(prisma.customer.findFirst).toHaveBeenNthCalledWith(2, {
      where: {
        restaurantId: otherRestaurantId,
        phoneHash: hashPhone(e164, hmacKey),
        status: 'ACTIVE',
      },
    });
  });

  it('excludes an anonymised row from the ACTIVE lookup and re-enrols', async () => {
    (prisma.customer.findFirst as jest.Mock).mockImplementation(
      async ({ where }: { where: { status: string } }) =>
        where.status === 'ACTIVE' ? null : { id: 'anonymised-cust' }
    );
    (prisma.customer.create as jest.Mock).mockResolvedValue({ id: 'cust-new' });

    const result = await resolveOrCreateCustomer(baseInput());

    expect(result.isNew).toBe(true);
    expect(result.customerId).toBe('cust-new');
    expect(prisma.customer.findFirst).toHaveBeenCalledWith({
      where: {
        restaurantId,
        phoneHash: hashPhone(e164, hmacKey),
        status: 'ACTIVE',
      },
    });
    expect(prisma.customer.create).toHaveBeenCalled();
  });

  it('returns PHONE_INVALID for a missing or invalid phone without touching the database', async () => {
    const missing = await resolveOrCreateCustomer(baseInput({ phone: null }));
    const invalid = await resolveOrCreateCustomer(baseInput({ phone: 'abc' }));

    expect(missing).toMatchObject({
      customerId: null,
      consentOk: false,
      loyaltyError: { code: 'PHONE_INVALID' },
    });
    expect(invalid).toMatchObject({
      customerId: null,
      consentOk: false,
      loyaltyError: { code: 'PHONE_INVALID' },
    });
    expect(prisma.customer.findFirst).not.toHaveBeenCalled();
    expect(prisma.customer.create).not.toHaveBeenCalled();
  });

  it('returns LOYALTY_DISABLED when the notice is absent', async () => {
    const result = await resolveOrCreateCustomer(baseInput({ notice: null }));

    expect(result).toMatchObject({
      customerId: null,
      loyaltyError: { code: 'LOYALTY_DISABLED' },
    });
    expect(prisma.customer.findFirst).not.toHaveBeenCalled();
  });

  it('does not create a customer without valid consent', async () => {
    const missing = await resolveOrCreateCustomer(baseInput({ consent: null }));
    const stale = await resolveOrCreateCustomer(
      baseInput({
        consent: { clientVersion: 'v0', clientTextHash: notice.textHash },
      })
    );

    expect(missing).toMatchObject({
      customerId: null,
      loyaltyError: { code: 'CONSENT_REQUIRED' },
    });
    expect(stale).toMatchObject({
      customerId: null,
      loyaltyError: { code: 'CONSENT_STALE' },
    });
    expect(prisma.customer.findFirst).not.toHaveBeenCalled();
    expect(prisma.customer.create).not.toHaveBeenCalled();
  });

  it('fails closed when the HMAC key is missing', async () => {
    delete process.env.LOYALTY_PHONE_HMAC_KEY;

    const result = await resolveOrCreateCustomer(baseInput());

    expect(result).toMatchObject({
      customerId: null,
      loyaltyError: { code: 'LOYALTY_DISABLED' },
    });
    expect(prisma.customer.findFirst).not.toHaveBeenCalled();
  });

  it('never puts the full phone in a loyalty error', async () => {
    const result = await resolveOrCreateCustomer(baseInput({ phone: 'abc' }));

    expect(JSON.stringify(result)).not.toContain('60123456789');
    expect(JSON.stringify(result)).not.toContain(e164);
  });

  describe('anonymiseCustomer', () => {
    it('keeps phoneHash and nulls phone and name', async () => {
      (prisma.customer.updateMany as jest.Mock).mockResolvedValue({ count: 1 });

      const result = await anonymiseCustomer({
        restaurantId,
        customerId: 'cust-1',
      });

      expect(result).toEqual({ anonymised: true });
      expect(prisma.customer.updateMany).toHaveBeenCalledWith({
        where: { id: 'cust-1', restaurantId },
        data: {
          status: 'ANONYMIZED',
          anonymizedAt: expect.any(Date),
          phone: null,
          name: null,
        },
      });

      const update = (prisma.customer.updateMany as jest.Mock).mock
        .calls[0][0] as { data: Record<string, unknown> };
      expect(update.data).not.toHaveProperty('phoneHash');
    });

    it('is tenant-scoped and reports a cross-tenant miss', async () => {
      (prisma.customer.updateMany as jest.Mock).mockResolvedValue({ count: 0 });

      const result = await anonymiseCustomer({
        restaurantId: otherRestaurantId,
        customerId: 'cust-1',
      });

      expect(result).toEqual({ anonymised: false });
      expect(prisma.customer.updateMany).toHaveBeenCalledWith({
        where: { id: 'cust-1', restaurantId: otherRestaurantId },
        data: expect.objectContaining({ status: 'ANONYMIZED' }),
      });
    });
  });
});
