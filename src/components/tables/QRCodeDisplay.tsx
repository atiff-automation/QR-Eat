import React, { useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { X, Printer, Share2, Copy, RotateCcw, Check } from 'lucide-react';
import { buildSubdomainUrl } from '@/lib/config/domains';

interface QRCodeDisplayProps {
  tableId: string;
  tableNumber: string;
  tableName?: string;
  restaurantName: string;
  restaurantSlug?: string;
  qrToken?: string;
  onClose: () => void;
  onRegenerate: (tableId: string) => void;
}

export const QRCodeDisplay: React.FC<QRCodeDisplayProps> = ({
  tableId,
  tableNumber,
  tableName,
  restaurantName,
  restaurantSlug,
  qrToken,
  onClose,
  onRegenerate,
}) => {
  const [copied, setCopied] = useState(false);
  // Use token if available, otherwise fallback to ID (though ID is static)
  const codeToUse = qrToken || tableId;

  // ✅ Use subdomain if slug provided, fallback to current origin
  const qrValue = restaurantSlug
    ? buildSubdomainUrl(restaurantSlug, `/qr/${codeToUse}`)
    : `${window.location.origin}/qr/${codeToUse}`;

  const handlePrint = () => {
    window.print();
  };

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(qrValue);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy', err);
    }
  };

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: `${restaurantName} - Table ${tableNumber}`,
          text: `Order at Table ${tableNumber}`,
          url: qrValue,
        });
      } catch (err) {
        console.log('Share canceled', err);
      }
    } else {
      handleCopyLink();
    }
  };

  return (
    <>
      <style>
        {`
          @media print {
            body > * { display: none !important; }
            .print-only-qr { 
              display: flex !important; 
              position: fixed; 
              top: 0; 
              left: 0; 
              width: 100%; 
              height: 100%; 
              align-items: center; 
              justify-content: center;
              background: white; 
              z-index: 9999;
            }
            .print-hide { display: none !important; }
          }
        `}
      </style>
      <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 print-only-qr">
        {/* Backdrop: Transparent (relies on underlying modal's backdrop) */}
        <div
          className="absolute inset-0 bg-transparent transition-opacity print-hide"
          onClick={onClose}
        />

        {/* Modal Card */}
        <div className="relative bg-white w-full max-w-sm rounded-3xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200 ring-1 ring-black/5">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 print-hide">
            <h3 className="text-base font-bold text-gray-900">QR Code</h3>
            <button
              onClick={onClose}
              className="p-1.5 bg-gray-50 rounded-full hover:bg-gray-100 transition-colors"
            >
              <X className="w-4 h-4 text-gray-500" />
            </button>
          </div>

          {/* Content */}
          <div className="p-4 flex flex-col items-center space-y-3">
            {/* QR Code */}
            <div className="p-2 bg-white border-2 border-gray-100 rounded-2xl shadow-sm">
              <QRCodeSVG
                value={qrValue}
                size={200}
                level="H"
                includeMargin={true}
                className="w-full h-auto"
              />
            </div>

            {/* Table Info */}
            <div className="text-center space-y-0.5">
              <h4 className="text-lg font-bold text-gray-900">
                Table {tableNumber}
              </h4>
              {tableName && (
                <p className="text-xs font-medium text-gray-500">{tableName}</p>
              )}
              <p className="text-[10px] text-gray-400 font-mono mt-0.5">
                Ref: {codeToUse.substring(0, 8)}...
              </p>
            </div>

            {/* Action Grid */}
            <div className="grid grid-cols-3 gap-2 w-full pt-1 print-hide">
              <button
                onClick={handleShare}
                className="flex items-center justify-center gap-1.5 h-8 rounded-lg bg-gray-50 hover:bg-gray-100 border border-gray-100 transition-all active:scale-95"
              >
                <Share2 className="w-3.5 h-3.5 text-blue-600" />
                <span className="text-[11px] font-bold text-gray-700">
                  Share
                </span>
              </button>

              <button
                onClick={handlePrint}
                className="flex items-center justify-center gap-1.5 h-8 rounded-lg bg-gray-50 hover:bg-gray-100 border border-gray-100 transition-all active:scale-95"
              >
                <Printer className="w-3.5 h-3.5 text-purple-600" />
                <span className="text-[11px] font-bold text-gray-700">
                  Print
                </span>
              </button>

              <button
                onClick={handleCopyLink}
                className="flex items-center justify-center gap-1.5 h-8 rounded-lg bg-gray-50 hover:bg-gray-100 border border-gray-100 transition-all active:scale-95"
              >
                {copied ? (
                  <Check className="w-3.5 h-3.5 text-green-600" />
                ) : (
                  <Copy className="w-3.5 h-3.5 text-gray-600" />
                )}
                <span className="text-[11px] font-bold text-gray-700">
                  {copied ? 'Copied' : 'Copy'}
                </span>
              </button>
            </div>
          </div>

          {/* Footer / Reset Link */}
          <div className="p-2.5 bg-gray-50 border-t border-gray-100 text-center print-hide">
            <button
              onClick={() => {
                if (
                  window.confirm(
                    'Are you sure you want to regenerate this QR code? The old code will stop working.'
                  )
                ) {
                  onRegenerate(tableId);
                }
              }}
              className="text-[10px] font-medium text-gray-400 hover:text-red-500 flex items-center justify-center gap-1.5 mx-auto transition-colors"
            >
              <RotateCcw className="w-3 h-3" />
              Reset QR Token
            </button>
          </div>
        </div>
      </div>
    </>
  );
};
