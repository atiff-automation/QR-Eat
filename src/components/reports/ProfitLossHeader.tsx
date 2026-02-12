'use client';

import React from 'react';
import { Calendar } from 'lucide-react';

type PeriodType = 'today' | 'week' | 'month' | 'custom';

interface ProfitLossHeaderProps {
  period: PeriodType;
  startDate: Date;
  endDate: Date;
  onPeriodChange: (period: PeriodType, startDate: Date, endDate: Date) => void;
}

export function ProfitLossHeader({
  period,
  startDate,
  endDate,
  onPeriodChange,
}: ProfitLossHeaderProps) {
  const [showCustomPicker, setShowCustomPicker] = React.useState(false);
  const [customStart, setCustomStart] = React.useState(
    startDate.toISOString().split('T')[0]
  );
  const [customEnd, setCustomEnd] = React.useState(
    endDate.toISOString().split('T')[0]
  );

  const handlePeriodClick = (newPeriod: PeriodType) => {
    const now = new Date();
    let start: Date;
    const end: Date = now;

    switch (newPeriod) {
      case 'today':
        start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        break;
      case 'week':
        start = new Date(now);
        start.setDate(now.getDate() - 7);
        break;
      case 'month':
        start = new Date(now.getFullYear(), now.getMonth(), 1);
        break;
      case 'custom':
        setShowCustomPicker(true);
        return;
      default:
        start = new Date(now.getFullYear(), now.getMonth(), 1);
    }

    onPeriodChange(newPeriod, start, end);
  };

  const handleCustomApply = () => {
    const start = new Date(customStart);
    const end = new Date(customEnd);
    onPeriodChange('custom', start, end);
    setShowCustomPicker(false);
  };

  const formatDateRange = () => {
    const options: Intl.DateTimeFormatOptions = {
      month: 'short',
      day: 'numeric',
    };
    const startStr = startDate.toLocaleDateString('en-US', options);
    const endStr = endDate.toLocaleDateString('en-US', {
      ...options,
      year: 'numeric',
    });
    return `${startStr} – ${endStr}`;
  };

  return (
    <div className="px-4 pt-3 pb-2">
      {/* Period Pills */}
      <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
        {[
          { label: 'Today', value: 'today' as PeriodType },
          { label: '7 Days', value: 'week' as PeriodType },
          { label: 'This Month', value: 'month' as PeriodType },
          { label: 'Custom', value: 'custom' as PeriodType, icon: true },
        ].map((item) => (
          <button
            key={item.value}
            onClick={() => handlePeriodClick(item.value)}
            className={`flex-shrink-0 px-3.5 py-1.5 rounded-full text-sm font-medium transition-all flex items-center gap-1.5 ${
              period === item.value
                ? 'bg-green-600 text-white shadow-sm'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200 active:bg-gray-300'
            }`}
          >
            {item.icon && <Calendar size={14} />}
            {item.label}
          </button>
        ))}
      </div>

      {/* Date Range */}
      <p className="text-xs text-gray-400 mt-1">{formatDateRange()}</p>

      {/* Custom Date Picker */}
      {showCustomPicker && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40">
          <div className="bg-white rounded-t-2xl sm:rounded-2xl p-5 w-full max-w-md">
            <h3 className="text-base font-semibold text-gray-900 mb-4">
              Custom Date Range
            </h3>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">
                  Start Date
                </label>
                <input
                  type="date"
                  value={customStart}
                  onChange={(e) => setCustomStart(e.target.value)}
                  className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-green-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">
                  End Date
                </label>
                <input
                  type="date"
                  value={customEnd}
                  onChange={(e) => setCustomEnd(e.target.value)}
                  className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-green-500 focus:border-transparent"
                />
              </div>
              <div className="flex gap-2 pt-1">
                <button
                  onClick={() => setShowCustomPicker(false)}
                  className="flex-1 px-4 py-2.5 text-gray-700 bg-gray-100 rounded-xl text-sm font-medium hover:bg-gray-200"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCustomApply}
                  className="flex-1 px-4 py-2.5 text-white bg-green-600 rounded-xl text-sm font-medium hover:bg-green-700"
                >
                  Apply
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
