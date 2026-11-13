'use client';

import { formatPrice } from '@/lib/qr-utils';
import { OrderResponse } from '@/types/order';
import { CheckCircle } from 'lucide-react';
import { useBodyScrollLock } from '@/hooks/useBodyScrollLock';
import {
  visitStateCopy,
  type LoyaltyConfirmation,
} from '@/components/qr/loyalty-checkout';

interface OrderConfirmationProps {
  order: OrderResponse;
  onNewOrder: () => void;
  currency: string; // Phase 3 - Restaurant Settings
  /** Loyalty-only summary. Absent (flag off) renders the pre-feature card. */
  loyalty?: LoyaltyConfirmation;
}

export function OrderConfirmation({
  order,
  onNewOrder,
  currency,
  loyalty,
}: OrderConfirmationProps) {
  // Lock body scroll to prevent browser UI auto-hiding
  useBodyScrollLock(true);

  // With a confirmed loyalty response, every amount is the server's quote
  // string (the create route re-priced and validated it). Without one, the
  // pre-feature order fields are used exactly as before.
  const subtotal = loyalty ? loyalty.subtotal : order.subtotalAmount;
  const taxAmount = loyalty ? loyalty.taxAmount : order.taxAmount;
  const serviceCharge = loyalty ? loyalty.serviceCharge : order.serviceCharge;
  const total = loyalty ? loyalty.total : order.totalAmount;

  return (
    <div className="overflow-hidden max-w-2xl mx-auto">
      {/* Success Header */}
      <div className="bg-gradient-to-r from-orange-50 to-orange-100 p-5 text-center border-b border-orange-200">
        <div className="flex justify-center mb-3">
          <div className="w-14 h-14 bg-orange-500 rounded-full flex items-center justify-center">
            <CheckCircle className="w-9 h-9 text-white" strokeWidth={2.5} />
          </div>
        </div>
        <h2 className="text-xl font-bold text-gray-900 mb-1">
          Order Placed Successfully!
        </h2>
        <p className="text-sm text-gray-600">
          {loyalty?.message || 'Thank you for your order'}
        </p>
      </div>

      {/* Order Details */}
      <div className="p-5 space-y-4">
        {/* Order Number */}
        <div className="text-center">
          <p className="text-xs text-gray-600 mb-0.5">Order Number</p>
          <h3 className="text-2xl font-bold text-gray-900">
            #{order.orderNumber}
          </h3>
        </div>

        {/* Total Amount */}
        <div className="bg-gray-50 rounded-xl p-4 border border-gray-200 space-y-2">
          {/* Subtotal */}
          <div className="flex justify-between text-sm text-gray-600">
            <span>Subtotal</span>
            <span>{formatPrice(subtotal, currency)}</span>
          </div>

          {/* Discount lines: server-issued labels and amounts only. */}
          {loyalty?.discountLines.map((line, index) => (
            <div
              key={`${line.label}-${index}`}
              className="flex justify-between gap-3 text-sm text-gray-600"
            >
              <span className="min-w-0 break-words">{line.label}</span>
              <span className="shrink-0">
                −{formatPrice(line.amount, currency)}
              </span>
            </div>
          ))}

          {/* Tax */}
          <div className="flex justify-between text-sm text-gray-600">
            <span>{order.taxLabelSnapshot || 'Tax'}</span>
            <span>{formatPrice(taxAmount, currency)}</span>
          </div>

          {/* Service Charge */}
          <div className="flex justify-between text-sm text-gray-600 border-b border-gray-200 pb-2">
            <span>{order.serviceChargeLabelSnapshot || 'Service Charge'}</span>
            <span>{formatPrice(serviceCharge, currency)}</span>
          </div>

          {/* Total Amount */}
          <div className="flex justify-between items-center pt-1">
            <span className="text-sm font-semibold text-gray-900">
              Total Amount
            </span>
            <span
              className={`text-3xl font-bold ${
                loyalty ? 'text-orange-700' : 'text-orange-600'
              }`}
            >
              {formatPrice(total, currency)}
            </span>
          </div>

          <p className="text-xs text-gray-500 mt-2 text-center">
            Pay at the counter when ready
          </p>
        </div>

        {loyalty && (
          <div
            role="status"
            aria-live="polite"
            aria-atomic="true"
            className="rounded-xl border border-orange-100 bg-orange-50 px-4 py-3 text-sm text-gray-900"
          >
            <p className="font-semibold">
              {visitStateCopy(loyalty.visitState)}
            </p>
            {loyalty.visitProgress && (
              <p className="mt-1">Visit count: {loyalty.visitProgress}</p>
            )}
            {loyalty.rewardLabel && (
              <p className="mt-1">Reward: {loyalty.rewardLabel}</p>
            )}
            {loyalty.loyaltyError && (
              <p className="mt-1 font-medium text-gray-800">
                {loyalty.loyaltyError.message}
              </p>
            )}
            {loyalty.noticeText && (
              <div className="mt-2 rounded-lg border border-gray-200 bg-white p-3">
                <p className="text-xs font-semibold text-gray-900">
                  Rewards notice
                </p>
                <p className="mt-1 whitespace-pre-line break-words text-sm text-gray-800">
                  {loyalty.noticeText}
                </p>
              </div>
            )}
          </div>
        )}

        {/* Action Buttons */}
        <div
          className="space-y-4"
          style={{
            paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 0.5rem)',
          }}
        >
          <button
            onClick={onNewOrder}
            className="w-full bg-orange-500 hover:bg-orange-600 text-white font-bold py-3.5 px-6 rounded-lg transition-all duration-200 transform active:scale-98 touch-target text-base"
          >
            Order More Items
          </button>

          <p className="text-center text-xs text-gray-500">
            Need help? Ask any staff member
          </p>
        </div>
      </div>
    </div>
  );
}
