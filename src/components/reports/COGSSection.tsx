'use client';

import React from 'react';
import { ChevronDown } from 'lucide-react';

interface COGSSectionProps {
  cogs: {
    breakdown: Array<{
      categoryName: string;
      amount: number;
      percentage: number;
    }>;
    totalCOGS: number;
    cogsPercentage: number;
  };
}

export function COGSSection({ cogs }: COGSSectionProps) {
  const [isOpen, setIsOpen] = React.useState(false);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-MY', {
      style: 'currency',
      currency: 'MYR',
    }).format(amount);
  };

  const formatPercentage = (value: number) => {
    return `${value.toFixed(1)}%`;
  };

  return (
    <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
      {/* Collapsible Header */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between px-4 py-3.5 hover:bg-gray-50 active:bg-gray-100 transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-gray-900">COGS</span>
          <span className="text-xs text-gray-400">
            {formatPercentage(cogs.cogsPercentage)}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm font-semibold text-red-600">
            {formatCurrency(cogs.totalCOGS)}
          </span>
          <ChevronDown
            size={16}
            className={`text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}
          />
        </div>
      </button>

      {/* Expanded Content */}
      {isOpen && (
        <div className="px-4 pb-4 pt-1 space-y-2.5 border-t border-gray-50">
          {cogs.breakdown.map((item) => (
            <div
              key={item.categoryName}
              className="flex justify-between items-center"
            >
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-orange-400" />
                <span className="text-sm text-gray-600">
                  {item.categoryName}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-400">
                  {formatPercentage(item.percentage)}
                </span>
                <span className="text-sm font-medium text-gray-900">
                  {formatCurrency(item.amount)}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
