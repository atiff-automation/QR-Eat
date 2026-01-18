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
    const options = group.options || [];
    const newOption: VariationOption = {
      id: uuidv4(),
      name: '',
      priceModifier: 0,
      isAvailable: true,
      displayOrder: options.length,
    };
    updateGroup(groupIndex, {
      options: [...options, newOption],
    });
  };

  const updateOption = (
    groupIndex: number,
    optionIndex: number,
    updates: Partial<VariationOption>
  ) => {
    const group = value[groupIndex];
    const options = group.options || [];
    const newOptions = [...options];
    newOptions[optionIndex] = { ...newOptions[optionIndex], ...updates };
    updateGroup(groupIndex, { options: newOptions });
  };

  const removeOption = (groupIndex: number, optionIndex: number) => {
    const group = value[groupIndex];
    const options = group.options || [];
    const newOptions = options.filter((_, i) => i !== optionIndex);
    updateGroup(groupIndex, { options: newOptions });
  };

  return (
    <div className="space-y-4">
      {value.map((group, groupIndex) => (
        <div
          key={group.id}
          className="border border-gray-200 rounded-lg p-3 bg-gray-50/50 space-y-3"
        >
          {/* Group Header - Dense Grid */}
          <div className="flex items-start gap-2">
            <div className="mt-2 text-gray-400 cursor-move shrink-0">
              <GripVertical size={18} />
            </div>

            <div className="flex-1 space-y-3">
              {/* Row 1: Group Name */}
              <div>
                <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-1">
                  Group Name
                </label>
                <input
                  type="text"
                  value={group.name}
                  onChange={(e) =>
                    updateGroup(groupIndex, { name: e.target.value })
                  }
                  placeholder="e.g. Size, Toppings"
                  className="w-full px-2.5 py-1.5 text-sm border border-gray-300 rounded-md focus:ring-brand-500 focus:border-brand-500 bg-white"
                />
              </div>

              {/* Row 2: Select Limits */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-1">
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
                    className="w-full px-2.5 py-1.5 text-sm border border-gray-300 rounded-md focus:ring-brand-500 focus:border-brand-500 bg-white"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-1">
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
                    className="w-full px-2.5 py-1.5 text-sm border border-gray-300 rounded-md focus:ring-brand-500 focus:border-brand-500 bg-white"
                  />
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => removeGroup(groupIndex)}
              className="mt-6 p-1 text-gray-400 hover:text-red-500 transition-colors shrink-0"
            >
              <Trash2 size={18} />
            </button>
          </div>

          {/* Validation Warning */}
          {group.maxSelections > 0 &&
            group.minSelections > group.maxSelections && (
              <div className="flex items-center gap-2 text-xs text-red-600 bg-red-50 px-2 py-1.5 rounded">
                <AlertCircle size={14} />
                <span>Min selections cannot exceed Max selections</span>
              </div>
            )}

          {/* Options List - Removed left indentation to save space */}
          <div className="pt-2 border-t border-gray-200">
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-[11px] font-bold text-gray-400 uppercase tracking-widest">
                Options
              </h4>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => addOption(groupIndex)}
                className="text-brand-600 hover:text-brand-700 h-7 text-xs px-2"
              >
                <Plus size={14} className="mr-1" /> Add Option
              </Button>
            </div>

            {(!group.options || group.options.length === 0) ? (
              <div className="text-xs text-gray-400 italic py-1 text-center">
                No options added yet.
              </div>
            ) : (
              <div className="space-y-2">
                {(group.options || []).map((option, optIndex) => (
                  <div
                    key={option.id}
                    className="flex items-center gap-2 bg-white p-1.5 rounded border border-gray-100 shadow-sm"
                  >
                    <div className="text-gray-300 cursor-move shrink-0">
                      <GripVertical size={14} />
                    </div>

                    <input
                      type="text"
                      value={option.name}
                      onChange={(e) =>
                        updateOption(groupIndex, optIndex, {
                          name: e.target.value,
                        })
                      }
                      placeholder="e.g. Small"
                      className="flex-1 min-w-0 px-2 py-1 text-sm border border-gray-300 rounded focus:ring-brand-500 focus:border-brand-500"
                    />

                    {/* Price Input - Compact and width-limited */}
                    <div className="w-[5.5rem] shrink-0">
                      <CurrencyInput
                        value={option.priceModifier}
                        onChange={(val) =>
                          updateOption(groupIndex, optIndex, {
                            priceModifier: val,
                          })
                        }
                        currency={currencySymbol}
                        placeholder="0.00"
                        className="w-full py-1 px-2 text-sm border border-gray-300 rounded focus:ring-brand-500 focus:border-brand-500 text-right bg-white"
                      />
                    </div>

                    <button
                      type="button"
                      onClick={() => removeOption(groupIndex, optIndex)}
                      className="p-1 text-gray-300 hover:text-red-500 shrink-0"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      ))}

      <Button
        type="button"
        variant="outline"
        onClick={addGroup}
        className="w-full border-dashed border-2 py-6 text-gray-500 hover:border-brand-500 hover:text-brand-500"
      >
        <Plus size={20} className="mr-2" /> Add Variation Group
      </Button>
    </div>
  );
}
