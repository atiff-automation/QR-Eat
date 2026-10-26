import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/database';
import { addToTableCart } from '@/lib/table-session';

jest.mock('@/lib/database', () => ({
  prisma: {
    table: { findUnique: jest.fn() },
    customerSession: { findUnique: jest.fn() },
    cartItem: {
      count: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    menuItem: { findUnique: jest.fn() },
  },
}));

const tableId = '550e8400-e29b-41d4-a716-446655440001';
const sessionId = '550e8400-e29b-41d4-a716-446655440002';
const restaurantId = '550e8400-e29b-41d4-a716-446655440003';
const itemId = '550e8400-e29b-41d4-a716-446655440004';
const sizeGroupId = '550e8400-e29b-41d4-a716-446655440005';
const regularId = '550e8400-e29b-41d4-a716-446655440006';
const largeId = '550e8400-e29b-41d4-a716-446655440007';
const extraGroupId = '550e8400-e29b-41d4-a716-446655440008';
const cheeseId = '550e8400-e29b-41d4-a716-446655440009';

function table(overrides: Record<string, unknown> = {}) {
  return {
    restaurantId,
    status: 'AVAILABLE',
    ...overrides,
  };
}

function item(overrides: Record<string, unknown> = {}) {
  return {
    id: itemId,
    name: 'Pizza',
    price: new Prisma.Decimal('10.00'),
    restaurantId,
    isAvailable: true,
    status: 'ACTIVE',
    category: { status: 'ACTIVE', isActive: true },
    variationGroups: [
      {
        id: sizeGroupId,
        name: 'Size',
        minSelections: 1,
        maxSelections: 1,
        options: [
          {
            id: regularId,
            name: 'Regular',
            priceModifier: new Prisma.Decimal('0'),
            isAvailable: true,
          },
          {
            id: largeId,
            name: 'Large',
            priceModifier: new Prisma.Decimal('2.50'),
            isAvailable: true,
          },
        ],
      },
      {
        id: extraGroupId,
        name: 'Extras',
        minSelections: 0,
        maxSelections: 2,
        options: [
          {
            id: cheeseId,
            name: 'Extra Cheese',
            priceModifier: new Prisma.Decimal('1.00'),
            isAvailable: true,
          },
        ],
      },
    ],
    ...overrides,
  };
}

function session() {
  return {
    id: sessionId,
    tableId,
    sessionToken: 'token',
    status: 'ACTIVE',
    startedAt: new Date(),
    expiresAt: new Date(Date.now() + 60_000),
  };
}

function cartItem(overrides: Record<string, unknown> = {}) {
  return {
    id: 'cart-item-1',
    customerSessionId: sessionId,
    menuItemId: itemId,
    quantity: 1,
    unitPrice: new Prisma.Decimal('12.50'),
    subtotal: new Prisma.Decimal('12.50'),
    specialInstructions: null,
    menuItem: { id: itemId, name: 'Pizza', imageUrl: null },
    selectedOptions: [
      {
        variationOption: {
          id: largeId,
          name: 'Large',
          priceModifier: new Prisma.Decimal('2.50'),
          isAvailable: true,
          displayOrder: 0,
        },
      },
    ],
    ...overrides,
  };
}

const base = {
  tableId,
  sessionId,
  menuItemId: itemId,
  variationOptionIds: [largeId],
  quantity: 1,
  unitPrice: 999,
};

describe('QR cart option validation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (prisma.table.findUnique as jest.Mock).mockResolvedValue(table());
    (prisma.customerSession.findUnique as jest.Mock).mockResolvedValue(
      session()
    );
    (prisma.cartItem.count as jest.Mock).mockResolvedValue(0);
    (prisma.cartItem.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.cartItem.create as jest.Mock).mockResolvedValue(cartItem());
    (prisma.menuItem.findUnique as jest.Mock).mockResolvedValue(item());
  });

  it('uses the server price and accepts a valid required option', async () => {
    await addToTableCart(base);

    expect(prisma.cartItem.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          unitPrice: new Prisma.Decimal('12.50'),
          subtotal: new Prisma.Decimal('12.50'),
        }),
      })
    );
  });

  it('rejects an option from another item', async () => {
    await expect(
      addToTableCart({
        ...base,
        variationOptionIds: [largeId, '550e8400-e29b-41d4-a716-446655440099'],
      })
    ).rejects.toThrow(/invalid for this item/i);

    expect(prisma.cartItem.create).not.toHaveBeenCalled();
  });

  it('rejects a missing required option group', async () => {
    await expect(
      addToTableCart({ ...base, variationOptionIds: [] })
    ).rejects.toThrow(/choose at least 1 from Size/i);
  });

  it('rejects too many options in a group', async () => {
    await expect(
      addToTableCart({
        ...base,
        variationOptionIds: [regularId, largeId],
      })
    ).rejects.toThrow(/no more than 1 from Size/i);
  });

  it('rejects a table/menu item from different restaurants', async () => {
    (prisma.menuItem.findUnique as jest.Mock).mockResolvedValue(
      item({ restaurantId: '550e8400-e29b-41d4-a716-446655440099' })
    );

    await expect(addToTableCart(base)).rejects.toThrow(
      /not available for this table/i
    );
  });
});
