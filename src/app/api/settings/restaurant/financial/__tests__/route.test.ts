import { NextRequest } from 'next/server';
import {
  getTenantContext,
  requireAuth,
  requirePermission,
} from '@/lib/tenant-context';
import { requireRestaurantAccess } from '@/lib/rbac/resource-auth';
import { prisma } from '@/lib/database';
import { PUT } from '@/app/api/settings/restaurant/financial/route';

jest.mock('@/lib/database', () => ({
  prisma: { restaurant: { update: jest.fn() } },
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

const prismaMock = prisma as unknown as {
  restaurant: { update: jest.Mock };
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

function request(): NextRequest {
  return new NextRequest('http://localhost/api/settings/restaurant/financial', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      currency: 'MYR',
      taxRate: 0.08,
      serviceChargeRate: 0.1,
      taxLabel: 'Tax',
      serviceChargeLabel: 'Service Charge',
    }),
  });
}

describe('PUT /api/settings/restaurant/financial', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (requireAuth as jest.Mock).mockReturnValue(undefined);
    (requirePermission as jest.Mock).mockReturnValue(undefined);
    (requireRestaurantAccess as jest.Mock).mockResolvedValue(undefined);
    prismaMock.restaurant.update.mockResolvedValue({
      id: restaurantId,
      currency: 'MYR',
      taxRate: 0.08,
      serviceChargeRate: 0.1,
      taxLabel: 'Tax',
      serviceChargeLabel: 'Service Charge',
      updatedAt: new Date('2026-11-16T00:00:00.000Z'),
    });
  });

  it('refuses a manager who holds settings:write (S-1)', async () => {
    (getTenantContext as jest.Mock).mockResolvedValue(contextFor('staff'));

    const response = await PUT(request());
    const json = await response.json();

    expect(response.status).toBe(403);
    expect(json).toMatchObject({
      success: false,
      code: 'PERMISSION_DENIED',
    });
    expect(prismaMock.restaurant.update).not.toHaveBeenCalled();
  });

  it('allows the restaurant owner to change tax', async () => {
    (getTenantContext as jest.Mock).mockResolvedValue(
      contextFor('restaurant_owner')
    );

    const response = await PUT(request());
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.success).toBe(true);
    expect(requirePermission).toHaveBeenCalledWith(
      expect.objectContaining({ userType: 'restaurant_owner' }),
      'settings',
      'write'
    );
    expect(prismaMock.restaurant.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: restaurantId },
        data: {
          currency: 'MYR',
          taxRate: 0.08,
          serviceChargeRate: 0.1,
          taxLabel: 'Tax',
          serviceChargeLabel: 'Service Charge',
        },
      })
    );
  });
});
