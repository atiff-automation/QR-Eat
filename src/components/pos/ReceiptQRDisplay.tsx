/**
 * Receipt QR Display Component
 *
 * Shows QR code for customers to scan and access their receipt
 * Optimized for mobile/PWA display
 *
 * Following CLAUDE.md principles:
 * - Type Safety
 * - Single Responsibility
 * - Mobile-First Design
 */

'use client';

import { QRCodeSVG } from 'qrcode.react';
import { X } from 'lucide-react';
import type { ReceiptQRDisplayProps } from '@/types/pos';
import { buildPublicReceiptUrl } from '@/lib/utils/receipt-url';

export function ReceiptQRDisplay({
  receiptNumber,
  restaurantSlug,
  onClose,
}: ReceiptQRDisplayProps) {
  // Build the public receipt URL
  const receiptUrl = buildPublicReceiptUrl(receiptNumber, restaurantSlug);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[80]">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full mx-4 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">
            Receipt QR Code
          </h3>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-full transition-colors"
            aria-label="Close"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* QR Code Display */}
        <div className="p-8 flex flex-col items-center">
          {/* QR Code */}
          <div className="bg-white p-4 rounded-xl border-2 border-gray-200 mb-6">
            <QRCodeSVG
              value={receiptUrl}
              size={256}
              level="H"
              includeMargin={false}
            />
          </div>

          {/* Receipt Info */}
          <div className="text-center mb-4">
            <p className="text-sm font-medium text-gray-700 mb-1">
              Receipt #{receiptNumber}
            </p>
            <p className="text-xs text-gray-500">
              Show this QR code to customer to get receipt copy
            </p>
          </div>

          {/* Close Button */}
          <button
            onClick={onClose}
            className="w-full px-4 py-3 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 font-medium transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
