'use client';

import { Cart, CartItem } from '@/types/menu';
import { formatPrice } from '@/lib/qr-utils';
import { ShoppingBag, Trash2 } from 'lucide-react';
import { useBodyScrollLock } from '@/hooks/useBodyScrollLock';

interface CartSummaryProps {
  cart: Cart;
  onUpdateItem: (
    index: number,
    updates: Partial<Pick<CartItem, 'quantity' | 'specialInstructions'>>
  ) => void;
  onRemoveItem: (index: number) => void;
  onCheckout: () => void;
  onBack?: () => void;
  onClearAll?: () => void;
  isCheckoutLoading?: boolean;
}

export function CartSummary({
  cart,
  onUpdateItem,
  onRemoveItem,
  onCheckout,
  onBack,
  onClearAll,
  isCheckoutLoading = false,
}: CartSummaryProps) {
  // Lock body scroll to prevent browser UI auto-hiding
  useBodyScrollLock(true);

  return (
    <div className="overflow-hidden">
      <div className="p-4 border-b border-gray-200 bg-gradient-to-r from-orange-50 to-orange-100">
        <div className="flex items-center justify-between">
          {onBack && (
            <button
              onClick={onBack}
              className="p-2 hover:bg-orange-100 rounded-full transition-colors"
              aria-label="Back to menu"
            >
              <svg
                className="h-6 w-6 text-gray-700"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 19l-7-7 7-7"
                />
              </svg>
            </button>
          )}
          <h2 className="text-xl font-bold text-gray-900 flex items-center flex-1">
            <ShoppingBag className="h-6 w-6 mr-2 text-orange-600" />
            Your Order
          </h2>
          {onClearAll && cart.items.length > 0 && (
            <button
              onClick={onClearAll}
              className="flex items-center space-x-1 px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50 rounded-lg transition-colors touch-target"
              aria-label="Clear all items"
            >
              <Trash2 className="w-4 h-4" />
              <span>Clear All</span>
            </button>
          )}
        </div>
      </div>

      {/* Scrollable Order List - Add bottom padding to prevent content being hidden behind fixed footer */}
      <div
        className="modal-scrollable overflow-y-auto pb-80"
        style={{ maxHeight: 'calc(100vh - 12rem)' }}
      >
        {cart.items.map((item, index) => (
          <div
            key={`${item.menuItemId}-${index}`}
            className="p-4 border-b border-gray-100 last:border-b-0 hover:bg-gray-50 transition-colors"
          >
            <div className="flex space-x-3 mb-3">
              {/* Item Thumbnail */}
              {item.menuItem.imageUrl && (
                <img
                  src={item.menuItem.imageUrl}
                  alt={item.menuItem.name}
                  className="w-20 h-20 object-cover rounded-lg flex-shrink-0"
                />
              )}

              <div className="flex-1 min-w-0">
                <div className="flex justify-between items-start mb-1">
                  <h3 className="font-semibold text-gray-900 text-base">
                    {item.menuItem.name}
                  </h3>
                  <button
                    onClick={() => onRemoveItem(index)}
                    className="p-1 hover:bg-red-50 rounded-full transition-colors ml-2 touch-target"
                    aria-label="Remove item"
                  >
                    <Trash2 className="w-4 h-4 text-red-500" />
                  </button>
                </div>

                {item.selectedVariations.length > 0 && (
                  <div className="text-sm text-gray-600 mb-1">
                    {item.selectedVariations.map((variation, i) => (
                      <span key={variation.variationId}>
                        {variation.variation.name}
                        {i < item.selectedVariations.length - 1 && ', '}
                      </span>
                    ))}
                  </div>
                )}

                {item.specialInstructions && (
                  <div className="text-sm text-gray-500 italic mb-1">
                    Note: {item.specialInstructions}
                  </div>
                )}

                <div className="text-sm text-gray-600">
                  {formatPrice(item.unitPrice)} × {item.quantity}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between">
              {/* Quantity Controls */}
              <div className="flex items-center space-x-2 bg-gray-100 rounded-lg p-1">
                <button
                  onClick={() =>
                    onUpdateItem(index, { quantity: item.quantity - 1 })
                  }
                  className="w-9 h-9 rounded-lg bg-white flex items-center justify-center text-gray-700 hover:bg-gray-50 font-bold shadow-sm touch-target"
                >
                  −
                </button>
                <span className="w-9 text-center font-bold text-gray-900">
                  {item.quantity}
                </span>
                <button
                  onClick={() =>
                    onUpdateItem(index, { quantity: item.quantity + 1 })
                  }
                  className="w-9 h-9 rounded-lg bg-white flex items-center justify-center text-gray-700 hover:bg-gray-50 font-bold shadow-sm touch-target"
                >
                  +
                </button>
              </div>

              {/* Item Total */}
              <div className="text-right">
                <div className="text-lg font-bold text-gray-900">
                  {formatPrice(item.totalPrice)}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Fixed Footer - Summary + Checkout Button (matches FloatingCartBar position) */}
      <div className="fixed bottom-4 left-4 right-4 z-50 bg-white shadow-xl p-4">
        <div className="space-y-2 text-sm mb-4">
          <div className="flex justify-between">
            <span className="text-gray-600">Subtotal</span>
            <span className="font-medium text-gray-900">
              {formatPrice(cart.subtotal)}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">Tax</span>
            <span className="font-medium text-gray-900">
              {formatPrice(cart.taxAmount)}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">Service Charge</span>
            <span className="font-medium text-gray-900">
              {formatPrice(cart.serviceCharge)}
            </span>
          </div>
          <div className="border-t-2 border-gray-300 pt-2 mt-2">
            <div className="flex justify-between items-center">
              <span className="text-lg font-bold text-gray-900">Total</span>
              <span className="text-2xl font-bold text-orange-600">
                {formatPrice(cart.totalAmount)}
              </span>
            </div>
          </div>
        </div>

        <button
          onClick={onCheckout}
          disabled={isCheckoutLoading}
          className="w-full bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 disabled:from-gray-300 disabled:to-gray-400 text-white font-bold py-4 px-6 rounded-lg transition-all duration-200 transform active:scale-98 disabled:cursor-not-allowed touch-target text-lg"
        >
          {isCheckoutLoading ? 'Processing...' : 'Proceed to Checkout'}
        </button>
      </div>
    </div>
  );
}
