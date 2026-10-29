import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/database';
import {
  CounterOrderInputSchema,
  buildCounterOrderRequestHash,
  createCounterOrder,
  quoteCounterOrder,
} from '@/lib/services/counter-order-service';
import { SequenceManager } from '@/lib/sequence-manager';
import { PostgresEventManager } from '@/lib/postgres-pubsub';
import { formatPickupNumber } from '@/lib/order-utils';

jest.mock('@/lib/database', () => ({
  prisma: {
    table: { findUnique: jest.fn() },
    businessDay: { findFirst: jest.fn() },
    restaurant: { findUnique: jest.fn() },
    menuItem: { findMany: jest.fn() },
    order: { findUnique: jest.fn() },
    orderEvent: { findMany: jest.fn() },
    auditLog: { create: jest.fn() },
    $transaction: jest.fn(),
  },
}));

jest.mock('@/lib/sequence-manager', () => ({
  SequenceManager: {
    getNextOrder: jest.fn(),
  },
}));

jest.mock('@/lib/postgres-pubsub', () => ({
  PostgresEventManager: {
    publishOrderCreated: jest.fn(),
  },
}));

const restaurantId = '550e8400-e29b-41d4-a716-446655440001';
const tableId = '550e8400-e29b-41d4-a716-446655440002';
const itemId = '550e8400-e29b-41d4-a716-446655440003';
const optionId = '550e8400-e29b-41d4-a716-446655440004';

function table(overrides: Record<string, unknown> = {}) {
  return {
    id: tableId,
    tableNumber: '2',
    tableName: 'Center Table',
    status: 'AVAILABLE',
    restaurantId,
    restaurant: {
      id: restaurantId,
      name: 'Mario',
      currency: 'MYR',
      taxRate: new Prisma.Decimal('0.10'),
      serviceChargeRate: new Prisma.Decimal('0'),
      taxLabel: 'Tax',
      serviceChargeLabel: 'Service Charge',
      isActive: true,
    },
    ...overrides,
  };
}

function restaurant(overrides: Record<string, unknown> = {}) {
  return {
    id: restaurantId,
    name: 'Mario',
    currency: 'MYR',
    taxRate: new Prisma.Decimal('0.10'),
    serviceChargeRate: new Prisma.Decimal('0.10'),
    taxLabel: 'Tax',
    serviceChargeLabel: 'Service Charge',
    isActive: true,
    ...overrides,
  };
}

function menuItem(overrides: Record<string, unknown> = {}) {
  return {
    id: itemId,
    name: 'Pasta',
    price: new Prisma.Decimal('10.00'),
    preparationTime: 12,
    isAvailable: true,
    status: 'ACTIVE',
    category: { id: 'cat-1', name: 'Mains', status: 'ACTIVE', isActive: true },
    variationGroups: [
      {
        id: 'group-1',
        name: 'Size',
        minSelections: 1,
        maxSelections: 1,
        displayOrder: 0,
        options: [
          {
            id: optionId,
            name: 'Large',
            priceModifier: new Prisma.Decimal('2.00'),
            isAvailable: true,
            displayOrder: 0,
          },
        ],
      },
    ],
    ...overrides,
  };
}

const actor = {
  userId: 'user-1',
  userType: 'staff',
  restaurantId,
};

const input = {
  orderType: 'DINE_IN' as const,
  tableId,
  items: [{ menuItemId: itemId, quantity: 1, optionIds: [optionId] }],
};

describe('Counter order quoting', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('prices item options and tax from the server menu', async () => {
    (prisma.table.findUnique as jest.Mock).mockResolvedValue(table());
    (prisma.menuItem.findMany as jest.Mock).mockResolvedValue([menuItem()]);

    const quote = await quoteCounterOrder(input, actor);

    expect(quote.valid).toBe(true);
    expect(quote.subtotal).toBe(12);
    expect(quote.taxAmount).toBe(1.2);
    expect(quote.totalAmount).toBe(13.2);
    expect(quote.lines[0].unitPrice).toBe('12.00');
    expect(quote.lines[0].options[0].name).toBe('Large');
  });

  it('reports a required option that was not selected', async () => {
    (prisma.table.findUnique as jest.Mock).mockResolvedValue(table());
    (prisma.menuItem.findMany as jest.Mock).mockResolvedValue([menuItem()]);

    const quote = await quoteCounterOrder(
      { ...input, items: [{ menuItemId: itemId, quantity: 1 }] },
      actor
    );

    expect(quote.valid).toBe(false);
    expect(quote.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'OPTION_SELECTION_REQUIRED' }),
      ])
    );
  });

  it('rejects unavailable menu items without pricing them', async () => {
    (prisma.table.findUnique as jest.Mock).mockResolvedValue(table());
    (prisma.menuItem.findMany as jest.Mock).mockResolvedValue([
      menuItem({ isAvailable: false }),
    ]);

    const quote = await quoteCounterOrder(input, actor);

    expect(quote.valid).toBe(false);
    expect(quote.lines).toHaveLength(0);
    expect(quote.issues[0]).toMatchObject({ code: 'ITEM_UNAVAILABLE' });
  });

  it('rejects a table from another restaurant', async () => {
    (prisma.table.findUnique as jest.Mock).mockResolvedValue(
      table({ restaurantId: '550e8400-e29b-41d4-a716-446655440099' })
    );

    await expect(quoteCounterOrder(input, actor)).rejects.toMatchObject({
      code: 'TABLE_NOT_FOUND',
      statusCode: 404,
    });
  });

  it('rejects reserved tables', async () => {
    (prisma.table.findUnique as jest.Mock).mockResolvedValue(
      table({ status: 'RESERVED' })
    );

    await expect(quoteCounterOrder(input, actor)).rejects.toMatchObject({
      code: 'TABLE_NOT_ACCEPTING_ORDERS',
      statusCode: 409,
    });
  });

  it('quotes a takeaway order without a table and without service charge', async () => {
    (prisma.restaurant.findUnique as jest.Mock).mockResolvedValue(restaurant());
    (prisma.menuItem.findMany as jest.Mock).mockResolvedValue([menuItem()]);

    const quote = await quoteCounterOrder(
      {
        orderType: 'TAKEAWAY',
        customerName: 'Alex',
        customerPhone: '0123456789',
        items: [{ menuItemId: itemId, quantity: 1, optionIds: [optionId] }],
      },
      actor
    );

    expect(quote.valid).toBe(true);
    expect(quote.orderType).toBe('TAKEAWAY');
    expect(quote.tableId).toBeNull();
    expect(quote.tableNumber).toBeNull();
    expect(quote.customerName).toBe('Alex');
    expect(quote.customerPhone).toBe('0123456789');
    expect(quote.subtotal).toBe(12);
    expect(quote.taxAmount).toBe(1.2);
    expect(quote.serviceCharge).toBe(0);
    expect(quote.totalAmount).toBe(13.2);
    expect(prisma.table.findUnique).not.toHaveBeenCalled();
  });

  it('rejects a takeaway quote that includes a table', async () => {
    await expect(
      quoteCounterOrder({ ...input, orderType: 'TAKEAWAY' }, actor)
    ).rejects.toMatchObject({
      code: 'TABLE_NOT_ALLOWED',
      statusCode: 400,
    });
  });

  it('requires a table for a dine-in quote', async () => {
    await expect(
      quoteCounterOrder({ ...input, tableId: null }, actor)
    ).rejects.toMatchObject({
      code: 'TABLE_REQUIRED',
      statusCode: 400,
    });
  });
});

describe('Counter order input schema', () => {
  const items = [{ menuItemId: itemId, quantity: 1, optionIds: [optionId] }];

  it('defaults the order type to dine-in for old clients', () => {
    const parsed = CounterOrderInputSchema.parse({ tableId, items });

    expect(parsed.orderType).toBe('DINE_IN');
  });

  it('accepts a takeaway order without a table', () => {
    const parsed = CounterOrderInputSchema.parse({
      orderType: 'TAKEAWAY',
      customerName: 'Alex',
      items,
    });

    expect(parsed.orderType).toBe('TAKEAWAY');
    expect(parsed.tableId).toBeUndefined();
  });

  it('rejects a takeaway order with a table', () => {
    const parsed = CounterOrderInputSchema.safeParse({
      orderType: 'TAKEAWAY',
      tableId,
      items,
    });

    expect(parsed.success).toBe(false);
  });

  it('rejects a dine-in order without a table', () => {
    const parsed = CounterOrderInputSchema.safeParse({
      orderType: 'DINE_IN',
      items,
    });

    expect(parsed.success).toBe(false);
  });
});

describe('Counter order idempotency hash', () => {
  it('is stable when option order changes', () => {
    const left = buildCounterOrderRequestHash(input);
    const right = buildCounterOrderRequestHash({
      ...input,
      items: [
        {
          ...input.items[0],
          optionIds: [optionId],
        },
      ],
    });
    expect(left).toBe(right);
  });

  it('changes when quantity or notes change', () => {
    const base = buildCounterOrderRequestHash(input);
    expect(
      buildCounterOrderRequestHash({
        ...input,
        items: [{ ...input.items[0], quantity: 2 }],
      })
    ).not.toBe(base);
    expect(
      buildCounterOrderRequestHash({
        ...input,
        items: [{ ...input.items[0], notes: 'No cheese' }],
      })
    ).not.toBe(base);
  });

  it('changes when order type or customer data changes', () => {
    const base = buildCounterOrderRequestHash(input);
    expect(
      buildCounterOrderRequestHash({
        ...input,
        orderType: 'TAKEAWAY',
        tableId: null,
      })
    ).not.toBe(base);
    expect(
      buildCounterOrderRequestHash({
        ...input,
        customerName: 'Alex',
      })
    ).not.toBe(base);
    expect(
      buildCounterOrderRequestHash({
        ...input,
        customerPhone: '0123456789',
      })
    ).not.toBe(base);
  });
});

describe('Counter order idempotency', () => {
  const hash = buildCounterOrderRequestHash(input);
  const existing = {
    id: 'order-1',
    orderNumber: 'ORD-1',
    dailySeq: 1,
    restaurantId,
    tableId,
    status: 'PENDING',
    paymentStatus: 'PENDING',
    source: 'COUNTER',
    orderType: 'DINE_IN',
    customerName: null,
    customerPhone: null,
    totalAmount: new Prisma.Decimal('13.20'),
    idempotencyHash: hash,
    createdAt: new Date(),
    table: { tableNumber: '2', tableName: 'Center Table' },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (prisma.order.findUnique as jest.Mock).mockResolvedValue(existing);
    (prisma.orderEvent.findMany as jest.Mock).mockResolvedValue([]);
  });

  it('replays the original order for the same key and request', async () => {
    const result = await createCounterOrder(
      input,
      actor,
      'test-idempotency-key'
    );

    expect(result.replayed).toBe(true);
    expect(result.order.id).toBe('order-1');
    expect(result.order.source).toBe('COUNTER');
    expect(result.order.orderType).toBe('DINE_IN');
    expect(result.order.pickupNumber).toBe('#001');
    expect(result.warning).toMatch(/pending kitchen dispatch/i);
  });

  it('rejects the same key with a different request', async () => {
    await expect(
      createCounterOrder(
        { ...input, items: [{ ...input.items[0], quantity: 2 }] },
        actor,
        'test-idempotency-key'
      )
    ).rejects.toMatchObject({
      code: 'IDEMPOTENCY_MISMATCH',
      statusCode: 409,
    });
  });
});

describe('Counter takeaway creation', () => {
  const takeawayInput = {
    orderType: 'TAKEAWAY' as const,
    customerName: 'Alex',
    customerPhone: '0123456789',
    sendToKitchen: false,
    items: [{ menuItemId: itemId, quantity: 1, optionIds: [optionId] }],
  };

  const createdTakeaway = {
    id: 'order-takeaway-1',
    orderNumber: 'ORD-TEST-042',
    dailySeq: 42,
    status: 'PENDING',
    paymentStatus: 'PENDING',
    source: 'COUNTER',
    orderType: 'TAKEAWAY',
    customerName: 'Alex',
    customerPhone: '0123456789',
    totalAmount: new Prisma.Decimal('13.20'),
    tableId: null,
    createdAt: new Date(),
    table: null,
  };

  const tx = {
    customerSession: { create: jest.fn() },
    order: { create: jest.fn() },
    orderItem: { create: jest.fn() },
    table: { update: jest.fn() },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (prisma.restaurant.findUnique as jest.Mock).mockResolvedValue(restaurant());
    (prisma.menuItem.findMany as jest.Mock).mockResolvedValue([menuItem()]);
    (prisma.order.findUnique as jest.Mock).mockResolvedValue(null);
    (prisma.orderEvent.findMany as jest.Mock).mockResolvedValue([]);
    (SequenceManager.getNextOrder as jest.Mock).mockResolvedValue({
      number: 42,
      formatted: 'ORD-TEST-042',
    });
    (prisma.auditLog.create as jest.Mock).mockResolvedValue({});
    (PostgresEventManager.publishOrderCreated as jest.Mock).mockResolvedValue(
      undefined
    );
    tx.customerSession.create.mockResolvedValue({ id: 'session-1' });
    tx.order.create.mockResolvedValue(createdTakeaway);
    tx.orderItem.create.mockResolvedValue({});
    tx.table.update.mockResolvedValue({});
    (prisma.$transaction as jest.Mock).mockImplementation(
      async (callback: (client: typeof tx) => unknown) => callback(tx)
    );
  });

  it('creates a takeaway order without a table or customer session', async () => {
    const result = await createCounterOrder(
      takeawayInput,
      actor,
      'takeaway-idempotency-key'
    );

    expect(result.order.orderType).toBe('TAKEAWAY');
    expect(result.order.pickupNumber).toBe(formatPickupNumber(42));
    expect(result.order.tableId).toBeNull();
    expect(result.order.customerName).toBe('Alex');
    expect(tx.customerSession.create).not.toHaveBeenCalled();
    expect(tx.table.update).not.toHaveBeenCalled();
    expect(tx.orderItem.create).toHaveBeenCalledTimes(1);
    expect(tx.order.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          orderType: 'TAKEAWAY',
          tableId: null,
          customerSessionId: null,
          customerName: 'Alex',
          customerPhone: '0123456789',
        }),
      })
    );
    expect(
      tx.order.create.mock.calls[0][0].data.serviceChargeRateSnapshot.toString()
    ).toBe('0');
    expect(PostgresEventManager.publishOrderCreated).toHaveBeenCalledWith(
      expect.objectContaining({ tableId: null })
    );
  });

  it('creates a dine-in order with a session and table update', async () => {
    const dineInOrder = {
      ...createdTakeaway,
      id: 'order-dine-in-1',
      dailySeq: 43,
      orderNumber: 'ORD-TEST-043',
      orderType: 'DINE_IN',
      customerName: null,
      customerPhone: null,
      tableId,
      table: { tableNumber: '2', tableName: 'Center Table' },
    };
    (prisma.table.findUnique as jest.Mock).mockResolvedValue(table());
    tx.order.create.mockResolvedValue(dineInOrder);

    const result = await createCounterOrder(
      { ...input, sendToKitchen: false },
      actor,
      'dine-in-idempotency-key'
    );

    expect(result.order.orderType).toBe('DINE_IN');
    expect(result.order.tableId).toBe(tableId);
    expect(tx.customerSession.create).toHaveBeenCalledTimes(1);
    expect(tx.table.update).toHaveBeenCalledTimes(1);
    expect(tx.order.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          orderType: 'DINE_IN',
          tableId,
          customerSessionId: 'session-1',
        }),
      })
    );
  });
});
