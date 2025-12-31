'use client';

import { Cart } from '@/types/menu';
import { formatPrice } from '@/lib/qr-utils';
import { ShoppingBag } from 'lucide-react';

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
    <div className="fixed bottom-4 left-4 right-4 z-50 animate-in slide-in-from-bottom-4 duration-300">
      <button
        onClick={onReviewCart}
        className="w-full bg-gradient-to-r from-orange-500 to-orange-600 text-white shadow-xl shadow-orange-200 rounded-2xl p-4 flex items-center justify-between group transition-transform active:scale-95"
      >
        {/* Left: Item Count Badge */}
        <div className="flex items-center space-x-3">
          <div className="bg-white/20 backdrop-blur-sm text-white font-bold h-10 w-10 rounded-full flex items-center justify-center text-lg shadow-sm">
            {itemCount}
          </div>
          <div className="flex flex-col items-start">
            <span className="text-sm font-medium text-orange-100">Total</span>
            <span className="text-lg font-bold leading-tight">
              {formatPrice(cart.totalAmount)}
            </span>
          </div>
        </div>

        {/* Right: Action */}
        <div className="flex items-center bg-white text-orange-600 px-4 py-2 rounded-xl font-bold text-sm shadow-sm group-hover:bg-orange-50 transition-colors">
          <ShoppingBag className="w-4 h-4 mr-2" />
          <span>View Cart</span>
        </div>
      </button>
    </div>
  );
}
