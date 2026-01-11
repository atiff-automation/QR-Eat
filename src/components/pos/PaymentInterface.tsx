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

import { useState, useEffect } from 'react';
import type { PaymentMethod, OrderWithDetails } from '@/types/pos';
import { OrderDetails } from './OrderDetails';
import { PaymentMethodSelector } from './PaymentMethodSelector';
import { CashPaymentForm } from './CashPaymentForm';
import { Receipt } from './Receipt';
import { X, CreditCard, Smartphone } from 'lucide-react';
import type { Payment } from '@prisma/client';
import type { PaymentInterfaceProps } from '@/types/pos';
import { usePaymentMethods } from '@/contexts/RestaurantContext';
import { ApiClient } from '@/lib/api-client';

export function PaymentInterface({
  order,
  relatedOrders = [],
  currency = 'MYR',
  onClose,
  onPaymentComplete,
}: PaymentInterfaceProps & { relatedOrders?: OrderWithDetails[] }) {
  const [selectedMethod, setSelectedMethod] = useState<PaymentMethod | null>(
    null
  );
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string>('');
  const [completedPayment, setCompletedPayment] = useState<Payment | null>(
    null
  );
  const paymentMethods = usePaymentMethods();
  const [restaurantInfo, setRestaurantInfo] = useState<{
    name: string;
    address: string;
    phone: string;
    email: string;
  } | null>(null);
  const [cashierInfo, setCashierInfo] = useState<{
    firstName: string;
    lastName: string;
  } | null>(null);

  // Fetch restaurant and cashier info
  useEffect(() => {
    const fetchInfo = async () => {
      try {
        // Fetch restaurant settings
        const settings = await ApiClient.get<{
          settings: {
            name: string;
            address: string;
            phone?: string;
            email?: string;
          };
        }>('/settings/restaurant');
        setRestaurantInfo({
          name: settings.settings.name || 'Restaurant',
          address: settings.settings.address || '',
          phone: settings.settings.phone || '',
          email: settings.settings.email || '',
        });

        // Fetch current user info
        const user = await ApiClient.get<{
          user: { firstName: string; lastName: string };
        }>('/auth/me');
        setCashierInfo({
          firstName: user.user.firstName || 'Staff',
          lastName: user.user.lastName || 'Member',
        });
      } catch (err) {
        console.error('Failed to fetch restaurant/cashier info:', err);
        // Set defaults
        setRestaurantInfo({
          name: 'Restaurant',
          address: '',
          phone: '',
          email: '',
        });
        setCashierInfo({
          firstName: 'Staff',
          lastName: 'Member',
        });
      }
    };
    fetchInfo();
  }, []);

  const handleMethodSelect = (method: PaymentMethod) => {
    setSelectedMethod(method);
    setError('');
  };

  const calculateTotalAmount = () => {
    if (relatedOrders.length > 0) {
      return relatedOrders
        .filter((o) => o.status !== 'CANCELLED')
        .reduce((sum, o) => sum + Number(o.totalAmount), 0);
    }
    return order.status !== 'CANCELLED' ? Number(order.totalAmount) : 0;
  };

  const totalAmount = calculateTotalAmount();
  const isTablePayment = relatedOrders.length > 0;

  // For table payments, create a combined order for display
  const validOrders = relatedOrders.filter((o) => o.status !== 'CANCELLED');
  const displayOrder: OrderWithDetails = isTablePayment
    ? ({
        ...order,
        orderNumber: validOrders.map((o) => o.orderNumber).join(', '),
        totalAmount: totalAmount as unknown as typeof order.totalAmount,
        subtotalAmount: validOrders.reduce(
          (sum, o) => sum + Number(o.subtotalAmount),
          0
        ) as unknown as typeof order.subtotalAmount,
        taxAmount: validOrders.reduce(
          (sum, o) => sum + Number(o.taxAmount || 0),
          0
        ) as unknown as typeof order.taxAmount,
        serviceCharge: validOrders.reduce(
          (sum, o) => sum + Number(o.serviceCharge || 0),
          0
        ) as unknown as typeof order.serviceCharge,
        items: validOrders.flatMap((o) => o.items || []),
        // Preserve tax and service charge labels from restaurant or order
        taxLabel: order.restaurant?.taxLabel || order.taxLabel,
        serviceChargeLabel:
          order.restaurant?.serviceChargeLabel || order.serviceChargeLabel,
      } as OrderWithDetails)
    : order;

  console.log('[PaymentInterface] Payment setup:', {
    orderId: order.id,
    tableId: order.tableId,
    relatedOrdersCount: relatedOrders.length,
    relatedOrderIds: relatedOrders.map((o) => o.id),
    isTablePayment,
    totalAmount,
  });

  const handleCashPayment = async (data: { cashReceived: number }) => {
    console.log('[PaymentInterface] handleCashPayment called', data);
    setIsProcessing(true);
    setError('');

    try {
      console.log('[PaymentInterface] Calling processPayment service...');

      // Use table payment endpoint if this is a table payment
      const result = isTablePayment
        ? await import('@/lib/services/payment-service').then((m) =>
            m.processTablePayment(order.tableId, {
              paymentMethod: 'cash',
              cashReceived: data.cashReceived,
            })
          )
        : await import('@/lib/services/payment-service').then((m) =>
            m.processPayment({
              orderId: order.id,
              paymentMethod: 'cash',
              cashReceived: data.cashReceived,
            })
          );

      console.log('[PaymentInterface] processPayment result:', result);

      if (result.success) {
        setCompletedPayment(result.payment);
      } else {
        console.warn('[PaymentInterface] Payment failed:', result.message);
        setError(result.message || 'Payment processing failed');
      }
    } catch (err) {
      console.error('[PaymentInterface] Exception:', err);
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
      // Use table payment endpoint if this is a table payment
      const result = isTablePayment
        ? await import('@/lib/services/payment-service').then((m) =>
            m.processTablePayment(order.tableId, {
              paymentMethod: selectedMethod,
            })
          )
        : await import('@/lib/services/payment-service').then((m) =>
            m.processPayment({
              orderId: order.id,
              paymentMethod: selectedMethod,
            })
          );

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
            <OrderDetails
              order={displayOrder}
              currency={currency}
              showOrderNumber={false}
            />

            {/* Error Message */}
            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                <p className="text-sm text-red-800">{error}</p>
              </div>
            )}

            {/* Payment Method Selection */}
            {!selectedMethod && (
              <PaymentMethodSelector
                onSelect={handleMethodSelect}
                enabledMethods={paymentMethods}
              />
            )}

            {selectedMethod === 'cash' && (
              <CashPaymentForm
                totalAmount={totalAmount}
                onSubmit={handleCashPayment}
                onCancel={() => setSelectedMethod(null)}
                isProcessing={isProcessing}
                currency={currency}
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

      {completedPayment && restaurantInfo && cashierInfo && (
        <Receipt
          order={displayOrder}
          payment={completedPayment}
          currency={currency}
          restaurantInfo={restaurantInfo}
          cashierInfo={cashierInfo}
          onClose={handleReceiptClose}
        />
      )}
    </>
  );
}
