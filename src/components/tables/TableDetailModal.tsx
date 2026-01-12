import React, { useEffect, useState } from 'react';
import {
  X,
  Printer,
  ExternalLink,
  Users,
  Utensils,
  Clock,
  CreditCard,
  Lock,
  Unlock,
} from 'lucide-react';
import { useTableOrders } from '@/lib/hooks/queries/useTableOrders';
import { formatPrice } from '@/lib/qr-utils';
import type { OrderWithDetails } from '@/types/pos';

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
  onProcessPayment?: (tableId: string, orders: OrderWithDetails[]) => void;
  currency?: string;
}

export function TableDetailModal({
  table,
  isOpen,
  onClose,
  onUpdateStatus,
  onShowQR,
  onProcessPayment,
  currency = 'MYR',
}: TableDetailModalProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [showOrderModal, setShowOrderModal] = useState(false);

  // Fetch orders for this table (only when modal is open)
  const { orders, tableTotal } = useTableOrders(table?.id ?? null, isOpen);

  useEffect(() => {
    if (isOpen) {
      setIsVisible(true);
      document.body.style.overflow = 'hidden';
    } else {
      setTimeout(() => setIsVisible(false), 300);
      document.body.style.overflow = '';
    }
  }, [isOpen]);

  // Handle Escape key to close order modal
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && showOrderModal) {
        setShowOrderModal(false);
      }
    };

    if (showOrderModal) {
      window.addEventListener('keydown', handleEscape);
      return () => window.removeEventListener('keydown', handleEscape);
    }
  }, [showOrderModal]);

  // Prevent body scroll when order modal is open
  useEffect(() => {
    if (showOrderModal) {
      const previousOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = previousOverflow;
      };
    }
  }, [showOrderModal]);

  if (!isVisible && !isOpen) return null;
  if (!table) return null;

  const generateQRCode = (token: string) => {
    const baseUrl = window.location.origin;
    return `${baseUrl}/qr/${token}`;
  };

  const openOrderModal = () => {
    setShowOrderModal(true);
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
        className={`absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity duration-300 ${
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
                  case 'OCCUPIED':
                    return (
                      <span className="bg-orange-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">
                        Occupied
                      </span>
                    );
                  case 'RESERVED':
                    return (
                      <span className="bg-blue-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">
                        Reserved
                      </span>
                    );
                  default:
                    return null;
                }
              })()}
            </div>
            {table.tableName && (
              <p className="text-sm text-gray-500">{table.tableName}</p>
            )}
          </div>

          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-full transition-colors"
          >
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        {/* Stats Row - Compact */}
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

        {/* Simplified content with increased side padding */}
        <div className="px-5 py-3 space-y-2">
          {/* Payment Summary - Minimal Design */}
          {isOpen && table && orders.length > 0 && (
            <div className="space-y-2 pb-2 border-b border-gray-100">
              <p className="text-sm text-gray-600 font-medium">
                {orders.length} {orders.length === 1 ? 'Order' : 'Orders'} •{' '}
                {formatPrice(tableTotal, currency)}
              </p>
              <button
                onClick={() => onProcessPayment?.(table.id, orders)}
                className="w-full h-10 bg-green-600 hover:bg-green-700 active:scale-[0.98] text-white rounded-lg font-semibold text-sm flex items-center justify-center gap-2 shadow-sm transition-all"
              >
                <CreditCard className="w-4 h-4" />
                <span>
                  Process Payment - {formatPrice(tableTotal, currency)}
                </span>
              </button>
            </div>
          )}

          {/* Action Buttons - Compact */}
          <div className="space-y-1.5">
            {/* Make Order Button - Disabled if Reserved */}
            <button
              onClick={() => {
                if (table.status !== 'RESERVED') {
                  openOrderModal();
                }
              }}
              disabled={table.status === 'RESERVED'}
              title={
                table.status === 'RESERVED'
                  ? 'Table must be checked-in (unreserved) before ordering'
                  : 'Place order for this table'
              }
              className={`
                w-full h-10 rounded-lg font-semibold text-sm flex items-center justify-center gap-2 shadow-sm transition-all
                ${
                  table.status === 'RESERVED'
                    ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                    : 'bg-blue-600 hover:bg-blue-700 active:scale-[0.98] text-white'
                }
              `}
            >
              <span>Make Order</span>
              {table.status === 'RESERVED' ? (
                <Lock className="w-3.5 h-3.5 opacity-60" />
              ) : (
                <ExternalLink className="w-3.5 h-3.5 opacity-80" />
              )}
            </button>

            <button
              onClick={() => onShowQR(table)}
              className="w-full h-10 bg-white border-2 border-gray-200 hover:border-gray-300 active:scale-[0.98] text-gray-700 rounded-lg font-semibold text-sm flex items-center justify-center gap-2 transition-all"
            >
              <span>Show QR Code</span>
              <Printer className="w-3.5 h-3.5 opacity-60" />
            </button>

            {/* Reserve Toggle - Show for all statuses except reserved */}
            {table.status !== 'RESERVED' && (
              <button
                onClick={() => {
                  if (table.status !== 'OCCUPIED') {
                    onUpdateStatus(table.id, 'RESERVED');
                  }
                }}
                disabled={table.status === 'OCCUPIED'}
                title={
                  table.status === 'OCCUPIED'
                    ? 'Cannot reserve an occupied table. Clear it first.'
                    : 'Reserve this table'
                }
                className={`
                  w-full h-10 rounded-lg font-semibold text-sm flex items-center justify-center gap-2 transition-all
                  ${
                    table.status === 'OCCUPIED'
                      ? 'bg-gray-50 text-gray-300 cursor-not-allowed'
                      : 'bg-gray-100 hover:bg-gray-200 active:scale-[0.98] text-gray-700'
                  }
                `}
              >
                <Lock className="w-3.5 h-3.5" />
                <span>Reserve Table</span>
              </button>
            )}
            {table.status === 'RESERVED' && (
              <button
                onClick={() => onUpdateStatus(table.id, 'AVAILABLE')}
                className="w-full h-10 bg-orange-100 hover:bg-orange-200 active:scale-[0.98] text-orange-700 rounded-lg font-semibold text-sm flex items-center justify-center gap-2 transition-all"
              >
                <Unlock className="w-3.5 h-3.5" />
                <span>Unreserve</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Order Modal */}
      {showOrderModal && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
          {/* Backdrop */}
          <div
            onClick={() => setShowOrderModal(false)}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
          />

          {/* Modal Content */}
          <div className="relative w-full h-full max-w-2xl bg-white rounded-lg shadow-2xl overflow-hidden">
            {/* Close Button */}
            <button
              onClick={() => setShowOrderModal(false)}
              className="absolute top-4 right-4 z-10 p-2 bg-white/90 hover:bg-white rounded-full shadow-lg transition-colors"
              aria-label="Close order interface"
            >
              <X className="w-6 h-6 text-gray-600" />
            </button>

            {/* Iframe - QR Ordering Interface */}
            <iframe
              src={generateQRCode(table.qrCodeToken)}
              className="w-full h-full border-0"
              title="Order Interface"
              allow="payment"
            />
          </div>
        </div>
      )}
    </div>
  );
}
