'use client';

import { useState, useMemo, useEffect } from 'react';
import { MenuItem, VariationOption, VariationGroup } from '@/types/menu';
import { formatPrice } from '@/lib/qr-utils';
import { ChefHat, MessageSquare } from 'lucide-react';
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
  const [showInstructions, setShowInstructions] = useState(false);

  // Reset state when modal opens
  useEffect(() => {
    onModalStateChange?.(showModal);
    if (showModal) {
      setQuantity(1);
      setSelectedOptions({});
      setSpecialInstructions('');
      setShowInstructions(false);
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
    <div className="space-y-4">
      {/* Quantity Row */}
      <div className="flex items-center justify-center">
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

      {/* Add Button Row */}
      <button
        onClick={handleAddToCart}
        disabled={!isValid}
        className="w-full bg-orange-500 hover:bg-orange-600 active:scale-[0.98] disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-bold h-12 rounded-lg shadow-md transition-all flex items-center justify-center text-sm sm:text-base uppercase tracking-wide"
      >
        <span>Add to Cart - {formatPrice(calculateTotalPrice(), currency)}</span>
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
        showCloseButtonOverlay
        noPadding
        hideDragHandle
        footer={renderFooter()}
      >
        <div className="flex flex-col h-full">
          {/* Header Image - Full Width */}
          <div className="relative w-full aspect-[4/3] sm:aspect-video bg-gray-100 shrink-0">
            {item.imageUrl ? (
              <Image
                src={item.imageUrl}
                alt={item.name}
                fill
                priority
                className="object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-gray-300 bg-gray-50">
                <ChefHat className="w-16 h-16" />
              </div>
            )}
          </div>

          {/* Content Wrapper */}
          <div className="p-4 space-y-4">
            {/* Title and Price */}
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-bold text-gray-900 leading-tight">
                  {item.name}
                </h2>
                {item.isFeatured && (
                  <ChefHat className="w-5 h-5 text-orange-500 flex-shrink-0" />
                )}
              </div>
              <div className="text-xl font-bold text-orange-600 whitespace-nowrap">
                {formatPrice(item.price, currency)}
              </div>
            </div>

            {/* Description */}
            {item.description && (
              <p className="text-sm text-gray-600 leading-relaxed">
                {item.description}
              </p>
            )}

            {/* Variation Groups */}
            <div className="space-y-4">
              {item.variationGroups?.map((group) => {
                const currentSelections = selectedOptions[group.id] || [];
                const isSatisfied =
                  currentSelections.length >= group.minSelections;
                const isError = validationState.includes(group.id);

                return (
                  <div key={group.id} className="space-y-2">
                    <div className="flex items-center justify-between">
                      <h4 className="text-sm font-bold text-gray-900 capitalize tracking-tight">
                        {group.name}
                      </h4>
                      {group.minSelections > 0 && !isSatisfied && (
                        <span className="text-[10px] font-bold text-white bg-orange-500 px-1.5 py-0.5 rounded uppercase">
                          Required
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {group.options.map((option) => {
                        const isSelected = currentSelections.some(
                          (o) => o.id === option.id
                        );
                        return (
                          <button
                            key={option.id}
                            onClick={() => handleOptionToggle(group, option)}
                            className={`flex items-center px-4 py-2 rounded-xl border-2 transition-all duration-200 text-sm font-medium ${isSelected
                              ? 'border-orange-500 bg-orange-50 text-orange-700 shadow-sm'
                              : 'border-gray-100 bg-gray-50 text-gray-600 hover:border-gray-200 hover:bg-gray-100'
                              }`}
                          >
                            <span className="flex-1">{option.name}</span>
                            {option.priceModifier > 0 && (
                              <span
                                className={`ml-2 text-xs font-bold ${isSelected ? 'text-orange-600' : 'text-gray-400'}`}
                              >
                                +{formatPrice(option.priceModifier, currency)}
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
                  className="w-full p-4 bg-gray-50 border border-gray-100 rounded-2xl text-base focus:ring-2 focus:ring-blue-500 mt-3 transition-all placeholder-gray-400"
                  rows={2}
                  placeholder="Any allergies or special requests? We'll do our best!"
                  autoFocus
                />
              )}
            </div>
          </div>
        </div>
      </BottomSheet>
    </>
  );
}
