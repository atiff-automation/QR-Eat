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
import { ReceiptCard } from '@/components/receipt/ReceiptCard';
import { adaptPublicToDisplay } from '@/lib/utils/receipt-adapter';

interface PublicReceiptViewProps {
  receipt: PublicReceiptData;
}

export function PublicReceiptView({ receipt }: PublicReceiptViewProps) {
  const handlePrint = () => {
    window.print();
  };

  const receiptDisplayData = adaptPublicToDisplay(receipt);

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

      {/* Shared Receipt Card */}
      <div className="max-w-md mx-auto">
        <ReceiptCard data={receiptDisplayData} />
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
