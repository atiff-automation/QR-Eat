import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/database';
import { addOrderItems } from '@/lib/orders/order-add-items-service';
import { buildOrderMutationRequestHash } from '@/lib/orders/order-mutation-idempotency';
import { isOrderBusinessDayClosed } from '@/lib/orders/order-business-day';
import { priceCounterOrderLines } from '@/lib/services/counter-order-service';
import {
  acquireOrderModificationLocks,
  reapplyPromotionForModifiedOrder,
} from '@/lib/services/loyalty-order-modify-service';
import { recordOrderItemsAdded } from '@/lib/order-events';
import { recordRestaurantChangeTx } from '@/lib/restaurant-changes';
import { PostgresEventManager } from '@/lib/postgres-pubsub';

jest.mock('@/lib/database', () => ({
  prisma: {
    order: { findFirst: jest.fn() },
    orderMutationIdempotency: { findUnique: jest.fn() },
    $transaction: jest.fn(),
  },
}));

jest.mock('@/lib/orders/order-business-day', () => ({
  isOrderBusinessDayClosed: jest.fn().mockResolvedValue(false),
}));

jest.mock('@/lib/services/counter-order-service', () => ({
  priceCounterOrderLines: jest.fn(),
}));

jest.mock('@/lib/services/loyalty-order-modify-service', () => ({
  acquireOrderModificationLocks: jest.fn(),
  reapplyPromotionForModifiedOrder: jest.fn().mockResolvedValue(null),
}));

jest.mock('@/lib/order-events', () => {
  const actual = jest.requireActual('@/lib/order-events');
  return { ...actual, recordOrderItemsAdded: jest.fn() };
});

jest.mock('@/lib/restaurant-changes', () => ({
  recordRestaurantChangeTx: jest.fn(),
}));

jest.mock('@/lib/postgres-pubsub', () => ({
  PostgresEventManager: { publishOrderItemsAdded: jest.fn() },
}));

const actor = {
  userId: 'user-1',
  userType: 'staff',
  ipAddress: '203.0.113.10',
  userAgent: 'counter-test',
};

const input = {
  expectedVersion: 4,
  idempotencyKey: '550e8400-e29b-41d4-a716-446655440000',
  reason: 'customer_request' as const,
  reasonNotes: 'extra tea',
  customerNotified: true,
  items: [
    {
      menuItemId: '550e8400-e29b-41d4-a716-446655440020',
      quantity: 1,
      optionIds: [],
      notes: null,
    },
  ],
};

function normalizedBody(overrides: Record<string, unknown> = {}) {
  return {
    expectedVersion: input.expectedVersion,
    reason: input.reason,
    reasonNotes: input.reasonNotes,
    customerNotified: input.customerNotified,
    items: [
      {
        clientItemId: null,
        menuItemId: input.items[0].menuItemId,
        quantity: 1,
        optionIds: [],
        notes: null,
      },
    ],
    ...overrides,
  };
}

function hashFor(overrides: Record<string, unknown> = {}) {
  return buildOrderMutationRequestHash(
    'ADD_ITEMS',
    'order-1',
    normalizedBody(overrides)
  );
}

function order(overrides: Record<string, unknown> = {}) {
  return {
    id: 'order-1',
    restaurantId: 'restaurant-1',
    orderNumber: 'ORD-1',
    status: 'CONFIRMED',
    paymentStatus: 'PENDING',
    orderType: 'DINE_IN',
    version: 4,
    createdAt: new Date('2026-11-18T01:00:00.000Z'),
    tableId: 'table-1',
    customerId: null,
    diningSessionId: null,
    subtotalAmount: new Prisma.Decimal('18.00'),
    taxAmount: new Prisma.Decimal('1.08'),
    serviceCharge: new Prisma.Decimal('1.80'),
    discountAmount: new Prisma.Decimal('0.00'),
    totalAmount: new Prisma.Decimal('20.88'),
    taxRateSnapshot: new Prisma.Decimal('0.0600'),
    serviceChargeRateSnapshot: new Prisma.Decimal('0.1000'),
    items: [
      {
        id: 'item-1',
        menuItemId: 'menu-1',
        quantity: 1,
        totalAmount: new Prisma.Decimal('18.00'),
        menuItem: {
          name: 'Pasta',
          categoryId: 'cat-1',
        },
        selectedOptions: [],
      },
    ],
    ...overrides,
  };
}

describe('order add-items service', () => {
  let currentOrder: ReturnType<typeof order>;
  let createdItems: {
    id: string;
    menuItemId: string;
    quantity: number;
    totalAmount: Prisma.Decimal;
  }[];
  let tx: {
    order: {
      findFirst: jest.Mock;
      updateMany: jest.Mock;
      findUnique: jest.Mock;
    };
    diningSession: { findFirst: jest.Mock };
    orderItem: { create: jest.Mock; findMany: jest.Mock };
    orderModification: { create: jest.Mock };
    orderEvent: { count: jest.Mock };
    orderMutationIdempotency: { findUnique: jest.Mock; create: jest.Mock };
    auditLog: { create: jest.Mock };
  };

  beforeEach(() => {
    jest.clearAllMocks();
    currentOrder = order();
    createdItems = [];

    tx = {
      order: {
        findFirst: jest.fn().mockImplementation(async () => currentOrder),
        updateMany: jest.fn().mockImplementation(async ({ data }) => {
          currentOrder = {
            ...currentOrder,
            status: data.status ?? currentOrder.status,
            paymentStatus: data.paymentStatus ?? currentOrder.paymentStatus,
            subtotalAmount: new Prisma.Decimal(data.subtotalAmount),
            taxAmount: new Prisma.Decimal(data.taxAmount),
            serviceCharge: new Prisma.Decimal(data.serviceCharge),
            totalAmount: new Prisma.Decimal(data.totalAmount),
            version: currentOrder.version + 1,
          };
          return { count: 1 };
        }),
        findUnique: jest.fn().mockImplementation(async () => currentOrder),
      },
      diningSession: { findFirst: jest.fn().mockResolvedValue(null) },
      orderItem: {
        create: jest.fn().mockImplementation(async ({ data }) => {
          const item = {
            id: `new-item-${createdItems.length + 1}`,
            menuItemId: data.menuItemId,
            quantity: data.quantity,
            totalAmount: new Prisma.Decimal('6.00'),
          };
          createdItems.push(item);
          return {
            ...item,
            menuItem: { name: 'Tea', categoryId: 'cat-2' },
            selectedOptions: [],
          };
        }),
        findMany: jest.fn().mockImplementation(async () => [
          ...currentOrder.items,
          ...createdItems.map((item) => ({
            ...item,
            menuItem: { name: 'Tea', categoryId: 'cat-2' },
            selectedOptions: [],
          })),
        ]),
      },
      orderModification: { create: jest.fn().mockResolvedValue({}) },
      orderEvent: { count: jest.fn().mockResolvedValue(1) },
      orderMutationIdempotency: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({}),
      },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
    };

    (prisma.order.findFirst as jest.Mock).mockImplementation(
      async () => currentOrder
    );
    (prisma.orderMutationIdempotency.findUnique as jest.Mock).mockResolvedValue(
      null
    );
    (prisma.$transaction as jest.Mock).mockImplementation(
      async (callback: (client: typeof tx) => unknown) => callback(tx)
    );
    (isOrderBusinessDayClosed as jest.Mock).mockResolvedValue(false);
    (priceCounterOrderLines as jest.Mock).mockResolvedValue({
      issues: [],
      lines: [
        {
          menuItemId: input.items[0].menuItemId,
          name: 'Tea',
          quantity: 1,
          unitPrice: new Prisma.Decimal('6.00'),
          totalAmount: new Prisma.Decimal('6.00'),
          preparationTime: 1,
          notes: null,
          options: [],
        },
      ],
    });
    (acquireOrderModificationLocks as jest.Mock).mockResolvedValue(undefined);
    (reapplyPromotionForModifiedOrder as jest.Mock).mockResolvedValue(null);
    (recordOrderItemsAdded as jest.Mock).mockResolvedValue({
      tickets: 1,
      stationIds: ['station-1'],
      unroutedItemIds: [],
      replayed: false,
    });
    (recordRestaurantChangeTx as jest.Mock).mockResolvedValue(undefined);
    (
      PostgresEventManager.publishOrderItemsAdded as jest.Mock
    ).mockResolvedValue(undefined);
  });

  it('adds items, re-prices from snapshots and emits one add-on ticket', async () => {
    const result = await addOrderItems('restaurant-1', 'order-1', actor, input);

    expect(result).toMatchObject({
      isDuplicate: false,
      order: {
        id: 'order-1',
        status: 'CONFIRMED',
        paymentStatus: 'PENDING',
        version: 5,
        subtotalAmount: '24.00',
        taxAmount: '1.44',
        serviceCharge: '2.40',
        discountAmount: '0.00',
        totalAmount: '27.84',
      },
      addedItems: [
        {
          id: 'new-item-1',
          menuItemId: input.items[0].menuItemId,
          quantity: 1,
          totalAmount: '6.00',
        },
      ],
      ticket: {
        routed: true,
        stationIds: ['station-1'],
        unroutedItemIds: [],
        replayed: false,
      },
    });

    expect(acquireOrderModificationLocks).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        restaurantId: 'restaurant-1',
        orderId: 'order-1',
      })
    );
    expect(tx.orderModification.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          idempotencyKey: `ADD_ITEMS:order-1:${input.idempotencyKey}`,
          items: {
            create: [
              expect.objectContaining({
                action: 'added',
                newQuantity: 1,
              }),
            ],
          },
        }),
      })
    );
    expect(recordOrderItemsAdded).toHaveBeenCalledWith(
      'order-1',
      ['new-item-1'],
      { tx }
    );
    expect(recordRestaurantChangeTx).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({ entityType: 'order', entityId: 'order-1' })
    );
    expect(tx.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          description: 'order.items.added',
          recordId: 'order-1',
          ipAddress: '203.0.113.10',
          userAgent: 'counter-test',
        }),
      })
    );
    expect(tx.orderMutationIdempotency.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          operation: 'ADD_ITEMS',
          restaurantId: 'restaurant-1',
          requestHash: hashFor(),
        }),
      })
    );
    expect(PostgresEventManager.publishOrderItemsAdded).toHaveBeenCalledWith(
      expect.objectContaining({
        orderId: 'order-1',
        restaurantId: 'restaurant-1',
        orderVersion: 5,
        ticketCount: 1,
      })
    );
  });

  it('writes no event for a PENDING order even when a creation event exists', async () => {
    currentOrder = order({ status: 'PENDING' });

    const result = await addOrderItems('restaurant-1', 'order-1', actor, input);

    expect(result.ticket).toEqual({
      routed: false,
      stationIds: [],
      unroutedItemIds: [],
      replayed: false,
    });
    expect(recordOrderItemsAdded).not.toHaveBeenCalled();
    expect(PostgresEventManager.publishOrderItemsAdded).not.toHaveBeenCalled();
    expect(tx.orderItem.create).toHaveBeenCalledTimes(1);
    expect(tx.orderMutationIdempotency.create).toHaveBeenCalled();
  });

  it.each(['SERVED', 'CANCELLED'])(
    'rejects a %s order with ORDER_NOT_ADDABLE',
    async (status) => {
      currentOrder = order({ status });

      await expect(
        addOrderItems('restaurant-1', 'order-1', actor, input)
      ).rejects.toMatchObject({ code: 'ORDER_NOT_ADDABLE' });
      expect(prisma.$transaction).not.toHaveBeenCalled();
    }
  );

  it.each(['PAID', 'REFUNDED'])(
    'rejects a %s payment state',
    async (paymentStatus) => {
      currentOrder = order({ paymentStatus });

      await expect(
        addOrderItems('restaurant-1', 'order-1', actor, input)
      ).rejects.toMatchObject({ code: 'PAYMENT_STATE_INVALID' });
      expect(prisma.$transaction).not.toHaveBeenCalled();
    }
  );

  it('rejects a closed business day', async () => {
    (isOrderBusinessDayClosed as jest.Mock).mockResolvedValue(true);

    await expect(
      addOrderItems('restaurant-1', 'order-1', actor, input)
    ).rejects.toMatchObject({ code: 'BUSINESS_DAY_CLOSED' });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects a stale expectedVersion with ORDER_VERSION_CONFLICT', async () => {
    currentOrder = order({ version: 5 });

    await expect(
      addOrderItems('restaurant-1', 'order-1', actor, input)
    ).rejects.toMatchObject({ code: 'ORDER_VERSION_CONFLICT' });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rolls back when the version-conditional order write loses the race', async () => {
    tx.order.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      addOrderItems('restaurant-1', 'order-1', actor, input)
    ).rejects.toMatchObject({
      code: 'ORDER_VERSION_CONFLICT',
      statusCode: 409,
    });
    expect(tx.orderMutationIdempotency.create).not.toHaveBeenCalled();
    expect(recordOrderItemsAdded).not.toHaveBeenCalled();
    expect(recordRestaurantChangeTx).not.toHaveBeenCalled();
    expect(tx.auditLog.create).not.toHaveBeenCalled();
    expect(PostgresEventManager.publishOrderItemsAdded).not.toHaveBeenCalled();
  });

  it('replays when it loses the P2002 unique-key race', async () => {
    (prisma.orderMutationIdempotency.findUnique as jest.Mock)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        requestHash: hashFor(),
        responseJson: {
          order: {
            id: 'order-1',
            status: 'CONFIRMED',
            paymentStatus: 'PENDING',
            version: 5,
            subtotalAmount: '24.00',
            taxAmount: '1.44',
            serviceCharge: '2.40',
            discountAmount: '0.00',
            totalAmount: '27.84',
          },
          addedItems: [],
          ticket: {
            routed: true,
            stationIds: ['station-1'],
            unroutedItemIds: [],
            replayed: false,
          },
          isDuplicate: false,
          serverTime: '2026-11-18T10:00:00.000Z',
        },
      });
    (prisma.$transaction as jest.Mock).mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: '6.11.1',
      })
    );

    const result = await addOrderItems('restaurant-1', 'order-1', actor, input);

    expect(result.isDuplicate).toBe(true);
    expect(result.ticket.replayed).toBe(true);
    expect(recordOrderItemsAdded).not.toHaveBeenCalled();
    expect(PostgresEventManager.publishOrderItemsAdded).not.toHaveBeenCalled();
  });

  it('replays the stored response for the same key and body', async () => {
    (prisma.orderMutationIdempotency.findUnique as jest.Mock).mockResolvedValue(
      {
        requestHash: hashFor(),
        responseJson: {
          order: {
            id: 'order-1',
            status: 'CONFIRMED',
            paymentStatus: 'PENDING',
            version: 5,
            subtotalAmount: '24.00',
            taxAmount: '1.44',
            serviceCharge: '2.40',
            discountAmount: '0.00',
            totalAmount: '27.84',
          },
          addedItems: [],
          ticket: {
            routed: true,
            stationIds: ['station-1'],
            unroutedItemIds: [],
            replayed: false,
          },
          isDuplicate: false,
          serverTime: '2026-11-18T10:00:00.000Z',
        },
      }
    );

    const result = await addOrderItems('restaurant-1', 'order-1', actor, input);

    expect(result.isDuplicate).toBe(true);
    expect(result.ticket.replayed).toBe(true);
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(tx.orderItem.create).not.toHaveBeenCalled();
    expect(PostgresEventManager.publishOrderItemsAdded).not.toHaveBeenCalled();
  });

  it('rejects the same key with a different body', async () => {
    (prisma.orderMutationIdempotency.findUnique as jest.Mock).mockResolvedValue(
      {
        requestHash: hashFor({ expectedVersion: 3 }),
        responseJson: {},
      }
    );

    await expect(
      addOrderItems('restaurant-1', 'order-1', actor, input)
    ).rejects.toMatchObject({ code: 'IDEMPOTENCY_KEY_REUSED' });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('replays a concurrent duplicate found under the lock', async () => {
    tx.orderMutationIdempotency.findUnique.mockResolvedValue({
      requestHash: hashFor(),
      responseJson: {
        order: {
          id: 'order-1',
          status: 'CONFIRMED',
          paymentStatus: 'PENDING',
          version: 5,
          subtotalAmount: '24.00',
          taxAmount: '1.44',
          serviceCharge: '2.40',
          discountAmount: '0.00',
          totalAmount: '27.84',
        },
        addedItems: [],
        ticket: {
          routed: true,
          stationIds: ['station-1'],
          unroutedItemIds: [],
          replayed: false,
        },
        isDuplicate: false,
        serverTime: '2026-11-18T10:00:00.000Z',
      },
    });

    const result = await addOrderItems('restaurant-1', 'order-1', actor, input);

    expect(result.isDuplicate).toBe(true);
    expect(tx.orderItem.create).not.toHaveBeenCalled();
    expect(tx.auditLog.create).not.toHaveBeenCalled();
  });

  it('returns 404 when the order is outside the tenant scope', async () => {
    (prisma.order.findFirst as jest.Mock).mockResolvedValue(null);

    await expect(
      addOrderItems('restaurant-2', 'order-1', actor, input)
    ).rejects.toMatchObject({ code: 'ORDER_NOT_FOUND', statusCode: 404 });
    expect(prisma.orderMutationIdempotency.findUnique).not.toHaveBeenCalled();
  });

  it('rejects unavailable menu lines before the transaction', async () => {
    (priceCounterOrderLines as jest.Mock).mockResolvedValue({
      issues: [
        {
          code: 'ITEM_UNAVAILABLE',
          message: 'Tea is sold out.',
          menuItemId: 'm',
        },
      ],
      lines: [],
    });

    await expect(
      addOrderItems('restaurant-1', 'order-1', actor, input)
    ).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
      statusCode: 400,
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
