'use client';

import { useState } from 'react';
import { OrderResponse } from '@/types/order';
import { PaymentIntent, PaymentMethodType } from '@/types/payment';
import { formatCurrency } from '@/lib/payment-utils';
import { PaymentMethodSelector } from './PaymentMethodSelector';
import { TipSelector } from './TipSelector';
import { Button } from '@/components/ui/Button';

interface PaymentFormProps {
  order: OrderResponse;
  onPaymentSuccess: (paymentIntent: PaymentIntent) => void;
  onCancel: () => void;
}

export function PaymentForm({
  order,
  onPaymentSuccess,
  onCancel,
}: PaymentFormProps) {
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<string | null>(null);
  const [selectedTip, setSelectedTip] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState('');
  const [paymentStep, setPaymentStep] = useState<'method' | 'tip' | 'confirm' | 'processing'>('method');

  const totalWithTip = order.totalAmount + selectedTip;

  const handleMethodSelect = (methodId: string) => {
    setSelectedPaymentMethod(methodId);
    setError('');
  };

  const handleContinueToTip = () => {
    if (!selectedPaymentMethod) {
      setError('Please select a payment method');
      return;
    }
    setPaymentStep('tip');
  };

  const handleContinueToConfirm = () => {
    setPaymentStep('confirm');
  };

  const handleBackToMethod = () => {
    setPaymentStep('method');
    setError('');
  };

  const handleBackToTip = () => {
    setPaymentStep('tip');
    setError('');
  };

  const handlePayment = async () => {
    if (!selectedPaymentMethod) {
      setError('Please select a payment method');
      return;
    }

    setIsProcessing(true);
    setError('');
    setPaymentStep('processing');

    try {
      // Create payment intent
      const intentResponse = await fetch('/api/payment/create-intent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId: order.id,
          amount: order.totalAmount,
          currency: 'USD',
          paymentMethodId: selectedPaymentMethod,
          metadata: {
            tip: selectedTip,
            totalWithTip
          }
        }),
      });

      const intentData = await intentResponse.json();

      if (!intentResponse.ok) {
        throw new Error(intentData.error || 'Failed to create payment intent');
      }

      const paymentIntent = intentData.paymentIntent;

      // Handle different payment methods
      let confirmationData: any = {};

      switch (selectedPaymentMethod) {
        case 'cash':
          // For cash, we just need to confirm the intent
          confirmationData = { paymentMethodData: { type: 'cash' } };
          break;

        case 'card':
          // In production, this would integrate with Stripe Elements
          confirmationData = { 
            paymentMethodData: { 
              type: 'card',
              card: { brand: 'visa', last4: '4242' }
            }
          };
          break;

        case 'digital_wallet':
          // In production, this would handle Apple Pay/Google Pay
          confirmationData = {
            paymentMethodData: { type: 'digital_wallet' }
          };
          break;

        default:
          throw new Error('Unsupported payment method');
      }

      // Confirm payment
      const confirmResponse = await fetch('/api/payment/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          paymentIntentId: paymentIntent.id,
          paymentMethodData: confirmationData.paymentMethodData,
          tip: selectedTip
        }),
      });

      const confirmData = await confirmResponse.json();

      if (!confirmResponse.ok) {
        throw new Error(confirmData.error || 'Payment failed');
      }

      // Payment successful
      onPaymentSuccess({
        id: confirmData.payment.id,
        orderId: order.id,
        amount: confirmData.payment.amount,
        currency: confirmData.payment.currency,
        status: confirmData.payment.status,
        paymentMethodId: selectedPaymentMethod,
        createdAt: new Date().toISOString(),
        confirmedAt: new Date().toISOString(),
        metadata: {
          tip: confirmData.payment.tip,
          transactionId: confirmData.payment.transactionId
        }
      });

    } catch (error: any) {
      console.error('Payment failed:', error);
      setError(error.message || 'Payment failed. Please try again.');
      setPaymentStep('confirm');
    } finally {
      setIsProcessing(false);
    }
  };

  const getPaymentMethodName = (methodId: string): string => {
    switch (methodId) {
      case 'cash':
        return 'Cash';
      case 'card':
        return 'Credit/Debit Card';
      case 'digital_wallet':
        return 'Digital Wallet';
      default:
        return methodId;
    }
  };

  if (paymentStep === 'processing') {
    return (
      <div className="bg-white rounded-lg p-6">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">
            Processing Payment
          </h3>
          <p className="text-gray-600">
            Please wait while we process your payment...
          </p>
          {selectedPaymentMethod === 'cash' && (
            <p className="text-sm text-gray-500 mt-2">
              Please have your cash ready for the staff
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg p-6">
      <div className="mb-6">
        <h2 className="text-xl font-bold text-gray-900 mb-2">Payment</h2>
        <div className="text-sm text-gray-600">
          Order #{order.orderNumber} • {formatCurrency(order.totalAmount)}
        </div>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md">
          <p className="text-red-600 text-sm">{error}</p>
        </div>
      )}

      {paymentStep === 'method' && (
        <div className="space-y-6">
          <PaymentMethodSelector
            restaurantId="1" // In production, get from order/table
            selectedMethod={selectedPaymentMethod}
            onMethodSelect={handleMethodSelect}
          />

          <div className="flex space-x-3">
            <Button
              onClick={onCancel}
              variant="outline"
              className="flex-1"
            >
              Cancel
            </Button>
            <Button
              onClick={handleContinueToTip}
              disabled={!selectedPaymentMethod}
              className="flex-1"
            >
              Continue
            </Button>
          </div>
        </div>
      )}

      {paymentStep === 'tip' && (
        <div className="space-y-6">
          <TipSelector
            subtotal={order.totalAmount}
            selectedTip={selectedTip}
            onTipChange={setSelectedTip}
          />

          <div className="flex space-x-3">
            <Button
              onClick={handleBackToMethod}
              variant="outline"
              className="flex-1"
            >
              Back
            </Button>
            <Button
              onClick={handleContinueToConfirm}
              className="flex-1"
            >
              Continue
            </Button>
          </div>
        </div>
      )}

      {paymentStep === 'confirm' && (
        <div className="space-y-6">
          <div className="bg-gray-50 rounded-lg p-4">
            <h3 className="font-semibold text-gray-900 mb-3">Payment Summary</h3>
            
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span>Payment Method:</span>
                <span className="font-medium">
                  {getPaymentMethodName(selectedPaymentMethod!)}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Order Total:</span>
                <span>{formatCurrency(order.totalAmount)}</span>
              </div>
              {selectedTip > 0 && (
                <div className="flex justify-between">
                  <span>Tip:</span>
                  <span>{formatCurrency(selectedTip)}</span>
                </div>
              )}
              <div className="border-t pt-2 mt-2">
                <div className="flex justify-between font-semibold">
                  <span>Total to Pay:</span>
                  <span>{formatCurrency(totalWithTip)}</span>
                </div>
              </div>
            </div>
          </div>

          {selectedPaymentMethod === 'cash' && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
              <div className="flex items-start space-x-2">
                <span className="text-yellow-600">💡</span>
                <div className="text-sm text-yellow-800">
                  <p className="font-medium">Cash Payment Instructions:</p>
                  <p>Please have exact change ready. Our staff will confirm your payment.</p>
                </div>
              </div>
            </div>
          )}

          <div className="flex space-x-3">
            <Button
              onClick={handleBackToTip}
              variant="outline"
              className="flex-1"
            >
              Back
            </Button>
            <Button
              onClick={handlePayment}
              disabled={isProcessing}
              className="flex-1"
            >
              {isProcessing ? 'Processing...' : `Pay ${formatCurrency(totalWithTip)}`}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}