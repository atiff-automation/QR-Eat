'use client';

import { useState } from 'react';
import { MenuItem, MenuItemVariation } from '@/types/menu';
import { formatPrice } from '@/lib/qr-utils';
import { Button } from '@/components/ui/Button';

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
}

export function MenuCard({ item, onAddToCart }: MenuCardProps) {
  const [quantity, setQuantity] = useState(1);
  const [selectedVariations, setSelectedVariations] = useState<
    Record<string, MenuItemVariation>
  >({});
  const [specialInstructions, setSpecialInstructions] = useState('');
  const [showDetails, setShowDetails] = useState(false);

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

    // Reset form
    setQuantity(1);
    setSelectedVariations({});
    setSpecialInstructions('');
    setShowDetails(false);
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
    <div className="bg-white rounded-lg shadow-md overflow-hidden">
      {item.imageUrl && (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={item.imageUrl}
            alt={item.name}
            className="w-full h-48 object-cover"
          />
        </>
      )}

      <div className="p-4">
        <div className="flex justify-between items-start mb-2">
          <h3 className="text-lg font-semibold text-gray-900">{item.name}</h3>
          {item.isFeatured && (
            <span className="bg-yellow-100 text-yellow-800 text-xs px-2 py-1 rounded-full">
              Featured
            </span>
          )}
        </div>

        {item.description && (
          <p className="text-gray-600 text-sm mb-3">{item.description}</p>
        )}

        <div className="flex justify-between items-center mb-3">
          <span className="text-xl font-bold text-green-600">
            {formatPrice(item.price)}
          </span>
          <span className="text-sm text-gray-500">
            {item.preparationTime} min
          </span>
        </div>

        {item.calories && (
          <div className="text-sm text-gray-500 mb-2">
            {item.calories} calories
          </div>
        )}

        {(item.allergens.length > 0 || item.dietaryInfo.length > 0) && (
          <div className="mb-3">
            {item.dietaryInfo.length > 0 && (
              <div className="flex flex-wrap gap-1 mb-1">
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

        {item.variations.length > 0 && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowDetails(!showDetails)}
            className="w-full mb-3"
          >
            {showDetails ? 'Hide' : 'Show'} Options
          </Button>
        )}

        {showDetails && item.variations.length > 0 && (
          <div className="mb-4 p-3 bg-gray-50 rounded-lg">
            {[...new Set(item.variations.map((v) => v.variationType))].map(
              (type) => {
                const typeVariations = item.variations.filter(
                  (v) => v.variationType === type
                );
                const isRequired = typeVariations.some((v) => v.isRequired);

                return (
                  <div key={type} className="mb-3 last:mb-0">
                    <h4 className="font-medium text-gray-900 mb-2 capitalize">
                      {type}{' '}
                      {isRequired && <span className="text-red-500">*</span>}
                    </h4>
                    <div className="space-y-1">
                      {typeVariations.map((variation) => (
                        <label key={variation.id} className="flex items-center">
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
                            className="mr-2"
                          />
                          <span className="text-sm">
                            {variation.name}
                            {variation.priceModifier !== 0 && (
                              <span className="text-gray-600 ml-1">
                                ({variation.priceModifier > 0 ? '+' : ''}
                                {formatPrice(variation.priceModifier)})
                              </span>
                            )}
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>
                );
              }
            )}

            <div className="mt-3">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Special Instructions
              </label>
              <textarea
                value={specialInstructions}
                onChange={(e) => setSpecialInstructions(e.target.value)}
                className="w-full p-2 border border-gray-300 rounded-md text-sm"
                rows={2}
                placeholder="Any special requests..."
              />
            </div>
          </div>
        )}

        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <button
              onClick={() => setQuantity(Math.max(1, quantity - 1))}
              className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-gray-600 hover:bg-gray-300"
            >
              -
            </button>
            <span className="w-8 text-center font-medium">{quantity}</span>
            <button
              onClick={() => setQuantity(quantity + 1)}
              className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-gray-600 hover:bg-gray-300"
            >
              +
            </button>
          </div>

          <Button
            onClick={handleAddToCart}
            disabled={!canAddToCart}
            className="flex-1 ml-4"
          >
            Add {formatPrice(calculatePrice())}
          </Button>
        </div>
      </div>
    </div>
  );
}
