import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/database';
import {
  buildCounterOrderRequestHash,
  createCounterOrder,
  quoteCounterOrder,
} from '@/lib/services/counter-order-service';

jest.mock('@/lib/database', () => ({
  prisma: {
    table: { findUnique: jest.fn() },
    menuItem: { findMany: jest.fn() },
    order: { findUnique: jest.fn() },
    orderEvent: { findMany: jest.fn() },
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
});

describe('Counter order idempotency', () => {
  const hash = buildCounterOrderRequestHash(input);
  const existing = {
    id: 'order-1',
    orderNumber: 'ORD-1',
    restaurantId,
    tableId,
    status: 'PENDING',
    paymentStatus: 'PENDING',
    source: 'COUNTER',
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
