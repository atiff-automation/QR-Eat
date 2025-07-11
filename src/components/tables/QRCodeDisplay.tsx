'use client';

import { useState, useEffect } from 'react';

interface QRCodeDisplayProps {
  tableId: string;
  tableNumber: string;
  tableName?: string;
  restaurantName: string;
  onClose: () => void;
}

interface QRCodeData {
  qrCode: string;
  qrUrl: string;
  table: {
    id: string;
    tableNumber: string;
    tableName?: string;
    restaurant: string;
  };
}

export function QRCodeDisplay({ 
  tableId, 
  tableNumber, 
  tableName, 
  restaurantName, 
  onClose 
}: QRCodeDisplayProps) {
  const [qrData, setQrData] = useState<QRCodeData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchQRCode();
  }, [tableId]);

  // Handle ESC key to close modal
  useEffect(() => {
    const handleEscKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleEscKey);
    return () => {
      document.removeEventListener('keydown', handleEscKey);
    };
  }, [onClose]);

  const fetchQRCode = async () => {
    try {
      const response = await fetch(`/api/tables/${tableId}/qr-code`);
      const data = await response.json();

      if (response.ok) {
        setQrData(data);
      } else {
        setError(data.error || 'Failed to generate QR code');
      }
    } catch (error) {
      console.error('Failed to fetch QR code:', error);
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const downloadQRCode = async (format: 'png' | 'svg') => {
    try {
      const response = await fetch(`/api/tables/${tableId}/qr-code?format=${format === 'svg' ? 'svg' : 'image'}&download=true`);
      
      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `table-${tableNumber}-qr.${format}`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
      } else {
        alert('Failed to download QR code');
      }
    } catch (error) {
      console.error('Download failed:', error);
      alert('Download failed. Please try again.');
    }
  };

  const printQRCode = () => {
    if (!qrData) return;

    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const printContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>QR Code - Table ${tableNumber}</title>
          <style>
            body {
              font-family: Arial, sans-serif;
              text-align: center;
              padding: 20px;
              margin: 0;
            }
            .qr-container {
              border: 2px solid #000;
              padding: 20px;
              margin: 20px auto;
              max-width: 400px;
              background: white;
            }
            .qr-code {
              margin: 20px 0;
            }
            .table-info {
              margin: 15px 0;
            }
            .restaurant-name {
              font-size: 24px;
              font-weight: bold;
              margin-bottom: 10px;
            }
            .table-name {
              font-size: 18px;
              margin-bottom: 5px;
            }
            .instructions {
              font-size: 14px;
              color: #666;
              margin-top: 15px;
            }
            @media print {
              body { margin: 0; }
              .no-print { display: none; }
            }
          </style>
        </head>
        <body>
          <div class="qr-container">
            <div class="restaurant-name">${restaurantName}</div>
            <div class="table-name">Table ${tableNumber}${tableName ? ` - ${tableName}` : ''}</div>
            <div class="qr-code">
              <img src="${qrData.qrCode}" alt="QR Code" style="width: 200px; height: 200px;" />
            </div>
            <div class="instructions">
              <p><strong>Scan to order:</strong></p>
              <p>1. Open your phone's camera</p>
              <p>2. Point at the QR code</p>
              <p>3. Tap the notification to open menu</p>
            </div>
          </div>
        </body>
      </html>
    `;

    printWindow.document.write(printContent);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  };

  return (
    <div 
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4 overflow-y-auto"
      onClick={(e) => {
        // Close modal when clicking on backdrop
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div 
        className="bg-white rounded-lg max-w-md w-full mx-4 my-8 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex justify-between items-center p-6 border-b sticky top-0 bg-white rounded-t-lg">
          <h2 className="text-xl font-semibold text-gray-900">
            QR Code - Table {tableNumber}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-600 hover:text-gray-800 text-3xl leading-none w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          {loading ? (
            <div className="text-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
              <p className="text-gray-800">Generating QR code...</p>
            </div>
          ) : error ? (
            <div className="text-center py-8">
              <div className="text-red-600 text-xl mb-4">⚠️</div>
              <p className="text-red-600 mb-4">{error}</p>
              <button
                onClick={fetchQRCode}
                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg"
              >
                Try Again
              </button>
            </div>
          ) : qrData ? (
            <div className="text-center">
              {/* QR Code Display */}
              <div className="mb-6">
                <img
                  src={qrData.qrCode}
                  alt="QR Code"
                  className="w-64 h-64 mx-auto border border-gray-200 rounded-lg"
                />
              </div>

              {/* Table Info */}
              <div className="mb-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                  {restaurantName}
                </h3>
                <p className="text-gray-800">
                  Table {tableNumber}
                  {tableName && ` - ${tableName}`}
                </p>
              </div>

              {/* URL Display */}
              <div className="mb-6 p-3 bg-gray-50 rounded-lg">
                <p className="text-xs text-gray-700 mb-1">QR Code URL:</p>
                <p className="text-sm text-gray-800 break-all font-mono">
                  {qrData.qrUrl}
                </p>
              </div>

              {/* Action Buttons */}
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={printQRCode}
                    className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-3 rounded-lg font-medium text-sm flex items-center justify-center"
                  >
                    🖨️ Print
                  </button>
                  <button
                    onClick={() => downloadQRCode('png')}
                    className="bg-green-600 hover:bg-green-700 text-white px-4 py-3 rounded-lg font-medium text-sm flex items-center justify-center"
                  >
                    📥 Download PNG
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => downloadQRCode('svg')}
                    className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-3 rounded-lg font-medium text-sm flex items-center justify-center"
                  >
                    📄 Download SVG
                  </button>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(qrData.qrUrl);
                      alert('QR URL copied to clipboard!');
                    }}
                    className="bg-gray-600 hover:bg-gray-700 text-white px-4 py-3 rounded-lg font-medium text-sm flex items-center justify-center"
                  >
                    📋 Copy URL
                  </button>
                </div>
                <button
                  onClick={onClose}
                  className="w-full bg-gray-200 hover:bg-gray-300 text-gray-800 px-4 py-3 rounded-lg font-medium text-sm mt-4"
                >
                  Close
                </button>
              </div>

              {/* Instructions */}
              <div className="mt-6 text-left text-sm text-gray-600 bg-blue-50 p-4 rounded-lg">
                <h4 className="font-medium text-blue-900 mb-2">Customer Instructions:</h4>
                <ol className="list-decimal list-inside space-y-1">
                  <li>Open phone camera</li>
                  <li>Point at QR code</li>
                  <li>Tap notification to open menu</li>
                  <li>Browse menu and add items to cart</li>
                  <li>Complete order and payment</li>
                </ol>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}