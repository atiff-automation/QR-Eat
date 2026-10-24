/**
 * Security regression tests for tenant context.
 *
 * SEC-00: the API must never trust unsigned x-user-* request headers.
 * AUTH-01: a bearer token must be accepted for native clients.
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { NextRequest } from 'next/server';
import { getTenantContext } from '@/lib/tenant-context';
import { AuthServiceV2 } from '@/lib/rbac/auth-service';
import { EnhancedAuthenticatedUser, UserType } from '@/lib/rbac/types';
import { ORDER_WITH_DETAILS_INCLUDE } from '@/lib/order-utils';

const validUser: EnhancedAuthenticatedUser = {
  id: 'user-1',
  email: 'manager@example.com',
  firstName: 'Counter',
  lastName: 'Manager',
  userType: UserType.STAFF,
  permissions: ['orders:read', 'orders:write', 'payments:write'],
  currentRole: {
    id: 'role-1',
    userType: 'staff',
    roleTemplate: 'manager',
    restaurantId: 'restaurant-1',
    isActive: true,
  },
  availableRoles: [],
  restaurantContext: {
    id: 'restaurant-1',
    name: 'Demo',
    slug: 'demo',
    isActive: true,
    timezone: 'Asia/Kuala_Lumpur',
    currency: 'MYR',
  },
  isActive: true,
};

describe('tenant context security', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('does not authenticate spoofed x-user-* headers without a token', async () => {
    const validateToken = jest.spyOn(AuthServiceV2, 'validateToken');
    const request = new NextRequest('http://localhost/api/orders', {
      headers: {
        'x-user-id': 'attacker',
        'x-user-type': 'platform_admin',
        'x-user-email': 'attacker@example.com',
        'x-is-admin': 'true',
        'x-restaurant-id': 'restaurant-1',
        'x-user-permissions': '["payments:write"]',
      },
    });

    await expect(getTenantContext(request)).resolves.toBeNull();
    expect(validateToken).not.toHaveBeenCalled();
  });

  it('accepts a valid bearer token', async () => {
    const validateToken = jest
      .spyOn(AuthServiceV2, 'validateToken')
      .mockResolvedValue({
        isValid: true,
        user: validUser,
      });

    const request = new NextRequest('http://localhost/api/orders', {
      headers: {
        authorization: 'Bearer signed-token',
        'x-user-id': 'spoofed',
        'x-is-admin': 'true',
      },
    });

    const context = await getTenantContext(request);

    expect(context).not.toBeNull();
    expect(context?.userId).toBe('user-1');
    expect(context?.isAdmin).toBe(false);
    expect(context?.restaurantId).toBe('restaurant-1');
    expect(validateToken).toHaveBeenCalledWith('signed-token');
  });

  it('does not include the customer session token in staff order payloads', () => {
    const customerSession = ORDER_WITH_DETAILS_INCLUDE.customerSession;

    expect(customerSession.select).not.toHaveProperty('sessionToken');
  });
});
