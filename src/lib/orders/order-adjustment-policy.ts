export type OrderAdjustmentAction = 'CANCEL' | 'VOID' | 'REFUND' | 'NONE';

export interface OrderAdjustmentPolicyInput {
  status: string;
  paymentStatus: string;
  orderType?: string;
  businessDayClosed: boolean;
  userType: string;
  roleTemplate?: string | null;
  permissions?: string[] | Record<string, string[]>;
}

export interface OrderAdjustmentPolicy {
  action: OrderAdjustmentAction;
  allowed: boolean;
  reason?: string;
}

const PRE_SERVICE_STATUSES = new Set([
  'PENDING',
  'CONFIRMED',
  'PREPARING',
  'READY',
]);

function hasPermission(
  input: OrderAdjustmentPolicyInput,
  resource: string,
  action: string
): boolean {
  if (Array.isArray(input.permissions)) {
    return input.permissions.includes(`${resource}:${action}`);
  }
  return Boolean(input.permissions?.[resource]?.includes(action));
}

function isManager(input: OrderAdjustmentPolicyInput): boolean {
  return (
    input.userType === 'restaurant_owner' ||
    (input.userType === 'staff' && input.roleTemplate === 'manager')
  );
}

/**
 * One source of truth for whether an order can be cancelled, voided or
 * refunded. The UI can mirror this rule, but the API remains authoritative.
 */
export function getOrderAdjustmentPolicy(
  input: OrderAdjustmentPolicyInput
): OrderAdjustmentPolicy {
  if (input.businessDayClosed) {
    return {
      action: 'NONE',
      allowed: false,
      reason:
        'This business day is closed. Use the payment history for a refund.',
    };
  }

  if (input.status === 'CANCELLED') {
    return {
      action: 'NONE',
      allowed: false,
      reason: 'This order is already cancelled.',
    };
  }

  if (PRE_SERVICE_STATUSES.has(input.status)) {
    const canCancelPending =
      input.status === 'PENDING' &&
      (isManager(input) || hasPermission(input, 'orders', 'write'));
    if (input.status === 'PENDING' && !canCancelPending) {
      return {
        action: 'NONE',
        allowed: false,
        reason: 'You do not have permission to cancel this order.',
      };
    }
    if (input.status !== 'PENDING' && !isManager(input)) {
      return {
        action: 'NONE',
        allowed: false,
        reason:
          'Only a manager or owner can cancel an order after confirmation.',
      };
    }
    return {
      action: 'CANCEL',
      allowed: true,
    };
  }

  if (input.status !== 'SERVED') {
    return {
      action: 'NONE',
      allowed: false,
      reason: 'This order cannot be adjusted.',
    };
  }

  if (!isManager(input)) {
    return {
      action: 'NONE',
      allowed: false,
      reason: 'Only a manager or owner can adjust a served order.',
    };
  }

  if (input.paymentStatus === 'PAID') {
    return {
      action: 'REFUND',
      allowed: true,
    };
  }

  if (input.paymentStatus === 'PENDING' || input.paymentStatus === 'FAILED') {
    return {
      action: 'VOID',
      allowed: true,
    };
  }

  return {
    action: 'NONE',
    allowed: false,
    reason: 'This order has no refundable payment.',
  };
}

export function assertOrderAdjustmentAction(
  policy: OrderAdjustmentPolicy,
  expected: Exclude<OrderAdjustmentAction, 'NONE'>
): void {
  if (!policy.allowed || policy.action !== expected) {
    throw new OrderAdjustmentError(
      policy.reason ?? 'This order action is not allowed.',
      'ORDER_ADJUSTMENT_NOT_ALLOWED',
      403
    );
  }
}

export class OrderAdjustmentError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode = 400
  ) {
    super(message);
  }
}
