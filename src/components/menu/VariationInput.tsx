import { useState } from 'react';
import { CurrencyInput } from '@/components/ui/CurrencyInput';
import { MenuItemVariation } from '@/types/menu';

// Type for new variations (no ID yet)
export type MenuVariationInput = Omit<
  MenuItemVariation,
  'id' | 'menuItemId' | 'createdAt' | 'updatedAt'
> & {
  id?: string; // Optional ID for existing variations
};

interface VariationInputProps {
  value: MenuVariationInput[];
  onChange: (variations: MenuVariationInput[]) => void;
  currency: string;
}

export function VariationInput({
  value = [],
  onChange,
  currency,
}: VariationInputProps) {
  // Local state for the new variation being added
  const [newVariation, setNewVariation] = useState<MenuVariationInput>({
    name: '',
    priceModifier: 0,
    variationType: '',
    isRequired: false,
    maxSelections: 1,
    displayOrder: 0,
  });

  const [error, setError] = useState('');

  const handleAdd = () => {
    if (!newVariation.name.trim()) {
      setError('Name is required');
      return;
    }
    if (!newVariation.variationType.trim()) {
      setError('Type is required');
      return;
    }

    const nextDisplayOrder =
      value.length > 0 ? Math.max(...value.map((v) => v.displayOrder)) + 1 : 0;

    onChange([
      ...value,
      {
        ...newVariation,
        displayOrder: nextDisplayOrder,
      },
    ]);

    // Reset form but keep type for convenience (often adding multiple of same type)
    setNewVariation({
      ...newVariation,
      name: '',
      priceModifier: 0,
      // Keep variationType
      // Keep isRequired
    });
    setError('');
  };

  const handleRemove = (index: number) => {
    const newVariations = [...value];
    newVariations.splice(index, 1);
    onChange(newVariations);
  };

  const handleUpdate = (
    index: number,
    field: keyof MenuVariationInput,
    val: string | number | boolean
  ) => {
    const newVariations = [...value];
    newVariations[index] = { ...newVariations[index], [field]: val };
    onChange(newVariations);
  };

  // Group variations by type for display
  const groupedVariations = value.reduce(
    (acc, variation, index) => {
      const type = variation.variationType;
      if (!acc[type]) acc[type] = [];
      acc[type].push({ variation, originalIndex: index });
      return acc;
    },
    {} as Record<
      string,
      { variation: MenuVariationInput; originalIndex: number }[]
    >
  );

  return (
    <div className="space-y-4">
      <div className="space-y-4">
        {Object.entries(groupedVariations).map(([type, items]) => (
          <div
            key={type}
            className="bg-gray-50 rounded-lg p-3 border border-gray-200"
          >
            <h4 className="text-sm font-bold text-gray-700 mb-2 uppercase flex items-center justify-between">
              {type}
              <span className="text-xs font-normal text-gray-500 normal-case bg-gray-200 px-2 py-0.5 rounded-full">
                {items[0].variation.isRequired ? 'Required' : 'Optional'}
              </span>
            </h4>
            <div className="divide-y divide-gray-200">
              {items.map(({ variation, originalIndex }) => (
                <div
                  key={originalIndex}
                  className="py-2 flex items-center gap-2"
                >
                  <div className="flex-1 grid grid-cols-12 gap-2">
                    <div className="col-span-5">
                      <input
                        type="text"
                        value={variation.name}
                        onChange={(e) =>
                          handleUpdate(originalIndex, 'name', e.target.value)
                        }
                        className="w-full p-1 bg-white border border-gray-300 rounded text-sm focus:ring-1 focus:ring-blue-500 outline-none"
                        placeholder="Name"
                      />
                    </div>
                    <div className="col-span-4">
                      <CurrencyInput
                        value={variation.priceModifier}
                        onChange={(val) =>
                          handleUpdate(originalIndex, 'priceModifier', val)
                        }
                        currency={currency}
                        className="w-full p-1 bg-white border border-gray-300 rounded text-sm focus:ring-1 focus:ring-blue-500 outline-none"
                      />
                    </div>
                    <div className="col-span-3 flex flex-col gap-1">
                      <label className="flex items-center space-x-1 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={variation.isRequired}
                          onChange={(e) =>
                            handleUpdate(
                              originalIndex,
                              'isRequired',
                              e.target.checked
                            )
                          }
                          className="w-3 h-3 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                        />
                        <span className="text-xs text-gray-600">Req.</span>
                      </label>
                      <div className="flex items-center gap-1">
                        <span className="text-[10px] text-gray-400">Max:</span>
                        <input
                          type="number"
                          min="0"
                          value={variation.maxSelections || 1}
                          onChange={(e) =>
                            handleUpdate(
                              originalIndex,
                              'maxSelections',
                              parseInt(e.target.value) || 1
                            )
                          }
                          className="w-12 p-0.5 text-xs border border-gray-300 rounded text-center"
                        />
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleRemove(originalIndex)}
                    className="text-red-500 hover:text-red-700 p-1"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="bg-blue-50 rounded-lg p-3 border border-blue-100">
        <h4 className="text-xs font-bold text-blue-800 uppercase mb-2">
          Add Variation
        </h4>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mb-2">
          <div>
            <label className="block text-xs text-gray-500 mb-1">
              Type (e.g., Size, Flavor)
            </label>
            <input
              type="text"
              value={newVariation.variationType}
              onChange={(e) =>
                setNewVariation({
                  ...newVariation,
                  variationType: e.target.value,
                })
              }
              className="w-full p-2 bg-white border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
              placeholder="Variation Type"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Name</label>
            <input
              type="text"
              value={newVariation.name}
              onChange={(e) =>
                setNewVariation({ ...newVariation, name: e.target.value })
              }
              className="w-full p-2 bg-white border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
              placeholder="Variation Name"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mb-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">
              Price Adjustment
            </label>
            <CurrencyInput
              value={newVariation.priceModifier}
              onChange={(val) =>
                setNewVariation({ ...newVariation, priceModifier: val })
              }
              currency={currency}
              className="w-full p-2 bg-white border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
            />
          </div>
          <div className="flex items-center pt-5">
            <label className="flex items-center space-x-2 cursor-pointer">
              <input
                type="checkbox"
                checked={newVariation.isRequired}
                onChange={(e) =>
                  setNewVariation({
                    ...newVariation,
                    isRequired: e.target.checked,
                  })
                }
                className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
              />
              <span className="text-sm text-gray-700">Required</span>
            </label>
          </div>
        </div>

        <div className="mb-3">
          <label className="block text-xs text-gray-500 mb-1">
            Max Selections (0 = No Limit)
          </label>
          <input
            type="number"
            min="0"
            value={newVariation.maxSelections || 1}
            onChange={(e) =>
              setNewVariation({
                ...newVariation,
                maxSelections: parseInt(e.target.value) || 1,
              })
            }
            className="w-full p-2 bg-white border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
          />
        </div>

        {error && <p className="text-red-500 text-xs mb-2">{error}</p>}

        <button
          type="button"
          onClick={handleAdd}
          className="w-full py-2 bg-white border border-blue-200 text-blue-700 rounded-lg hover:bg-blue-50 font-medium text-sm transition-colors"
        >
          + Add Variation
        </button>
      </div>
    </div>
  );
}
