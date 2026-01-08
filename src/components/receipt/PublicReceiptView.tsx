/**
 * Public Receipt View Component
 *
 * Displays receipt in thermal printer format for customers
 * Includes PDF download and share functionality
 *
 * Following CLAUDE.md principles:
 * - Type Safety
 * - Mobile-First Design
 * - User Experience
 */

'use client';

import { useState } from 'react';
import type { PublicReceiptData } from '@/types/pos';
import { Share2, Printer, Copy, Check } from 'lucide-react';

interface PublicReceiptViewProps {
  receipt: PublicReceiptData;
}

export function PublicReceiptView({ receipt }: PublicReceiptViewProps) {
  const [copied, setCopied] = useState(false);

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: `Receipt ${receipt.receiptNumber}`,
          text: `Receipt from ${receipt.restaurant.name}`,
          url: window.location.href,
        });
      } catch (err) {
        console.error('Share failed:', err);
      }
    } else {
      // Fallback to WhatsApp
      const text = encodeURIComponent(
        `Receipt ${receipt.receiptNumber} from ${receipt.restaurant.name}`
      );
      const url = encodeURIComponent(window.location.href);
      window.open(`https://wa.me/?text=${text}%20${url}`, '_blank');
    }
  };

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
      <div className="max-w-md mx-auto mb-4 flex gap-2 print:hidden">
        <button
          onClick={handlePrint}
          className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium transition-colors"
        >
          <Printer className="w-4 h-4" />
          Print
        </button>
        <button
          onClick={handleCopyLink}
          className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium transition-colors"
        >
          {copied ? (
            <>
              <Check className="w-4 h-4 text-green-600" />
              Copied!
            </>
          ) : (
            <>
              <Copy className="w-4 h-4" />
              Copy Link
            </>
          )}
        </button>
        <button
          onClick={handleShare}
          className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium transition-colors"
        >
          <Share2 className="w-4 h-4" />
          Share
        </button>
      </div>

      {/* Receipt Display - Thermal Printer Style */}
      <div className="max-w-md mx-auto bg-white shadow-lg rounded-lg overflow-hidden">
        <div className="p-6 font-mono text-sm">
          {/* Header */}
          <div className="text-center mb-4 pb-4 border-b-2 border-dashed border-gray-300">
            <h1 className="text-lg font-bold mb-1">
              {receipt.restaurant.name}
            </h1>
            <p className="text-xs text-gray-600">
              {receipt.restaurant.address}
            </p>
            <p className="text-xs text-gray-600">
              Tel: {receipt.restaurant.phone}
            </p>
            {receipt.restaurant.email && (
              <p className="text-xs text-gray-600">
                {receipt.restaurant.email}
              </p>
            )}
          </div>

          {/* Receipt Info */}
          <div className="mb-4 pb-4 border-b border-dashed border-gray-300">
            <div className="flex justify-between mb-1">
              <span className="text-gray-600">Receipt #:</span>
              <span className="font-semibold">{receipt.receiptNumber}</span>
            </div>
            <div className="flex justify-between mb-1">
              <span className="text-gray-600">Order #:</span>
              <span>{receipt.order.orderNumber}</span>
            </div>
            <div className="flex justify-between mb-1">
              <span className="text-gray-600">Date:</span>
              <span>{formatDate(receipt.order.createdAt)}</span>
            </div>
            <div className="flex justify-between mb-1">
              <span className="text-gray-600">Table:</span>
              <span>{receipt.order.tableName}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Cashier:</span>
              <span>
                {receipt.cashier.firstName} {receipt.cashier.lastName}
              </span>
            </div>
          </div>

          {/* Items */}
          <div className="mb-4 pb-4 border-b border-dashed border-gray-300">
            {receipt.order.items.map((item, index) => (
              <div key={index} className="mb-2">
                <div className="flex justify-between">
                  <span>
                    {item.name} x{item.quantity}
                  </span>
                  <span>{formatCurrency(item.totalAmount)}</span>
                </div>
              </div>
            ))}
          </div>

          {/* Totals */}
          <div className="mb-4">
            <div className="flex justify-between mb-1">
              <span className="text-gray-600">Subtotal:</span>
              <span>{formatCurrency(receipt.order.subtotalAmount)}</span>
            </div>
            <div className="flex justify-between mb-1">
              <span className="text-gray-600">
                {receipt.restaurant.taxLabel || 'Tax'}:
              </span>
              <span>{formatCurrency(receipt.order.taxAmount)}</span>
            </div>
            <div className="flex justify-between mb-2">
              <span className="text-gray-600">
                {receipt.restaurant.serviceChargeLabel || 'Service Charge'}:
              </span>
              <span>{formatCurrency(receipt.order.serviceCharge)}</span>
            </div>
            <div className="flex justify-between text-lg font-bold pt-2 border-t border-gray-300">
              <span>TOTAL:</span>
              <span>{formatCurrency(receipt.order.totalAmount)}</span>
            </div>
          </div>

          {/* Payment Details */}
          <div className="mb-4 pb-4 border-b border-dashed border-gray-300">
            <div className="flex justify-between mb-1">
              <span className="text-gray-600">Payment Method:</span>
              <span className="uppercase">{receipt.payment.method}</span>
            </div>
            {receipt.payment.cashReceived && (
              <>
                <div className="flex justify-between mb-1">
                  <span className="text-gray-600">Cash Received:</span>
                  <span>{formatCurrency(receipt.payment.cashReceived)}</span>
                </div>
                {receipt.payment.changeGiven && (
                  <div className="flex justify-between">
                    <span className="text-gray-600">Change Given:</span>
                    <span>{formatCurrency(receipt.payment.changeGiven)}</span>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Footer */}
          <div className="text-center text-xs text-gray-600">
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
