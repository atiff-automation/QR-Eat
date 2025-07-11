'use client';

import { PaymentIntent } from '@/types/payment';
import { formatCurrency, getPaymentStatusDisplay } from '@/lib/payment-utils';
import { Button } from '@/components/ui/Button';

interface PaymentSuccessProps {
  paymentIntent: PaymentIntent;
  orderNumber: string;
  onNewOrder: () => void;
}

export function PaymentSuccess({
  paymentIntent,
  orderNumber,
  onNewOrder,
}: PaymentSuccessProps) {
  const statusDisplay = getPaymentStatusDisplay(paymentIntent.status);
  const tip = (paymentIntent.metadata?.tip as number) || 0;
  const transactionId = paymentIntent.metadata?.transactionId as string;

  return (
    <div className="bg-white rounded-lg p-6 text-center">
      <div className="mb-6">
        <div className="text-6xl mb-4">{statusDisplay.icon}</div>
        <h2 className="text-2xl font-bold text-gray-900 mb-2">
          Payment {paymentIntent.status === 'succeeded' ? 'Successful' : 'Processed'}
        </h2>
        <p className="text-gray-600">
          Thank you for your payment!
        </p>
      </div>

      {/* Payment Details */}
      <div className="bg-gray-50 rounded-lg p-4 mb-6">
        <h3 className="font-semibold text-gray-900 mb-3">Payment Details</h3>
        
        <div className="space-y-2 text-sm text-left">
          <div className="flex justify-between">
            <span className="text-gray-600">Order Number:</span>
            <span className="font-medium">{orderNumber}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">Payment ID:</span>
            <span className="font-mono text-xs">{paymentIntent.id}</span>
          </div>
          {transactionId && (
            <div className="flex justify-between">
              <span className="text-gray-600">Transaction ID:</span>
              <span className="font-mono text-xs">{transactionId}</span>
            </div>
          )}
          <div className="flex justify-between">
            <span className="text-gray-600">Status:</span>
            <span className={`px-2 py-1 rounded-full text-xs font-medium ${statusDisplay.color}`}>
              {statusDisplay.label}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">Amount:</span>
            <span className="font-medium">{formatCurrency(paymentIntent.amount)}</span>
          </div>
          {tip > 0 && (
            <div className="flex justify-between">
              <span className="text-gray-600">Tip:</span>
              <span className="font-medium">{formatCurrency(tip)}</span>
            </div>
          )}
          <div className="border-t pt-2 mt-2">
            <div className="flex justify-between font-semibold">
              <span>Total Paid:</span>
              <span>{formatCurrency(paymentIntent.amount + tip)}</span>
            </div>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">Date:</span>
            <span>{new Date(paymentIntent.confirmedAt || paymentIntent.createdAt).toLocaleString()}</span>
          </div>
        </div>
      </div>

      {/* Success Messages by Payment Method */}
      {paymentIntent.paymentMethodId === 'cash' && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
          <div className="flex items-start space-x-2">
            <span className="text-blue-600">💵</span>
            <div className="text-sm text-blue-800">
              <p className="font-medium">Cash Payment Confirmed</p>
              <p>Our staff has confirmed receipt of your cash payment.</p>
            </div>
          </div>
        </div>
      )}

      {paymentIntent.paymentMethodId === 'card' && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6">
          <div className="flex items-start space-x-2">
            <span className="text-green-600">💳</span>
            <div className="text-sm text-green-800">
              <p className="font-medium">Card Payment Processed</p>
              <p>Your payment has been securely processed.</p>
            </div>
          </div>
        </div>
      )}

      {paymentIntent.paymentMethodId === 'digital_wallet' && (
        <div className="bg-purple-50 border border-purple-200 rounded-lg p-4 mb-6">
          <div className="flex items-start space-x-2">
            <span className="text-purple-600">📱</span>
            <div className="text-sm text-purple-800">
              <p className="font-medium">Digital Wallet Payment Complete</p>
              <p>Your digital wallet payment was successful.</p>
            </div>
          </div>
        </div>
      )}

      {/* Next Steps */}
      <div className="bg-gray-50 rounded-lg p-4 mb-6">
        <h4 className="font-medium text-gray-900 mb-2">What's Next?</h4>
        <div className="text-sm text-gray-600 space-y-1">
          <p>✅ Your order is now confirmed and being prepared</p>
          <p>🍽️ You'll be notified when your food is ready</p>
          <p>📱 Keep this screen handy for order updates</p>
        </div>
      </div>

      {/* Actions */}
      <div className="space-y-3">
        <Button
          onClick={onNewOrder}
          variant="outline"
          className="w-full"
        >
          Place Another Order
        </Button>
        
        <button
          onClick={() => window.print()}
          className="w-full text-sm text-gray-600 hover:text-gray-800 underline"
        >
          Print Receipt
        </button>
      </div>

      {/* Footer */}
      <div className="mt-6 pt-4 border-t text-xs text-gray-500">
        <p>Need help? Please ask our staff for assistance.</p>
        <p className="mt-1">Thank you for dining with us!</p>
      </div>
    </div>
  );
}