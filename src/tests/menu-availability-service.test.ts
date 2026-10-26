import { prisma } from '@/lib/database';
import { invalidateMenuCache } from '@/lib/cache/menu-cache';
import {
  MenuAvailabilityError,
  listMenuAvailability,
  setMenuItemAvailability,
} from '@/lib/services/menu-availability-service';

jest.mock('@/lib/database', () => ({
  prisma: {
    menuItem: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    menuCategory: {
      findMany: jest.fn(),
    },
    auditLog: {
      create: jest.fn(),
    },
    $transaction: jest.fn(),
  },
}));

jest.mock('@/lib/cache/menu-cache', () => ({
  invalidateMenuCache: jest.fn(),
}));

const restaurantId = '550e8400-e29b-41d4-a716-446655440001';
const otherRestaurantId = '550e8400-e29b-41d4-a716-446655440099';
const itemId = '550e8400-e29b-41d4-a716-446655440003';

function item(overrides: Record<string, unknown> = {}) {
  return {
    id: itemId,
    name: 'Chicken Rice',
    restaurantId,
    isAvailable: true,
    status: 'ACTIVE',
    category: {
      id: 'cat-1',
      restaurantId,
      status: 'ACTIVE',
      isActive: true,
    },
    ...overrides,
  };
}

function updatedItem(overrides: Record<string, unknown> = {}) {
  return {
    id: itemId,
    name: 'Chicken Rice',
    isAvailable: false,
    updatedAt: new Date('2026-10-26T12:00:00.000Z'),
    ...overrides,
  };
}

const actor = {
  userId: 'staff-1',
  userType: 'staff',
};

describe('menu availability service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (prisma.$transaction as jest.Mock).mockImplementation(
      async (callback: (tx: unknown) => Promise<unknown>) =>
        callback({
          menuItem: { update: prisma.menuItem.update },
          auditLog: { create: prisma.auditLog.create },
        })
    );
    (prisma.menuItem.update as jest.Mock).mockResolvedValue(updatedItem());
    (prisma.auditLog.create as jest.Mock).mockResolvedValue({});
  });

  it('marks an item unavailable and writes audit metadata', async () => {
    (prisma.menuItem.findUnique as jest.Mock).mockResolvedValue(item());

    const result = await setMenuItemAvailability({
      restaurantId,
      itemId,
      isAvailable: false,
      source: 'COUNTER',
      reason: 'sold_out',
      actor,
      requestContext: { ipAddress: '127.0.0.1', userAgent: 'Counter/1.4.2' },
    });

    expect(result).toMatchObject({
      id: itemId,
      isAvailable: false,
      changed: true,
    });
    expect(prisma.menuItem.update).toHaveBeenCalledWith({
      where: { id: itemId },
      data: {
        isAvailable: false,
        updatedAt: expect.any(Date),
      },
      select: {
        id: true,
        name: true,
        isAvailable: true,
        updatedAt: true,
      },
    });
    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tableName: 'menu_items',
        recordId: itemId,
        operation: 'UPDATE',
        oldValues: { isAvailable: true },
        newValues: { isAvailable: false },
        changedBy: 'staff-1',
        changedByType: 'staff',
        restaurantId,
        category: 'menu',
        metadata: expect.objectContaining({
          source: 'COUNTER',
          reason: 'sold_out',
        }),
      }),
    });
    expect(invalidateMenuCache).toHaveBeenCalledWith(restaurantId);
  });

  it('returns a no-op result without writing or invalidating when unchanged', async () => {
    (prisma.menuItem.findUnique as jest.Mock).mockResolvedValue(
      item({ isAvailable: false })
    );

    const result = await setMenuItemAvailability({
      restaurantId,
      itemId,
      isAvailable: false,
      source: 'WEB',
      actor,
    });

    expect(result.changed).toBe(false);
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(invalidateMenuCache).not.toHaveBeenCalled();
  });

  it('rejects an item from another restaurant', async () => {
    (prisma.menuItem.findUnique as jest.Mock).mockResolvedValue(
      item({ restaurantId: otherRestaurantId })
    );

    await expect(
      setMenuItemAvailability({
        restaurantId,
        itemId,
        isAvailable: false,
        source: 'WEB',
        actor,
      })
    ).rejects.toMatchObject({
      code: 'ITEM_NOT_FOUND',
      statusCode: 404,
    });
  });

  it('rejects restoring an item in an inactive category', async () => {
    (prisma.menuItem.findUnique as jest.Mock).mockResolvedValue(
      item({
        isAvailable: false,
        category: {
          id: 'cat-1',
          restaurantId,
          status: 'INACTIVE',
          isActive: false,
        },
      })
    );

    await expect(
      setMenuItemAvailability({
        restaurantId,
        itemId,
        isAvailable: true,
        source: 'WEB',
        actor,
      })
    ).rejects.toBeInstanceOf(MenuAvailabilityError);
  });

  it('lists unavailable items for the staff screen', async () => {
    (prisma.menuCategory.findMany as jest.Mock).mockResolvedValue([
      {
        id: 'cat-1',
        name: 'Mains',
        menuItems: [
          {
            id: itemId,
            name: 'Chicken Rice',
            price: { toString: () => '12.00' },
            imageUrl: null,
            isAvailable: false,
          },
        ],
      },
    ]);

    await expect(listMenuAvailability(restaurantId)).resolves.toEqual([
      {
        id: itemId,
        name: 'Chicken Rice',
        categoryId: 'cat-1',
        categoryName: 'Mains',
        price: '12.00',
        imageUrl: null,
        isAvailable: false,
      },
    ]);
  });
});
