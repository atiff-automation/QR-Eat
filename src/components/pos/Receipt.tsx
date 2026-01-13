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
      currency: restaurantInfo.currency,
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
          <div className="flex items-center gap-3">
            <h3 className="text-lg font-semibold text-gray-900">
              Payment Receipt
            </h3>
            <button
              onClick={() => setShowQR(true)}
              className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-xs font-medium rounded-md hover:bg-blue-700 transition-colors"
            >
              <QrCode className="w-3.5 h-3.5" />
              Show QR
            </button>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="p-4 overflow-y-auto">
          {/* Card Wrapper for consistent shadow/border if needed, 
              though ReceiptCard has its own shadow. 
              We'll add a bit of padding/bg to distinguish it from the modal. */}
          <div className="bg-gray-50 p-2 rounded-lg">
            <ReceiptCard data={receiptDisplayData} />
          </div>
        </div>

        {/* Mobile Sticky Footer */}
        <div className="p-4 border-t border-gray-200 bg-white sm:hidden sticky bottom-0 z-10">
          <button
            onClick={() => setShowQR(true)}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium transition-colors shadow-sm"
          >
            <QrCode className="w-5 h-5" />
            Show QR Code
          </button>
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
