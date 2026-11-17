import { NextRequest } from 'next/server';
import {
  getTenantContext,
  requireAuth,
  requirePermission,
} from '@/lib/tenant-context';
import { requireRestaurantAccess } from '@/lib/rbac/resource-auth';
import { prisma } from '@/lib/database';
import { revalidateTag } from 'next/cache';
import { PUT } from '@/app/api/settings/restaurant/route';

jest.mock('@/lib/database', () => ({
  prisma: { restaurant: { update: jest.fn(), findUnique: jest.fn() } },
}));
jest.mock('@/lib/tenant-context', () => ({
  getTenantContext: jest.fn(),
  requireAuth: jest.fn(),
  requirePermission: jest.fn(),
  UserType: {
    PLATFORM_ADMIN: 'platform_admin',
    RESTAURANT_OWNER: 'restaurant_owner',
    STAFF: 'staff',
  },
}));
jest.mock('@/lib/rbac/resource-auth', () => ({
  requireRestaurantAccess: jest.fn(),
}));
jest.mock('next/cache', () => ({ revalidateTag: jest.fn() }));

const prismaMock = prisma as unknown as {
  restaurant: { update: jest.Mock; findUnique: jest.Mock };
};

const restaurantId = '550e8400-e29b-41d4-a716-446655440001';

function contextFor(userType: 'restaurant_owner' | 'staff') {
  return {
    userId: userType === 'staff' ? 'manager-1' : 'owner-1',
    userType,
    email: `${userType}@example.test`,
    restaurantId,
    permissions: { settings: ['read', 'write'] },
    isAdmin: false,
    mustChangePassword: false,
  };
}

function request(body: Record<string, unknown>): NextRequest {
  return new NextRequest('http://localhost/api/settings/restaurant', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('PUT /api/settings/restaurant — financial owner-only guard (H-1)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (requireAuth as jest.Mock).mockReturnValue(undefined);
    (requirePermission as jest.Mock).mockReturnValue(undefined);
    (requireRestaurantAccess as jest.Mock).mockResolvedValue(undefined);
    prismaMock.restaurant.update.mockResolvedValue({
      id: restaurantId,
      name: 'Test Restaurant',
      taxRate: 0.08,
    });
    prismaMock.restaurant.findUnique.mockResolvedValue({
      slug: 'test-restaurant',
    });
  });

  it('refuses a manager who sends taxRate and writes nothing', async () => {
    (getTenantContext as jest.Mock).mockResolvedValue(contextFor('staff'));

    const response = await PUT(request({ taxRate: 0.08 }));
    const json = await response.json();

    expect(response.status).toBe(403);
    expect(json).toMatchObject({
      success: false,
      code: 'PERMISSION_DENIED',
    });
    expect(prismaMock.restaurant.update).not.toHaveBeenCalled();
    expect(revalidateTag).not.toHaveBeenCalled();
  });

  it('still allows a manager to change a non-financial setting', async () => {
    (getTenantContext as jest.Mock).mockResolvedValue(contextFor('staff'));

    const response = await PUT(request({ name: 'Renamed Restaurant' }));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.success).toBe(true);
    expect(prismaMock.restaurant.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: restaurantId },
        data: expect.objectContaining({ name: 'Renamed Restaurant' }),
      })
    );
  });

  it('allows the owner to change taxRate', async () => {
    (getTenantContext as jest.Mock).mockResolvedValue(
      contextFor('restaurant_owner')
    );

    const response = await PUT(request({ taxRate: 0.08 }));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.success).toBe(true);
    expect(prismaMock.restaurant.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: restaurantId },
        data: expect.objectContaining({ taxRate: 0.08 }),
      })
    );
  });
});
