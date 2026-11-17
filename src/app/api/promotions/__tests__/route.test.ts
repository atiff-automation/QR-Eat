import { NextRequest } from 'next/server';
import {
  getTenantContext,
  requireAuth,
  requirePermission,
} from '@/lib/tenant-context';
import { requireRestaurantAccess } from '@/lib/rbac/resource-auth';
import {
  createPromotion,
  listPromotions,
} from '@/lib/services/loyalty-promotion-service';
import { OwnerIdempotencyMismatchError } from '@/lib/services/loyalty-owner-idempotency';
import { GET, POST } from '@/app/api/promotions/route';

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
    createPromotion: jest.fn(),
    listPromotions: jest.fn(),
  };
});

const restaurantId = '550e8400-e29b-41d4-a716-446655440001';
const categoryId = '11111111-1111-4111-8111-111111111111';

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
  id: 'promo-1',
  name: 'Lunch 20%',
  receiptLabel: 'Lunch 20%',
  type: 'PERCENT',
  value: '20.00',
  scope: 'CATEGORY',
  categoryIds: [categoryId],
  itemIds: [],
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

const validBody = {
  name: 'Lunch 20%',
  receiptLabel: 'Lunch 20%',
  type: 'PERCENT',
  value: '20.00',
  scope: 'CATEGORY',
  categoryIds: [categoryId],
  minSpend: '0.00',
  maxDiscount: '15.00',
  startsAt: '2026-11-01',
  endsAt: '2026-12-31',
};

function getRequest(query = ''): NextRequest {
  return new NextRequest(`http://localhost/api/promotions${query}`);
}

function postRequest(
  body: unknown,
  headers: Record<string, string> = {}
): NextRequest {
  return new NextRequest('http://localhost/api/promotions', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'idempotency-key': 'promo-key-1',
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

describe('promotions list/create route', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getTenantContext as jest.Mock).mockResolvedValue(context);
    (requireAuth as jest.Mock).mockReturnValue(context);
    (requirePermission as jest.Mock).mockReturnValue(undefined);
    (requireRestaurantAccess as jest.Mock).mockResolvedValue(undefined);
    (listPromotions as jest.Mock).mockResolvedValue([promotion]);
    (createPromotion as jest.Mock).mockResolvedValue({
      promotion,
      replayed: false,
      statusCode: 201,
    });
  });

  it('lists promotions with scope/status filters and promotions:manage', async () => {
    const response = await GET(getRequest('?scope=ITEM&status=active'));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(requirePermission).toHaveBeenCalledWith(
      context,
      'promotions',
      'manage'
    );
    expect(listPromotions).toHaveBeenCalledWith({
      restaurantId,
      filters: { scope: 'ITEM', status: 'active' },
    });
    expect(json).toEqual({ success: true, promotions: [promotion] });
  });

  it('creates a promotion with promotions:manage and an idempotency key', async () => {
    const response = await POST(postRequest(validBody));
    const json = await response.json();

    expect(response.status).toBe(201);
    expect(createPromotion).toHaveBeenCalledWith({
      restaurantId,
      userId: 'user-1',
      userType: 'restaurant_owner',
      input: expect.objectContaining({
        name: 'Lunch 20%',
        scope: 'CATEGORY',
        categoryIds: [categoryId],
      }),
      idempotencyKey: 'promo-key-1',
    });
    expect(json).toEqual({ success: true, promotion });
  });

  it('requires an Idempotency-Key for POST', async () => {
    const response = await POST(
      postRequest(validBody, { 'idempotency-key': '' })
    );
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json).toMatchObject({
      success: false,
      code: 'IDEMPOTENCY_KEY_REQUIRED',
    });
    expect(createPromotion).not.toHaveBeenCalled();
  });

  it('rejects an invalid promotion body with PROMOTION_INVALID', async () => {
    const response = await POST(postRequest({ ...validBody, value: '101.00' }));
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json).toMatchObject({
      success: false,
      code: 'PROMOTION_INVALID',
    });
    expect(createPromotion).not.toHaveBeenCalled();
  });

  it('returns 403 when the caller lacks promotions:manage', async () => {
    (requirePermission as jest.Mock).mockImplementationOnce(() => {
      throw new Error('Permission denied: manage on promotions');
    });

    const response = await POST(postRequest(validBody));
    const json = await response.json();

    expect(response.status).toBe(403);
    expect(json).toMatchObject({
      success: false,
      code: 'PERMISSION_DENIED',
    });
    expect(createPromotion).not.toHaveBeenCalled();
  });

  it('returns 403 on GET when the caller lacks promotions:manage', async () => {
    (requirePermission as jest.Mock).mockImplementationOnce(() => {
      throw new Error('Permission denied: manage on promotions');
    });

    const response = await GET(getRequest());
    const json = await response.json();

    expect(response.status).toBe(403);
    expect(json).toMatchObject({
      success: false,
      code: 'PERMISSION_DENIED',
    });
    expect(listPromotions).not.toHaveBeenCalled();
  });

  it('marks a replayed create with the Idempotent-Replay header', async () => {
    (createPromotion as jest.Mock).mockResolvedValue({
      promotion,
      replayed: true,
      statusCode: 201,
    });

    const response = await POST(postRequest(validBody));

    expect(response.headers.get('Idempotent-Replay')).toBe('true');
  });

  it('returns 409 when a key is reused with a different body', async () => {
    (createPromotion as jest.Mock).mockRejectedValue(
      new OwnerIdempotencyMismatchError()
    );

    const response = await POST(postRequest(validBody));
    const json = await response.json();

    expect(response.status).toBe(409);
    expect(json).toMatchObject({
      success: false,
      code: 'IDEMPOTENCY_MISMATCH',
    });
  });
});
