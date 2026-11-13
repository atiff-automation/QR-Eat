import { NextRequest } from 'next/server';
import {
  getTenantContext,
  requireAuth,
  requirePermission,
} from '@/lib/tenant-context';
import { requireRestaurantAccess } from '@/lib/rbac/resource-auth';
import {
  deletePromotion,
  updatePromotion,
  PromotionNotFoundError,
} from '@/lib/services/loyalty-promotion-service';
import { OwnerIdempotencyMismatchError } from '@/lib/services/loyalty-owner-idempotency';
import { DELETE, PATCH } from '@/app/api/promotions/[id]/route';

jest.mock('@/lib/database', () => ({ prisma: {} }));
jest.mock('@/lib/tenant-context', () => ({
  getTenantContext: jest.fn(),
  requireAuth: jest.fn(),
  requirePermission: jest.fn(),
}));
jest.mock('@/lib/rbac/resource-auth', () => ({
  requireRestaurantAccess: jest.fn(),
}));
jest.mock('@/lib/services/loyalty-promotion-service', () => {
  const actual = jest.requireActual('@/lib/services/loyalty-promotion-service');
  return {
    ...actual,
    updatePromotion: jest.fn(),
    deletePromotion: jest.fn(),
  };
});

const restaurantId = '550e8400-e29b-41d4-a716-446655440001';
const promotionId = '44444444-4444-4444-8444-444444444444';
const itemId = '22222222-2222-4222-8222-222222222222';

const context = {
  userId: 'user-1',
  userType: 'restaurant_owner',
  email: 'owner@example.test',
  restaurantId,
  permissions: { promotions: ['manage'] },
  isAdmin: false,
  mustChangePassword: false,
};

const promotion = {
  id: promotionId,
  name: 'Lunch 20%',
  receiptLabel: 'Lunch 20%',
  type: 'ITEM',
  value: '20.00',
  scope: 'ITEM',
  categoryIds: [],
  itemIds: [itemId],
  minSpend: '0.00',
  maxDiscount: '15.00',
  startsAt: '2026-11-01T00:00:00.000Z',
  endsAt: '2026-12-31T23:59:59.999Z',
  isActive: true,
  deletedAt: null,
  createdBy: 'user-1',
  updatedBy: 'user-1',
  createdAt: '2026-11-01T00:00:00.000Z',
  updatedAt: '2026-11-01T00:00:00.000Z',
};

function request(
  method: 'PATCH' | 'DELETE',
  body?: unknown,
  headers: Record<string, string> = {}
): NextRequest {
  return new NextRequest(`http://localhost/api/promotions/${promotionId}`, {
    method,
    headers: {
      'content-type': 'application/json',
      'idempotency-key': 'promo-id-key-1',
      ...headers,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

const params = { params: Promise.resolve({ id: promotionId }) };

describe('promotion detail route', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getTenantContext as jest.Mock).mockResolvedValue(context);
    (requireAuth as jest.Mock).mockReturnValue(context);
    (requirePermission as jest.Mock).mockReturnValue(undefined);
    (requireRestaurantAccess as jest.Mock).mockResolvedValue(undefined);
    (updatePromotion as jest.Mock).mockResolvedValue({
      promotion,
      replayed: false,
      statusCode: 200,
    });
    (deletePromotion as jest.Mock).mockResolvedValue({
      promotion: {
        ...promotion,
        isActive: false,
        deletedAt: '2026-11-13T00:00:00.000Z',
      },
      replayed: false,
      statusCode: 200,
    });
  });

  it('patches a promotion with promotions:manage and an idempotency key', async () => {
    const response = await PATCH(
      request('PATCH', { itemIds: [itemId] }),
      params
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(requirePermission).toHaveBeenCalledWith(
      context,
      'promotions',
      'manage'
    );
    expect(updatePromotion).toHaveBeenCalledWith({
      restaurantId,
      promotionId,
      userId: 'user-1',
      userType: 'restaurant_owner',
      patch: { itemIds: [itemId] },
      idempotencyKey: 'promo-id-key-1',
    });
    expect(json).toEqual({ success: true, promotion });
  });

  it('soft-deletes a promotion with an idempotency key', async () => {
    const response = await DELETE(request('DELETE'), params);
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(deletePromotion).toHaveBeenCalledWith({
      restaurantId,
      promotionId,
      userId: 'user-1',
      userType: 'restaurant_owner',
      idempotencyKey: 'promo-id-key-1',
    });
    expect(json.promotion.deletedAt).toBe('2026-11-13T00:00:00.000Z');
  });

  it('requires an Idempotency-Key for DELETE', async () => {
    const response = await DELETE(
      request('DELETE', undefined, { 'idempotency-key': '' }),
      params
    );
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json).toMatchObject({
      success: false,
      code: 'IDEMPOTENCY_KEY_REQUIRED',
    });
    expect(deletePromotion).not.toHaveBeenCalled();
  });

  it('returns 403 when the caller lacks promotions:manage', async () => {
    (requirePermission as jest.Mock).mockImplementationOnce(() => {
      throw new Error('Permission denied: manage on promotions');
    });

    const response = await PATCH(request('PATCH', { isActive: false }), params);
    const json = await response.json();

    expect(response.status).toBe(403);
    expect(json).toMatchObject({
      success: false,
      code: 'PERMISSION_DENIED',
    });
    expect(updatePromotion).not.toHaveBeenCalled();
  });

  it('returns 404 for a promotion outside the tenant', async () => {
    (updatePromotion as jest.Mock).mockRejectedValue(
      new PromotionNotFoundError()
    );

    const response = await PATCH(request('PATCH', { isActive: false }), params);
    const json = await response.json();

    expect(response.status).toBe(404);
    expect(json).toMatchObject({
      success: false,
      code: 'NOT_FOUND',
    });
  });

  it('returns 409 when a key is reused with a different body', async () => {
    (updatePromotion as jest.Mock).mockRejectedValue(
      new OwnerIdempotencyMismatchError()
    );

    const response = await PATCH(request('PATCH', { isActive: false }), params);
    const json = await response.json();

    expect(response.status).toBe(409);
    expect(json).toMatchObject({
      success: false,
      code: 'IDEMPOTENCY_MISMATCH',
    });
  });
});
