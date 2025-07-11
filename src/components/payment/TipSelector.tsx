'use client';

import { useState } from 'react';
import { formatCurrency, calculateTipAmount, DEFAULT_TIP_SUGGESTIONS } from '@/lib/payment-utils';
import { Button } from '@/components/ui/Button';

interface TipSelectorProps {
  subtotal: number;
  selectedTip: number;
  onTipChange: (tipAmount: number) => void;
  tipSuggestions?: number[];
}

export function TipSelector({
  subtotal,
  selectedTip,
  onTipChange,
  tipSuggestions = DEFAULT_TIP_SUGGESTIONS,
}: TipSelectorProps) {
  const [customTip, setCustomTip] = useState('');
  const [showCustom, setShowCustom] = useState(false);

  const handlePercentageTip = (percentage: number) => {
    const tipAmount = calculateTipAmount(subtotal, percentage);
    onTipChange(tipAmount);
    setShowCustom(false);
    setCustomTip('');
  };

  const handleCustomTip = (value: string) => {
    setCustomTip(value);
    const tipAmount = parseFloat(value) || 0;
    if (tipAmount >= 0 && tipAmount <= subtotal * 2) {
      onTipChange(tipAmount);
    }
  };

  const handleNoTip = () => {
    onTipChange(0);
    setShowCustom(false);
    setCustomTip('');
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-gray-900">Add Tip</h3>
        <div className="text-sm text-gray-600">
          Subtotal: {formatCurrency(subtotal)}
        </div>
      </div>

      {/* Percentage Suggestions */}
      <div className="grid grid-cols-3 gap-2">
        {tipSuggestions.map((percentage) => {
          const tipAmount = calculateTipAmount(subtotal, percentage);
          const isSelected = Math.abs(selectedTip - tipAmount) < 0.01;
          
          return (
            <button
              key={percentage}
              onClick={() => handlePercentageTip(percentage)}
              className={`p-3 border-2 rounded-lg text-center transition-all ${
                isSelected
                  ? 'border-blue-500 bg-blue-50 text-blue-700'
                  : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
              }`}
            >
              <div className="font-semibold">{percentage}%</div>
              <div className="text-sm">{formatCurrency(tipAmount)}</div>
            </button>
          );
        })}
      </div>

      {/* Custom Tip */}
      <div className="space-y-3">
        <button
          onClick={() => setShowCustom(!showCustom)}
          className="w-full p-3 border-2 border-gray-200 rounded-lg text-left hover:border-gray-300 transition-all"
        >
          <div className="flex items-center justify-between">
            <span className="font-medium text-gray-700">Custom Amount</span>
            <span className="text-gray-400">
              {showCustom ? '−' : '+'}
            </span>
          </div>
        </button>

        {showCustom && (
          <div className="flex items-center space-x-2">
            <span className="text-gray-600">$</span>
            <input
              type="number"
              value={customTip}
              onChange={(e) => handleCustomTip(e.target.value)}
              placeholder="0.00"
              min="0"
              max={subtotal * 2}
              step="0.01"
              className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
        )}
      </div>

      {/* No Tip Option */}
      <button
        onClick={handleNoTip}
        className={`w-full p-3 border-2 rounded-lg text-center transition-all ${
          selectedTip === 0
            ? 'border-gray-400 bg-gray-50 text-gray-700'
            : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
        }`}
      >
        No Tip
      </button>

      {/* Tip Summary */}
      {selectedTip > 0 && (
        <div className="bg-blue-50 p-3 rounded-lg">
          <div className="flex justify-between items-center text-sm">
            <span className="text-blue-700">Tip Amount:</span>
            <span className="font-semibold text-blue-700">
              {formatCurrency(selectedTip)}
            </span>
          </div>
          <div className="flex justify-between items-center text-sm mt-1">
            <span className="text-blue-600">Total with Tip:</span>
            <span className="font-semibold text-blue-600">
              {formatCurrency(subtotal + selectedTip)}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}