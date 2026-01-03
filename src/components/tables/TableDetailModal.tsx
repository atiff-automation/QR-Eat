import React, { useEffect, useState } from 'react';
import {
  X,
  Printer,
  ExternalLink,
  Users,
  Utensils,
  Clock,
  RotateCcw,
} from 'lucide-react';

interface TableDetailModalProps {
  table: {
    id: string;
    tableNumber: string;
    tableName?: string;
    status: string;
    capacity: number;
    currentOrders: number;
    qrCodeToken: string;
    locationDescription?: string;
    lastOrderAt?: string;
  } | null;
  isOpen: boolean;
  onClose: () => void;
  onUpdateStatus: (tableId: string, status: string) => Promise<void>;
  onShowQR: (table: NonNullable<TableDetailModalProps['table']>) => void;
  onRegenerateQR: (tableId: string) => void;
}

export function TableDetailModal({
  table,
  isOpen,
  onClose,
  onUpdateStatus,
  onShowQR,
  onRegenerateQR,
}: TableDetailModalProps) {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setIsVisible(true);
      document.body.style.overflow = 'hidden';
    } else {
      setTimeout(() => setIsVisible(false), 300);
      document.body.style.overflow = '';
    }
  }, [isOpen]);

  if (!isVisible && !isOpen) return null;
  if (!table) return null;

  const statusOptions = [
    { value: 'available', label: 'Available' },
    { value: 'occupied', label: 'Occupied' },
    { value: 'reserved', label: 'Reserved' },
    { value: 'cleaning', label: 'Cleaning' },
  ];

  const generateQRCode = (token: string) => {
    const baseUrl = window.location.origin;
    return `${baseUrl}/qr/${token}`;
  };

  const openMenuPreview = () => {
    const qrUrl = generateQRCode(table.qrCodeToken);
    window.open(qrUrl, '_blank');
  };

  const getDuration = () => {
    if (!table.lastOrderAt) return '0m';
    const diff = Date.now() - new Date(table.lastOrderAt).getTime();
    const minutes = Math.floor(diff / 60000);
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    return `${hours}h`;
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center font-sans">
      {/* Backdrop */}
      <div
        onClick={onClose}
        className={`absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity duration-300 ${
          isOpen ? 'opacity-100' : 'opacity-0'
        }`}
      />

      {/* Modal Content */}
      <div
        className={`
          relative w-full max-w-sm bg-white rounded-3xl shadow-2xl mx-4 overflow-hidden transform transition-all duration-300 ease-out
          ${isOpen ? 'scale-100 opacity-100 translate-y-0' : 'scale-95 opacity-0 translate-y-4'}
        `}
      >
        {/* Header */}
        <div className="flex items-start justify-between p-6 pb-2">
          <div className="space-y-1">
            <div className="flex items-center gap-3">
              <h2 className="text-3xl font-bold text-gray-900 tracking-tight">
                Table {table.tableNumber}
              </h2>
              {/* Status Badge */}
              {(() => {
                switch (table.status) {
                  case 'occupied':
                    return (
                      <span className="bg-orange-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">
                        Occupied
                      </span>
                    );
                  case 'reserved':
                    return (
                      <span className="bg-blue-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">
                        Reserved
                      </span>
                    );
                  default:
                    return null;
                }
              })()}
            </div>
            {table.tableName && (
              <p className="text-gray-500 font-medium">{table.tableName}</p>
            )}
          </div>

          <button
            onClick={onClose}
            className="p-2 bg-gray-50 rounded-full hover:bg-gray-100 transition-colors"
          >
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        {/* Stats Row - Modern & Compact - Changed px-8 to px-6 */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100 bg-gray-50/50">
          <div className="flex flex-col items-center">
            <div className="flex items-center text-gray-900 font-bold text-lg leading-none mb-1">
              <Users className="w-4 h-4 text-gray-400 mr-1.5" />
              {table.capacity}
            </div>
            <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">
              Guests
            </span>
          </div>

          <div className="flex flex-col items-center">
            <div className="flex items-center text-gray-900 font-bold text-lg leading-none mb-1">
              <Utensils className="w-4 h-4 text-gray-400 mr-1.5" />
              {table.currentOrders}
            </div>
            <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">
              Orders
            </span>
          </div>

          <div className="flex flex-col items-center">
            <div className="flex items-center text-gray-900 font-bold text-lg leading-none mb-1">
              <Clock className="w-4 h-4 text-gray-400 mr-1.5" />
              {getDuration()}
            </div>
            <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">
              Duration
            </span>
          </div>
        </div>

        {/* Changed p-5 to p-6 */}
        <div className="p-6 space-y-5">
          {/* Status Chips - Modern Design (No more gray segmented background) */}
          <div className="grid grid-cols-3 gap-2">
            {statusOptions.slice(0, 3).map((option) => (
              <button
                key={option.value}
                onClick={() => onUpdateStatus(table.id, option.value)}
                className={`
                     flex items-center justify-center py-2.5 rounded-xl text-sm font-bold transition-all border-2
                     ${
                       table.status === option.value
                         ? option.value === 'available'
                           ? 'border-green-500 bg-green-50 text-green-700'
                           : option.value === 'occupied'
                             ? 'border-amber-500 bg-amber-50 text-amber-700'
                             : 'border-blue-500 bg-blue-50 text-blue-700'
                         : 'border-gray-100 bg-white text-gray-500 hover:border-gray-200 hover:bg-gray-50'
                     }
                   `}
              >
                {option.label}
              </button>
            ))}
          </div>

          {/* Actions */}
          <div className="space-y-3">
            <button
              onClick={openMenuPreview}
              className="w-full h-12 bg-blue-600 hover:bg-blue-700 active:scale-[0.98] text-white rounded-xl font-bold flex items-center justify-center transition-all shadow-lg shadow-blue-200"
            >
              <span className="mr-2">Make Order</span>
              <ExternalLink className="w-4 h-4 ml-1 opacity-80" />
            </button>

            <button
              onClick={() => onShowQR(table)}
              className="w-full h-12 bg-white border-2 border-gray-100 hover:border-gray-200 active:scale-[0.98] text-gray-700 rounded-xl font-bold flex items-center justify-center transition-all"
            >
              <span className="mr-2">Show QR Code</span>
              <Printer className="w-4 h-4 opacity-60" />
            </button>
          </div>

          {/* Secondary Links */}
          <div className="flex justify-center pt-2">
            <button
              onClick={() => {
                if (confirm('Regenerate QR Code?')) onRegenerateQR(table.id);
              }}
              className="text-xs font-medium text-gray-400 hover:text-red-500 flex items-center"
            >
              <RotateCcw className="w-3 h-3 mr-1" />
              Reset QR Token
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
