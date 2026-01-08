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

import { useState } from 'react';
import type { ReceiptProps } from '@/types/pos';
import { formatReceiptData } from '@/lib/utils/receipt-formatter';
import { QrCode, X } from 'lucide-react';
import { ReceiptQRDisplay } from './ReceiptQRDisplay';

export function Receipt({
  order,
  payment,
  currency = 'MYR',
  restaurantInfo,
  cashierInfo,
  onClose,
}: ReceiptProps) {
  const [showQR, setShowQR] = useState(false);

  console.log('[Receipt] Order data:', {
    orderNumber: order.orderNumber,
    itemsCount: order.items?.length || 0,
    items: order.items?.map((i) => ({
      name: i.menuItem?.name,
      quantity: i.quantity,
      totalAmount: i.totalAmount,
    })),
  });

  const receiptText = formatReceiptData(
    {
      receiptNumber: payment.receiptNumber || 'N/A',
      order,
      payment,
      restaurant: {
        name: restaurantInfo.name,
        address: restaurantInfo.address,
        phone: restaurantInfo.phone,
        email: restaurantInfo.email,
        taxLabel: order.taxLabel,
        serviceChargeLabel: order.serviceChargeLabel,
      },
      cashier: {
        firstName: cashierInfo.firstName,
        lastName: cashierInfo.lastName,
      },
    },
    currency
  );

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[70]">
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
              onClick={() => setShowQR(true)}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium transition-colors"
            >
              <QrCode className="w-5 h-5" />
              Show QR
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

      {/* QR Code Modal */}
      {showQR && payment.receiptNumber && (
        <ReceiptQRDisplay
          receiptNumber={payment.receiptNumber}
          restaurantId={order.restaurantId}
          onClose={() => setShowQR(false)}
        />
      )}
    </div>
  );
}
