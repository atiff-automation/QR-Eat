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
import { QrCode, X } from 'lucide-react';
import { ReceiptQRDisplay } from './ReceiptQRDisplay';
import { ReceiptCard } from '@/components/receipt/ReceiptCard';
import { adaptPosToDisplay } from '@/lib/utils/receipt-adapter';

export function Receipt({
  order,
  payment,
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

  // Create unified receipt data structure
  const receiptData = {
    receiptNumber: payment.receiptNumber || 'N/A',
    order,
    payment,
    restaurant: {
      name: restaurantInfo.name,
      address: restaurantInfo.address,
      phone: restaurantInfo.phone,
      email: restaurantInfo.email,
    },
    cashier: {
      firstName: cashierInfo.firstName,
      lastName: cashierInfo.lastName,
    },
  };

  const receiptDisplayData = adaptPosToDisplay(receiptData);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[70]">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 bg-white sticky top-0 z-10">
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

        {/* Scrollable Content */}
        <div className="p-6 overflow-y-auto">
          {/* Card Wrapper for consistent shadow/border if needed, 
              though ReceiptCard has its own shadow. 
              We'll add a bit of padding/bg to distinguish it from the modal. */}
          <div className="bg-gray-50 p-4 rounded-lg mb-6">
            <ReceiptCard data={receiptDisplayData} />
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
