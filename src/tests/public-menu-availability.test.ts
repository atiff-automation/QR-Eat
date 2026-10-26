import { NextRequest } from 'next/server';
import { prisma } from '@/lib/database';
import { GET } from '@/app/api/menu/[restaurantId]/route';

jest.mock('@/lib/database', () => ({
  prisma: {
    menuCategory: {
      findMany: jest.fn(),
    },
  },
}));

jest.mock('@/lib/cache/menu-cache', () => ({
  getCachedPublicMenu: jest.fn(
    async (_restaurantId: string, load: () => Promise<unknown>) => load()
  ),
}));

const restaurantId = '550e8400-e29b-41d4-a716-446655440001';

function category() {
  return {
    id: 'cat-1',
    name: 'Mains',
    description: null,
    displayOrder: 0,
    isActive: true,
    menuItems: [
      {
        id: 'item-1',
        name: 'Chicken Rice',
        description: null,
        price: { toString: () => '12.00' },
        imageUrl: null,
        preparationTime: 10,
        calories: null,
        allergens: [],
        dietaryInfo: [],
        isAvailable: true,
        isFeatured: false,
        displayOrder: 0,
        variationGroups: [],
      },
    ],
  };
}

describe('public menu availability filtering', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (prisma.menuCategory.findMany as jest.Mock).mockResolvedValue([category()]);
  });

  it('queries only available active items and returns no-store', async () => {
    const response = await GET(
      new NextRequest(`http://localhost/api/menu/${restaurantId}`),
      { params: Promise.resolve({ restaurantId }) }
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(prisma.menuCategory.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { restaurantId, status: 'ACTIVE' },
        include: expect.objectContaining({
          menuItems: expect.objectContaining({
            where: { status: 'ACTIVE', isAvailable: true },
          }),
        }),
      })
    );
    expect(json.menu[0].menuItems[0]).toMatchObject({
      id: 'item-1',
      isAvailable: true,
    });
  });

  it('returns 404 when every category is empty after filtering', async () => {
    (prisma.menuCategory.findMany as jest.Mock).mockResolvedValue([
      { ...category(), menuItems: [] },
    ]);

    const response = await GET(
      new NextRequest(`http://localhost/api/menu/${restaurantId}`),
      { params: Promise.resolve({ restaurantId }) }
    );

    expect(response.status).toBe(404);
  });
});
