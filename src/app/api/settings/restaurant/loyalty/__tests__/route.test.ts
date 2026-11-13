import { NextRequest } from 'next/server';
import {
  getTenantContext,
  requireAuth,
  requirePermission,
} from '@/lib/tenant-context';
import { requireRestaurantAccess } from '@/lib/rbac/resource-auth';
import {
  getLoyaltySettings,
  updateLoyaltySettings,
} from '@/lib/services/loyalty-settings-service';
import { OwnerIdempotencyMismatchError } from '@/lib/services/loyalty-owner-idempotency';
import { GET, PATCH } from '@/app/api/settings/restaurant/loyalty/route';

jest.mock('@/lib/database', () => ({ prisma: {} }));
jest.mock('@/lib/tenant-context', () => ({
  getTenantContext: jest.fn(),
  requireAuth: jest.fn(),
  requirePermission: jest.fn(),
}));
jest.mock('@/lib/rbac/resource-auth', () => ({
  requireRestaurantAccess: jest.fn(),
}));
jest.mock('@/lib/services/loyalty-settings-service', () => {
  const actual = jest.requireActual('@/lib/services/loyalty-settings-service');
  return {
    ...actual,
    getLoyaltySettings: jest.fn(),
    updateLoyaltySettings: jest.fn(),
  };
});

const restaurantId = '550e8400-e29b-41d4-a716-446655440001';

const context = {
  userId: 'user-1',
  userType: 'restaurant_owner',
  email: 'owner@example.test',
  restaurantId,
  permissions: { loyalty: ['configure'], settings: ['read'] },
  isAdmin: false,
  mustChangePassword: false,
};

const settingsView = {
  enabled: false,
  visitsRequired: 3,
  rewardType: 'PERCENT',
  rewardValue: '10.00',
  maxDiscount: '15.00',
  minDailySpend: '20.00',
  rewardLabel: '10% off, max RM15',
  termsText: null,
  receiptLabel: null,
  privacyUrl: null,
  noticeVersion: null,
  noticeText: null,
  noticeTextHash: null,
  updatedBy: null,
  updatedAt: null,
};

function getRequest(): NextRequest {
  return new NextRequest('http://localhost/api/settings/restaurant/loyalty');
}

function patchRequest(
  body: unknown,
  headers: Record<string, string> = {}
): NextRequest {
  return new NextRequest('http://localhost/api/settings/restaurant/loyalty', {
    method: 'PATCH',
    headers: {
      'content-type': 'application/json',
      'idempotency-key': 'loyalty-key-1',
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

describe('loyalty settings route', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getTenantContext as jest.Mock).mockResolvedValue(context);
    (requireAuth as jest.Mock).mockReturnValue(context);
    (requirePermission as jest.Mock).mockReturnValue(undefined);
    (requireRestaurantAccess as jest.Mock).mockResolvedValue(undefined);
    (getLoyaltySettings as jest.Mock).mockResolvedValue(settingsView);
    (updateLoyaltySettings as jest.Mock).mockResolvedValue({
      settings: { ...settingsView, visitsRequired: 4 },
      replayed: false,
      statusCode: 200,
    });
  });

  it('returns settings with enabled=false and never LOYALTY_DISABLED', async () => {
    const response = await GET(getRequest());
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toEqual({ success: true, settings: settingsView });
    expect(requirePermission).toHaveBeenCalledWith(context, 'settings', 'read');
    expect(getLoyaltySettings).toHaveBeenCalledWith(restaurantId);
  });

  it('updates settings with loyalty:configure and an idempotency key', async () => {
    const response = await PATCH(patchRequest({ visitsRequired: 4 }));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(requirePermission).toHaveBeenCalledWith(
      context,
      'loyalty',
      'configure'
    );
    expect(updateLoyaltySettings).toHaveBeenCalledWith({
      restaurantId,
      userId: 'user-1',
      userType: 'restaurant_owner',
      patch: { visitsRequired: 4 },
      idempotencyKey: 'loyalty-key-1',
    });
    expect(json.settings.visitsRequired).toBe(4);
  });

  it('requires an Idempotency-Key for PATCH', async () => {
    const response = await PATCH(
      patchRequest({ visitsRequired: 4 }, { 'idempotency-key': '' })
    );
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json).toMatchObject({
      success: false,
      code: 'IDEMPOTENCY_KEY_REQUIRED',
    });
    expect(updateLoyaltySettings).not.toHaveBeenCalled();
  });

  it('rejects an out-of-bounds settings body', async () => {
    const response = await PATCH(patchRequest({ visitsRequired: 99 }));
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json).toMatchObject({ success: false, code: 'INVALID_REQUEST' });
    expect(updateLoyaltySettings).not.toHaveBeenCalled();
  });

  it('returns 403 when the caller lacks loyalty:configure', async () => {
    (requirePermission as jest.Mock).mockImplementationOnce(() => {
      throw new Error('Permission denied: configure on loyalty');
    });

    const response = await PATCH(patchRequest({ visitsRequired: 4 }));
    const json = await response.json();

    expect(response.status).toBe(403);
    expect(json).toMatchObject({
      success: false,
      code: 'PERMISSION_DENIED',
    });
    expect(updateLoyaltySettings).not.toHaveBeenCalled();
  });

  it('returns 403 when the caller lacks settings:read on GET', async () => {
    (requirePermission as jest.Mock).mockImplementationOnce(() => {
      throw new Error('Permission denied: read on settings');
    });

    const response = await GET(getRequest());
    const json = await response.json();

    expect(response.status).toBe(403);
    expect(json).toMatchObject({
      success: false,
      code: 'PERMISSION_DENIED',
    });
    expect(getLoyaltySettings).not.toHaveBeenCalled();
  });

  it('marks an idempotent replay with the Idempotent-Replay header', async () => {
    (updateLoyaltySettings as jest.Mock).mockResolvedValue({
      settings: settingsView,
      replayed: true,
      statusCode: 200,
    });

    const response = await PATCH(patchRequest({ enabled: true }));

    expect(response.headers.get('Idempotent-Replay')).toBe('true');
  });

  it('returns 409 when a key is reused with a different body', async () => {
    (updateLoyaltySettings as jest.Mock).mockRejectedValue(
      new OwnerIdempotencyMismatchError()
    );

    const response = await PATCH(patchRequest({ visitsRequired: 4 }));
    const json = await response.json();

    expect(response.status).toBe(409);
    expect(json).toMatchObject({
      success: false,
      code: 'IDEMPOTENCY_MISMATCH',
    });
  });
});
