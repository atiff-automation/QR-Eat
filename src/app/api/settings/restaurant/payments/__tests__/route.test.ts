import { NextRequest } from 'next/server';
import {
  getTenantContext,
  requireAuth,
  requirePermission,
} from '@/lib/tenant-context';
import { requireRestaurantAccess } from '@/lib/rbac/resource-auth';
import { prisma } from '@/lib/database';
import { stableRequestHash } from '@/lib/services/loyalty-owner-idempotency';
import { GET, PUT } from '@/app/api/settings/restaurant/payments/route';

jest.mock('@/lib/database', () => ({
  prisma: {
    restaurant: { findUnique: jest.fn(), update: jest.fn() },
    orderActionReceipt: { findUnique: jest.fn(), delete: jest.fn() },
    $transaction: jest.fn(),
  },
}));
jest.mock('@/lib/tenant-context', () => ({
  getTenantContext: jest.fn(),
  requireAuth: jest.fn(),
  requirePermission: jest.fn(),
}));
jest.mock('@/lib/rbac/resource-auth', () => ({
  requireRestaurantAccess: jest.fn(),
}));

const prismaMock = prisma as unknown as {
  restaurant: { findUnique: jest.Mock; update: jest.Mock };
  orderActionReceipt: { findUnique: jest.Mock; delete: jest.Mock };
  $transaction: jest.Mock;
};

const restaurantId = '550e8400-e29b-41d4-a716-446655440001';
const updatedAt = new Date('2026-11-13T00:00:00.000Z');

const context = {
  userId: 'user-1',
  userType: 'restaurant_owner',
  email: 'owner@example.test',
  restaurantId,
  permissions: { settings: ['read', 'write'] },
  isAdmin: false,
  mustChangePassword: false,
};

const paymentMethods = { cash: true, card: true, ewallet: true };

const tx = {
  restaurant: { findUnique: jest.fn(), update: jest.fn() },
  auditLog: { create: jest.fn() },
  orderActionReceipt: { create: jest.fn(), update: jest.fn() },
};

function request(
  method: 'GET' | 'PUT',
  body?: unknown,
  headers: Record<string, string> = {}
): NextRequest {
  return new NextRequest('http://localhost/api/settings/restaurant/payments', {
    method,
    headers: { 'content-type': 'application/json', ...headers },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

function updatedBody(cashRounding = 'NEAREST_5_SEN') {
  return {
    success: true,
    message: 'Payment settings updated successfully',
    restaurant: {
      id: restaurantId,
      paymentMethods,
      cashRounding,
      businessDayCloseTime: '04:00',
      updatedAt: updatedAt.toISOString(),
    },
  };
}

describe('payment settings route', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getTenantContext as jest.Mock).mockResolvedValue(context);
    (requireAuth as jest.Mock).mockReturnValue(context);
    (requirePermission as jest.Mock).mockReturnValue(undefined);
    (requireRestaurantAccess as jest.Mock).mockResolvedValue(undefined);

    prismaMock.restaurant.findUnique.mockResolvedValue({
      id: restaurantId,
      paymentMethods,
      cashRounding: null,
      businessDayCloseTime: '04:00',
      updatedAt,
    });
    prismaMock.restaurant.update.mockResolvedValue({
      id: restaurantId,
      paymentMethods,
      cashRounding: 'NEAREST_5_SEN',
      businessDayCloseTime: '04:00',
      updatedAt,
    });
    prismaMock.orderActionReceipt.findUnique.mockResolvedValue(null);
    prismaMock.orderActionReceipt.delete.mockResolvedValue({});
    prismaMock.$transaction = jest.fn(
      async (callback: (client: unknown) => unknown) => callback(tx)
    );

    tx.restaurant.findUnique.mockResolvedValue({
      paymentMethods,
      cashRounding: null,
    });
    tx.restaurant.update.mockResolvedValue({
      id: restaurantId,
      paymentMethods,
      cashRounding: 'NEAREST_5_SEN',
      businessDayCloseTime: '04:00',
      updatedAt,
    });
    tx.auditLog.create.mockResolvedValue({});
    tx.orderActionReceipt.create.mockResolvedValue({});
    tx.orderActionReceipt.update.mockResolvedValue({});
  });

  it('returns cashRounding as NONE for a null pre-migration row', async () => {
    const response = await GET(request('GET'));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.restaurant).toMatchObject({
      cashRounding: 'NONE',
      businessDayCloseTime: '04:00',
    });
    expect(requirePermission).toHaveBeenCalledWith(context, 'settings', 'read');
  });

  it('updates cashRounding independently of payment methods', async () => {
    const response = await PUT(
      request('PUT', { cashRounding: 'NEAREST_5_SEN' })
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(requirePermission).toHaveBeenCalledWith(
      context,
      'settings',
      'write'
    );
    expect(tx.restaurant.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: restaurantId },
        data: { cashRounding: 'NEAREST_5_SEN' },
      })
    );
    expect(json.restaurant.cashRounding).toBe('NEAREST_5_SEN');
  });

  it('keeps the existing payment-method update shape', async () => {
    await PUT(request('PUT', { paymentMethods }));

    expect(tx.restaurant.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { paymentMethods },
      })
    );
  });

  it('writes an audit row in the same transaction as the update', async () => {
    await PUT(request('PUT', { cashRounding: 'NEAREST_5_SEN' }));

    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tableName: 'restaurants',
        recordId: restaurantId,
        operation: 'UPDATE',
        changedBy: 'user-1',
        changedByType: 'restaurant_owner',
        restaurantId,
        category: 'payments',
        oldValues: {
          paymentMethods,
          cashRounding: 'NONE',
        },
        newValues: {
          paymentMethods,
          cashRounding: 'NEAREST_5_SEN',
        },
      }),
    });
  });

  it('replays the stored response for the same key and body', async () => {
    const requestHash = stableRequestHash({
      restaurantId,
      paymentMethods: null,
      cashRounding: 'NEAREST_5_SEN',
    });
    prismaMock.orderActionReceipt.findUnique.mockResolvedValue({
      id: 'receipt-1',
      createdAt: new Date(),
      response: {
        requestHash,
        statusCode: 200,
        body: updatedBody(),
      },
    });

    const response = await PUT(
      request(
        'PUT',
        { cashRounding: 'NEAREST_5_SEN' },
        {
          'idempotency-key': 'pay-key-1',
        }
      )
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get('Idempotent-Replay')).toBe('true');
    expect(json).toEqual(updatedBody());
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it('returns 409 when a key is reused with a different body', async () => {
    prismaMock.orderActionReceipt.findUnique.mockResolvedValue({
      id: 'receipt-2',
      createdAt: new Date(),
      response: {
        requestHash: 'different-hash',
        statusCode: 200,
        body: updatedBody(),
      },
    });

    const response = await PUT(
      request(
        'PUT',
        { cashRounding: 'NEAREST_5_SEN' },
        {
          'idempotency-key': 'pay-key-2',
        }
      )
    );
    const json = await response.json();

    expect(response.status).toBe(409);
    expect(json).toMatchObject({
      success: false,
      code: 'IDEMPOTENCY_MISMATCH',
    });
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it('records a receipt for a first keyed update', async () => {
    const response = await PUT(
      request(
        'PUT',
        { cashRounding: 'NEAREST_5_SEN' },
        {
          'idempotency-key': 'pay-key-3',
        }
      )
    );

    expect(response.status).toBe(200);
    expect(tx.orderActionReceipt.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          restaurantId,
          action: 'settings.payments.update',
          idempotencyKey: 'pay-key-3',
        }),
      })
    );
    expect(tx.orderActionReceipt.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ statusCode: 200 }),
      })
    );
  });

  it('rejects an unknown cashRounding value', async () => {
    const response = await PUT(request('PUT', { cashRounding: 'ROUND_UP' }));
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json).toMatchObject({ success: false, code: 'INVALID_REQUEST' });
    expect(tx.restaurant.update).not.toHaveBeenCalled();
  });

  it('keeps the legacy 500 body for unexpected failures', async () => {
    tx.restaurant.findUnique.mockRejectedValueOnce(new Error('boom'));

    const response = await PUT(
      request('PUT', { cashRounding: 'NEAREST_5_SEN' })
    );
    const json = await response.json();

    expect(response.status).toBe(500);
    expect(json).toEqual({ error: 'Internal server error' });
  });

  it('returns 403 when the caller lacks settings:write', async () => {
    (requirePermission as jest.Mock).mockImplementationOnce(() => {
      throw new Error('Permission denied: write on settings');
    });

    const response = await PUT(
      request('PUT', { cashRounding: 'NEAREST_5_SEN' })
    );
    const json = await response.json();

    expect(response.status).toBe(403);
    expect(json).toMatchObject({
      success: false,
      code: 'PERMISSION_DENIED',
    });
    expect(tx.restaurant.update).not.toHaveBeenCalled();
  });

  it('returns 403 when the caller lacks settings:read', async () => {
    (requirePermission as jest.Mock).mockImplementationOnce(() => {
      throw new Error('Permission denied: read on settings');
    });

    const response = await GET(request('GET'));
    const json = await response.json();

    expect(response.status).toBe(403);
    expect(json).toMatchObject({
      success: false,
      code: 'PERMISSION_DENIED',
    });
    expect(prismaMock.restaurant.findUnique).not.toHaveBeenCalled();
  });
});
