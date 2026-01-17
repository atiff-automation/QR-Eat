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
import { formatCurrencySimple } from '@/lib/utils/currency-formatter';

interface ReceiptCardProps {
  data: ReceiptDisplayData;
}

export function ReceiptCard({ data }: ReceiptCardProps) {
  const { receiptNumber, restaurant, order, payment, cashier } = data;

  const formatCurrency = (amount: number) => {
    return formatCurrencySimple(amount, restaurant.currency || 'MYR');
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
        <div className="mb-4 pb-4 border-b border-dashed border-gray-300 space-y-1">
          <div className="flex justify-between gap-4">
            <span className="text-black shrink-0">Receipt #:</span>
            <span className="font-semibold text-black text-right break-all">
              {receiptNumber}
            </span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-black shrink-0">Order #:</span>
            <div className="text-black text-right">
              {order.orderNumber.split(', ').map((num, i) => (
                <div key={i}>{num}</div>
              ))}
            </div>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-black shrink-0">Date:</span>
            <span className="text-black text-right">
              {formatDate(order.createdAt)}
            </span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-black shrink-0">Table:</span>
            <span className="text-black text-right">
              {data.order.tableName}
              {data.order.tableLocation && (
                <span className="text-gray-500 font-normal block text-xs">
                  ({data.order.tableLocation})
                </span>
              )}
            </span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-black shrink-0">Cashier:</span>
            <span className="text-black text-right">
              {cashier.firstName} {cashier.lastName}
            </span>
          </div>
        </div>

        {/* Items */}
        <div className="mb-4 pb-4 border-b border-dashed border-gray-300 space-y-2">
          {order.items.map((item, index) => (
            <div key={index} className="flex justify-between items-start">
              <div className="flex-1 pr-4">
                <span className="text-black block">
                  {item.name} <span className="text-xs">x{item.quantity}</span>
                </span>
                {item.selectedOptions && item.selectedOptions.length > 0 && (
                  <div className="text-xs text-gray-500 mt-0.5 pl-2">
                    {item.selectedOptions.map((opt, i) => (
                      <div key={i}>
                        + {opt.name}{' '}
                        {opt.priceModifier > 0 &&
                          `(${formatCurrency(opt.priceModifier)})`}
                      </div>
                    ))}
                  </div>
                )}
              </div>
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
          {payment.method === 'cash' && payment.cashReceived !== undefined && (
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
