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
import { X } from 'lucide-react';
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
      {/* Mobile: Full-screen view | Desktop: Modal overlay */}
      <div className="fixed inset-0 z-40 bg-white md:bg-black md:bg-opacity-50 md:flex md:items-center md:justify-center">
        {/* Container: Full-screen on mobile, modal on desktop */}
        <div className="h-full w-full bg-white md:rounded-lg md:shadow-xl md:max-w-4xl md:mx-4 md:max-h-[90vh] flex flex-col overflow-hidden">
          {/* Header - Sticky on mobile for better UX */}
          <div className="sticky top-0 z-10 bg-white border-b border-gray-200 p-4 md:p-6 flex items-center justify-between safe-area-padding">
            <h2 className="text-lg md:text-xl font-semibold text-gray-900">
              Process Payment
            </h2>
            <button
              onClick={onClose}
              className="touch-target p-2 hover:bg-gray-100 rounded-lg transition-colors"
              disabled={isProcessing}
              aria-label="Close payment interface"
            >
              <X className="w-5 h-5 md:w-6 md:h-6 text-gray-500" />
            </button>
          </div>

          {/* Content: Scrollable area */}
          <div className="flex-1 overflow-y-auto">
            <div className="p-4 md:p-6 space-y-6 md:grid md:grid-cols-2 md:gap-6 md:space-y-0">
              {/* Order Details - Always visible on desktop, collapsible on mobile could be added */}
              <div className="order-1">
                <OrderDetails order={order} />
              </div>

              {/* Payment Methods - Takes priority on mobile */}
              <div className="order-2 space-y-6">
                {error && (
                  <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
                    <p className="text-sm text-red-800">{error}</p>
                  </div>
                )}

                {!selectedMethod && (
                  <PaymentMethodSelector onSelect={handleMethodSelect} />
                )}

                {selectedMethod === 'cash' && (
                  <CashPaymentForm
                    totalAmount={Number(order.totalAmount)}
                    onSubmit={handleCashPayment}
                    onCancel={() => setSelectedMethod(null)}
                    isProcessing={isProcessing}
                  />
                )}

                {selectedMethod && selectedMethod !== 'cash' && (
                  <div className="bg-white rounded-lg border border-gray-200 p-6">
                    <h3 className="text-lg font-semibold text-gray-900 mb-4">
                      {selectedMethod === 'card'
                        ? 'Card Payment'
                        : 'E-Wallet Payment'}
                    </h3>
                    <p className="text-gray-600 mb-6">
                      Please complete the payment using the{' '}
                      {selectedMethod === 'card'
                        ? 'card terminal'
                        : 'e-wallet scanner'}
                      .
                    </p>
                    <div className="flex flex-col sm:flex-row gap-3">
                      <button
                        onClick={() => setSelectedMethod(null)}
                        className="touch-target flex-1 px-4 py-3 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 font-medium transition-colors"
                        disabled={isProcessing}
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleNonCashPayment}
                        className="touch-target flex-1 px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium transition-colors disabled:bg-gray-300"
                        disabled={isProcessing}
                      >
                        {isProcessing ? 'Processing...' : 'Confirm Payment'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
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
