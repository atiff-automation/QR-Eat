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

import { useState, useRef } from 'react';
import type { PublicReceiptData } from '@/types/pos';
import { Share2, Printer, Download } from 'lucide-react';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';

interface PublicReceiptViewProps {
  receipt: PublicReceiptData;
}

export function PublicReceiptView({ receipt }: PublicReceiptViewProps) {
  const [isGenerating, setIsGenerating] = useState(false);
  const receiptRef = useRef<HTMLDivElement>(null);

  const handleShare = async () => {
    if (!receiptRef.current) return;

    setIsGenerating(true);
    try {
      // Capture receipt as canvas
      const canvas = await html2canvas(receiptRef.current, {
        scale: 2,
        backgroundColor: '#ffffff',
      });

      // Convert to blob
      canvas.toBlob(async (blob) => {
        if (!blob) {
          setIsGenerating(false);
          return;
        }

        const file = new File([blob], `receipt-${receipt.receiptNumber}.png`, {
          type: 'image/png',
        });

        // Try native share API
        if (navigator.share && navigator.canShare?.({ files: [file] })) {
          try {
            await navigator.share({
              files: [file],
              title: `Receipt ${receipt.receiptNumber}`,
              text: `Receipt from ${receipt.restaurant.name}`,
            });
          } catch (err) {
            console.error('Share failed:', err);
          }
        } else {
          // Fallback: download the image
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `receipt-${receipt.receiptNumber}.png`;
          a.click();
          URL.revokeObjectURL(url);
        }

        setIsGenerating(false);
      }, 'image/png');
    } catch (error) {
      console.error('Failed to generate image:', error);
      setIsGenerating(false);
    }
  };

  const handleDownloadPDF = async () => {
    if (!receiptRef.current) return;

    setIsGenerating(true);
    try {
      // Capture receipt as canvas
      const canvas = await html2canvas(receiptRef.current, {
        scale: 2,
        backgroundColor: '#ffffff',
      });

      // Create PDF
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4',
      });

      const imgWidth = 80; // 80mm thermal receipt width
      const imgHeight = (canvas.height * imgWidth) / canvas.width;

      pdf.addImage(imgData, 'PNG', 15, 10, imgWidth, imgHeight);
      pdf.save(`receipt-${receipt.receiptNumber}.pdf`);

      setIsGenerating(false);
    } catch (error) {
      console.error('Failed to generate PDF:', error);
      setIsGenerating(false);
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
          disabled={isGenerating}
          className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium transition-colors disabled:opacity-50"
        >
          <Printer className="w-4 h-4" />
          Print
        </button>
        <button
          onClick={handleDownloadPDF}
          disabled={isGenerating}
          className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium transition-colors disabled:opacity-50"
        >
          <Download className="w-4 h-4" />
          {isGenerating ? 'Generating...' : 'PDF'}
        </button>
        <button
          onClick={handleShare}
          disabled={isGenerating}
          className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium transition-colors disabled:opacity-50"
        >
          <Share2 className="w-4 h-4" />
          {isGenerating ? 'Generating...' : 'Share'}
        </button>
      </div>

      {/* Receipt Display - Thermal Printer Style */}
      <div
        ref={receiptRef}
        className="max-w-md mx-auto bg-white shadow-lg rounded-lg overflow-hidden"
      >
        <div className="p-6 font-mono text-sm">
          {/* Header */}
          <div className="text-center mb-4 pb-4 border-b-2 border-dashed border-gray-300">
            <h1 className="text-lg font-bold mb-1">
              {receipt.restaurant.name}
            </h1>
            <p className="text-xs text-gray-800">
              {receipt.restaurant.address}
            </p>
            <p className="text-xs text-gray-800">
              Tel: {receipt.restaurant.phone}
            </p>
            {receipt.restaurant.email && (
              <p className="text-xs text-gray-800">
                {receipt.restaurant.email}
              </p>
            )}
          </div>

          {/* Receipt Info */}
          <div className="mb-4 pb-4 border-b border-dashed border-gray-300">
            <div className="flex justify-between mb-1">
              <span className="text-gray-800">Receipt #:</span>
              <span className="font-semibold">{receipt.receiptNumber}</span>
            </div>
            <div className="flex justify-between mb-1">
              <span className="text-gray-800">Order #:</span>
              <span>{receipt.order.orderNumber}</span>
            </div>
            <div className="flex justify-between mb-1">
              <span className="text-gray-800">Date:</span>
              <span>{formatDate(receipt.order.createdAt)}</span>
            </div>
            <div className="flex justify-between mb-1">
              <span className="text-gray-800">Table:</span>
              <span>{receipt.order.tableName}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-800">Cashier:</span>
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
              <span className="text-gray-800">Subtotal:</span>
              <span>{formatCurrency(receipt.order.subtotalAmount)}</span>
            </div>
            <div className="flex justify-between mb-1">
              <span className="text-gray-800">
                {receipt.restaurant.taxLabel || 'Tax'}:
              </span>
              <span>{formatCurrency(receipt.order.taxAmount)}</span>
            </div>
            <div className="flex justify-between mb-2">
              <span className="text-gray-800">
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
              <span className="text-gray-800">Payment Method:</span>
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
          <div className="text-center text-xs text-gray-800">
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
