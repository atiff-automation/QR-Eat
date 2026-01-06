'use client';

import { useState } from 'react';
import { MenuItem, MenuItemVariation } from '@/types/menu';
import { formatPrice } from '@/lib/qr-utils';
import { X, MessageSquare, ChefHat } from 'lucide-react';
import { useBodyScrollLock } from '@/hooks/useBodyScrollLock';
import Image from 'next/image';

interface MenuCardProps {
  item: MenuItem;
  onAddToCart: (
    item: MenuItem,
    quantity: number,
    variations: Array<{
      variationId: string;
      variation: MenuItemVariation;
      quantity: number;
    }>,
    instructions?: string
  ) => void;
  onModalStateChange?: (isOpen: boolean) => void;
  cartQuantity?: number; // Total quantity of this item in cart
  currency: string; // Phase 3 - Restaurant Settings
}

export function MenuCard({
  item,
  onAddToCart,
  onModalStateChange,
  cartQuantity = 0,
  currency,
}: MenuCardProps) {
  const [showModal, setShowModal] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [quantity, setQuantity] = useState(1);
  const [selectedVariations, setSelectedVariations] = useState<
    Record<string, MenuItemVariation>
  >({});
  const [specialInstructions, setSpecialInstructions] = useState('');
  const [showInstructions, setShowInstructions] = useState(false);

  // Lock body scroll when modal is open to prevent browser UI auto-hiding
  useBodyScrollLock(showModal);

  // Handle modal close with animation
  const handleClose = () => {
    setIsClosing(true);
    setTimeout(() => {
      setShowModal(false);
      setIsClosing(false);
      onModalStateChange?.(false);
    }, 300); // Match animation duration
  };

  const handleOpen = () => {
    setShowModal(true);
    onModalStateChange?.(true);
  };

  const handleVariationChange = (
    variationType: string,
    variation: MenuItemVariation
  ) => {
    setSelectedVariations((prev) => ({
      ...prev,
      [variationType]: variation,
    }));
  };

  const handleAddToCart = () => {
    const variations = Object.values(selectedVariations).map((v) => ({
      variationId: v.id,
      variation: v,
      quantity: 1,
    }));

    onAddToCart(item, quantity, variations, specialInstructions || undefined);

    // Reset and close
    setQuantity(1);
    setSelectedVariations({});
    setSpecialInstructions('');
    setShowModal(false);
    onModalStateChange?.(false);
  };

  const calculatePrice = () => {
    const variationsTotal = Object.values(selectedVariations).reduce(
      (sum: number, variation: MenuItemVariation) => {
        return sum + (variation.priceModifier || 0);
      },
      0
    );

    return (item.price + variationsTotal) * quantity;
  };

  const requiredVariationTypes = [
    ...new Set(
      item.variations.filter((v) => v.isRequired).map((v) => v.variationType)
    ),
  ];
  const canAddToCart = requiredVariationTypes.every(
    (type) => selectedVariations[type]
  );

  return (
    <>
      {/* Simple Card - Just Image, Name, Price */}
      <div
        onClick={handleOpen}
        className="bg-white rounded-lg overflow-hidden shadow-sm hover:shadow-md transition-shadow text-left w-full cursor-pointer relative"
      >
        {/* Cart Quantity Badge - Minimal & Modern */}
        {cartQuantity > 0 && (
          <div className="absolute top-1.5 right-1.5 z-10 bg-orange-500 text-white text-[10px] font-bold rounded-md px-1.5 py-0.5 shadow-sm">
            {cartQuantity}
          </div>
        )}
        {/* Image */}
        <div className="relative aspect-square">
          {item.imageUrl ? (
            <Image
              src={item.imageUrl}
              alt={item.name}
              fill
              sizes="(max-width: 768px) 50vw, 33vw"
              className="object-cover"
            />
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center">
              <div className="text-center text-gray-400">
                <svg
                  className="w-12 h-12 mx-auto"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                  />
                </svg>
              </div>
            </div>
          )}
        </div>

        {/* Info - Name and Price */}
        <div className="p-3">
          <div className="flex items-center gap-1 mb-1">
            <h3 className="font-semibold text-gray-900 text-sm line-clamp-2 min-h-[2.5rem] flex-1">
              {item.name}
            </h3>
            {item.isFeatured && (
              <ChefHat className="w-4 h-4 text-orange-500 flex-shrink-0" />
            )}
          </div>
          <p className="text-orange-600 font-bold text-base">
            {formatPrice(item.price, currency)}
          </p>
        </div>
      </div>

      {/* Detail Modal */}
      {showModal && (
        <div className="qr-modal-overlay z-50 flex items-center justify-center">
          {/* Backdrop - Darker to focus on modal */}
          <div
            className={`absolute inset-0 ${isClosing ? 'animate-fade-out' : ''}`}
            style={{ backgroundColor: 'rgba(0, 0, 0, 0.5)' }}
            onClick={handleClose}
          />

          {/* Modal Content - Fullscreen on mobile, centered card on desktop */}
          <div
            className={`relative bg-white w-full h-full max-h-[90vh] sm:h-auto rounded-2xl sm:max-w-lg overflow-hidden flex flex-col ${
              isClosing ? 'animate-slide-down' : 'animate-slide-up'
            }`}
          >
            {/* Header with Image */}
            <div className="relative shrink-0">
              {item.imageUrl ? (
                <div className="relative w-full h-56 sm:h-64">
                  <Image
                    src={item.imageUrl}
                    alt={item.name}
                    fill
                    sizes="(max-width: 768px) 100vw, 512px"
                    className="object-cover"
                  />
                </div>
              ) : (
                <div className="w-full h-56 sm:h-64 bg-gradient-to-br from-gray-100 to-gray-200" />
              )}

              {/* Close Button */}
              <button
                onClick={handleClose}
                className="absolute right-4 p-2 bg-white/80 backdrop-blur-sm rounded-full shadow-lg hover:bg-white transition-colors z-10"
                style={{ top: 'calc(env(safe-area-inset-top, 0px) + 1rem)' }}
              >
                <X className="h-5 w-5 text-gray-600" />
              </button>
            </div>

            {/* Scrollable Content */}
            <div className="modal-scrollable flex-1 overflow-y-auto min-h-0 p-4 space-y-3">
              {/* Name and Features */}
              <div className="space-y-0.5">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 pr-2">
                    <div className="flex items-center gap-2">
                      <h2 className="text-xl font-bold text-gray-900 leading-tight">
                        {item.name}
                      </h2>
                      {item.isFeatured && (
                        <ChefHat className="w-5 h-5 text-orange-500 flex-shrink-0" />
                      )}
                    </div>
                  </div>
                  <div className="text-xl font-bold text-orange-600 whitespace-nowrap pt-0.5">
                    {formatPrice(item.price, currency)}
                  </div>
                </div>
              </div>

              {/* Description */}
              {item.description && (
                <p className="text-sm text-gray-600 leading-relaxed">
                  {item.description}
                </p>
              )}

              {/* Variations */}
              {item.variations.length > 0 && (
                <div className="space-y-4 pt-1">
                  {[
                    ...new Set(item.variations.map((v) => v.variationType)),
                  ].map((type) => {
                    const typeVariations = item.variations.filter(
                      (v) => v.variationType === type
                    );
                    const isRequired = typeVariations.some((v) => v.isRequired);

                    return (
                      <div key={type} className="space-y-2">
                        <div className="flex items-center justify-between">
                          <h4 className="text-sm font-bold text-gray-900 capitalize tracking-tight">
                            {type}
                          </h4>
                          {isRequired && (
                            <span className="text-[10px] font-bold text-white bg-orange-500 px-1.5 py-0.5 rounded uppercase">
                              Required
                            </span>
                          )}
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {typeVariations.map((variation) => {
                            const isSelected =
                              selectedVariations[type]?.id === variation.id;
                            return (
                              <button
                                key={variation.id}
                                onClick={() =>
                                  handleVariationChange(type, variation)
                                }
                                className={`flex items-center px-4 py-2 rounded-xl border-2 transition-all duration-200 text-sm font-medium ${
                                  isSelected
                                    ? 'border-orange-500 bg-orange-50 text-orange-700 shadow-sm'
                                    : 'border-gray-100 bg-gray-50 text-gray-600 hover:border-gray-200 hover:bg-gray-100'
                                }`}
                              >
                                <span className="flex-1">{variation.name}</span>
                                {variation.priceModifier !== 0 && (
                                  <span
                                    className={`ml-2 text-xs font-bold ${isSelected ? 'text-orange-600' : 'text-gray-400'}`}
                                  >
                                    {variation.priceModifier > 0 ? '+' : ''}
                                    {formatPrice(
                                      variation.priceModifier,
                                      currency
                                    )}
                                  </span>
                                )}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Special Instructions - Collapsible */}
              <div className="pt-1">
                <button
                  onClick={() => setShowInstructions(!showInstructions)}
                  className="flex items-center text-xs font-bold text-blue-600 hover:text-blue-700 transition-colors uppercase tracking-wider"
                >
                  <MessageSquare className="w-3.5 h-3.5 mr-1.5" />
                  <span>
                    {showInstructions
                      ? 'Hide Instructions'
                      : 'Add Special Request'}
                  </span>
                </button>

                {showInstructions && (
                  <textarea
                    value={specialInstructions}
                    onChange={(e) => setSpecialInstructions(e.target.value)}
                    className="w-full p-4 bg-gray-50 border-none rounded-2xl text-base focus:ring-2 focus:ring-blue-500 mt-3 transition-all placeholder-gray-400"
                    rows={2}
                    placeholder="Any allergies or special requests? We'll do our best!"
                    autoFocus
                  />
                )}
              </div>
            </div>

            {/* Footer - Quantity and Add to Cart - Sticky */}
            <div
              className="sticky bottom-0 p-3 pt-4 border-t border-gray-100 bg-white shadow-[0_-4px_12px_-2px_rgba(0,0,0,0.03)]"
              style={{
                paddingBottom:
                  'calc(env(safe-area-inset-bottom, 0px) + 0.75rem)',
              }}
            >
              {/* Quantity Selector - Compact Modern Design */}
              <div className="flex items-center justify-center mb-4">
                <div className="flex items-center bg-gray-50 border border-gray-200 rounded-lg overflow-hidden h-9">
                  <button
                    onClick={() => setQuantity(Math.max(1, quantity - 1))}
                    className="w-10 h-full flex items-center justify-center text-gray-500 hover:text-gray-900 hover:bg-gray-100 transition-colors border-r border-gray-200"
                  >
                    <span className="text-xl">−</span>
                  </button>
                  <span className="w-10 text-center font-bold text-gray-900 text-base">
                    {quantity}
                  </span>
                  <button
                    onClick={() => setQuantity(quantity + 1)}
                    className="w-10 h-full flex items-center justify-center text-gray-500 hover:text-gray-900 hover:bg-gray-100 transition-colors border-l border-gray-200"
                  >
                    <span className="text-xl">+</span>
                  </button>
                </div>
              </div>

              {/* Add to Cart Button - Clean Action */}
              <button
                onClick={handleAddToCart}
                disabled={!canAddToCart}
                className="w-full bg-orange-500 hover:bg-orange-600 active:scale-[0.98] disabled:bg-gray-300 text-white font-bold h-12 rounded-lg shadow-md transition-all flex items-center justify-center"
              >
                <span className="uppercase">
                  Add to Cart - {formatPrice(calculatePrice(), currency)}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
