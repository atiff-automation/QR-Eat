import { NextRequest } from 'next/server';
import { getTenantContext } from '@/lib/tenant-context';
import { authenticateDevice } from '@/lib/device-auth';
import { resolveKitchenActor } from '@/lib/kitchen-actor';

jest.mock('@/lib/tenant-context', () => ({
  getTenantContext: jest.fn(),
}));

jest.mock('@/lib/auth-utils', () => ({
  getTokenFromRequest: jest.fn(() => 'token'),
}));

jest.mock('@/lib/device-auth', () => ({
  authenticateDevice: jest.fn(),
}));

function request() {
  return new NextRequest('http://localhost/api/orders/order-1/ready', {
    method: 'POST',
    headers: { authorization: 'Bearer token' },
  });
}

describe('resolveKitchenActor', () => {
  beforeEach(() => {
    (getTenantContext as jest.Mock).mockResolvedValue(null);
    (authenticateDevice as jest.Mock).mockResolvedValue({
      ok: false,
      status: 401,
      error: 'Invalid device token',
    });
  });

  it('resolves a live station device as the kitchen actor', async () => {
    (authenticateDevice as jest.Mock).mockResolvedValue({
      ok: true,
      device: {
        id: 'device-1',
        restaurantId: 'restaurant-1',
        stationId: 'station-1',
        name: 'Grill Station',
        isActive: true,
      },
      station: { id: 'station-1', name: 'Grill', isActive: true },
      restaurant: { id: 'restaurant-1', isActive: true },
    });

    const actor = await resolveKitchenActor(request());

    expect(actor).toEqual({
      restaurantId: 'restaurant-1',
      actorType: 'station',
      actorId: 'device-1',
      actorName: 'Grill Station',
      canRecall: true,
      isManager: false,
      deviceId: 'device-1',
      stationId: 'station-1',
    });
  });

  it('rejects a revoked or invalid station device', async () => {
    const actor = await resolveKitchenActor(request());
    expect(actor).toBeNull();
  });

  it('keeps the web/RBAC actor path', async () => {
    (getTenantContext as jest.Mock).mockResolvedValue({
      userId: 'manager-1',
      userType: 'staff',
      roleTemplate: 'manager',
      isAdmin: false,
      restaurantId: 'restaurant-1',
      permissions: {},
    });

    const actor = await resolveKitchenActor(request());

    expect(actor).toMatchObject({
      restaurantId: 'restaurant-1',
      actorType: 'web',
      actorId: 'manager-1',
      isManager: true,
      canRecall: true,
    });
    expect(authenticateDevice).not.toHaveBeenCalled();
  });
});
