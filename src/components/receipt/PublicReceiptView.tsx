/**
 * Public Receipt View Component
 *
 * Displays receipt in thermal printer format for customers
 * Uses browser's native print functionality
 *
 * Following CLAUDE.md principles:
 * - Type Safety
 * - Mobile-First Design
 * - User Experience
 */

'use client';

import type { PublicReceiptData } from '@/types/pos';
import { Printer } from 'lucide-react';

interface PublicReceiptViewProps {
  receipt: PublicReceiptData;
}

export function PublicReceiptView({ receipt }: PublicReceiptViewProps) {
  const handlePrint = () => {
    window.print();
  };

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
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      {/* Action Buttons - Hide on print */}
      <div className="max-w-md mx-auto mb-4 print:hidden">
        <button
          onClick={handlePrint}
          className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium transition-colors shadow-sm"
        >
          <Printer className="w-5 h-5" />
          Print / Save as PDF
        </button>
        <p className="text-center text-sm text-gray-600 mt-2">
          Use your browser&apos;s print dialog to save as PDF or print
        </p>
      </div>

      {/* Receipt Display - Thermal Printer Style */}
      <div className="max-w-md mx-auto bg-white shadow-lg rounded-lg overflow-hidden">
        <div className="p-6 font-mono text-sm">
          {/* Header */}
          <div className="text-center mb-4 pb-4 border-b-2 border-dashed border-gray-300">
            <h1 className="text-lg font-bold mb-1">
              {receipt.restaurant.name}
            </h1>
            <p className="text-xs text-black">{receipt.restaurant.address}</p>
            <p className="text-xs text-black">
              Tel: {receipt.restaurant.phone}
            </p>
            {receipt.restaurant.email && (
              <p className="text-xs text-black">{receipt.restaurant.email}</p>
            )}
          </div>

          {/* Receipt Info */}
          <div className="mb-4 pb-4 border-b border-dashed border-gray-300">
            <div className="flex justify-between mb-1">
              <span className="text-black">Receipt #:</span>
              <span className="font-semibold text-black">
                {receipt.receiptNumber}
              </span>
            </div>
            <div className="flex justify-between mb-1">
              <span className="text-black">Order #:</span>
              <span className="text-black">{receipt.order.orderNumber}</span>
            </div>
            <div className="flex justify-between mb-1">
              <span className="text-black">Date:</span>
              <span className="text-black">
                {formatDate(receipt.order.createdAt)}
              </span>
            </div>
            <div className="flex justify-between mb-1">
              <span className="text-black">Table:</span>
              <span className="text-black">{receipt.order.tableName}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-black">Cashier:</span>
              <span className="text-black">
                {receipt.cashier.firstName} {receipt.cashier.lastName}
              </span>
            </div>
          </div>

          {/* Items */}
          <div className="mb-4 pb-4 border-b border-dashed border-gray-300">
            {receipt.order.items.map((item, index) => (
              <div key={index} className="mb-2">
                <div className="flex justify-between">
                  <span className="text-black">
                    {item.name} x{item.quantity}
                  </span>
                  <span className="text-black">
                    {formatCurrency(item.totalAmount)}
                  </span>
                </div>
              </div>
            ))}
          </div>

          {/* Totals */}
          <div className="mb-4">
            <div className="flex justify-between mb-1">
              <span className="text-black">Subtotal:</span>
              <span className="text-black">
                {formatCurrency(receipt.order.subtotalAmount)}
              </span>
            </div>
            <div className="flex justify-between mb-1">
              <span className="text-black">
                {receipt.restaurant.taxLabel || 'Tax'}:
              </span>
              <span className="text-black">
                {formatCurrency(receipt.order.taxAmount)}
              </span>
            </div>
            <div className="flex justify-between mb-2">
              <span className="text-black">
                {receipt.restaurant.serviceChargeLabel || 'Service Charge'}:
              </span>
              <span className="text-black">
                {formatCurrency(receipt.order.serviceCharge)}
              </span>
            </div>
            <div className="flex justify-between text-lg font-bold pt-2 border-t border-gray-300">
              <span className="text-black">TOTAL:</span>
              <span className="text-black">
                {formatCurrency(receipt.order.totalAmount)}
              </span>
            </div>
          </div>

          {/* Payment Details */}
          <div className="mb-4 pb-4 border-b border-dashed border-gray-300">
            <div className="flex justify-between mb-1">
              <span className="text-black">Payment Method:</span>
              <span className="uppercase">{receipt.payment.method}</span>
            </div>
            {receipt.payment.cashReceived && (
              <>
                <div className="flex justify-between mb-1">
                  <span className="text-gray-800">Cash Received:</span>
                  <span>{formatCurrency(receipt.payment.cashReceived)}</span>
                </div>
                {receipt.payment.changeGiven && (
                  <div className="flex justify-between">
                    <span className="text-gray-800">Change Given:</span>
                    <span>{formatCurrency(receipt.payment.changeGiven)}</span>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Footer */}
          <div className="text-center text-xs text-black">
            <p className="mb-1">Thank you for dining with us!</p>
            <p>Please come again!</p>
          </div>
        </div>
      </div>

      {/* Print Styles */}
      <style jsx global>{`
        @media print {
          body {
            background: white;
          }
          .print\\:hidden {
            display: none !important;
          }
        }
      `}</style>
    </div>
  );
}
