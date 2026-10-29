'use client';

import { useEffect, useState } from 'react';
import { X, AlertTriangle, RotateCcw, Ban } from 'lucide-react';
import { formatPrice } from '@/lib/qr-utils';
import { generateIdempotencyKey } from '@/lib/order-modification-utils';
import type { OrderAdjustmentAction } from '@/lib/orders/order-adjustment-policy';
import { getOrderPrimaryLabel } from '@/lib/utils/order-display';

type AdjustmentAction = Exclude<OrderAdjustmentAction, 'NONE'>;

interface OrderAdjustmentModalProps {
  order: {
    id: string;
    orderNumber: string;
    orderType?: string;
    pickupNumber?: string | null;
    status: string;
    paymentStatus: string;
    totalAmount: number;
    version: number;
    table?: {
      tableNumber: string;
      tableName?: string | null;
    } | null;
    customerName?: string | null;
  };
  action: AdjustmentAction;
  currency: string;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function OrderAdjustmentModal({
  order,
  action,
  currency,
  isOpen,
  onClose,
  onSuccess,
}: OrderAdjustmentModalProps) {
  const [reason, setReason] = useState('customer_request');
  const [reasonNotes, setReasonNotes] = useState('');
  const [customerNotified, setCustomerNotified] = useState(false);
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(false);
  const [policyError, setPolicyError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isRefund = action === 'REFUND';
  const isVoid = action === 'VOID';
  const title = isVoid
    ? 'Void order?'
    : isRefund
      ? 'Refund payment?'
      : 'Cancel order?';
  const actionLabel = isVoid
    ? 'Void order'
    : isRefund
      ? 'Refund'
      : 'Cancel order';
  const refundAmount = Number(order.totalAmount);
  const refundWarning = isVoid
    ? 'No payment will be refunded. This removes the order from sales.'
    : isRefund
      ? `Full refund of ${formatPrice(refundAmount, currency)} will be recorded. The order remains served.`
      : order.paymentStatus === 'PAID'
        ? 'This order is paid. Cancelling records a refund. Process card refunds on the external terminal.'
        : null;

  useEffect(() => {
    if (!isOpen) return;
    let active = true;
    setChecking(true);
    setPolicyError(null);
    setError(null);
    fetch(`/api/orders/${order.id}`, { credentials: 'include' })
      .then(async (response) => {
        const data = (await response.json()) as {
          error?: string;
          adjustment?: {
            allowed?: boolean;
            action?: string;
            reason?: string | null;
          };
        };
        if (!response.ok) {
          throw new Error(data.error || 'Could not check order status');
        }
        const adjustment = data.adjustment;
        if (!adjustment?.allowed) {
          setPolicyError(adjustment?.reason || 'This action is not available.');
        } else if (adjustment.action !== action) {
          setPolicyError(
            `The available action is now ${String(adjustment.action).toLowerCase()}. Refresh the order list.`
          );
        }
      })
      .catch((err) => {
        if (active) {
          setPolicyError(
            err instanceof Error ? err.message : 'Could not check order status'
          );
        }
      })
      .finally(() => {
        if (active) setChecking(false);
      });
    return () => {
      active = false;
    };
  }, [action, isOpen, order.id]);

  useEffect(() => {
    document.body.style.overflow = isOpen ? 'hidden' : 'unset';
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isOpen]);

  const handleSubmit = async () => {
    if (!isRefund && !customerNotified) {
      setError('Please confirm that the customer has been notified');
      return;
    }
    try {
      setLoading(true);
      setError(null);
      const path =
        action === 'VOID'
          ? `/api/orders/${order.id}/void`
          : action === 'REFUND'
            ? `/api/orders/${order.id}/refund`
            : `/api/orders/${order.id}`;
      const response = await fetch(path, {
        method: action === 'CANCEL' ? 'DELETE' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          reason,
          reasonNotes: reasonNotes.trim() || undefined,
          customerNotified: isRefund ? false : customerNotified,
          version: order.version,
          idempotencyKey: generateIdempotencyKey(),
        }),
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || `Failed to ${actionLabel.toLowerCase()}`);
      }
      onSuccess();
      onClose();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : `Failed to ${actionLabel.toLowerCase()}`
      );
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-gray-200 p-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
            <p className="mt-0.5 text-xs text-gray-500">
              {order.orderNumber} · {getOrderPrimaryLabel(order)}
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1 hover:bg-gray-100"
            aria-label="Close"
            disabled={loading}
          >
            <X className="h-5 w-5 text-gray-500" />
          </button>
        </div>

        <div className="space-y-4 p-4">
          <div className="flex items-center justify-between rounded-lg bg-gray-50 p-3 text-sm">
            <span className="text-gray-600">
              {order.status} · {order.paymentStatus}
            </span>
            <span className="font-semibold text-gray-900">
              {formatPrice(order.totalAmount, currency)}
            </span>
          </div>

          {refundWarning && (
            <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
              <span>{refundWarning}</span>
            </div>
          )}

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Reason
            </label>
            <select
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
              disabled={loading}
            >
              <option value="customer_request">Customer request</option>
              <option value="kitchen_error">Kitchen error</option>
              <option value="out_of_stock">Out of stock</option>
              <option value="other">Other</option>
            </select>
          </div>

          {reason === 'other' && (
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Please explain
              </label>
              <textarea
                value={reasonNotes}
                onChange={(event) => setReasonNotes(event.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                rows={2}
                maxLength={500}
                placeholder={`Enter reason for ${actionLabel.toLowerCase()}...`}
                disabled={loading}
              />
            </div>
          )}

          {!isRefund && (
            <label className="flex cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                checked={customerNotified}
                onChange={(event) => setCustomerNotified(event.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                disabled={loading}
              />
              <span className="text-sm text-gray-700">
                Customer has been notified
              </span>
            </label>
          )}

          {(policyError || error) && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-600">
              {policyError || error}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-gray-200 bg-gray-50 p-4">
          <button
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200"
            disabled={loading}
          >
            Keep order
          </button>
          <button
            onClick={handleSubmit}
            disabled={
              loading ||
              checking ||
              Boolean(policyError) ||
              (!isRefund && !customerNotified)
            }
            className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:bg-gray-300"
          >
            {isVoid ? <Ban className="h-4 w-4" /> : null}
            {isRefund ? <RotateCcw className="h-4 w-4" /> : null}
            {loading ? 'Processing...' : actionLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
