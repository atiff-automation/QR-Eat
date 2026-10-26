import { NextRequest } from 'next/server';
import { getTenantContext, requirePermission } from '@/lib/tenant-context';
import { AuthServiceV2 } from '@/lib/rbac/auth-service';
import { setMenuItemAvailability } from '@/lib/services/menu-availability-service';
import { PATCH as counterPatch } from '@/app/api/counter/menu/items/[itemId]/availability/route';
import { PATCH as webPatch } from '@/app/api/admin/menu/items/[id]/availability/route';

jest.mock('@/lib/tenant-context', () => ({
  getTenantContext: jest.fn(),
  requireAuth: jest.fn(),
  requirePermission: jest.fn(),
}));

jest.mock('@/lib/counter/access', () => ({
  counterAccessDenied: jest.fn(() => null),
}));

jest.mock('@/lib/rbac/auth-service', () => ({
  AuthServiceV2: {
    validateToken: jest.fn(),
  },
}));

jest.mock('@/lib/services/menu-availability-service', () => ({
  MenuAvailabilityError: class MenuAvailabilityError extends Error {
    constructor(
      message: string,
      public code: string,
      public statusCode: number
    ) {
      super(message);
    }
  },
  setMenuItemAvailability: jest.fn(),
}));

const context = {
  userId: 'user-1',
  userType: 'staff',
  restaurantId: 'restaurant-1',
  email: 'cashier@example.com',
};

const updated = {
  id: 'item-1',
  name: 'Chicken Rice',
  isAvailable: false,
  updatedAt: '2026-10-26T12:00:00.000Z',
  changed: true,
};

function counterRequest(body: unknown = { isAvailable: false }) {
  return new NextRequest(
    'http://localhost/api/counter/menu/items/item-1/availability',
    {
      method: 'PATCH',
      headers: {
        'content-type': 'application/json',
        'user-agent': 'Counter/1.4.2',
      },
      body: JSON.stringify(body),
    }
  );
}

function webRequest(body: unknown = { isAvailable: false }) {
  return new NextRequest(
    'http://localhost/api/admin/menu/items/item-1/availability',
    {
      method: 'PATCH',
      headers: {
        'content-type': 'application/json',
        cookie: 'qr_rbac_token=test-token',
        'user-agent': 'Browser',
      },
      body: JSON.stringify(body),
    }
  );
}

describe('menu availability routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getTenantContext as jest.Mock).mockResolvedValue(context);
    (setMenuItemAvailability as jest.Mock).mockResolvedValue(updated);
    (AuthServiceV2.validateToken as jest.Mock).mockResolvedValue({
      isValid: true,
      user: {
        id: 'owner-1',
        userType: 'restaurant_owner',
        permissions: ['menu:availability'],
        currentRole: { restaurantId: 'restaurant-1' },
      },
    });
  });

  it('allows a Counter request with menu:availability', async () => {
    const response = await counterPatch(counterRequest(), {
      params: Promise.resolve({ itemId: 'item-1' }),
    });
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toEqual({ success: true, item: updated });
    expect(requirePermission).toHaveBeenCalledWith(
      context,
      'menu',
      'availability'
    );
    expect(setMenuItemAvailability).toHaveBeenCalledWith(
      expect.objectContaining({
        restaurantId: 'restaurant-1',
        itemId: 'item-1',
        isAvailable: false,
        source: 'COUNTER',
        actor: { userId: 'user-1', userType: 'staff' },
      })
    );
  });

  it('rejects malformed Counter availability data', async () => {
    const response = await counterPatch(counterRequest({ isAvailable: 'no' }), {
      params: Promise.resolve({ itemId: 'item-1' }),
    });

    expect(response.status).toBe(400);
    expect(setMenuItemAvailability).not.toHaveBeenCalled();
  });

  it('rejects a Counter role without menu:availability', async () => {
    (requirePermission as jest.Mock).mockImplementationOnce(() => {
      throw new Error('Permission denied: availability on menu');
    });

    const response = await counterPatch(counterRequest(), {
      params: Promise.resolve({ itemId: 'item-1' }),
    });

    expect(response.status).toBe(403);
    expect(setMenuItemAvailability).not.toHaveBeenCalled();
  });

  it('allows a website request with menu:availability', async () => {
    const response = await webPatch(webRequest(), {
      params: Promise.resolve({ id: 'item-1' }),
    });
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toEqual({ success: true, item: updated });
    expect(setMenuItemAvailability).toHaveBeenCalledWith(
      expect.objectContaining({
        restaurantId: 'restaurant-1',
        itemId: 'item-1',
        isAvailable: false,
        source: 'WEB',
        actor: { userId: 'owner-1', userType: 'restaurant_owner' },
      })
    );
  });

  it('rejects a website user without menu:availability', async () => {
    (AuthServiceV2.validateToken as jest.Mock).mockResolvedValue({
      isValid: true,
      user: {
        id: 'waiter-1',
        userType: 'staff',
        permissions: ['menu:read'],
        currentRole: { restaurantId: 'restaurant-1' },
      },
    });

    const response = await webPatch(webRequest(), {
      params: Promise.resolve({ id: 'item-1' }),
    });

    expect(response.status).toBe(403);
    expect(setMenuItemAvailability).not.toHaveBeenCalled();
  });
});
