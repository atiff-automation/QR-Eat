import { NextRequest } from 'next/server';
import {
  getTenantContext,
  requireAuth,
  requirePermission,
} from '@/lib/tenant-context';
import { requireRestaurantAccess } from '@/lib/rbac/resource-auth';
import { prisma } from '@/lib/database';
import { DELETE as deleteRestaurant } from '@/app/api/restaurants/[id]/route';

jest.mock('@/lib/tenant-context', () => ({
  getTenantContext: jest.fn(),
  requireAuth: jest.fn(),
  requirePermission: jest.fn(),
}));

jest.mock('@/lib/rbac/resource-auth', () => ({
  requireRestaurantAccess: jest.fn(),
}));

jest.mock('@/lib/database', () => ({
  prisma: {
    restaurant: { findUnique: jest.fn(), delete: jest.fn() },
    order: { count: jest.fn() },
    paymentBatch: { count: jest.fn() },
    businessDay: { count: jest.fn() },
    customer: { count: jest.fn() },
    loyaltyVisit: { count: jest.fn() },
    orderDiscount: { count: jest.fn() },
  },
}));

const restaurantId = '550e8400-e29b-41d4-a716-446655440001';

const context = {
  userId: 'user-1',
  userType: 'restaurant_owner',
  roleTemplate: 'owner',
  email: 'owner@example.test',
  restaurantId,
  permissions: { restaurants: ['read', 'write'] },
  isAdmin: false,
  mustChangePassword: false,
};

const restaurant = { id: restaurantId, name: 'Kopi Corner' };

function request() {
  return new NextRequest(`http://localhost/api/restaurants/${restaurantId}`, {
    method: 'DELETE',
  });
}

function params() {
  return { params: Promise.resolve({ id: restaurantId }) };
}

function setHistory(history: Partial<Record<string, number>>) {
  const counts = {
    order: 0,
    paymentBatch: 0,
    businessDay: 0,
    customer: 0,
    loyaltyVisit: 0,
    orderDiscount: 0,
    ...history,
  };
  (prisma.order.count as jest.Mock).mockResolvedValue(counts.order);
  (prisma.paymentBatch.count as jest.Mock).mockResolvedValue(
    counts.paymentBatch
  );
  (prisma.businessDay.count as jest.Mock).mockResolvedValue(counts.businessDay);
  (prisma.customer.count as jest.Mock).mockResolvedValue(counts.customer);
  (prisma.loyaltyVisit.count as jest.Mock).mockResolvedValue(
    counts.loyaltyVisit
  );
  (prisma.orderDiscount.count as jest.Mock).mockResolvedValue(
    counts.orderDiscount
  );
}

describe('DELETE /api/restaurants/[id]', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getTenantContext as jest.Mock).mockResolvedValue(context);
    (requireAuth as jest.Mock).mockReturnValue(context);
    (requirePermission as jest.Mock).mockReturnValue(undefined);
    (requireRestaurantAccess as jest.Mock).mockResolvedValue(undefined);
    (prisma.restaurant.findUnique as jest.Mock).mockResolvedValue(restaurant);
    (prisma.restaurant.delete as jest.Mock).mockResolvedValue(restaurant);
    setHistory({});
  });

  it.each([
    ['order', { order: 1 }],
    ['paymentBatch', { paymentBatch: 1 }],
    ['businessDay', { businessDay: 1 }],
    ['customer', { customer: 1 }],
    ['loyaltyVisit', { loyaltyVisit: 1 }],
    ['orderDiscount', { orderDiscount: 1 }],
  ])('refuses to delete a restaurant with %s history', async (_label, h) => {
    setHistory(h);

    const response = await deleteRestaurant(request(), params());
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body).toMatchObject({
      success: false,
      code: 'RESTAURANT_HAS_HISTORY',
    });
    expect(body.error).toContain('7 years');
    expect(body.error).toContain('isActive');
    expect(prisma.restaurant.delete).not.toHaveBeenCalled();
  });

  it('returns the record counts with the conflict', async () => {
    setHistory({ order: 2, loyaltyVisit: 3 });

    const response = await deleteRestaurant(request(), params());
    const body = await response.json();

    expect(body.history).toEqual({
      orders: 2,
      paymentBatches: 0,
      businessDays: 0,
      customers: 0,
      loyaltyVisits: 3,
      orderDiscounts: 0,
    });
  });

  it('deletes a restaurant with no history', async () => {
    const response = await deleteRestaurant(request(), params());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(prisma.restaurant.delete).toHaveBeenCalledWith({
      where: { id: restaurantId },
    });
  });

  it('maps a foreign-key restriction the pre-check missed to the same 409', async () => {
    (prisma.restaurant.delete as jest.Mock).mockRejectedValue(
      Object.assign(new Error('Foreign key constraint failed'), {
        code: 'P2003',
      })
    );

    const response = await deleteRestaurant(request(), params());
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body).toMatchObject({
      success: false,
      code: 'RESTAURANT_HAS_HISTORY',
    });
  });

  it('still reports a 404 for an unknown restaurant', async () => {
    (prisma.restaurant.findUnique as jest.Mock).mockResolvedValue(null);

    const response = await deleteRestaurant(request(), params());

    expect(response.status).toBe(404);
    expect(prisma.order.count).not.toHaveBeenCalled();
  });
});
