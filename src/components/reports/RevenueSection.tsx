'use client';

import React from 'react';
import { ChevronDown } from 'lucide-react';

interface RevenueSectionProps {
  revenue: {
    grossSales: number;
    discounts: number;
    refunds: number;
    netSales: number;
  };
}

export function RevenueSection({ revenue }: RevenueSectionProps) {
  const [isOpen, setIsOpen] = React.useState(false);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-MY', {
      style: 'currency',
      currency: 'MYR',
    }).format(amount);
  };

  return (
    <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
      {/* Collapsible Header */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between px-4 py-3.5 hover:bg-gray-50 active:bg-gray-100 transition-colors"
      >
        <span className="text-sm font-semibold text-gray-900">Revenue</span>
        <div className="flex items-center gap-3">
          <span className="text-sm font-semibold text-green-600">
            {formatCurrency(revenue.netSales)}
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
          <div className="flex justify-between items-center">
            <span className="text-sm text-gray-600">Gross Sales</span>
            <span className="text-sm font-medium text-gray-900">
              {formatCurrency(revenue.grossSales)}
            </span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-sm text-gray-500">Less: Discounts</span>
            <span className="text-sm text-red-600">
              −{formatCurrency(revenue.discounts)}
            </span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-sm text-gray-500">Less: Refunds</span>
            <span className="text-sm text-red-600">
              −{formatCurrency(revenue.refunds)}
            </span>
          </div>
          <div className="border-t border-gray-100 pt-2 flex justify-between items-center">
            <span className="text-sm font-semibold text-gray-900">
              Net Sales
            </span>
            <span className="text-sm font-bold text-green-600">
              {formatCurrency(revenue.netSales)}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
