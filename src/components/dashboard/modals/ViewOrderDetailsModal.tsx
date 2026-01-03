'use client';

import { useEffect, useState } from 'react';
import { X, Clock, User, Phone, Printer } from 'lucide-react';
import { ApiClient } from '@/lib/api-client';
import { formatPrice } from '@/lib/qr-utils';
import {
  formatModificationReason,
  formatModificationTime,
} from '@/lib/order-modification-utils';

interface ViewOrderDetailsModalProps {
  orderId: string;
  isOpen: boolean;
  onClose: () => void;
}

export function ViewOrderDetailsModal({
  orderId,
  isOpen,
  onClose,
}: ViewOrderDetailsModalProps) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [order, setOrder] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    const fetchOrder = async () => {
      try {
        setLoading(true);
        setError(null);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const data: any = await ApiClient.get(`/orders/${orderId}`);
        setOrder(data.order);
      } catch (err) {
        console.error('Failed to fetch order:', err);
        setError('Failed to load order details. Please try again.');
      } finally {
        setLoading(false);
      }
    };

    fetchOrder();
  }, [orderId, isOpen]);

  // Lock body scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }

    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isOpen]);

  const handlePrint = () => {
    window.print();
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Print Styles */}
      <style
        dangerouslySetInnerHTML={{
          __html: `
                @media print {
                    body > *:not(#print-modal-wrapper) {
                        display: none !important;
                    }
                    
                    #print-modal-wrapper {
                        position: static !important;
                        background: white !important;
                        padding: 0 !important;
                        display: block !important;
                    }
                    
                    .print-content {
                        max-height: none !important;
                        overflow: visible !important;
                        box-shadow: none !important;
                        border-radius: 0 !important;
                        max-width: 100% !important;
                    }
                    
                    .no-print {
                        display: none !important;
                    }
                }
            `,
        }}
      />

      <div
        id="print-modal-wrapper"
        className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
      >
        <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col print-content">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b bg-gradient-to-r from-blue-50 to-indigo-50">
            <div>
              <h2 className="text-xl font-bold text-gray-900">Order Details</h2>
              {order && (
                <p className="text-sm text-gray-600 mt-0.5">
                  #{order.orderNumber}
                </p>
              )}
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-white/50 rounded-lg transition-colors"
              aria-label="Close"
            >
              <X className="h-5 w-5 text-gray-500" />
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="p-12 text-center">
                <div className="animate-spin h-10 w-10 border-4 border-blue-600 border-t-transparent rounded-full mx-auto" />
                <p className="mt-3 text-gray-600">Loading...</p>
              </div>
            ) : error ? (
              <div className="p-12 text-center">
                <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <X className="h-8 w-8 text-red-600" />
                </div>
                <p className="text-red-600 font-medium">{error}</p>
              </div>
            ) : order ? (
              <div className="p-6 space-y-6">
                {/* Order Info Grid */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-gray-50 rounded-lg p-4">
                    <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">
                      Table
                    </p>
                    <p className="font-semibold text-gray-900">
                      {order.table.tableNumber}
                      {order.table.tableName && ` - ${order.table.tableName}`}
                    </p>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-4">
                    <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">
                      Status
                    </p>
                    <p className="font-semibold text-gray-900 capitalize">
                      {order.status}
                    </p>
                  </div>
                </div>

                {/* Customer Info */}
                {order.customerSession?.customerName && (
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <div className="flex items-start gap-3">
                      <User className="h-5 w-5 text-blue-600 mt-0.5" />
                      <div className="flex-1">
                        <p className="font-medium text-gray-900">
                          {order.customerSession.customerName}
                        </p>
                        {order.customerSession.customerPhone && (
                          <p className="text-sm text-gray-600 flex items-center gap-1 mt-1">
                            <Phone className="h-3.5 w-3.5" />
                            {order.customerSession.customerPhone}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* Order Time */}
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <Clock className="h-4 w-4" />
                  <span>
                    Ordered {new Date(order.createdAt).toLocaleString()}
                  </span>
                </div>

                {/* Items */}
                <div>
                  <h3 className="font-semibold text-gray-900 mb-3">Items</h3>
                  <div className="space-y-2">
                    {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                    {order.items.map((item: any) => (
                      <div
                        key={item.id}
                        className="flex justify-between items-center py-3 px-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
                      >
                        <div className="flex-1">
                          <p className="font-medium text-gray-900">
                            {item.menuItem.name}
                          </p>
                          <p className="text-sm text-gray-500">
                            Qty: {item.quantity} × {formatPrice(item.unitPrice)}
                          </p>
                        </div>
                        <p className="font-semibold text-gray-900">
                          {formatPrice(item.totalAmount)}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Totals */}
                <div className="border-t pt-4 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Subtotal</span>
                    <span className="text-gray-900">
                      {formatPrice(order.subtotalAmount)}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Tax (10%)</span>
                    <span className="text-gray-900">
                      {formatPrice(order.taxAmount)}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Service (5%)</span>
                    <span className="text-gray-900">
                      {formatPrice(order.serviceCharge)}
                    </span>
                  </div>
                  <div className="flex justify-between font-bold text-lg border-t pt-2">
                    <span className="text-gray-900">Total</span>
                    <span className="text-blue-600">
                      {formatPrice(order.totalAmount)}
                    </span>
                  </div>
                </div>

                {/* Modification History */}
                {order.modifications && order.modifications.length > 0 && (
                  <div className="border-t pt-6">
                    <h3 className="font-semibold text-gray-900 mb-4">
                      Modification History
                    </h3>
                    <div className="space-y-3">
                      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                      {order.modifications.map((mod: any) => (
                        <div
                          key={mod.id}
                          className="border-l-4 border-orange-400 bg-orange-50 rounded-r-lg p-4"
                        >
                          <div className="flex items-start justify-between mb-3">
                            <div className="flex-1">
                              <p className="font-semibold text-orange-900">
                                {formatModificationReason(mod.reason)}
                              </p>
                              <p className="text-xs text-orange-700 mt-1">
                                {mod.modifiedByUser?.name || 'Unknown'} •{' '}
                                {formatModificationTime(mod.modifiedAt)}
                              </p>
                            </div>
                            {mod.customerNotified && (
                              <span className="text-xs bg-green-500 text-white px-2.5 py-1 rounded-full font-medium">
                                ✓ Notified
                              </span>
                            )}
                          </div>

                          {mod.reasonNotes && (
                            <p className="text-sm text-gray-700 mb-3 italic">
                              &quot;{mod.reasonNotes}&quot;
                            </p>
                          )}

                          <div className="space-y-1.5 mb-3">
                            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                            {mod.items.map((item: any) => (
                              <div
                                key={item.id}
                                className="text-sm text-orange-800 flex items-center gap-2"
                              >
                                <span className="w-1.5 h-1.5 bg-orange-400 rounded-full" />
                                {item.action === 'removed' &&
                                  `Removed: ${item.menuItem.name}`}
                                {item.action === 'quantity_changed' &&
                                  `${item.menuItem.name}: ${item.oldQuantity} → ${item.newQuantity}`}
                              </div>
                            ))}
                          </div>

                          <div className="flex items-center gap-2 text-sm font-semibold pt-2 border-t border-orange-200">
                            <span className="text-gray-600">Total:</span>
                            <span className="text-gray-500 line-through">
                              {formatPrice(mod.oldTotal)}
                            </span>
                            <span className="text-orange-900">→</span>
                            <span className="text-orange-900">
                              {formatPrice(mod.newTotal)}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="p-12 text-center text-gray-500">
                Order not found
              </div>
            )}
          </div>

          {/* Footer */}
          {order && !loading && !error && (
            <div className="flex items-center justify-between gap-3 px-6 py-4 border-t bg-gray-50 no-print">
              <button
                onClick={handlePrint}
                className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 hover:bg-gray-50 rounded-lg transition-colors"
              >
                <Printer className="h-4 w-4" />
                Print Receipt
              </button>
              <button
                onClick={onClose}
                className="px-5 py-2.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
              >
                Close
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
