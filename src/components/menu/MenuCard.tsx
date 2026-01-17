'use client';

import { useState, useMemo, useEffect } from 'react';
import { MenuItem, VariationOption, VariationGroup } from '@/types/menu';
import { formatPrice } from '@/lib/qr-utils';
import { ChefHat } from 'lucide-react';
import Image from 'next/image';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { AccordionItem } from '@/components/ui/Accordion';

interface MenuCardProps {
  item: MenuItem;
  onAddToCart: (
    item: MenuItem,
    quantity: number,
    selectedOptions: VariationOption[],
    instructions?: string
  ) => void;
  onModalStateChange?: (isOpen: boolean) => void;
  cartQuantity?: number;
  currency: string;
}

export function MenuCard({
  item,
  onAddToCart,
  cartQuantity = 0,
  currency,
  onModalStateChange,
}: MenuCardProps) {
  const [showModal, setShowModal] = useState(false);
  const [quantity, setQuantity] = useState(1);
  const [selectedOptions, setSelectedOptions] = useState<
    Record<string, VariationOption[]>
  >({});
  const [specialInstructions, setSpecialInstructions] = useState('');

  // Reset state when modal opens
  useEffect(() => {
    onModalStateChange?.(showModal);
    if (showModal) {
      setQuantity(1);
      setSelectedOptions({});
      setSpecialInstructions('');
    }
  }, [showModal, onModalStateChange]);

  const handleOptionToggle = (
    group: VariationGroup,
    option: VariationOption
  ) => {
    setSelectedOptions((prev) => {
      const currentSelections = prev[group.id] || [];
      const isSelected = currentSelections.some((o) => o.id === option.id);

      if (isSelected) {
        // Remove option
        return {
          ...prev,
          [group.id]: currentSelections.filter((o) => o.id !== option.id),
        };
      } else {
        // Add option
        // Check max selections
        if (group.maxSelections === 1) {
          // Single select: Replace existing
          return {
            ...prev,
            [group.id]: [option],
          };
        } else {
          // Multi select: Add if under limit
          if (
            group.maxSelections > 0 &&
            currentSelections.length >= group.maxSelections
          ) {
            return prev; // Ignore if max reached
          }
          return {
            ...prev,
            [group.id]: [...currentSelections, option],
          };
        }
      }
    });
  };

  const calculateTotalPrice = () => {
    const basePrice = item.price;
    const optionsPrice = Object.values(selectedOptions)
      .flat()
      .reduce((sum, opt) => sum + opt.priceModifier, 0);
    return (basePrice + optionsPrice) * quantity;
  };

  const validationState = useMemo(() => {
    const invalidGroups: string[] = [];

    // Check nested variationGroups (phase 3 structure)
    // Fallback to empty array if undefined
    const groups = item.variationGroups || [];

    for (const group of groups) {
      const selections = selectedOptions[group.id] || [];
      if (selections.length < group.minSelections) {
        invalidGroups.push(group.id);
      }
    }
    return invalidGroups;
  }, [item.variationGroups, selectedOptions]);

  const isValid = validationState.length === 0;

  const handleAddToCart = () => {
    if (!isValid) return;

    const flattenedOptions = Object.values(selectedOptions).flat();
    onAddToCart(
      item,
      quantity,
      flattenedOptions,
      specialInstructions || undefined
    );
    setShowModal(false);
  };

  const renderFooter = () => (
    <div className="flex gap-4 items-center">
      {/* Quantity */}
      <div className="flex items-center bg-gray-50 border border-gray-200 rounded-lg overflow-hidden h-12 shrink-0">
        <button
          onClick={() => setQuantity(Math.max(1, quantity - 1))}
          className="w-12 h-full flex items-center justify-center text-gray-500 hover:text-gray-900 hover:bg-gray-100 transition-colors border-r border-gray-200 text-xl font-bold"
        >
          −
        </button>
        <span className="w-12 text-center font-bold text-gray-900 text-lg">
          {quantity}
        </span>
        <button
          onClick={() => setQuantity(quantity + 1)}
          className="w-12 h-full flex items-center justify-center text-gray-500 hover:text-gray-900 hover:bg-gray-100 transition-colors border-l border-gray-200 text-xl font-bold"
        >
          +
        </button>
      </div>

      {/* Add Button */}
      <button
        onClick={handleAddToCart}
        disabled={!isValid}
        className="flex-1 bg-orange-500 hover:bg-orange-600 active:scale-[0.98] disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-bold h-12 rounded-lg shadow-md transition-all flex items-center justify-center text-sm sm:text-base uppercase tracking-wide"
      >
        <span>Add • {formatPrice(calculateTotalPrice(), currency)}</span>
      </button>
    </div>
  );

  return (
    <>
      <div
        onClick={() => setShowModal(true)}
        className="bg-white rounded-lg overflow-hidden shadow-sm hover:shadow-md transition-shadow text-left w-full cursor-pointer relative"
      >
        {cartQuantity > 0 && (
          <div className="absolute top-1.5 right-1.5 z-10 bg-orange-500 text-white text-[10px] font-bold rounded-md px-1.5 py-0.5 shadow-sm">
            {cartQuantity}
          </div>
        )}
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
              <ChefHat className="w-12 h-12 text-gray-300" />
            </div>
          )}
        </div>
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

      <BottomSheet
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        title={item.name}
        footer={renderFooter()}
      >
        <div className="space-y-6 pb-4">
          {/* Image Header within Modal */}
          {item.imageUrl && (
            <div className="relative w-full h-48 rounded-xl overflow-hidden shadow-sm">
              <Image
                src={item.imageUrl}
                alt={item.name}
                fill
                className="object-cover"
              />
            </div>
          )}

          {/* Description */}
          {item.description && (
            <p className="text-gray-600 text-sm leading-relaxed">
              {item.description}
            </p>
          )}

          {/* Variation Groups */}
          <div className="space-y-3">
            {item.variationGroups?.map((group) => {
              const currentSelections = selectedOptions[group.id] || [];
              const isSatisfied =
                currentSelections.length >= group.minSelections;
              const isError = validationState.includes(group.id);

              return (
                <AccordionItem
                  key={group.id}
                  title={group.name}
                  subtitle={
                    group.maxSelections === 1
                      ? 'Select 1'
                      : `Select up to ${group.maxSelections}`
                  }
                  isRequired={group.minSelections > 0}
                  isCompleted={isSatisfied}
                  error={
                    isError
                      ? `Please select at least ${group.minSelections}`
                      : undefined
                  }
                  defaultOpen={group.minSelections > 0}
                >
                  <div className="space-y-2">
                    {group.options.map((option) => {
                      const isSelected = currentSelections.some(
                        (o) => o.id === option.id
                      );
                      return (
                        <button
                          key={option.id}
                          onClick={() => handleOptionToggle(group, option)}
                          className={`
                            w-full flex items-center justify-between p-3 rounded-lg border transition-all
                            ${
                              isSelected
                                ? 'border-orange-500 bg-orange-50 text-orange-900 shadow-sm'
                                : 'border-gray-100 hover:bg-gray-50 text-gray-700'
                            }
                          `}
                        >
                          <span className="font-medium">{option.name}</span>
                          {option.priceModifier > 0 && (
                            <span className="text-sm font-semibold text-orange-600">
                              +{formatPrice(option.priceModifier, currency)}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </AccordionItem>
              );
            })}
          </div>

          {/* Special Instructions */}
          <div className="pt-2">
            <label className="block text-sm font-bold text-gray-900 mb-2">
              Special Instructions
            </label>
            <textarea
              value={specialInstructions}
              onChange={(e) => setSpecialInstructions(e.target.value)}
              placeholder="Any allergies or special requests?"
              className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-orange-500 outline-none transition-all placeholder-gray-400 text-sm"
              rows={3}
            />
          </div>
        </div>
      </BottomSheet>
    </>
  );
}
