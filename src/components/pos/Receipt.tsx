/**
 * Receipt Component
 *
 * Following CLAUDE.md principles:
 * - Type Safety
 * - No Hardcoding
 *
 * @see claudedocs/POS_IMPLEMENTATION_PLAN.md
 */

'use client';

import type { ReceiptProps } from '@/types/pos';
import { formatReceiptData } from '@/lib/utils/receipt-formatter';
import { Printer, X } from 'lucide-react';

export function Receipt({ order, payment, onClose }: ReceiptProps) {
  const receiptText = formatReceiptData({
    receiptNumber: payment.receiptNumber || 'N/A',
    order,
    payment,
    restaurant: {
      name: 'QR Restaurant', // TODO: Get from context
      address: '123 Main Street, Kuala Lumpur',
      phone: '+60 12-345 6789',
      email: 'info@qrrestaurant.com',
    },
    cashier: {
      firstName: 'Cashier', // TODO: Get from auth context
      lastName: 'User',
    },
  });

  const handlePrint = () => {
    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write('<html><head><title>Receipt</title>');
      printWindow.document.write('<style>');
      printWindow.document.write(
        'body { font-family: monospace; white-space: pre; }'
      );
      printWindow.document.write('</style></head><body>');
      printWindow.document.write(receiptText);
      printWindow.document.write('</body></html>');
      printWindow.document.close();
      printWindow.print();
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">
            Payment Receipt
          </h3>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <div className="p-6">
          <div className="bg-gray-50 p-4 rounded-lg mb-6 overflow-x-auto">
            <pre className="text-xs font-mono whitespace-pre">
              {receiptText}
            </pre>
          </div>

          <div className="flex gap-3">
            <button
              onClick={handlePrint}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium transition-colors"
            >
              <Printer className="w-5 h-5" />
              Print Receipt
            </button>
            <button
              onClick={onClose}
              className="flex-1 px-4 py-3 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 font-medium transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
