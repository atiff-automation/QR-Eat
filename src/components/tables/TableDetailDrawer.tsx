import React, { useEffect, useState } from 'react';
import {
  X,
  Printer,
  Copy,
  ExternalLink,
  Users,
  Utensils,
  MapPin,
  RotateCcw,
} from 'lucide-react';

interface TableDetailDrawerProps {
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
  onShowQR: (table: { id: string; qrCodeToken: string }) => void;
  onRegenerateQR: (tableId: string) => void;
}

export function TableDetailDrawer({
  table,
  isOpen,
  onClose,
  onUpdateStatus,
  onShowQR,
  onRegenerateQR,
}: TableDetailDrawerProps) {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setIsVisible(true);
      document.body.style.overflow = 'hidden';
    } else {
      setTimeout(() => setIsVisible(false), 300); // Wait for animation
      document.body.style.overflow = '';
    }
  }, [isOpen]);

  if (!isVisible && !isOpen) return null;
  if (!table) return null;

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'available':
        return 'bg-green-500';
      case 'occupied':
        return 'bg-blue-500';
      case 'reserved':
        return 'bg-amber-500';
      case 'cleaning':
        return 'bg-gray-500';
      case 'maintenance':
        return 'bg-red-500';
      default:
        return 'bg-gray-300';
    }
  };

  const statusOptions = [
    {
      value: 'available',
      label: 'Available',
      color: 'bg-green-100 text-green-800',
    },
    {
      value: 'occupied',
      label: 'Occupied',
      color: 'bg-blue-100 text-blue-800',
    },
    {
      value: 'reserved',
      label: 'Reserved',
      color: 'bg-amber-100 text-amber-800',
    },
    {
      value: 'cleaning',
      label: 'Cleaning',
      color: 'bg-gray-100 text-gray-800',
    },
    {
      value: 'maintenance',
      label: 'Maintenance',
      color: 'bg-red-100 text-red-800',
    },
  ];

  const generateQRCode = (token: string) => {
    const baseUrl = window.location.origin;
    return `${baseUrl}/qr/${token}`;
  };

  return (
    <div
      className={`fixed inset-0 z-50 flex justify-end transition-opacity duration-300 ${
        isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
      }`}
    >
      {/* Backdrop */}
      <div
        onClick={onClose}
        className="absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity"
      />

      {/* Drawer Content */}
      <div
        className={`
          relative w-full max-w-md bg-white shadow-2xl flex flex-col h-full transform transition-transform duration-300 ease-out
          ${isOpen ? 'translate-x-0' : 'translate-x-full'}
        `}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-100">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">
              Table {table.tableNumber}
            </h2>
            {table.tableName && (
              <p className="text-gray-500 text-sm">{table.tableName}</p>
            )}
            <div className="flex items-center mt-2 space-x-2">
              <span
                className={`w-2.5 h-2.5 rounded-full ${getStatusColor(table.status)}`}
              />
              <span className="text-sm font-medium text-gray-600 capitalize">
                {table.status}
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 bg-gray-100 rounded-full hover:bg-gray-200 transition-colors"
          >
            <X className="w-5 h-5 text-gray-600" />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-8">
          {/* Quick Stats Grid */}
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-gray-50 p-4 rounded-xl">
              <div className="flex items-center text-gray-500 mb-1">
                <Users className="w-4 h-4 mr-2" />
                <span className="text-xs font-semibold uppercase tracking-wider">
                  Capacity
                </span>
              </div>
              <p className="text-xl font-bold text-gray-900">
                {table.capacity} Guests
              </p>
            </div>

            <div className="bg-gray-50 p-4 rounded-xl">
              <div className="flex items-center text-gray-500 mb-1">
                <Utensils className="w-4 h-4 mr-2" />
                <span className="text-xs font-semibold uppercase tracking-wider">
                  Orders
                </span>
              </div>
              <p className="text-xl font-bold text-gray-900">
                {table.currentOrders} Active
              </p>
            </div>
          </div>

          {/* Status Changer */}
          <div>
            <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wider mb-4">
              Change Status
            </h3>
            <div className="grid grid-cols-2 gap-3">
              {statusOptions.map((option) => (
                <button
                  key={option.value}
                  onClick={() => onUpdateStatus(table.id, option.value)}
                  className={`
                    px-4 py-3 rounded-lg text-sm font-medium transition-all
                    ${
                      table.status === option.value
                        ? 'ring-2 ring-offset-2 ring-blue-500 ' +
                          option.color.replace('bg-', 'bg-opacity-100 bg-')
                        : 'bg-white border border-gray-200 text-gray-700 hover:bg-gray-50'
                    }
                  `}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          {/* QR Actions */}
          <div>
            <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wider mb-4">
              QR Code
            </h3>
            <div className="space-y-3">
              <button
                onClick={() => onShowQR(table)}
                className="w-full flex items-center justify-between p-4 bg-blue-50 rounded-xl hover:bg-blue-100 transition-colors group"
              >
                <div className="flex items-center">
                  <div className="bg-blue-600 text-white p-2 rounded-lg mr-4">
                    <Printer className="w-5 h-5" />
                  </div>
                  <div className="text-left">
                    <p className="font-semibold text-gray-900">
                      Show & Print Code
                    </p>
                    <p className="text-xs text-gray-500">
                      View or print QR for customers
                    </p>
                  </div>
                </div>
                <Users className="w-5 h-5 text-blue-300 group-hover:text-blue-500" />
              </button>

              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => {
                    const qrUrl = generateQRCode(table.qrCodeToken);
                    navigator.clipboard.writeText(qrUrl);
                    alert('Copied to clipboard');
                  }}
                  className="flex items-center justify-center space-x-2 p-3 border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-700 font-medium text-sm"
                >
                  <Copy className="w-4 h-4" />
                  <span>Copy Link</span>
                </button>
                <button
                  onClick={() => {
                    const qrUrl = generateQRCode(table.qrCodeToken);
                    window.open(qrUrl, '_blank');
                  }}
                  className="flex items-center justify-center space-x-2 p-3 border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-700 font-medium text-sm"
                >
                  <ExternalLink className="w-4 h-4" />
                  <span>Preview</span>
                </button>
              </div>
            </div>
          </div>

          {/* Location */}
          {table.locationDescription && (
            <div>
              <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wider mb-2">
                Location
              </h3>
              <div className="flex items-start text-gray-600 bg-gray-50 p-3 rounded-lg">
                <MapPin className="w-4 h-4 mr-2 mt-0.5 shrink-0" />
                <span className="text-sm">{table.locationDescription}</span>
              </div>
            </div>
          )}

          {/* Danger Zone */}
          <div className="pt-6 border-t border-gray-100">
            <button
              onClick={() => {
                if (
                  confirm(
                    'Are you sure you want to regenerate the QR code? The old one will stop working.'
                  )
                ) {
                  onRegenerateQR(table.id);
                }
              }}
              className="flex items-center text-red-600 hover:text-red-700 text-sm font-medium"
            >
              <RotateCcw className="w-4 h-4 mr-2" />
              Regenerate QR Token
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
