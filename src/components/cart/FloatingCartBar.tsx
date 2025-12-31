'use client';

import { Cart } from '@/types/menu';
import { formatPrice } from '@/lib/qr-utils';
import { ShoppingCart } from 'lucide-react';

interface FloatingCartBarProps {
  cart: Cart;
  onReviewCart: () => void;
}

export function FloatingCartBar({ cart, onReviewCart }: FloatingCartBarProps) {
  const itemCount = cart.items.reduce((sum, item) => sum + item.quantity, 0);

  // Don't show if cart is empty
  if (itemCount === 0) {
    return null;
  }

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 bg-white border-t-2 border-orange-500 shadow-lg safe-area-bottom">
      <div className="max-w-7xl mx-auto px-4 py-3">
        <button
          onClick={onReviewCart}
          className="w-full flex items-center justify-between bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white rounded-lg px-4 py-3 transition-all duration-200 transform active:scale-98"
        >
          <div className="flex items-center space-x-3">
            <div className="relative">
              <ShoppingCart className="h-6 w-6" />
              <span className="absolute -top-2 -right-2 bg-white text-orange-600 text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
                {itemCount}
              </span>
            </div>
            <div className="text-left">
              <div className="text-sm font-medium">
                {itemCount} {itemCount === 1 ? 'item' : 'items'}
              </div>
              <div className="text-xs opacity-90">Tap to review</div>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <div className="text-right">
              <div className="text-lg font-bold">
                {formatPrice(cart.totalAmount)}
              </div>
              <div className="text-xs opacity-90">Total</div>
            </div>
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 5l7 7-7 7"
              />
            </svg>
          </div>
        </button>
      </div>
    </div>
  );
}
