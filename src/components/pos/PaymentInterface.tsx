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
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-40">
        <div className="bg-gray-50 rounded-lg shadow-xl max-w-4xl w-full mx-4 max-h-[90vh] overflow-y-auto">
          <div className="sticky top-0 bg-white border-b border-gray-200 p-4 flex items-center justify-between">
            <h2 className="text-xl font-semibold text-gray-900">
              Process Payment
            </h2>
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              disabled={isProcessing}
            >
              <X className="w-5 h-5 text-gray-500" />
            </button>
          </div>

          <div className="p-6 grid grid-cols-2 gap-6">
            <div>
              <OrderDetails order={order} />
            </div>

            <div className="space-y-6">
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
                  <div className="flex gap-3">
                    <button
                      onClick={() => setSelectedMethod(null)}
                      className="flex-1 px-4 py-3 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 font-medium transition-colors"
                      disabled={isProcessing}
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleNonCashPayment}
                      className="flex-1 px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium transition-colors disabled:bg-gray-300"
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
