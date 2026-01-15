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
    <div className="min-h-screen bg-gray-50 pb-32">
      {/* Shared Receipt Card */}
      <div className="max-w-md mx-auto pt-8 px-4">
        <ReceiptCard data={receiptDisplayData} />
      </div>

      {/* Sticky Bottom Action Buttons - Hide on print */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 p-4 z-50 print:hidden">
        <div className="max-w-md mx-auto">
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
