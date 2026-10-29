import {
  getOrderAdjustmentPolicy,
  OrderAdjustmentPolicyInput,
} from '@/lib/orders/order-adjustment-policy';

const base: OrderAdjustmentPolicyInput = {
  status: 'PENDING',
  paymentStatus: 'PENDING',
  businessDayClosed: false,
  userType: 'staff',
  roleTemplate: 'cashier',
  permissions: ['orders:read', 'orders:write'],
};

const manager: OrderAdjustmentPolicyInput = {
  ...base,
  userType: 'staff',
  roleTemplate: 'manager',
  permissions: { orders: ['read', 'write', 'fulfill'] },
};

function policy(overrides: Partial<OrderAdjustmentPolicyInput>) {
  return getOrderAdjustmentPolicy({ ...base, ...overrides });
}

describe('order adjustment policy', () => {
  it('allows staff to cancel pending orders', () => {
    expect(policy({})).toMatchObject({ action: 'CANCEL', allowed: true });
  });

  it('requires a manager after confirmation', () => {
    expect(policy({ status: 'CONFIRMED' })).toMatchObject({
      action: 'NONE',
      allowed: false,
    });
    expect(policy({ ...manager, status: 'CONFIRMED' })).toMatchObject({
      action: 'CANCEL',
      allowed: true,
    });
  });

  it('requires a manager before serving', () => {
    expect(policy({ status: 'READY' })).toMatchObject({
      action: 'NONE',
      allowed: false,
    });
    expect(policy({ ...manager, status: 'READY' })).toMatchObject({
      action: 'CANCEL',
      allowed: true,
    });
  });

  it('voids served unpaid orders for managers', () => {
    expect(
      policy({ ...manager, status: 'SERVED', paymentStatus: 'PENDING' })
    ).toMatchObject({ action: 'VOID', allowed: true });
  });

  it('refunds served paid orders for managers', () => {
    expect(
      policy({ ...manager, status: 'SERVED', paymentStatus: 'PAID' })
    ).toMatchObject({ action: 'REFUND', allowed: true });
  });

  it('does not allow served paid orders to be cancelled', () => {
    expect(
      policy({ ...manager, status: 'SERVED', paymentStatus: 'PAID' })
    ).not.toMatchObject({ action: 'CANCEL' });
  });

  it('blocks adjustments on a closed business day', () => {
    expect(
      policy({
        ...manager,
        status: 'SERVED',
        paymentStatus: 'PENDING',
        businessDayClosed: true,
      })
    ).toMatchObject({ action: 'NONE', allowed: false });
  });

  it('blocks cancelled and refunded orders', () => {
    expect(policy({ ...manager, status: 'CANCELLED' })).toMatchObject({
      action: 'NONE',
      allowed: false,
    });
    expect(
      policy({ ...manager, status: 'SERVED', paymentStatus: 'REFUNDED' })
    ).toMatchObject({ action: 'NONE', allowed: false });
  });
});
