import { prisma } from '@/lib/database';
import { hashNoticeText } from '@/lib/loyalty/consent';
import { hashPhone, maskPhone } from '@/lib/loyalty/phone';
import {
  OwnerIdempotencyMismatchError,
  stableRequestHash,
} from '@/lib/services/loyalty-owner-idempotency';
import {
  deleteMember,
  exportMarketingMembers,
  exportMember,
  getMember,
  marketingMembersToCsv,
  memberToCsv,
  MemberNotFoundError,
  MemberStateError,
  recordMarketingConsent,
  searchMembers,
  withdrawMemberConsent,
} from '@/lib/services/loyalty-member-service';

jest.mock('@/lib/database', () => ({ prisma: {} }));

const prismaMock = prisma as unknown as {
  customer: {
    findMany: jest.Mock;
    findFirst: jest.Mock;
  };
  auditLog: { create: jest.Mock };
  orderActionReceipt: { findUnique: jest.Mock; delete: jest.Mock };
  $transaction: jest.Mock;
};

const restaurantId = '550e8400-e29b-41d4-a716-446655440001';
const memberId = '11111111-1111-4111-8111-111111111111';
const e164 = '+60123456789';
const phone = '0123456789';

const memberRow = {
  id: memberId,
  name: 'Aina',
  phone: e164,
  phoneHash: 'hash-not-returned',
  status: 'ACTIVE' as const,
  consentAt: new Date('2026-11-01T00:00:00.000Z'),
  consentVersion: 'v1',
  consentSource: 'QR',
  consentWithdrawnAt: null,
  marketingOptIn: true,
  marketingConsentAt: new Date('2026-11-02T00:00:00.000Z'),
  marketingConsentVersion: 'v1',
  marketingConsentSource: 'COUNTER',
  marketingWithdrawnAt: null,
  anonymizedAt: null,
  lastVisitAt: null,
  createdAt: new Date('2026-11-01T00:00:00.000Z'),
  updatedAt: new Date('2026-11-02T00:00:00.000Z'),
  loyaltyCard: { visitsInCycle: 1, visitsRequired: 3, cycleNumber: 1 },
};

const noticeSettings = {
  noticeVersion: 'v1',
  noticeText: 'Join the rewards programme',
  noticeTextHash: hashNoticeText('Join the rewards programme'),
  privacyUrl: 'https://example.test/privacy',
  termsText: null,
};

function makeTx() {
  return {
    orderActionReceipt: {
      create: jest.fn().mockResolvedValue({}),
      update: jest.fn().mockResolvedValue({}),
    },
    customer: {
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    order: {
      findMany: jest.fn().mockResolvedValue([]),
      updateMany: jest.fn().mockResolvedValue({ count: 2 }),
    },
    orderEvent: {
      findMany: jest.fn().mockResolvedValue([]),
      update: jest.fn().mockResolvedValue({}),
    },
    customerSession: {
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    loyaltySettings: { findUnique: jest.fn() },
    auditLog: { create: jest.fn().mockResolvedValue({}) },
  };
}

describe('loyalty member service', () => {
  let tx: ReturnType<typeof makeTx>;
  let originalKey: string | undefined;

  beforeAll(() => {
    originalKey = process.env.LOYALTY_PHONE_HMAC_KEY;
    process.env.LOYALTY_PHONE_HMAC_KEY = 'test-loyalty-phone-key';
  });

  afterAll(() => {
    if (originalKey === undefined) {
      delete process.env.LOYALTY_PHONE_HMAC_KEY;
    } else {
      process.env.LOYALTY_PHONE_HMAC_KEY = originalKey;
    }
  });

  beforeEach(() => {
    jest.clearAllMocks();
    tx = makeTx();

    prismaMock.customer = {
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn().mockResolvedValue(null),
    };
    prismaMock.auditLog = { create: jest.fn().mockResolvedValue({}) };
    prismaMock.orderActionReceipt = {
      findUnique: jest.fn().mockResolvedValue(null),
      delete: jest.fn().mockResolvedValue({}),
    };
    prismaMock.$transaction = jest.fn(
      async (callback: (client: unknown) => unknown) => callback(tx)
    );
  });

  it('searches by exact phoneHash only, caps at 50 and audits the search', async () => {
    const expectedHash = hashPhone(e164);
    prismaMock.customer.findMany.mockImplementation(
      ({ where }: { where: { phoneHash: string } }) =>
        Promise.resolve(where.phoneHash === expectedHash ? [memberRow] : [])
    );

    const result = await searchMembers({
      restaurantId,
      actorId: 'user-1',
      actorType: 'restaurant_owner',
      phone,
      purpose: 'Counter lookup',
      revealPhone: false,
    });

    const call = prismaMock.customer.findMany.mock.calls[0][0];
    expect(call.where).toEqual({
      restaurantId,
      phoneHash: expectedHash,
      status: 'ACTIVE',
    });
    expect(call.take).toBe(50);
    expect(JSON.stringify(call.where)).not.toContain('contains');
    expect(JSON.stringify(call.where)).not.toContain('startsWith');
    expect(result.members).toHaveLength(1);

    // A different phone never matches the first member: no partial/prefix match.
    const other = await searchMembers({
      restaurantId,
      actorId: 'user-1',
      phone: '0199999999',
      purpose: 'Counter lookup',
      revealPhone: false,
    });
    expect(other.members).toHaveLength(0);

    expect(prismaMock.auditLog.create).toHaveBeenCalledTimes(2);
    expect(prismaMock.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        recordId: expectedHash,
        changedBy: 'user-1',
        category: 'members',
        metadata: expect.objectContaining({
          purpose: 'Counter lookup',
          phoneHash: expectedHash,
          resultCount: 1,
          pii: false,
          exactMatch: true,
        }),
      }),
    });
  });

  it('returns only a masked phone without members:pii', async () => {
    prismaMock.customer.findMany.mockResolvedValue([memberRow]);

    const result = await searchMembers({
      restaurantId,
      actorId: 'user-1',
      phone,
      purpose: 'Counter lookup',
      revealPhone: false,
    });

    expect(result.members[0].phone).toBeNull();
    expect(result.members[0].maskedPhone).toBe(maskPhone(e164));
    expect(JSON.stringify(result.members[0])).not.toContain(e164);
  });

  it('returns the full phone with members:pii and audits the full-phone read', async () => {
    prismaMock.customer.findMany.mockResolvedValue([memberRow]);

    const result = await searchMembers({
      restaurantId,
      actorId: 'user-1',
      phone,
      purpose: 'Owner review',
      revealPhone: true,
    });

    expect(result.members[0].phone).toBe(e164);
    expect(result.members[0].maskedPhone).toBe(maskPhone(e164));
    expect(prismaMock.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        changedBy: 'user-1',
        metadata: expect.objectContaining({
          purpose: 'Owner review',
          pii: true,
        }),
      }),
    });
  });

  it('rejects an invalid phone and audits the attempt without PII', async () => {
    await expect(
      searchMembers({
        restaurantId,
        actorId: 'user-1',
        phone: '123',
        purpose: 'Counter lookup',
        revealPhone: false,
      })
    ).rejects.toMatchObject({ code: 'PHONE_INVALID' });

    expect(prismaMock.customer.findMany).not.toHaveBeenCalled();
    expect(prismaMock.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        changedBy: 'user-1',
        metadata: expect.objectContaining({
          outcome: 'PHONE_INVALID',
          resultCount: 0,
        }),
      }),
    });
  });

  it('requires a non-empty search purpose', async () => {
    await expect(
      searchMembers({
        restaurantId,
        actorId: 'user-1',
        phone,
        purpose: '   ',
        revealPhone: false,
      })
    ).rejects.toMatchObject({ code: 'INVALID_REQUEST' });

    expect(prismaMock.customer.findMany).not.toHaveBeenCalled();
    expect(prismaMock.auditLog.create).not.toHaveBeenCalled();
  });

  it('scopes the profile lookup by restaurantId and returns 404 for a cross-tenant id', async () => {
    prismaMock.customer.findFirst.mockResolvedValue(null);

    await expect(
      getMember({
        restaurantId,
        actorId: 'user-1',
        memberId,
        revealPhone: false,
      })
    ).rejects.toBeInstanceOf(MemberNotFoundError);

    expect(prismaMock.customer.findFirst).toHaveBeenCalledWith({
      where: { id: memberId, restaurantId },
      include: { loyaltyCard: true },
    });
  });

  it('audits a profile read only when the full phone is revealed', async () => {
    prismaMock.customer.findFirst.mockResolvedValue(memberRow);

    const masked = await getMember({
      restaurantId,
      actorId: 'user-1',
      memberId,
      revealPhone: false,
    });
    expect(masked.member.phone).toBeNull();
    expect(prismaMock.auditLog.create).not.toHaveBeenCalled();

    const full = await getMember({
      restaurantId,
      actorId: 'user-1',
      memberId,
      purpose: 'Support call',
      revealPhone: true,
    });
    expect(full.member.phone).toBe(e164);
    expect(prismaMock.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tableName: 'customers',
        recordId: memberId,
        changedBy: 'user-1',
        operation: 'READ',
        metadata: expect.objectContaining({
          purpose: 'Support call',
          pii: true,
        }),
      }),
    });
  });

  it('exports only marketing-opted-in members and audits the export', async () => {
    prismaMock.customer.findMany.mockResolvedValue([
      {
        id: memberId,
        name: 'Aina',
        phone: e164,
        marketingConsentAt: new Date('2026-11-02T00:00:00.000Z'),
        marketingConsentVersion: 'v1',
      },
    ]);

    const result = await exportMarketingMembers({
      restaurantId,
      actorId: 'user-1',
      purpose: 'November campaign',
      revealPhone: true,
    });

    expect(prismaMock.customer.findMany).toHaveBeenCalledWith({
      where: {
        restaurantId,
        status: 'ACTIVE',
        marketingOptIn: true,
      },
      orderBy: { marketingConsentAt: 'desc' },
      select: {
        id: true,
        name: true,
        phone: true,
        marketingConsentAt: true,
        marketingConsentVersion: true,
      },
    });
    expect(result.count).toBe(1);
    expect(marketingMembersToCsv(result.rows)).toContain(e164);
    expect(prismaMock.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        recordId: 'marketing-opt-in-list',
        operation: 'EXPORT',
        changedBy: 'user-1',
        metadata: expect.objectContaining({
          target: 'marketing-opt-in-list',
          purpose: 'November campaign',
          count: 1,
          scope: 'MARKETING_OPT_IN',
          pii: true,
        }),
      }),
    });
  });

  it('exports one member as a subject-access export and audits the target id', async () => {
    prismaMock.customer.findFirst.mockResolvedValue(memberRow);

    const result = await exportMember({
      restaurantId,
      actorId: 'user-1',
      memberId,
      purpose: 'Subject access request',
      revealPhone: false,
    });

    expect(prismaMock.customer.findFirst).toHaveBeenCalledWith({
      where: { id: memberId, restaurantId },
      include: { loyaltyCard: true },
    });
    expect(result.member.id).toBe(memberId);
    expect(result.member.phone).toBeNull();
    expect(memberToCsv(result.member)).toContain(memberId);
    expect(memberToCsv(result.member)).toContain(maskPhone(e164));
    expect(memberToCsv(result.member)).not.toContain(e164);
    expect(prismaMock.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        recordId: memberId,
        operation: 'EXPORT',
        changedBy: 'user-1',
        metadata: expect.objectContaining({
          targetType: 'MEMBER',
          target: memberId,
          purpose: 'Subject access request',
          pii: false,
        }),
      }),
    });
  });

  it('returns 404 for a cross-tenant subject-access export', async () => {
    prismaMock.customer.findFirst.mockResolvedValue(null);

    await expect(
      exportMember({
        restaurantId,
        actorId: 'user-1',
        memberId,
        revealPhone: false,
      })
    ).rejects.toBeInstanceOf(MemberNotFoundError);
  });

  it('masks phones in an export when the caller lacks members:pii', async () => {
    prismaMock.customer.findMany.mockResolvedValue([
      {
        id: memberId,
        name: 'Aina',
        phone: e164,
        marketingConsentAt: null,
        marketingConsentVersion: 'v1',
      },
    ]);

    const result = await exportMarketingMembers({
      restaurantId,
      actorId: 'user-1',
      revealPhone: false,
    });

    const csv = marketingMembersToCsv(result.rows);
    expect(csv).toContain(maskPhone(e164));
    expect(csv).not.toContain(e164);
  });

  it('withdraws LOYALTY consent, clears marketing and sets consentWithdrawnAt', async () => {
    tx.customer.findFirst.mockResolvedValue(memberRow);
    tx.customer.update.mockImplementation(
      ({ data }: { data: Record<string, unknown> }) => ({
        ...memberRow,
        ...data,
      })
    );

    const result = await withdrawMemberConsent({
      restaurantId,
      actorId: 'user-1',
      actorType: 'restaurant_owner',
      memberId,
      scope: 'LOYALTY',
      revealPhone: false,
      idempotencyKey: 'withdraw-1',
    });

    const data = tx.customer.update.mock.calls[0][0].data;
    expect(data.consentWithdrawnAt).toBeInstanceOf(Date);
    expect(data.marketingOptIn).toBe(false);
    expect(data.marketingWithdrawnAt).toBeInstanceOf(Date);
    expect(data.marketingConsentAt).toBeNull();
    expect(data.marketingConsentVersion).toBeNull();
    expect(data.marketingConsentTextHash).toBeNull();
    expect(data.marketingConsentSource).toBeNull();

    expect(result.member.consentWithdrawnAt).not.toBeNull();
    expect(result.member.marketingOptIn).toBe(false);
    expect(tx.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        changedBy: 'user-1',
        description: 'Loyalty consent withdrawn',
        metadata: { scope: 'LOYALTY' },
      }),
    });
  });

  it('masks the phone in the stored idempotency receipt while returning the live PII view', async () => {
    tx.customer.findFirst.mockResolvedValue(memberRow);
    tx.customer.update.mockImplementation(
      ({ data }: { data: Record<string, unknown> }) => ({
        ...memberRow,
        ...data,
      })
    );

    const result = await withdrawMemberConsent({
      restaurantId,
      actorId: 'user-1',
      memberId,
      scope: 'LOYALTY',
      revealPhone: true,
      idempotencyKey: 'receipt-key',
    });

    expect(result.member.phone).toBe(e164);
    expect(result.member.name).toBe('Aina');
    const receiptCall = tx.orderActionReceipt.update.mock.calls[0][0];
    const envelope = receiptCall.data.response;
    expect(envelope.body.member.phone).toBeNull();
    expect(envelope.body.member.maskedPhone).toBeNull();
    expect(envelope.body.member.name).toBeNull();
    expect(envelope.requestHash).toBe(
      stableRequestHash({
        restaurantId,
        memberId,
        scope: 'LOYALTY',
        actorId: 'user-1',
        revealPhone: true,
      })
    );
  });

  it('rejects a replay with a different actor or reveal flag', async () => {
    const existingHash = stableRequestHash({
      restaurantId,
      memberId,
      scope: 'LOYALTY',
      actorId: 'user-1',
      revealPhone: false,
    });
    prismaMock.orderActionReceipt.findUnique.mockResolvedValue({
      id: 'receipt-1',
      createdAt: new Date(),
      response: {
        requestHash: existingHash,
        statusCode: 200,
        body: { member: { ...memberRow, phone: null }, scope: 'LOYALTY' },
      },
    });

    await expect(
      withdrawMemberConsent({
        restaurantId,
        actorId: 'user-2',
        memberId,
        scope: 'LOYALTY',
        revealPhone: false,
        idempotencyKey: 'same-key',
      })
    ).rejects.toBeInstanceOf(OwnerIdempotencyMismatchError);

    await expect(
      withdrawMemberConsent({
        restaurantId,
        actorId: 'user-1',
        memberId,
        scope: 'LOYALTY',
        revealPhone: true,
        idempotencyKey: 'same-key',
      })
    ).rejects.toBeInstanceOf(OwnerIdempotencyMismatchError);
  });

  it('withdraws MARKETING consent only and leaves the loyalty account intact', async () => {
    tx.customer.findFirst.mockResolvedValue(memberRow);
    tx.customer.update.mockImplementation(
      ({ data }: { data: Record<string, unknown> }) => ({
        ...memberRow,
        ...data,
      })
    );

    const result = await withdrawMemberConsent({
      restaurantId,
      actorId: 'user-1',
      memberId,
      scope: 'MARKETING',
      revealPhone: false,
      idempotencyKey: 'withdraw-2',
    });

    const data = tx.customer.update.mock.calls[0][0].data;
    expect(data).not.toHaveProperty('consentWithdrawnAt');
    expect(data.marketingOptIn).toBe(false);
    expect(result.member.consentWithdrawnAt).toBeNull();
    expect(result.member.marketingOptIn).toBe(false);
  });

  it('forbids marketing consent for an anonymised member', async () => {
    tx.customer.findFirst.mockResolvedValue({
      ...memberRow,
      status: 'ANONYMIZED',
      phone: null,
      name: null,
    });

    await expect(
      recordMarketingConsent({
        restaurantId,
        actorId: 'user-1',
        memberId,
        revealPhone: false,
        idempotencyKey: 'marketing-1',
      })
    ).rejects.toMatchObject({ code: 'MEMBER_ANONYMIZED' });

    expect(tx.customer.update).not.toHaveBeenCalled();
  });

  it('forbids marketing consent after loyalty consent was withdrawn', async () => {
    tx.customer.findFirst.mockResolvedValue({
      ...memberRow,
      consentWithdrawnAt: new Date('2026-11-03T00:00:00.000Z'),
    });

    await expect(
      recordMarketingConsent({
        restaurantId,
        actorId: 'user-1',
        memberId,
        revealPhone: false,
        idempotencyKey: 'marketing-2',
      })
    ).rejects.toMatchObject({ code: 'CONSENT_WITHDRAWN' });

    expect(tx.customer.update).not.toHaveBeenCalled();
  });

  it('records marketing consent with server-derived notice fields and an actor', async () => {
    tx.customer.findFirst.mockResolvedValue(memberRow);
    tx.loyaltySettings.findUnique.mockResolvedValue(noticeSettings);
    tx.customer.update.mockImplementation(
      ({ data }: { data: Record<string, unknown> }) => ({
        ...memberRow,
        ...data,
      })
    );

    const result = await recordMarketingConsent({
      restaurantId,
      actorId: 'user-1',
      actorType: 'restaurant_owner',
      memberId,
      purpose: 'Campaign opt-in',
      revealPhone: false,
      idempotencyKey: 'marketing-3',
    });

    const data = tx.customer.update.mock.calls[0][0].data;
    expect(data).toMatchObject({
      marketingOptIn: true,
      marketingConsentVersion: 'v1',
      marketingConsentTextHash: noticeSettings.noticeTextHash,
      marketingConsentSource: 'OWNER',
      marketingWithdrawnAt: null,
    });
    expect(data.marketingConsentAt).toBeInstanceOf(Date);
    expect(result.noticeVersion).toBe('v1');
    expect(tx.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        changedBy: 'user-1',
        description: 'Marketing consent recorded',
        metadata: expect.objectContaining({
          purpose: 'Campaign opt-in',
          noticeVersion: 'v1',
          source: 'OWNER',
        }),
      }),
    });
  });

  it('anonymises the member, nulls order and session PII, keeps phoneHash and financial rows', async () => {
    tx.customer.findFirst.mockResolvedValue(memberRow);
    tx.customer.update.mockImplementation(
      ({ data }: { data: Record<string, unknown> }) => ({
        ...memberRow,
        ...data,
      })
    );
    tx.order.findMany.mockResolvedValue([
      { id: 'order-1', customerSessionId: 'session-1' },
      { id: 'order-2', customerSessionId: 'session-1' },
      { id: 'order-3', customerSessionId: null },
    ]);

    const result = await deleteMember({
      restaurantId,
      actorId: 'user-1',
      actorType: 'restaurant_owner',
      memberId,
      idempotencyKey: 'delete-1',
    });

    const orderLookup = tx.order.findMany.mock.calls[0][0];
    expect(orderLookup.where).toMatchObject({
      restaurantId,
      OR: [
        { customerId: memberId },
        { diningSession: { is: { customerId: memberId } } },
      ],
    });
    expect(orderLookup.select).toEqual({
      id: true,
      customerSessionId: true,
    });

    const sessionCall = tx.customerSession.updateMany.mock.calls[0][0];
    expect(sessionCall.where).toEqual({
      table: { restaurantId },
      OR: [{ id: { in: ['session-1'] } }, { customerPhone: e164 }],
    });
    expect(sessionCall.data).toEqual({
      customerName: null,
      customerPhone: null,
      customerEmail: null,
    });

    const orderCall = tx.order.updateMany.mock.calls[0][0];
    expect(orderCall.where).toMatchObject({
      restaurantId,
      OR: [
        { customerId: memberId },
        { diningSession: { is: { customerId: memberId } } },
      ],
    });
    expect(orderCall.data).toEqual({
      customerName: null,
      customerPhone: null,
    });

    const customerData = tx.customer.update.mock.calls[0][0].data;
    expect(customerData).toMatchObject({
      status: 'ANONYMIZED',
      phone: null,
      name: null,
    });
    expect(customerData).not.toHaveProperty('phoneHash');
    expect(result.ordersAnonymised).toBe(2);
    expect(result.member.status).toBe('ANONYMIZED');
    expect(tx.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        operation: 'DELETE',
        changedBy: 'user-1',
        metadata: {
          ordersAnonymised: 2,
          customerSessionsAnonymised: 1,
          orderEventsAnonymised: 0,
        },
      }),
    });
  });

  it('nulls an unlinked customer session by the member E.164 phone', async () => {
    tx.customer.findFirst.mockResolvedValue(memberRow);
    tx.customer.update.mockImplementation(
      ({ data }: { data: Record<string, unknown> }) => ({
        ...memberRow,
        ...data,
      })
    );
    // No order points at the session: this is the guest-order-with-existing-
    // member case that the order join misses.
    tx.order.findMany.mockResolvedValue([]);
    tx.customerSession.updateMany.mockResolvedValue({ count: 1 });

    await deleteMember({
      restaurantId,
      actorId: 'user-1',
      memberId,
      idempotencyKey: 'delete-unlinked-session',
    });

    const sessionCall = tx.customerSession.updateMany.mock.calls[0][0];
    expect(sessionCall.where).toEqual({
      table: { restaurantId },
      OR: [{ customerPhone: e164 }],
    });
    expect(sessionCall.data).toEqual({
      customerName: null,
      customerPhone: null,
      customerEmail: null,
    });
    expect(tx.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        operation: 'DELETE',
        metadata: expect.objectContaining({ customerSessionsAnonymised: 1 }),
      }),
    });
  });

  it('nulls customerName in the member order event payloads', async () => {
    tx.customer.findFirst.mockResolvedValue(memberRow);
    tx.customer.update.mockImplementation(
      ({ data }: { data: Record<string, unknown> }) => ({
        ...memberRow,
        ...data,
      })
    );
    tx.order.findMany.mockResolvedValue([
      { id: 'order-1', customerSessionId: null },
    ]);
    tx.orderEvent.findMany.mockResolvedValue([
      {
        id: BigInt(1),
        payload: {
          orderNumber: 'ORD-1',
          customerName: 'Aina',
          customerPhone: '+60123456789',
          customerEmail: 'aina@example.test',
        },
      },
      {
        id: BigInt(2),
        payload: { orderNumber: 'ORD-1', customerName: null },
      },
    ]);

    await deleteMember({
      restaurantId,
      actorId: 'user-1',
      memberId,
      idempotencyKey: 'delete-order-events',
    });

    expect(tx.orderEvent.findMany).toHaveBeenCalledWith({
      where: { restaurantId, orderId: { in: ['order-1'] } },
      select: { id: true, payload: true },
    });
    expect(tx.orderEvent.update).toHaveBeenCalledTimes(1);
    expect(tx.orderEvent.update).toHaveBeenCalledWith({
      where: { id: BigInt(1) },
      data: {
        payload: {
          orderNumber: 'ORD-1',
          customerName: null,
        },
      },
    });
    expect(tx.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        metadata: expect.objectContaining({ orderEventsAnonymised: 1 }),
      }),
    });
  });

  it('returns 404 for a cross-tenant consent withdrawal, marketing consent or delete', async () => {
    tx.customer.findFirst.mockResolvedValue(null);

    await expect(
      withdrawMemberConsent({
        restaurantId,
        actorId: 'user-1',
        memberId,
        scope: 'LOYALTY',
        revealPhone: false,
        idempotencyKey: 'cross-tenant-1',
      })
    ).rejects.toBeInstanceOf(MemberNotFoundError);

    await expect(
      recordMarketingConsent({
        restaurantId,
        actorId: 'user-1',
        memberId,
        revealPhone: false,
        idempotencyKey: 'cross-tenant-2',
      })
    ).rejects.toBeInstanceOf(MemberNotFoundError);

    await expect(
      deleteMember({
        restaurantId,
        actorId: 'user-1',
        memberId,
        idempotencyKey: 'cross-tenant-3',
      })
    ).rejects.toBeInstanceOf(MemberNotFoundError);

    expect(tx.customer.findFirst).toHaveBeenCalledWith({
      where: { id: memberId, restaurantId },
      include: { loyaltyCard: true },
    });
  });

  it('surfaces a state error for marketing consent when loyalty consent is missing', async () => {
    tx.customer.findFirst.mockResolvedValue({
      ...memberRow,
      consentAt: null,
    });

    await expect(
      recordMarketingConsent({
        restaurantId,
        actorId: 'user-1',
        memberId,
        revealPhone: false,
        idempotencyKey: 'marketing-4',
      })
    ).rejects.toBeInstanceOf(MemberStateError);
  });
});
