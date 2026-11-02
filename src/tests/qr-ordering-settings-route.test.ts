import { NextRequest } from 'next/server';
import {
  getTenantContext,
  requireAuth,
  requirePermission,
} from '@/lib/tenant-context';
import { requireRestaurantAccess } from '@/lib/rbac/resource-auth';
import { prisma } from '@/lib/database';
import { PATCH as updateQrOrdering } from '@/app/api/settings/restaurant/qr-ordering/route';

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
    restaurant: { findUnique: jest.fn(), update: jest.fn() },
    auditLog: { create: jest.fn() },
  },
}));

const restaurantId = '550e8400-e29b-41d4-a716-446655440001';

const context = {
  userId: 'user-1',
  userType: 'restaurant_owner',
  email: 'owner@example.test',
  restaurantId,
  permissions: {},
  isAdmin: false,
  roleTemplate: 'restaurant_owner',
  mustChangePassword: false,
};

function request(body: unknown): NextRequest {
  return new NextRequest(
    'http://localhost/api/settings/restaurant/qr-ordering',
    {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }
  );
}

describe('QR ordering settings route', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getTenantContext as jest.Mock).mockResolvedValue(context);
    (requireAuth as jest.Mock).mockReturnValue(context);
    (requirePermission as jest.Mock).mockReturnValue(undefined);
    (requireRestaurantAccess as jest.Mock).mockResolvedValue(undefined);
    (prisma.restaurant.findUnique as jest.Mock).mockResolvedValue({
      qrOrderingPaused: false,
      qrOrderingPausedReason: null,
    });
    (prisma.restaurant.update as jest.Mock).mockImplementation(
      async ({ data }: { data: Record<string, unknown> }) => ({
        qrOrderingPaused: data.qrOrderingPaused,
        qrOrderingPausedAt: data.qrOrderingPausedAt,
        qrOrderingPausedBy: data.qrOrderingPausedBy,
        qrOrderingPausedReason: data.qrOrderingPausedReason,
      })
    );
    (prisma.auditLog.create as jest.Mock).mockResolvedValue({});
  });

  it('pauses QR ordering with the owner identity and reason', async () => {
    const response = await updateQrOrdering(
      request({ paused: true, reason: 'Internet maintenance' })
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.success).toBe(true);
    expect(prisma.restaurant.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          qrOrderingPaused: true,
          qrOrderingPausedBy: context.userId,
          qrOrderingPausedReason: 'Internet maintenance',
        }),
      })
    );
    expect(prisma.auditLog.create).toHaveBeenCalled();
  });

  it('resumes QR ordering and clears the pause metadata', async () => {
    (prisma.restaurant.findUnique as jest.Mock).mockResolvedValue({
      qrOrderingPaused: true,
      qrOrderingPausedReason: 'Internet maintenance',
    });

    const response = await updateQrOrdering(request({ paused: false }));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.success).toBe(true);
    expect(prisma.restaurant.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          qrOrderingPaused: false,
          qrOrderingPausedAt: null,
          qrOrderingPausedBy: null,
          qrOrderingPausedReason: null,
        },
      })
    );
  });

  it('rejects an invalid body', async () => {
    const response = await updateQrOrdering(
      request({ paused: 'not-a-boolean' })
    );

    expect(response.status).toBe(400);
  });
});
