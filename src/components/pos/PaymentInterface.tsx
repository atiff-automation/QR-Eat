/**
 * Payment Interface Component
 *
 * Following CLAUDE.md principles:
 * - Type Safety
 * - State Management
 * - Error Handling
 *
 * @see claudedocs/POS_IMPLEMENTATION_PLAN.md
 */

'use client';

import { useState } from 'react';
import type { PaymentInterfaceProps, PaymentMethod } from '@/types/pos';
import { processPayment } from '@/lib/services/payment-service';
import { OrderDetails } from './OrderDetails';
import { PaymentMethodSelector } from './PaymentMethodSelector';
import { CashPaymentForm } from './CashPaymentForm';
import { Receipt } from './Receipt';
import { X, CreditCard, Smartphone } from 'lucide-react';
import type { Payment } from '@prisma/client';

export function PaymentInterface({
  order,
  onClose,
  onPaymentComplete,
}: PaymentInterfaceProps) {
  const [selectedMethod, setSelectedMethod] = useState<PaymentMethod | null>(
    null
  );
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string>('');
  const [completedPayment, setCompletedPayment] = useState<Payment | null>(
    null
  );

  const handleMethodSelect = (method: PaymentMethod) => {
    setSelectedMethod(method);
    setError('');
  };

  const handleCashPayment = async (data: { cashReceived: number }) => {
    setIsProcessing(true);
    setError('');

    try {
      const result = await processPayment({
        orderId: order.id,
        paymentMethod: 'cash',
        cashReceived: data.cashReceived,
      });

      if (result.success) {
        setCompletedPayment(result.payment);
      } else {
        setError(result.message || 'Payment processing failed');
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'An unexpected error occurred'
      );
    } finally {
      setIsProcessing(false);
    }
  };

  const handleNonCashPayment = async () => {
    if (!selectedMethod || selectedMethod === 'cash') return;

    setIsProcessing(true);
    setError('');

    try {
      const result = await processPayment({
        orderId: order.id,
        paymentMethod: selectedMethod,
      });

      if (result.success) {
        setCompletedPayment(result.payment);
      } else {
        setError(result.message || 'Payment processing failed');
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'An unexpected error occurred'
      );
    } finally {
      setIsProcessing(false);
    }
  };

  const handleReceiptClose = () => {
    setCompletedPayment(null);
    onPaymentComplete();
  };

  return (
    <>
      {/* Modal Overlay - Match TableDetailModal style */}
      <div className="fixed inset-0 z-[60] flex items-center justify-center font-sans">
        {/* Backdrop */}
        <div
          onClick={onClose}
          className="absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity duration-300"
        />

        {/* Modal Content - Match TableDetailModal */}
        <div className="relative w-full max-w-sm bg-white rounded-3xl shadow-2xl mx-4 max-h-[90vh] flex flex-col overflow-hidden transform transition-all duration-300 ease-out">
          {/* Header - Compact */}
          <div className="flex items-center justify-between p-4 pb-3 border-b border-gray-100">
            <h2 className="text-lg font-bold text-gray-900">Process Payment</h2>
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-100 rounded-full transition-colors"
              disabled={isProcessing}
              aria-label="Close payment interface"
            >
              <X className="w-5 h-5 text-gray-400" />
            </button>
          </div>

          {/* Content: Scrollable area - Single column for mobile */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {/* Order Details */}
            <OrderDetails order={order} />

            {/* Error Message */}
            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                <p className="text-sm text-red-800">{error}</p>
              </div>
            )}

            {/* Payment Method Selection */}
            {!selectedMethod && (
              <PaymentMethodSelector onSelect={handleMethodSelect} />
            )}

            {/* Cash Payment Form */}
            {selectedMethod === 'cash' && (
              <CashPaymentForm
                totalAmount={Number(order.totalAmount)}
                onSubmit={handleCashPayment}
                onCancel={() => setSelectedMethod(null)}
                isProcessing={isProcessing}
              />
            )}

            {/* Non-Cash Payment */}
            {selectedMethod && selectedMethod !== 'cash' && (
              <div className="bg-white rounded-lg border border-gray-200 p-4">
                {/* Title with Icon */}
                <div className="flex items-center gap-2 mb-4">
                  {selectedMethod === 'card' ? (
                    <CreditCard className="w-5 h-5 text-gray-700" />
                  ) : (
                    <Smartphone className="w-5 h-5 text-gray-700" />
                  )}
                  <h3 className="text-base font-semibold text-gray-900">
                    {selectedMethod === 'card'
                      ? 'Card Payment'
                      : 'E-Wallet Payment'}
                  </h3>
                </div>

                {/* Buttons */}
                <div className="flex gap-2">
                  <button
                    onClick={() => setSelectedMethod(null)}
                    className="flex-1 h-10 px-4 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 font-medium transition-colors"
                    disabled={isProcessing}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleNonCashPayment}
                    className="flex-1 h-10 px-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium transition-colors disabled:bg-gray-300"
                    disabled={isProcessing}
                  >
                    {isProcessing ? 'Processing...' : 'Pay'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {completedPayment && (
        <Receipt
          order={order}
          payment={completedPayment}
          onClose={handleReceiptClose}
        />
      )}
    </>
  );
}
