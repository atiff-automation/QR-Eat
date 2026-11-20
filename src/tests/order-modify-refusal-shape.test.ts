import { NextRequest } from 'next/server';
import {
  getTenantContext,
  requireAuth,
  requirePermission,
} from '@/lib/tenant-context';
import { requireOrderAccess } from '@/lib/rbac/resource-auth';
import { RBACError } from '@/lib/rbac/types';
import { prisma } from '@/lib/database';
import { PATCH as modifyOrderRoute } from '@/app/api/orders/[id]/modify/route';

jest.mock('@/lib/tenant-context', () => ({
  getTenantContext: jest.fn(),
  requireAuth: jest.fn(),
  requirePermission: jest.fn(),
}));

jest.mock('@/lib/rbac/resource-auth', () => ({
  requireOrderAccess: jest.fn(),
}));

jest.mock('@/lib/database', () => ({
  prisma: { $transaction: jest.fn() },
}));

jest.mock('@/lib/services/loyalty-order-modify-service', () => ({
  acquireOrderModificationLocks: jest.fn(),
  reapplyPromotionForModifiedOrder: jest.fn(),
}));

const orderId = '550e8400-e29b-41d4-a716-446655440010';

const context = {
  userId: 'counter-1',
  userType: 'staff',
  roleTemplate: 'cashier',
  restaurantId: 'restaurant-1',
  email: 'cashier@example.test',
  permissions: { orders: ['read', 'write'] },
  isAdmin: false,
  mustChangePassword: false,
};

const NOT_FOUND = {
  success: false,
  error: 'Order not found',
  code: 'ORDER_NOT_FOUND',
};

function request(body: unknown = {}) {
  return new NextRequest(`http://localhost/api/orders/${orderId}/modify`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function params() {
  return { params: Promise.resolve({ id: orderId }) };
}

describe('PATCH /api/orders/{id}/modify refusal shape', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getTenantContext as jest.Mock).mockResolvedValue(context);
    (requireAuth as jest.Mock).mockReturnValue(context);
    (requirePermission as jest.Mock).mockReturnValue(undefined);
    (requireOrderAccess as jest.Mock).mockResolvedValue(undefined);
  });

  it('returns the same 404 ORDER_NOT_FOUND body for a foreign and a missing order', async () => {
    (requireOrderAccess as jest.Mock).mockRejectedValueOnce(
      new RBACError(
        'Access denied: Order belongs to another restaurant',
        'FORBIDDEN',
        403
      )
    );
    const foreign = await modifyOrderRoute(request(), params());

    (requireOrderAccess as jest.Mock).mockRejectedValueOnce(
      new RBACError('Order not found', 'NOT_FOUND', 404)
    );
    const missing = await modifyOrderRoute(request(), params());

    const foreignBody = await foreign.json();
    const missingBody = await missing.json();

    expect(foreign.status).toBe(404);
    expect(missing.status).toBe(404);
    expect(foreignBody).toEqual(NOT_FOUND);
    expect(missingBody).toEqual(foreignBody);
    expect(foreignBody.order).toBeUndefined();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('keeps a permission denial at 403', async () => {
    (requirePermission as jest.Mock).mockImplementation(() => {
      throw new Error('Permission denied: write on orders');
    });

    const response = await modifyOrderRoute(request(), params());
    const json = await response.json();

    expect(response.status).toBe(403);
    expect(json.error).toBe('Permission denied: write on orders');
    expect(requireOrderAccess).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('keeps validation at 400 after the access check passes', async () => {
    const response = await modifyOrderRoute(request({}), params());
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.error).toBe('Invalid input');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('keeps a genuine unexpected failure at 500', async () => {
    (requireOrderAccess as jest.Mock).mockRejectedValue(
      new Error('database down')
    );

    const response = await modifyOrderRoute(request(), params());

    expect(response.status).toBe(500);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
