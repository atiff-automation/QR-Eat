'use client';

import { useState } from 'react';
import { MenuItem, MenuItemVariation } from '@/types/menu';
import { formatPrice } from '@/lib/qr-utils';
import { X, MessageSquare } from 'lucide-react';
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
}

export function MenuCard({
  item,
  onAddToCart,
  onModalStateChange,
}: MenuCardProps) {
  const [showModal, setShowModal] = useState(false);
  const [quantity, setQuantity] = useState(1);
  const [selectedVariations, setSelectedVariations] = useState<
    Record<string, MenuItemVariation>
  >({});
  const [specialInstructions, setSpecialInstructions] = useState('');
  const [showInstructions, setShowInstructions] = useState(false);

  // Lock body scroll when modal is open to prevent browser UI auto-hiding
  useBodyScrollLock(showModal);

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
      <button
        onClick={() => {
          setShowModal(true);
          onModalStateChange?.(true);
        }}
        className="bg-white rounded-lg overflow-hidden shadow-sm hover:shadow-md transition-shadow text-left w-full"
      >
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

          {/* Best Seller Badge */}
          {item.isFeatured && (
            <div className="absolute top-2 right-2 bg-orange-500 text-white px-2 py-1 rounded-full text-xs font-bold shadow-md">
              Best Seller
            </div>
          )}
        </div>

        {/* Info - Name and Price Only */}
        <div className="p-3">
          <h3 className="font-semibold text-gray-900 text-sm mb-1 line-clamp-2 min-h-[2.5rem]">
            {item.name}
          </h3>
          <p className="text-orange-600 font-bold text-base">
            {formatPrice(item.price)}
          </p>
        </div>
      </button>

      {/* Detail Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
          {/* Backdrop - Very Light and Transparent */}
          <div
            className="absolute inset-0"
            style={{ backgroundColor: 'rgba(0, 0, 0, 0.1)' }}
            onClick={() => {
              setShowModal(false);
              onModalStateChange?.(false);
            }}
          />

          {/* Modal Content - Safe area padding pushes all content into visible area */}
          <div className="relative bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-lg max-h-[90vh] overflow-hidden animate-slide-up pt-safe-top">
            {/* Header with Image */}
            <div className="relative">
              {item.imageUrl ? (
                <div className="relative w-full h-64">
                  <Image
                    src={item.imageUrl}
                    alt={item.name}
                    fill
                    sizes="(max-width: 768px) 100vw, 512px"
                    className="object-cover"
                  />
                </div>
              ) : (
                <div className="w-full h-64 bg-gradient-to-br from-gray-100 to-gray-200" />
              )}

              {/* Close Button - positioned relative to padded container */}
              <button
                onClick={() => {
                  setShowModal(false);
                  onModalStateChange?.(false);
                }}
                className="absolute top-4 right-4 p-2 bg-white rounded-full shadow-lg hover:bg-gray-100 transition-colors"
              >
                <X className="h-5 w-5 text-gray-600" />
              </button>

              {/* Best Seller Badge */}
              {item.isFeatured && (
                <div className="absolute top-4 left-4 bg-orange-500 text-white px-3 py-1.5 rounded-full text-sm font-bold shadow-md">
                  Best Seller
                </div>
              )}
            </div>

            {/* Scrollable Content */}
            <div className="modal-scrollable overflow-y-auto max-h-[calc(90vh-16rem)] p-6">
              {/* Name and Price */}
              <div className="mb-4">
                <h2 className="text-2xl font-bold text-gray-900 mb-2">
                  {item.name}
                </h2>
                <div className="text-3xl font-bold text-orange-600">
                  {formatPrice(item.price)}
                </div>
              </div>

              {/* Description */}
              {item.description && (
                <p className="text-gray-600 mb-4">{item.description}</p>
              )}

              {/* Calories */}
              {item.calories && (
                <div className="text-sm text-gray-500 mb-4">
                  {item.calories} calories
                </div>
              )}

              {/* Dietary Info and Allergens */}
              {(item.allergens.length > 0 || item.dietaryInfo.length > 0) && (
                <div className="mb-4">
                  {item.dietaryInfo.length > 0 && (
                    <div className="flex flex-wrap gap-1 mb-2">
                      {item.dietaryInfo.map((info) => (
                        <span
                          key={info}
                          className="bg-green-100 text-green-800 text-xs px-2 py-1 rounded-full"
                        >
                          {info}
                        </span>
                      ))}
                    </div>
                  )}
                  {item.allergens.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {item.allergens.map((allergen) => (
                        <span
                          key={allergen}
                          className="bg-red-100 text-red-800 text-xs px-2 py-1 rounded-full"
                        >
                          {allergen}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Variations */}
              {item.variations.length > 0 && (
                <div className="mb-4 p-4 bg-gray-50 rounded-lg border border-gray-200">
                  {[
                    ...new Set(item.variations.map((v) => v.variationType)),
                  ].map((type) => {
                    const typeVariations = item.variations.filter(
                      (v) => v.variationType === type
                    );
                    const isRequired = typeVariations.some((v) => v.isRequired);

                    return (
                      <div key={type} className="mb-4 last:mb-0">
                        <h4 className="font-semibold text-gray-900 mb-2 capitalize">
                          {type}{' '}
                          {isRequired && (
                            <span className="text-red-500">*</span>
                          )}
                        </h4>
                        <div className="space-y-2">
                          {typeVariations.map((variation) => (
                            <label
                              key={variation.id}
                              className="flex items-center p-2 hover:bg-white rounded cursor-pointer"
                            >
                              <input
                                type="radio"
                                name={type}
                                value={variation.id}
                                checked={
                                  selectedVariations[type]?.id === variation.id
                                }
                                onChange={() =>
                                  handleVariationChange(type, variation)
                                }
                                className="mr-3 w-4 h-4 text-orange-600 focus:ring-orange-500"
                              />
                              <span className="flex-1 text-sm font-medium text-gray-900">
                                {variation.name}
                              </span>
                              {variation.priceModifier !== 0 && (
                                <span className="text-sm text-gray-600">
                                  ({variation.priceModifier > 0 ? '+' : ''}
                                  {formatPrice(variation.priceModifier)})
                                </span>
                              )}
                            </label>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Special Instructions - Collapsible */}
              <div className="mb-4">
                <button
                  onClick={() => setShowInstructions(!showInstructions)}
                  className="flex items-center text-sm font-semibold text-gray-900 hover:text-orange-600 transition-colors"
                >
                  <MessageSquare className="w-4 h-4 mr-2 text-orange-500" />
                  <span>Add Special Request</span>
                  <svg
                    className={`ml-2 h-4 w-4 transition-transform ${showInstructions ? 'rotate-180' : ''}`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M19 9l-7 7-7-7"
                    />
                  </svg>
                </button>

                {showInstructions && (
                  <textarea
                    value={specialInstructions}
                    onChange={(e) => setSpecialInstructions(e.target.value)}
                    className="w-full p-3 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent mt-2"
                    rows={2}
                    placeholder="Any special requests..."
                    autoFocus
                  />
                )}
              </div>
            </div>

            {/* Footer - Quantity and Add to Cart - Sticky */}
            <div className="sticky bottom-0 p-4 border-t border-gray-200 bg-white shadow-lg">
              {/* Quantity Selector - Centered */}
              <div className="flex items-center justify-center mb-3">
                <div className="flex items-center space-x-4 bg-gray-100 rounded-lg p-1">
                  <button
                    onClick={() => setQuantity(Math.max(1, quantity - 1))}
                    className="w-10 h-10 rounded-lg bg-white flex items-center justify-center text-gray-700 hover:bg-gray-50 font-bold text-xl shadow-sm touch-target"
                  >
                    −
                  </button>
                  <span className="w-12 text-center font-bold text-gray-900 text-lg">
                    {quantity}
                  </span>
                  <button
                    onClick={() => setQuantity(quantity + 1)}
                    className="w-10 h-10 rounded-lg bg-white flex items-center justify-center text-gray-700 hover:bg-gray-50 font-bold text-xl shadow-sm touch-target"
                  >
                    +
                  </button>
                </div>
              </div>

              {/* Add to Cart Button - Full Width */}
              <button
                onClick={handleAddToCart}
                disabled={!canAddToCart}
                className="w-full bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 disabled:from-gray-300 disabled:to-gray-400 text-white font-bold py-3 px-4 rounded-lg transition-all duration-200 transform active:scale-98 disabled:cursor-not-allowed touch-target"
              >
                Add {formatPrice(calculatePrice())}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
