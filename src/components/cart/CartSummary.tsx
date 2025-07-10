'use client';

import { Cart, CartItem } from '@/types/menu';
import { formatPrice } from '@/lib/qr-utils';
import { Button } from '@/components/ui/Button';

interface CartSummaryProps {
  cart: Cart;
  onUpdateItem: (
    index: number,
    updates: Partial<Pick<CartItem, 'quantity' | 'specialInstructions'>>
  ) => void;
  onRemoveItem: (index: number) => void;
  onCheckout: () => void;
  isCheckoutLoading?: boolean;
}

export function CartSummary({
  cart,
  onUpdateItem,
  onRemoveItem,
  onCheckout,
  isCheckoutLoading = false,
}: CartSummaryProps) {
  if (cart.items.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow-md p-6 text-center">
        <div className="text-gray-500 mb-4">
          <svg
            className="w-12 h-12 mx-auto mb-2"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M3 3h2l.4 2M7 13h10l4-8H5.4m0 0L7 13m0 0l-1.5 6M7 13l-1.5-6m0 0h2.8m12.2 0H7"
            />
          </svg>
          <p>Your cart is empty</p>
        </div>
        <p className="text-sm text-gray-400">
          Add items from the menu to get started
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-md overflow-hidden">
      <div className="p-4 border-b border-gray-200">
        <h2 className="text-lg font-semibold text-gray-900">Your Order</h2>
      </div>

      <div className="max-h-96 overflow-y-auto">
        {cart.items.map((item, index) => (
          <div
            key={`${item.menuItemId}-${index}`}
            className="p-4 border-b border-gray-100 last:border-b-0"
          >
            <div className="flex justify-between items-start mb-2">
              <div className="flex-1">
                <h3 className="font-medium text-gray-900">
                  {item.menuItem.name}
                </h3>
                {item.selectedVariations.length > 0 && (
                  <div className="text-sm text-gray-600 mt-1">
                    {item.selectedVariations.map((variation, i) => (
                      <span key={variation.variationId}>
                        {variation.variation.name}
                        {i < item.selectedVariations.length - 1 && ', '}
                      </span>
                    ))}
                  </div>
                )}
                {item.specialInstructions && (
                  <div className="text-sm text-gray-500 mt-1 italic">
                    Note: {item.specialInstructions}
                  </div>
                )}
              </div>
              <button
                onClick={() => onRemoveItem(index)}
                className="text-red-500 hover:text-red-700 ml-2"
                aria-label="Remove item"
              >
                <svg
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <button
                  onClick={() =>
                    onUpdateItem(index, { quantity: item.quantity - 1 })
                  }
                  className="w-6 h-6 rounded-full bg-gray-200 flex items-center justify-center text-gray-600 hover:bg-gray-300 text-sm"
                >
                  -
                </button>
                <span className="w-6 text-center text-sm font-medium">
                  {item.quantity}
                </span>
                <button
                  onClick={() =>
                    onUpdateItem(index, { quantity: item.quantity + 1 })
                  }
                  className="w-6 h-6 rounded-full bg-gray-200 flex items-center justify-center text-gray-600 hover:bg-gray-300 text-sm"
                >
                  +
                </button>
              </div>
              <div className="text-right">
                <div className="text-sm text-gray-500">
                  {formatPrice(item.unitPrice)} × {item.quantity}
                </div>
                <div className="font-medium text-gray-900">
                  {formatPrice(item.totalPrice)}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="p-4 bg-gray-50">
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-600">Subtotal</span>
            <span className="text-gray-900">{formatPrice(cart.subtotal)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">Tax</span>
            <span className="text-gray-900">{formatPrice(cart.taxAmount)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">Service Charge</span>
            <span className="text-gray-900">
              {formatPrice(cart.serviceCharge)}
            </span>
          </div>
          <div className="border-t border-gray-300 pt-2">
            <div className="flex justify-between font-semibold text-lg">
              <span className="text-gray-900">Total</span>
              <span className="text-gray-900">
                {formatPrice(cart.totalAmount)}
              </span>
            </div>
          </div>
        </div>

        <Button
          onClick={onCheckout}
          loading={isCheckoutLoading}
          className="w-full mt-4"
          size="lg"
        >
          Proceed to Checkout
        </Button>
      </div>
    </div>
  );
}
