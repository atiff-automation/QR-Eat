/**
 * Receipt Card Component
 *
 * Visual representation of the receipt.
 * Shared between POS (post-payment) and Public (QR scan) views.
 *
 * Following CLAUDE.md principles:
 * - Pure Presentation Component
 * - Single Source of Truth
 */

import { ReceiptDisplayData } from '@/types/receipt';

interface ReceiptCardProps {
  data: ReceiptDisplayData;
}

export function ReceiptCard({ data }: ReceiptCardProps) {
  const { receiptNumber, restaurant, order, payment, cashier } = data;

  const formatCurrency = (amount: number) => {
    return `RM ${amount.toFixed(2)}`;
  };

  const formatDate = (date: Date) => {
    return new Date(date).toLocaleString('en-MY', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="bg-white shadow-lg rounded-lg overflow-hidden">
      <div className="p-6 font-mono text-sm leading-relaxed">
        {/* Header */}
        <div className="text-center mb-4 pb-4 border-b-2 border-dashed border-gray-300">
          <h1 className="text-lg font-bold mb-1 text-black uppercase">
            {restaurant.name}
          </h1>
          <p className="text-xs text-black">{restaurant.address}</p>
          <p className="text-xs text-black">Tel: {restaurant.phone}</p>
          {restaurant.email && (
            <p className="text-xs text-black">{restaurant.email}</p>
          )}
        </div>

        {/* Receipt Info */}
        <div className="mb-4 pb-4 border-b border-dashed border-gray-300">
          <div className="flex justify-between mb-1">
            <span className="text-black">Receipt #:</span>
            <span className="font-semibold text-black">{receiptNumber}</span>
          </div>
          <div className="flex justify-between mb-1">
            <span className="text-black">Order #:</span>
            <span className="text-black">{order.orderNumber}</span>
          </div>
          <div className="flex justify-between mb-1">
            <span className="text-black">Date:</span>
            <span className="text-black">{formatDate(order.createdAt)}</span>
          </div>
          <div className="flex justify-between mb-1">
            <span className="text-black">Table:</span>
            <span className="text-black">{order.tableName}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-black">Cashier:</span>
            <span className="text-black">
              {cashier.firstName} {cashier.lastName}
            </span>
          </div>
        </div>

        {/* Items */}
        <div className="mb-4 pb-4 border-b border-dashed border-gray-300 space-y-2">
          {order.items.map((item, index) => (
            <div key={index} className="flex justify-between items-start">
              <span className="text-black flex-1 pr-4">
                {item.name} <span className="text-xs">x{item.quantity}</span>
              </span>
              <span className="text-black whitespace-nowrap">
                {formatCurrency(item.totalAmount)}
              </span>
            </div>
          ))}
        </div>

        {/* Totals */}
        <div className="mb-4 space-y-1">
          <div className="flex justify-between">
            <span className="text-black">Subtotal:</span>
            <span className="text-black">
              {formatCurrency(order.subtotalAmount)}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-black">{restaurant.taxLabel || 'Tax'}:</span>
            <span className="text-black">
              {formatCurrency(order.taxAmount)}
            </span>
          </div>
          <div className="flex justify-between mb-2">
            <span className="text-black">
              {restaurant.serviceChargeLabel || 'Service Charge'}:
            </span>
            <span className="text-black">
              {formatCurrency(order.serviceCharge)}
            </span>
          </div>
          <div className="flex justify-between text-lg font-bold pt-2 border-t border-gray-300">
            <span className="text-black">TOTAL:</span>
            <span className="text-black">
              {formatCurrency(order.totalAmount)}
            </span>
          </div>
        </div>

        {/* Payment Details */}
        <div className="mb-4 pb-4 border-b border-dashed border-gray-300">
          <div className="flex justify-between mb-1">
            <span className="text-black">Payment Method:</span>
            <span className="uppercase text-black">{payment.method}</span>
          </div>
          {payment.cashReceived !== undefined && (
            <>
              <div className="flex justify-between mb-1">
                <span className="text-black">Cash Received:</span>
                <span className="text-black">
                  {formatCurrency(payment.cashReceived)}
                </span>
              </div>
              {payment.changeGiven !== undefined && (
                <div className="flex justify-between">
                  <span className="text-black">Change Given:</span>
                  <span className="text-black">
                    {formatCurrency(payment.changeGiven)}
                  </span>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="text-center text-xs text-black space-y-1">
          <p>Thank you for dining with us!</p>
          <p>Please come again!</p>
        </div>
      </div>
    </div>
  );
}
