'use client';

import { Cart, CartItem } from '@/types/menu';
import { formatPrice } from '@/lib/qr-utils';
import { ShoppingBag, Trash2, Coins, Ticket, Info } from 'lucide-react';
import { useBodyScrollLock } from '@/hooks/useBodyScrollLock';

interface CartSummaryProps {
  cart: Cart;
  restaurantSettings: {
    currency: string;
    taxLabel: string;
    serviceChargeLabel: string;
  } | null; // Phase 3 - Restaurant Settings
  onUpdateItem: (
    index: number,
    updates: Partial<Pick<CartItem, 'quantity' | 'specialInstructions'>>
  ) => void;
  onRemoveItem: (index: number) => void;
  onCheckout: () => void;
  onBack?: () => void;
  onClearAll?: () => void;
  onLogin?: () => void;
  isCheckoutLoading?: boolean;
}

import { useEffect } from 'react';

export function CartSummary({
  cart,
  restaurantSettings,
  onUpdateItem,
  onRemoveItem,
  onCheckout,
  onBack,
  onClearAll,
  onLogin,
  isCheckoutLoading = false,
}: CartSummaryProps) {
  // Scroll to top on mount to ensure header is visible
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  // Lock body scroll to prevent browser UI auto-hiding
  useBodyScrollLock(true);

  // Extract settings with fallbacks
  const currency = restaurantSettings?.currency || 'MYR';
  const taxLabel = restaurantSettings?.taxLabel || 'Tax';
  const serviceChargeLabel =
    restaurantSettings?.serviceChargeLabel || 'Service Charge';

  return (
    <div className="qr-cart-summary bg-gray-50 flex flex-col h-[100dvh]">
      <div className="p-3 border-b border-gray-200 bg-white shadow-sm shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center">
            {onBack && (
              <button
                onClick={onBack}
                className="p-1 -ml-1 mr-2 text-gray-500 hover:text-gray-900 transition-colors"
                aria-label="Back to menu"
              >
                <svg
                  className="h-6 w-6"
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
            <h2 className="text-lg font-bold text-gray-900">
              Order {cart.items.reduce((sum, item) => sum + item.quantity, 0)}{' '}
              Items
            </h2>
          </div>
          {onClearAll && cart.items.length > 0 && (
            <button
              onClick={onClearAll}
              className="flex items-center space-x-1 px-2 py-1 text-xs font-medium text-red-500 hover:bg-red-50 rounded-lg transition-colors"
              aria-label="Clear all items"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Clear All</span>
            </button>
          )}
        </div>
      </div>

      {/* Scrollable Order List */}
      <div
        className="flex-1 overflow-y-auto pb-64 bg-white"
        style={{ WebkitOverflowScrolling: 'touch' }}
      >
        {cart.items.map((item, index) => (
          <div
            key={`${item.menuItemId}-${index}`}
            className="p-4 border-b border-gray-100 flex items-start space-x-4"
          >
            {/* Left: Image */}
            {item.menuItem.imageUrl ? (
              <div className="relative w-16 h-16 shrink-0">
                <img
                  src={item.menuItem.imageUrl}
                  alt={item.menuItem.name}
                  className="w-full h-full object-cover rounded-md"
                />
              </div>
            ) : (
              <div className="w-16 h-16 bg-gray-100 rounded-md shrink-0 flex items-center justify-center text-gray-300">
                <ShoppingBag className="w-6 h-6" />
              </div>
            )}

            {/* Middle: Info */}
            <div className="flex-1 min-w-0 flex flex-col justify-center min-h-[4rem] pr-2">
              <div className="flex justify-between items-start">
                <h3 className="font-bold text-gray-900 text-sm leading-tight mb-0.5">
                  {item.menuItem.name}
                </h3>
              </div>
              <div className="text-sm text-gray-500 mb-1">
                {formatPrice(item.unitPrice, currency)}
              </div>

              {item.selectedVariations.length > 0 && (
                <div className="text-xs text-gray-400 mb-0.5">
                  {item.selectedVariations
                    .map((v) => v.variation.name)
                    .join(', ')}
                </div>
              )}
              {item.specialInstructions && (
                <div className="text-xs text-gray-400 italic">
                  &quot;{item.specialInstructions}&quot;
                </div>
              )}
            </div>

            {/* Right: Quantity Controls */}
            <div className="flex items-center space-x-3 shrink-0 self-center">
              <button
                onClick={() => {
                  if (item.quantity - 1 === 0) {
                    onRemoveItem(index);
                  } else {
                    onUpdateItem(index, { quantity: item.quantity - 1 });
                  }
                }}
                className="w-8 h-8 rounded-full border border-gray-300 flex items-center justify-center text-gray-500 hover:border-orange-500 hover:text-orange-500 transition-colors"
              >
                <span className="mb-0.5">−</span>
              </button>
              <span className="w-4 text-center font-medium text-gray-900">
                {item.quantity}
              </span>
              <button
                onClick={() =>
                  onUpdateItem(index, { quantity: item.quantity + 1 })
                }
                className="w-8 h-8 rounded-full border border-gray-300 flex items-center justify-center text-gray-500 hover:border-orange-500 hover:text-orange-500 transition-colors"
              >
                <span className="mb-0.5">+</span>
              </button>
            </div>
          </div>
        ))}

        {/* Helper text for scrolling if needed */}
        {cart.items.length > 4 && (
          <div className="text-center py-4 text-xs text-gray-400 italic">
            Running low on space? Scroll for more items
          </div>
        )}

        {/* Spacer for fixed footer */}
        <div className="h-[240px]" />
      </div>

      {/* Fixed Footer - Compact Pitboy Style */}
      <div
        className="bg-white shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)] border-t border-gray-100 z-10 w-full fixed bottom-0 left-0 right-0"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px))' }}
      >
        {/* Compact Cashback Row */}
        <div
          onClick={onLogin}
          className="flex items-center justify-between px-4 py-2 bg-gray-50/50 cursor-pointer hover:bg-gray-100 transition-colors"
        >
          <div className="flex items-center space-x-2">
            <div className="w-4 h-4 rounded-full bg-yellow-100 flex items-center justify-center">
              <Coins className="w-3 h-3 text-yellow-600" />
            </div>
            <span className="font-bold text-gray-900 text-xs text-nowrap">
              Use Cashback
            </span>
            <Info className="w-3 h-3 text-gray-400" />
          </div>
          <button className="px-3 py-1 bg-orange-500 text-white text-[10px] font-bold rounded uppercase hover:bg-orange-600 transition-colors pointer-events-none">
            Login
          </button>
        </div>

        {/* Compact Voucher Row */}
        <div
          onClick={onLogin}
          className="flex items-center px-4 py-2 bg-white cursor-pointer hover:bg-gray-50 transition-colors"
        >
          <div className="w-4 h-4 mr-2 flex items-center justify-center">
            <Ticket className="w-4 h-4 text-orange-500" />
          </div>
          <span className="font-bold text-gray-500 text-xs">
            Add a voucher code
          </span>
        </div>

        <div className="p-4 pt-2">
          {/* Consolidated Info Row - Now includes service charge */}
          <div className="flex justify-center text-xs text-gray-400 mb-3 space-x-3">
            <span>Subtotal: {formatPrice(cart.subtotal, currency)}</span>
            <span className="text-gray-300">•</span>
            <span>
              {taxLabel}: {formatPrice(cart.taxAmount, currency)}
            </span>
            <span className="text-gray-300">•</span>
            <span>
              {serviceChargeLabel}: {formatPrice(cart.serviceCharge, currency)}
            </span>
          </div>

          <button
            onClick={onCheckout}
            disabled={isCheckoutLoading}
            className="w-full bg-orange-500 hover:bg-orange-600 active:scale-[0.98] disabled:bg-gray-300 text-white font-bold h-12 rounded-lg shadow-md transition-all flex items-center justify-center ring-offset-2 focus:ring-2 ring-orange-200"
          >
            {isCheckoutLoading ? (
              <span className="flex items-center">
                <svg
                  className="animate-spin -ml-1 mr-3 h-5 w-5 text-white"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  ></circle>
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  ></path>
                </svg>
                Processing...
              </span>
            ) : (
              <span className="uppercase tracking-wide">
                Confirm Order - {formatPrice(cart.totalAmount, currency)}
              </span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
