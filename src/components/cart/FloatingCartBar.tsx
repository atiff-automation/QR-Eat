'use client';

import { Cart } from '@/types/menu';
import { formatPrice } from '@/lib/qr-utils';
import { ShoppingBag } from 'lucide-react';

interface FloatingCartBarProps {
  cart: Cart;
  currency: string;
  onReviewCart: () => void;
}

export function FloatingCartBar({
  cart,
  currency,
  onReviewCart,
}: FloatingCartBarProps) {
  const itemCount = cart.items.reduce((sum, item) => sum + item.quantity, 0);

  // Don't show if cart is empty
  if (itemCount === 0) {
    return null;
  }

  return (
    <div
      className="qr-floating-cart"
      style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 1rem)' }}
    >
      <div className="animate-in slide-in-from-bottom-4 duration-300">
        <button
          onClick={onReviewCart}
          className="w-full bg-orange-500 hover:bg-orange-600 text-white shadow-lg rounded-lg py-4 px-6 flex items-center justify-between group transition-transform active:scale-95"
        >
          {/* Left: Item Count Badge */}
          <div className="flex items-center space-x-3">
            <div className="bg-white/20 backdrop-blur-sm text-white font-bold h-8 w-8 rounded-full flex items-center justify-center text-base shadow-sm">
              {itemCount}
            </div>
            <div className="flex flex-col items-start">
              <span className="text-xs font-medium text-orange-100">Total</span>
              <span className="text-base font-bold leading-tight">
                {formatPrice(cart.totalAmount, currency)}
              </span>
            </div>
          </div>

          {/* Right: Action */}
          <div className="flex items-center bg-white text-orange-600 px-3 py-1.5 rounded-lg font-bold text-base shadow-sm group-hover:bg-orange-50 transition-colors">
            <ShoppingBag className="w-4 h-4 mr-1.5" />
            <span>View Cart</span>
          </div>
        </button>
      </div>
    </div>
  );
}
