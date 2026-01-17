import React from 'react';
import { Plus, Trash2, GripVertical, AlertCircle } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { Button } from '@/components/ui/Button';
import { CurrencyInput } from '@/components/ui/CurrencyInput';
import { VariationGroup, VariationOption } from '@/lib/hooks/queries/useMenu';

interface VariationManagerProps {
  value: VariationGroup[];
  onChange: (value: VariationGroup[]) => void;
  currencySymbol?: string;
}

export function VariationManager({
  value,
  onChange,
  currencySymbol = '$',
}: VariationManagerProps) {
  // Update a specific group by Index
  const updateGroup = (index: number, updates: Partial<VariationGroup>) => {
    const newGroups = [...value];
    newGroups[index] = { ...newGroups[index], ...updates };
    onChange(newGroups);
  };

  // Add a new empty group
  const addGroup = () => {
    onChange([
      ...value,
      {
        id: uuidv4(), // Temp ID
        name: '',
        minSelections: 0,
        maxSelections: 1,
        displayOrder: value.length,
        options: [],
      },
    ]);
  };

  // Remove a group
  const removeGroup = (index: number) => {
    const newGroups = value.filter((_, i) => i !== index);
    onChange(newGroups);
  };

  // --- Option Handlers ---

  const addOption = (groupIndex: number) => {
    const group = value[groupIndex];
    const newOption: VariationOption = {
      id: uuidv4(),
      name: '',
      priceModifier: 0,
      isAvailable: true,
      displayOrder: group.options.length,
    };
    updateGroup(groupIndex, {
      options: [...group.options, newOption],
    });
  };

  const updateOption = (
    groupIndex: number,
    optionIndex: number,
    updates: Partial<VariationOption>
  ) => {
    const group = value[groupIndex];
    const newOptions = [...group.options];
    newOptions[optionIndex] = { ...newOptions[optionIndex], ...updates };
    updateGroup(groupIndex, { options: newOptions });
  };

  const removeOption = (groupIndex: number, optionIndex: number) => {
    const group = value[groupIndex];
    const newOptions = group.options.filter((_, i) => i !== optionIndex);
    updateGroup(groupIndex, { options: newOptions });
  };

  return (
    <div className="space-y-6">
      {value.map((group, groupIndex) => (
        <div
          key={group.id}
          className="border border-gray-200 rounded-lg p-4 bg-gray-50/50 space-y-4"
        >
          {/* Group Header */}
          <div className="flex items-start gap-4">
            <div className="mt-3 text-gray-400 cursor-move">
              <GripVertical size={20} />
            </div>

            <div className="flex-1 grid grid-cols-1 md:grid-cols-12 gap-4">
              {/* Group Name */}
              <div className="md:col-span-6">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Group Name
                </label>
                <input
                  type="text"
                  value={group.name}
                  onChange={(e) =>
                    updateGroup(groupIndex, { name: e.target.value })
                  }
                  placeholder="e.g. Size, Toppings"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-brand-500 focus:border-brand-500"
                />
              </div>

              {/* Min Selections */}
              <div className="md:col-span-3">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Min Select
                </label>
                <input
                  type="number"
                  min={0}
                  value={group.minSelections}
                  onChange={(e) =>
                    updateGroup(groupIndex, {
                      minSelections: parseInt(e.target.value) || 0,
                    })
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-brand-500 focus:border-brand-500"
                />
              </div>

              {/* Max Selections */}
              <div className="md:col-span-3">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Max Select
                </label>
                <input
                  type="number"
                  min={0}
                  value={group.maxSelections}
                  onChange={(e) =>
                    updateGroup(groupIndex, {
                      maxSelections: parseInt(e.target.value) || 0,
                    })
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-brand-500 focus:border-brand-500"
                />
              </div>
            </div>

            <button
              onClick={() => removeGroup(groupIndex)}
              className="mt-7 text-gray-400 hover:text-red-500 transition-colors"
            >
              <Trash2 size={20} />
            </button>
          </div>

          {/* Validation Warning */}
          {group.maxSelections > 0 &&
            group.minSelections > group.maxSelections && (
              <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 p-2 rounded">
                <AlertCircle size={16} />
                <span>Min selections cannot exceed Max selections</span>
              </div>
            )}

          {/* Options List */}
          <div className="ml-8 space-y-2 border-l-2 border-gray-200 pl-4 py-2">
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-sm font-medium text-gray-500 uppercase tracking-wider">
                Options
              </h4>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => addOption(groupIndex)}
                className="text-brand-600 hover:text-brand-700"
              >
                <Plus size={16} className="mr-1" /> Add Option
              </Button>
            </div>

            {group.options.length === 0 ? (
              <div className="text-sm text-gray-400 italic py-2">
                No options added yet.
              </div>
            ) : (
              <div className="space-y-3">
                {group.options.map((option, optIndex) => (
                  <div
                    key={option.id} // Use ID for key
                    className="flex items-center gap-3 bg-white p-2 rounded border border-gray-100 shadow-sm"
                  >
                    <GripVertical size={16} className="text-gray-300" />

                    <input
                      type="text"
                      value={option.name}
                      onChange={(e) =>
                        updateOption(groupIndex, optIndex, {
                          name: e.target.value,
                        })
                      }
                      placeholder="Option Name (e.g. Small)"
                      className="flex-1 px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-brand-500 focus:border-brand-500"
                    />

                    <div className="w-32">
                      <CurrencyInput
                        value={option.priceModifier}
                        onChange={(val) =>
                          updateOption(groupIndex, optIndex, {
                            priceModifier: val,
                          })
                        }
                        currency={currencySymbol}
                        placeholder="0.00"
                      />
                    </div>

                    <button
                      onClick={() => removeOption(groupIndex, optIndex)}
                      className="text-gray-300 hover:text-red-500"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      ))}

      <Button
        variant="outline"
        onClick={addGroup}
        className="w-full border-dashed border-2 py-6 text-gray-500 hover:border-brand-500 hover:text-brand-500"
      >
        <Plus size={20} className="mr-2" /> Add Variation Group
      </Button>
    </div>
  );
}
