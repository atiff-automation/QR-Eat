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
      year: 'numeric',
    };
    return `${startDate.toLocaleDateString('en-US', options)} - ${endDate.toLocaleDateString('en-US', options)}`;
  };

  return (
    <div className="bg-white border-b border-gray-200 p-4">
      <div className="max-w-7xl mx-auto">
        {/* Period Selector */}
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <button
            onClick={() => handlePeriodClick('today')}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              period === 'today'
                ? 'bg-green-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            Today
          </button>
          <button
            onClick={() => handlePeriodClick('week')}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              period === 'week'
                ? 'bg-green-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            Last 7 Days
          </button>
          <button
            onClick={() => handlePeriodClick('month')}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              period === 'month'
                ? 'bg-green-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            This Month
          </button>
          <button
            onClick={() => handlePeriodClick('custom')}
            className={`px-4 py-2 rounded-lg font-medium transition-colors flex items-center gap-2 ${
              period === 'custom'
                ? 'bg-green-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            <Calendar size={18} />
            Custom
          </button>
        </div>

        {/* Date Range Display */}
        <div className="text-sm text-gray-600">{formatDateRange()}</div>

        {/* Custom Date Picker Modal */}
        {showCustomPicker && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
            <div className="bg-white rounded-lg p-6 max-w-md w-full">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">
                Custom Date Range
              </h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Start Date
                  </label>
                  <input
                    type="date"
                    value={customStart}
                    onChange={(e) => setCustomStart(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    End Date
                  </label>
                  <input
                    type="date"
                    value={customEnd}
                    onChange={(e) => setCustomEnd(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setShowCustomPicker(false)}
                    className="flex-1 px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 font-medium"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleCustomApply}
                    className="flex-1 px-4 py-2 text-white bg-green-600 rounded-lg hover:bg-green-700 font-medium"
                  >
                    Apply
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
