import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/database';
import { resolveOrCreateCustomer } from '@/lib/services/loyalty-customer-service';
import {
  changeMember,
  removeMember,
} from '@/lib/services/loyalty-bill-service';
import { hashNoticeText } from '@/lib/loyalty/consent';

jest.mock('@/lib/database', () => ({
  prisma: {
    loyaltySettings: { findUnique: jest.fn() },
    promotion: { findMany: jest.fn() },
    restaurant: { findUnique: jest.fn() },
    customer: { findFirst: jest.fn(), updateMany: jest.fn() },
    loyaltyCard: { findUnique: jest.fn() },
    loyaltyVisit: { findFirst: jest.fn() },
    paymentBatch: { findMany: jest.fn() },
    idempotencyRecord: { findFirst: jest.fn(), deleteMany: jest.fn() },
    table: { findFirst: jest.fn() },
    diningSession: { findFirst: jest.fn(), update: jest.fn() },
    order: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      updateMany: jest.fn(),
      update: jest.fn(),
    },
    $transaction: jest.fn(),
  },
}));

jest.mock('@/lib/services/loyalty-customer-service', () => ({
  resolveOrCreateCustomer: jest.fn(),
}));

const restaurantId = '550e8400-e29b-41d4-a716-446655440001';
const tableId = '550e8400-e29b-41d4-a716-446655440002';
const sessionId = '550e8400-e29b-41d4-a716-446655440003';
const customerId = '550e8400-e29b-41d4-a716-446655440004';
const orderId = '550e8400-e29b-41d4-a716-446655440005';
const now = new Date('2026-11-13T10:00:00.000Z');

const noticeText = 'Rewards notice text';

const settingsRow = {
  enabled: true,
  visitsRequired: 3,
  rewardType: 'PERCENT',
  rewardValue: new Prisma.Decimal('10.00'),
  maxDiscount: new Prisma.Decimal('15.00'),
  minDailySpend: new Prisma.Decimal('20.00'),
  rewardLabel: '10% off, max RM15',
  noticeVersion: 'v1',
  noticeText,
  noticeTextHash: hashNoticeText(noticeText),
  privacyUrl: 'https://example.test/privacy',
  termsText: null,
};

const customerRow = {
  id: customerId,
  name: 'Aina',
  phone: '+60123456789',
  consentAt: new Date('2026-11-01T00:00:00.000Z'),
  consentWithdrawnAt: null,
  status: 'ACTIVE',
};

const restaurantRow = {
  cashRounding: 'NONE',
  timezone: 'Asia/Kuala_Lumpur',
  businessDayCloseTime: '04:00',
};

function orderRow(overrides: Record<string, unknown> = {}) {
  return {
    id: orderId,
    subtotalAmount: new Prisma.Decimal('60.00'),
    taxRateSnapshot: new Prisma.Decimal('0.06'),
    serviceChargeRateSnapshot: new Prisma.Decimal('0.10'),
    paymentStatus: 'PENDING',
    status: 'CONFIRMED',
    discountVersion: 3,
    customerId: null,
    diningSessionId: null,
    items: [
      {
        menuItemId: 'item-1',
        totalAmount: new Prisma.Decimal('60.00'),
        menuItem: { name: 'Pasta', categoryId: 'cat-1' },
      },
    ],
    ...overrides,
  };
}

const tx = {
  $queryRaw: jest.fn(),
  table: { findFirst: jest.fn() },
  diningSession: { findFirst: jest.fn(), update: jest.fn() },
  order: {
    findFirst: jest.fn(),
    findMany: jest.fn(),
    updateMany: jest.fn(),
    update: jest.fn(),
  },
  orderDiscount: { findMany: jest.fn() },
  idempotencyRecord: { create: jest.fn(), update: jest.fn() },
  loyaltySettings: { findUnique: jest.fn() },
  promotion: { findMany: jest.fn() },
  restaurant: { findUnique: jest.fn() },
  customer: { findFirst: jest.fn() },
  loyaltyCard: { findUnique: jest.fn() },
  loyaltyVisit: { findFirst: jest.fn() },
  paymentBatch: { findMany: jest.fn() },
  auditLog: { create: jest.fn() },
};

function baseTableInput(overrides: Record<string, unknown> = {}) {
  return {
    restaurantId,
    target: { kind: 'table' as const, tableId },
    userId: 'user-1',
    phone: '+60123456789',
    expectedBillRevision: 7,
    idempotencyKey: 'member-key-1',
    now,
    ...overrides,
  };
}

describe('Counter member attach/change', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.LOYALTY_ENABLED = 'true';
    process.env.LOYALTY_PHONE_HMAC_KEY = 'test-key';

    (prisma.$transaction as jest.Mock).mockImplementation(
      async (fn: (client: typeof tx) => unknown) => fn(tx)
    );
    (prisma.loyaltySettings.findUnique as jest.Mock).mockResolvedValue(
      settingsRow
    );
    (prisma.promotion.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.restaurant.findUnique as jest.Mock).mockResolvedValue(
      restaurantRow
    );
    (prisma.table.findFirst as jest.Mock).mockResolvedValue({ id: tableId });
    (prisma.diningSession.findFirst as jest.Mock).mockResolvedValue({
      id: sessionId,
      billRevision: 7,
      customerId: null,
    });
    (prisma.order.findMany as jest.Mock).mockResolvedValue([orderRow()]);
    (prisma.idempotencyRecord.findFirst as jest.Mock).mockResolvedValue(null);
    (prisma.customer.findFirst as jest.Mock).mockResolvedValue(customerRow);
    (prisma.customer.updateMany as jest.Mock).mockResolvedValue({ count: 1 });

    tx.$queryRaw.mockResolvedValue([{ lock: '' }]);
    tx.table.findFirst.mockResolvedValue({ id: tableId });
    tx.diningSession.findFirst.mockResolvedValue({
      id: sessionId,
      billRevision: 7,
      customerId: null,
    });
    tx.order.findMany.mockResolvedValue([orderRow()]);
    tx.orderDiscount.findMany.mockResolvedValue([]);
    tx.loyaltySettings.findUnique.mockResolvedValue(settingsRow);
    tx.promotion.findMany.mockResolvedValue([]);
    tx.restaurant.findUnique.mockResolvedValue(restaurantRow);
    tx.customer.findFirst.mockResolvedValue(customerRow);
    tx.loyaltyCard.findUnique.mockResolvedValue(null);
    tx.loyaltyVisit.findFirst.mockResolvedValue(null);
    tx.paymentBatch.findMany.mockResolvedValue([]);
    tx.idempotencyRecord.create.mockResolvedValue({});
    tx.idempotencyRecord.update.mockResolvedValue({});
    tx.diningSession.update.mockResolvedValue({});
    tx.order.updateMany.mockResolvedValue({ count: 1 });
    tx.order.update.mockResolvedValue({});
    tx.auditLog.create.mockResolvedValue({});
  });

  afterAll(() => {
    delete process.env.LOYALTY_ENABLED;
    delete process.env.LOYALTY_PHONE_HMAC_KEY;
  });

  it('links an existing ACTIVE consented customer and bumps the bill revision', async () => {
    const result = await changeMember(baseTableInput());

    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({
      success: true,
      billRevision: 8,
      member: {
        id: customerId,
        name: 'Aina',
        maskedPhone: '+60•••••••89',
        completedVisits: 0,
        visitsRequired: 3,
      },
      visitState: 'COUNTS',
    });
    expect(JSON.stringify(result.body)).not.toContain('+60123456789');
    expect(resolveOrCreateCustomer).not.toHaveBeenCalled();
    expect(tx.diningSession.update).toHaveBeenCalledWith({
      where: {
        restaurantId_id: { restaurantId, id: sessionId },
      },
      data: { customerId, billRevision: 8 },
    });
    expect(tx.order.updateMany).toHaveBeenCalledWith({
      where: {
        restaurantId,
        diningSessionId: sessionId,
        paymentStatus: 'PENDING',
        status: { not: 'CANCELLED' },
      },
      data: { customerId },
    });
    expect(tx.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tableName: 'dining_sessions',
        recordId: sessionId,
        operation: 'UPDATE',
        oldValues: { customerId: null },
        newValues: { customerId, billRevision: 8 },
        changedBy: 'user-1',
        restaurantId,
      }),
    });
    expect(tx.idempotencyRecord.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        restaurantId,
        scope: 'MEMBER_CHANGE',
        key: 'member-key-1',
        status: 'IN_PROGRESS',
      }),
    });

    const persisted = (tx.idempotencyRecord.update as jest.Mock).mock
      .calls[0][0].data.responseJson as {
      member: { name: string | null; maskedPhone: string | null };
    };
    expect(persisted.member.name).toBeNull();
    expect(persisted.member.maskedPhone).toBeNull();
    expect(
      (result.body as { member: { name: string; maskedPhone: string } }).member
    ).toMatchObject({
      name: 'Aina',
      maskedPhone: '+60•••••••89',
    });
  });

  it('does not rename an existing customer on attach (R-01)', async () => {
    const result = await changeMember(
      baseTableInput({ name: 'Renamed Customer' })
    );

    expect(result.status).toBe(200);
    expect(prisma.customer.updateMany).not.toHaveBeenCalled();
    expect(result.body).toMatchObject({
      member: { id: customerId, name: 'Aina' },
    });
  });

  it('captures consent for a new member in the same call', async () => {
    (prisma.customer.findFirst as jest.Mock).mockResolvedValue(null);
    (resolveOrCreateCustomer as jest.Mock).mockResolvedValue({
      customerId,
      isNew: true,
      consentOk: true,
      loyaltyError: null,
    });

    const result = await changeMember(
      baseTableInput({
        consent: true,
        consentVersion: 'v1',
        consentTextHash: hashNoticeText(noticeText),
      })
    );

    expect(result.status).toBe(200);
    expect(resolveOrCreateCustomer).toHaveBeenCalledWith(
      expect.objectContaining({
        restaurantId,
        phone: '+60123456789',
        source: 'COUNTER',
      })
    );
    expect(tx.diningSession.update).toHaveBeenCalled();
  });

  it('returns CONSENT_REQUIRED for a new phone without consent', async () => {
    (prisma.customer.findFirst as jest.Mock).mockResolvedValue(null);

    const result = await changeMember(baseTableInput({ consent: false }));

    expect(result.status).toBe(422);
    expect(result.body).toMatchObject({
      success: false,
      code: 'CONSENT_REQUIRED',
    });
    expect(resolveOrCreateCustomer).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('returns CONSENT_STALE for a stale notice proof', async () => {
    (prisma.customer.findFirst as jest.Mock).mockResolvedValue(null);
    (resolveOrCreateCustomer as jest.Mock).mockResolvedValue({
      customerId: null,
      isNew: false,
      consentOk: false,
      loyaltyError: {
        code: 'CONSENT_STALE',
        message: 'The rewards notice changed. Review and agree again.',
      },
    });

    const result = await changeMember(
      baseTableInput({
        consent: true,
        consentVersion: 'v0',
        consentTextHash: 'stale-hash',
      })
    );

    expect(result.status).toBe(422);
    expect(result.body).toMatchObject({
      success: false,
      code: 'CONSENT_STALE',
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('returns BILL_CHANGED before writing on a revision mismatch', async () => {
    const result = await changeMember(
      baseTableInput({ expectedBillRevision: 6 })
    );

    expect(result.status).toBe(409);
    expect(result.body).toMatchObject({
      success: false,
      code: 'BILL_CHANGED',
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(tx.diningSession.update).not.toHaveBeenCalled();
  });

  it('returns BILL_PAID for a fully paid bill', async () => {
    (prisma.order.findMany as jest.Mock).mockResolvedValue([
      orderRow({ paymentStatus: 'PAID', status: 'SERVED' }),
    ]);

    const result = await changeMember(baseTableInput());

    expect(result.status).toBe(409);
    expect(result.body).toMatchObject({ success: false, code: 'BILL_PAID' });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('does not re-attribute paid orders when attaching a member to a partially paid session (F-01)', async () => {
    const paidOrder = orderRow({
      id: 'paid-order',
      subtotalAmount: new Prisma.Decimal('18.00'),
      paymentStatus: 'PAID',
      status: 'SERVED',
      customerId: null,
    });
    const pendingOrder = orderRow({
      id: 'pending-order',
      subtotalAmount: new Prisma.Decimal('5.00'),
      paymentStatus: 'PENDING',
      status: 'CONFIRMED',
      customerId: null,
    });

    (prisma.order.findMany as jest.Mock).mockResolvedValue([
      paidOrder,
      pendingOrder,
    ]);
    (tx.order.findMany as jest.Mock).mockResolvedValue([
      paidOrder,
      pendingOrder,
    ]);
    (tx.paymentBatch.findMany as jest.Mock).mockImplementation(async () => [
      { payments: [{ order: paidOrder }] },
    ]);
    (tx.order.updateMany as jest.Mock).mockImplementation(
      async ({
        where,
        data,
      }: {
        where: Record<string, unknown>;
        data: { customerId: string | null };
      }) => {
        const onlyUnpaid =
          where.paymentStatus === 'PENDING' &&
          (where.status as { not?: string } | undefined)?.not === 'CANCELLED';

        if (onlyUnpaid) {
          if (
            pendingOrder.paymentStatus === 'PENDING' &&
            pendingOrder.status !== 'CANCELLED'
          ) {
            (pendingOrder as Record<string, unknown>).customerId =
              data.customerId;
          }
        } else {
          // The pre-fix code re-attributed every order in the session.
          (paidOrder as Record<string, unknown>).customerId = data.customerId;
          (pendingOrder as Record<string, unknown>).customerId =
            data.customerId;
        }

        return { count: onlyUnpaid ? 1 : 2 };
      }
    );

    const result = await changeMember(baseTableInput());

    expect(tx.order.updateMany).toHaveBeenCalledWith({
      where: {
        restaurantId,
        diningSessionId: sessionId,
        paymentStatus: 'PENDING',
        status: { not: 'CANCELLED' },
      },
      data: { customerId },
    });
    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({
      visitState: 'BELOW_MINIMUM',
      daySubtotal: '5.00',
      amountToMinimum: '15.00',
    });
  });

  it('does not bump the revision when re-attaching the same member (R-07)', async () => {
    (prisma.diningSession.findFirst as jest.Mock).mockResolvedValue({
      id: sessionId,
      billRevision: 7,
      customerId,
    });
    (tx.diningSession.findFirst as jest.Mock).mockResolvedValue({
      id: sessionId,
      billRevision: 7,
      customerId,
    });

    const result = await changeMember(baseTableInput());

    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({
      billRevision: 7,
      member: { id: customerId },
    });
    expect(tx.diningSession.update).not.toHaveBeenCalled();
    expect(tx.order.updateMany).not.toHaveBeenCalled();
    expect(tx.auditLog.create).not.toHaveBeenCalled();
  });

  it('does not bump the revision when removing with no member attached (R-07)', async () => {
    (prisma.diningSession.findFirst as jest.Mock).mockResolvedValue({
      id: sessionId,
      billRevision: 7,
      customerId: null,
    });
    (tx.diningSession.findFirst as jest.Mock).mockResolvedValue({
      id: sessionId,
      billRevision: 7,
      customerId: null,
    });

    const result = await removeMember({
      restaurantId,
      target: { kind: 'table', tableId },
      userId: 'user-1',
      expectedBillRevision: 7,
      idempotencyKey: 'noop-remove-key',
      now,
    });

    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({
      billRevision: 7,
      member: null,
      visitState: 'GUEST',
    });
    expect(tx.diningSession.update).not.toHaveBeenCalled();
    expect(tx.order.updateMany).not.toHaveBeenCalled();
    expect(tx.auditLog.create).not.toHaveBeenCalled();
  });

  it('replays a completed MEMBER_CHANGE record without a second write', async () => {
    const first = await changeMember(baseTableInput());
    const requestHash = (tx.idempotencyRecord.create as jest.Mock).mock
      .calls[0][0].data.requestHash as string;
    const persisted = (tx.idempotencyRecord.update as jest.Mock).mock
      .calls[0][0].data.responseJson;

    (prisma.idempotencyRecord.findFirst as jest.Mock).mockResolvedValue({
      status: 'COMPLETED',
      requestHash,
      responseJson: persisted,
      createdAt: now,
      expiresAt: new Date(now.getTime() + 60_000),
    });

    const second = await changeMember(baseTableInput());

    expect(second.status).toBe(200);
    expect(second.replayed).toBe(true);
    expect(second.body).toEqual(persisted);
    expect(
      (second.body as { member: { name: string | null } }).member.name
    ).toBeNull();
    expect(
      (second.body as { member: { maskedPhone: string | null } }).member
        .maskedPhone
    ).toBeNull();
    expect((first.body as { member: { name: string } }).member.name).toBe(
      'Aina'
    );
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it('rejects a reused key with a different body', async () => {
    (prisma.idempotencyRecord.findFirst as jest.Mock).mockResolvedValue({
      status: 'COMPLETED',
      requestHash: 'different-hash',
      responseJson: { success: true },
      createdAt: now,
      expiresAt: new Date(now.getTime() + 60_000),
    });

    const result = await changeMember(baseTableInput());

    expect(result.status).toBe(409);
    expect(result.body).toMatchObject({
      success: false,
      code: 'IDEMPOTENCY_MISMATCH',
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('returns 404 for a cross-tenant table', async () => {
    (prisma.table.findFirst as jest.Mock).mockResolvedValue(null);

    const result = await changeMember(baseTableInput());

    expect(result.status).toBe(404);
    expect(result.body).toMatchObject({ success: false, code: 'NOT_FOUND' });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('returns LOYALTY_DISABLED when the global flag is off', async () => {
    delete process.env.LOYALTY_ENABLED;

    const result = await changeMember(baseTableInput());

    expect(result.status).toBe(409);
    expect(result.body).toMatchObject({
      success: false,
      code: 'LOYALTY_DISABLED',
    });
    expect(prisma.loyaltySettings.findUnique).not.toHaveBeenCalled();
  });

  it('removes the member and leaves the bill GUEST', async () => {
    (prisma.diningSession.findFirst as jest.Mock).mockResolvedValue({
      id: sessionId,
      billRevision: 7,
      customerId,
    });
    (tx.diningSession.findFirst as jest.Mock).mockResolvedValue({
      id: sessionId,
      billRevision: 7,
      customerId,
    });

    const result = await removeMember({
      restaurantId,
      target: { kind: 'table', tableId },
      userId: 'user-1',
      expectedBillRevision: 7,
      idempotencyKey: 'remove-key-1',
      now,
    });

    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({
      success: true,
      billRevision: 8,
      member: null,
      visitState: 'GUEST',
    });
    expect(tx.diningSession.update).toHaveBeenCalledWith({
      where: { restaurantId_id: { restaurantId, id: sessionId } },
      data: { customerId: null, billRevision: 8 },
    });
    expect(tx.order.updateMany).toHaveBeenCalledWith({
      where: {
        restaurantId,
        diningSessionId: sessionId,
        paymentStatus: 'PENDING',
        status: { not: 'CANCELLED' },
      },
      data: { customerId: null },
    });
    expect(tx.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tableName: 'dining_sessions',
        recordId: sessionId,
        oldValues: { customerId },
        newValues: { customerId: null, billRevision: 8 },
        changedBy: 'user-1',
      }),
    });
  });

  it.each([
    ['cancelled', { status: 'CANCELLED', paymentStatus: 'PENDING' }],
    ['refunded', { status: 'SERVED', paymentStatus: 'REFUNDED' }],
  ])(
    'rejects a %s takeaway order as settled (R-03)',
    async (label, overrides) => {
      const settled = orderRow({
        diningSessionId: null,
        discountVersion: 3,
        ...overrides,
      });
      (prisma.order.findFirst as jest.Mock).mockResolvedValue(settled);

      const result = await changeMember({
        restaurantId,
        target: { kind: 'order', orderId },
        userId: 'user-1',
        phone: '+60123456789',
        expectedBillRevision: 3,
        idempotencyKey: `settled-${label}`,
        now,
      });

      expect(result.status).toBe(409);
      expect(result.body).toMatchObject({
        success: false,
        code: 'BILL_PAID',
      });
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(tx.order.update).not.toHaveBeenCalled();
    }
  );

  it('attaches a member to a takeaway order and bumps discountVersion', async () => {
    const takeaway = orderRow({
      diningSessionId: null,
      discountVersion: 3,
      customerId: null,
    });
    (prisma.order.findFirst as jest.Mock).mockResolvedValue(takeaway);
    (tx.order.findFirst as jest.Mock).mockResolvedValue(takeaway);

    const result = await changeMember({
      restaurantId,
      target: { kind: 'order', orderId },
      userId: 'user-1',
      phone: '+60123456789',
      expectedBillRevision: 3,
      idempotencyKey: 'order-member-key-1',
      now,
    });

    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({
      success: true,
      billRevision: 4,
      member: { id: customerId },
    });
    expect(tx.order.update).toHaveBeenCalledWith({
      where: { restaurantId_id: { restaurantId, id: orderId } },
      data: { customerId, discountVersion: 4 },
    });
  });

  it('returns LOYALTY_DISABLED when the restaurant setting is off', async () => {
    (prisma.loyaltySettings.findUnique as jest.Mock).mockResolvedValue({
      ...settingsRow,
      enabled: false,
    });

    const result = await changeMember(baseTableInput());

    expect(result.status).toBe(409);
    expect(result.body).toMatchObject({
      success: false,
      code: 'LOYALTY_DISABLED',
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
