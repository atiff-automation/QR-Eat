/**
 * Payment Service - POS System
 *
 * Following CLAUDE.md principles:
 * - Single Source of Truth (uses centralized ApiClient)
 * - DRY (no duplicate error handling)
 * - Type Safety (explicit TypeScript types)
 * - Centralized Approach (all API calls through ApiClient)
 *
 * @see claudedocs/POS_IMPLEMENTATION_PLAN.md
 */

import { ApiClient } from '@/lib/api-client';
import type {
  PaymentProcessRequest,
  PaymentProcessResult,
  PendingOrdersResponse,
} from '@/types/pos';

/**
 * Process payment for an order
 *
 * Uses centralized ApiClient for:
 * - Automatic authentication (credentials: 'include')
 * - Reactive 401 refresh (automatic token renewal)
 * - Consistent error handling
 * - Request retry logic
 */
export async function processPayment(
  data: PaymentProcessRequest
): Promise<PaymentProcessResult> {
  console.log(
    '[PaymentService] Sending request to API:',
    `/api/pos/payment/${data.orderId}`,
    data
  );
  return ApiClient.post<PaymentProcessResult>(
    `/api/pos/payment/${data.orderId}`,
    {
      paymentMethod: data.paymentMethod,
      cashReceived: data.cashReceived,
      externalTransactionId: data.externalTransactionId,
      notes: data.notes,
      payFullTable: data.payFullTable,
    }
  );
}

/**
 * Fetch pending orders for POS dashboard
 *
 * Uses centralized ApiClient for:
 * - Automatic authentication (credentials: 'include')
 * - Reactive 401 refresh (automatic token renewal)
 * - Consistent error handling
 * - Request retry logic
 *
 * This fixes the polling refresh issue where expired tokens caused
 * continuous 401 errors without triggering reactive refresh.
 */
export async function fetchPendingOrders(
  page = 1,
  limit = 20
): Promise<PendingOrdersResponse> {
  return ApiClient.get<PendingOrdersResponse>('/api/pos/orders/pending', {
    params: { page, limit },
  });
}

/**
 * Refresh order details
 *
 * Uses centralized ApiClient for:
 * - Automatic authentication (credentials: 'include')
 * - Reactive 401 refresh (automatic token renewal)
 * - Consistent error handling
 * - Request retry logic
 */
export async function refreshOrder(orderId: string): Promise<unknown> {
  return ApiClient.get(`/api/orders/${orderId}`);
}
