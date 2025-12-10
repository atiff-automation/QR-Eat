/**
 * Payment Service - POS System
 *
 * Following CLAUDE.md principles:
 * - Single Responsibility
 * - Type Safety
 * - Error Handling
 *
 * @see claudedocs/POS_IMPLEMENTATION_PLAN.md
 */

import type {
  PaymentProcessRequest,
  PaymentProcessResult,
  PendingOrdersResponse,
} from '@/types/pos';

/**
 * Process payment for an order
 */
export async function processPayment(
  data: PaymentProcessRequest
): Promise<PaymentProcessResult> {
  try {
    const response = await fetch(`/api/pos/payment/${data.orderId}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        paymentMethod: data.paymentMethod,
        cashReceived: data.cashReceived,
        externalTransactionId: data.externalTransactionId,
        notes: data.notes,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({
        message: 'Payment processing failed',
      }));
      throw new Error(errorData.message || 'Payment processing failed');
    }

    const result: PaymentProcessResult = await response.json();
    return result;
  } catch (error) {
    console.error('Payment processing error:', error);
    throw error instanceof Error
      ? error
      : new Error('An unexpected error occurred');
  }
}

/**
 * Fetch pending orders for POS dashboard
 */
export async function fetchPendingOrders(
  page = 1,
  limit = 20
): Promise<PendingOrdersResponse> {
  try {
    const response = await fetch(
      `/api/pos/orders/pending?page=${page}&limit=${limit}`,
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({
        message: 'Failed to fetch pending orders',
      }));
      throw new Error(errorData.message || 'Failed to fetch pending orders');
    }

    const result: PendingOrdersResponse = await response.json();
    return result;
  } catch (error) {
    console.error('Fetch pending orders error:', error);
    throw error instanceof Error
      ? error
      : new Error('An unexpected error occurred');
  }
}

/**
 * Refresh order details
 */
export async function refreshOrder(orderId: string): Promise<unknown> {
  try {
    const response = await fetch(`/api/orders/${orderId}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({
        message: 'Failed to refresh order',
      }));
      throw new Error(errorData.message || 'Failed to refresh order');
    }

    return await response.json();
  } catch (error) {
    console.error('Refresh order error:', error);
    throw error instanceof Error
      ? error
      : new Error('An unexpected error occurred');
  }
}
