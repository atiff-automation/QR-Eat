import { describe, expect, it, jest } from '@jest/globals';
import {
  canReadRestaurantPaymentBatch,
  canReceiveRestaurantEvent,
} from '@/lib/counter/tenant-guards';
import { PermissionManager } from '@/lib/rbac/permissions';

describe('Phase A tenant guards', () => {
  it('accepts only the same restaurant for events', () => {
    expect(canReceiveRestaurantEvent('restaurant-a', 'restaurant-a')).toBe(
      true
    );
    expect(canReceiveRestaurantEvent('restaurant-a', 'restaurant-b')).toBe(
      false
    );
    expect(canReceiveRestaurantEvent(undefined, 'restaurant-a')).toBe(false);
    expect(canReceiveRestaurantEvent('restaurant-a', undefined)).toBe(false);
  });

  it('accepts only the same restaurant for payment batches', () => {
    expect(canReadRestaurantPaymentBatch('restaurant-a', 'restaurant-a')).toBe(
      true
    );
    expect(canReadRestaurantPaymentBatch('restaurant-a', 'restaurant-b')).toBe(
      false
    );
    expect(canReadRestaurantPaymentBatch(undefined, 'restaurant-a')).toBe(
      false
    );
  });

  it('computes permissions from one role, not the user role union', async () => {
    const template = jest
      .spyOn(PermissionManager, 'getTemplatePermissions')
      .mockResolvedValue(['orders:read', 'payments:write']);

    const permissions = await PermissionManager.computeRolePermissions({
      roleTemplate: 'manager',
      customPermissions: ['orders:write'],
    });

    expect(template).toHaveBeenCalledWith('manager');
    expect(permissions.sort()).toEqual(
      ['orders:read', 'orders:write', 'payments:write'].sort()
    );
    template.mockRestore();
  });
});
