'use client';

import { useState, useEffect } from 'react';
import { X, Trash2, AlertTriangle, Minus, Plus } from 'lucide-react';
import { ApiClient } from '@/lib/api-client';
import { formatPrice } from '@/lib/qr-utils';
import {
  generateIdempotencyKey,
  calculateRefundNeeded,
} from '@/lib/order-modification-utils';

interface ModifyOrderModalProps {
  order: {
    id: string;
    orderNumber: string;
    status: string;
    paymentStatus: string;
    totalAmount: number;
    version: number;
    items: Array<{
      id: string;
      quantity: number;
      unitPrice: number;
      totalAmount: number;
      menuItem: {
        id: string;
        name: string;
        price: number;
      };
    }>;
  };
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

interface ItemChange {
  itemId: string;
  action: 'remove' | 'update_quantity';
  newQuantity?: number;
}

/**
 * ModifyOrderModal Component
 *
 * Edit order items interface with validation.
 *
 * Features:
 * - Remove items
 * - Update quantities
 * - Real-time total calculation
 * - Refund warning
 * - Validation (can't remove all items)
 */
export function ModifyOrderModal({
  order,
  isOpen,
  onClose,
  onSuccess,
}: ModifyOrderModalProps) {
  const [items, setItems] = useState(order.items);
  const [reason, setReason] = useState<string>('out_of_stock');
  const [reasonNotes, setReasonNotes] = useState('');
  const [customerNotified, setCustomerNotified] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset items when order changes
  useEffect(() => {
    setItems(order.items);
  }, [order.items]);

  // Calculate new total
  const newTotal = items.reduce((sum, item) => sum + item.totalAmount, 0);
  const refundNeeded = calculateRefundNeeded(order, newTotal);
  const hasChanges = JSON.stringify(items) !== JSON.stringify(order.items);

  const updateQuantity = (itemId: string, delta: number) => {
    setItems((prev) =>
      prev.map((item) => {
        if (item.id !== itemId) return item;

        const newQty = Math.max(1, Math.min(99, item.quantity + delta));
        return {
          ...item,
          quantity: newQty,
          totalAmount: item.menuItem.price * newQty,
        };
      })
    );
  };

  const removeItem = (itemId: string) => {
    if (items.length <= 1) {
      setError('Cannot remove all items. Please cancel the order instead.');
      return;
    }

    setItems((prev) => prev.filter((item) => item.id !== itemId));
    setError(null);
  };

  const handleSave = async () => {
    if (!hasChanges) {
      setError('No changes made to the order');
      return;
    }

    if (items.length === 0) {
      setError('Cannot remove all items. Please cancel the order instead.');
      return;
    }

    if (!customerNotified) {
      setError('Please confirm that the customer has been notified');
      return;
    }

    try {
      setLoading(true);
      setError(null);

      // Build item changes
      const itemChanges: ItemChange[] = [];

      // Check for removed items
      for (const originalItem of order.items) {
        const currentItem = items.find((i) => i.id === originalItem.id);
        if (!currentItem) {
          itemChanges.push({
            itemId: originalItem.id,
            action: 'remove',
          });
        }
      }

      // Check for quantity changes
      for (const currentItem of items) {
        const originalItem = order.items.find((i) => i.id === currentItem.id);
        if (originalItem && originalItem.quantity !== currentItem.quantity) {
          itemChanges.push({
            itemId: currentItem.id,
            action: 'update_quantity',
            newQuantity: currentItem.quantity,
          });
        }
      }

      await ApiClient.patch(`/orders/${order.id}/modify`, {
        reason,
        reasonNotes: reasonNotes.trim() || undefined,
        customerNotified,
        version: order.version,
        idempotencyKey: generateIdempotencyKey(),
        itemChanges,
      });

      onSuccess();
      onClose();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: any) {
      console.error('Failed to modify order:', err);
      setError(
        err.response?.data?.error || 'Failed to modify order. Please try again.'
      );
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
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 sticky top-0 bg-white z-10">
          <h2 className="text-lg font-semibold text-gray-900">
            Modify Order #{order.orderNumber}
          </h2>
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
          {/* Reason Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Reason for modification
            </label>
            <select
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              disabled={loading}
            >
              <option value="out_of_stock">Out of Stock</option>
              <option value="customer_request">Customer Request</option>
              <option value="kitchen_error">Kitchen Error</option>
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
                rows={2}
                maxLength={500}
                placeholder="Enter reason for modification..."
                disabled={loading}
              />
            </div>
          )}

          {/* Items List */}
          <div>
            <h3 className="text-sm font-medium text-gray-700 mb-2">
              Order Items
            </h3>
            <div className="space-y-2">
              {items.map((item) => (
                <div key={item.id} className="border rounded-lg p-3 bg-gray-50">
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <h4 className="font-medium">{item.menuItem.name}</h4>
                      <p className="text-sm text-gray-600">
                        {formatPrice(item.menuItem.price)} each
                      </p>
                    </div>
                    <button
                      onClick={() => removeItem(item.id)}
                      className="text-red-600 hover:bg-red-50 p-1.5 rounded transition-colors"
                      disabled={loading || items.length <= 1}
                      title={
                        items.length <= 1
                          ? 'Cannot remove last item'
                          : 'Remove item'
                      }
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => updateQuantity(item.id, -1)}
                        className="p-1 hover:bg-gray-200 rounded disabled:opacity-50 disabled:cursor-not-allowed"
                        disabled={loading || item.quantity <= 1}
                      >
                        <Minus className="h-4 w-4" />
                      </button>
                      <span className="w-8 text-center font-medium">
                        {item.quantity}
                      </span>
                      <button
                        onClick={() => updateQuantity(item.id, 1)}
                        className="p-1 hover:bg-gray-200 rounded disabled:opacity-50 disabled:cursor-not-allowed"
                        disabled={loading || item.quantity >= 99}
                      >
                        <Plus className="h-4 w-4" />
                      </button>
                    </div>
                    <span className="font-semibold">
                      {formatPrice(item.totalAmount)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Totals Comparison */}
          <div className="border-t pt-3">
            <div className="flex justify-between text-sm mb-1">
              <span className="text-gray-600">Original Total:</span>
              <span>{formatPrice(order.totalAmount)}</span>
            </div>
            <div className="flex justify-between font-bold">
              <span>New Total:</span>
              <span
                className={newTotal < order.totalAmount ? 'text-red-600' : ''}
              >
                {formatPrice(newTotal)}
              </span>
            </div>
            {newTotal < order.totalAmount && (
              <div className="text-sm text-red-600 mt-1">
                Difference: -{formatPrice(order.totalAmount - newTotal)}
              </div>
            )}
          </div>

          {/* Refund Warning */}
          {refundNeeded && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-5 w-5 text-yellow-600 flex-shrink-0 mt-0.5" />
                <div className="text-sm text-yellow-800">
                  <p className="font-medium">Refund Required</p>
                  <p>
                    Order is already paid. Manual refund of $
                    {refundNeeded.toFixed(2)} needed.
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
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={loading || !hasChanges || !customerNotified}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed rounded-lg transition-colors"
          >
            {loading ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
}
