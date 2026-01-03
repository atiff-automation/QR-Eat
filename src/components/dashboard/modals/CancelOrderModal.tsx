'use client';

import { useState, useEffect } from 'react';
import { X, AlertTriangle } from 'lucide-react';
import {
  generateIdempotencyKey,
  calculateRefundNeeded,
} from '@/lib/order-modification-utils';

interface CancelOrderModalProps {
  order: {
    id: string;
    orderNumber: string;
    status: string;
    paymentStatus: string;
    totalAmount: number;
    version: number;
    table: {
      tableNumber: string;
    };
  };
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

/**
 * CancelOrderModal Component
 *
 * Confirmation dialog for order cancellation.
 *
 * Features:
 * - Cancellation reason selection
 * - Customer notification checkbox
 * - Refund warning display
 * - Loading and error states
 */
export function CancelOrderModal({
  order,
  isOpen,
  onClose,
  onSuccess,
}: CancelOrderModalProps) {
  const [reason, setReason] = useState<string>('customer_request');
  const [reasonNotes, setReasonNotes] = useState('');
  const [customerNotified, setCustomerNotified] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refundNeeded = calculateRefundNeeded(order, 0);

  const handleCancel = async () => {
    if (!customerNotified) {
      setError('Please confirm that the customer has been notified');
      return;
    }

    try {
      setLoading(true);
      setError(null);

      // Use fetch directly since ApiClient.delete doesn't support body
      const response = await fetch(`/api/orders/${order.id}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          reason,
          reasonNotes: reasonNotes.trim() || undefined,
          customerNotified,
          version: order.version,
          idempotencyKey: generateIdempotencyKey(),
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        console.error('Cancel order failed:', {
          status: response.status,
          data,
        });
        throw new Error(data.error || 'Failed to cancel order');
      }

      onSuccess();
      onClose();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: any) {
      console.error('Failed to cancel order:', err);
      setError(err.message || 'Failed to cancel order. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Lock body scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }

    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Cancel Order?</h2>
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-100 rounded-lg transition-colors"
            aria-label="Close"
            disabled={loading}
          >
            <X className="h-5 w-5 text-gray-500" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-4">
          <p className="text-gray-700">
            Are you sure you want to cancel this order?
          </p>

          {/* Order Summary */}
          <div className="bg-gray-50 rounded-lg p-3">
            <div className="font-semibold">Order #{order.orderNumber}</div>
            <div className="text-sm text-gray-600">
              Table {order.table.tableNumber} • $
              {Number(order.totalAmount).toFixed(2)}
            </div>
          </div>

          {/* Reason Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Reason for cancellation
            </label>
            <select
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              disabled={loading}
            >
              <option value="customer_request">Customer Request</option>
              <option value="kitchen_error">Kitchen Error</option>
              <option value="out_of_stock">Out of Stock</option>
              <option value="other">Other</option>
            </select>
          </div>

          {/* Optional Notes */}
          {reason === 'other' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Please explain
              </label>
              <textarea
                value={reasonNotes}
                onChange={(e) => setReasonNotes(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                rows={3}
                maxLength={500}
                placeholder="Enter reason for cancellation..."
                disabled={loading}
              />
              <p className="text-xs text-gray-500 mt-1">
                {reasonNotes.length}/500 characters
              </p>
            </div>
          )}

          {/* Refund Warning */}
          {refundNeeded && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-5 w-5 text-yellow-600 flex-shrink-0 mt-0.5" />
                <div className="text-sm text-yellow-800">
                  <p className="font-medium">Refund Required</p>
                  <p>
                    Order is already paid. Manual refund of $
                    {Number(refundNeeded).toFixed(2)} needed.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Customer Notification */}
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={customerNotified}
              onChange={(e) => setCustomerNotified(e.target.checked)}
              className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
              disabled={loading}
            />
            <span className="text-sm text-gray-700">
              Customer has been notified
            </span>
          </label>

          {/* Error Message */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3">
              <p className="text-sm text-red-600">{error}</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 p-4 border-t border-gray-200 bg-gray-50">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200 rounded-lg transition-colors"
            disabled={loading}
          >
            No, Keep Order
          </button>
          <button
            onClick={handleCancel}
            disabled={loading || !customerNotified}
            className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 disabled:bg-gray-300 disabled:cursor-not-allowed rounded-lg transition-colors"
          >
            {loading ? 'Cancelling...' : 'Yes, Cancel Order'}
          </button>
        </div>
      </div>
    </div>
  );
}
