'use client';

import { TrendingUp, TrendingDown, AlertCircle } from 'lucide-react';
import { useExpenseSummary } from '@/hooks/expenses/useExpenseSummary';
import { useCurrency } from '@/lib/hooks/queries/useRestaurantSettings';
import { formatCurrency } from '@/lib/utils/currency-formatter';

interface ExpenseSummaryCardsProps {
  restaurantId: string;
  startDate: Date;
  endDate: Date;
}

export function ExpenseSummaryCards({
  restaurantId,
  startDate,
  endDate,
}: ExpenseSummaryCardsProps) {
  const currency = useCurrency();
  const { data, isLoading, error } = useExpenseSummary(
    restaurantId,
    startDate,
    endDate
  );

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="bg-white rounded-lg border border-gray-200 p-4 animate-pulse"
          >
            <div className="h-4 bg-gray-200 rounded w-1/2 mb-3"></div>
            <div className="h-8 bg-gray-200 rounded w-3/4 mb-2"></div>
            <div className="h-3 bg-gray-200 rounded w-1/3"></div>
          </div>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
        <div className="flex items-center gap-2 text-red-700">
          <AlertCircle size={20} />
          <p className="font-medium">Failed to load expense summary</p>
        </div>
        <p className="text-sm text-red-600 mt-1">
          {error instanceof Error ? error.message : 'Please try again later'}
        </p>
      </div>
    );
  }

  if (!data) return null;

  const cards = [
    {
      title: 'Total Expenses',
      amount: data.total,
      trend: data.trend.total,
      color: 'text-gray-900',
      bgColor: 'bg-gray-50',
    },
    {
      title: 'COGS',
      amount: data.cogs,
      trend: data.trend.cogs,
      color: 'text-orange-700',
      bgColor: 'bg-orange-50',
    },
    {
      title: 'Operating',
      amount: data.operating,
      trend: data.trend.operating,
      color: 'text-blue-700',
      bgColor: 'bg-blue-50',
    },
  ];

  return (
    <div className="overflow-x-auto -mx-4 px-4 mb-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 min-w-max md:min-w-0">
        {cards.map((card, index) => (
          <div
            key={index}
            className={`${card.bgColor} rounded-lg border border-gray-200 p-4 min-w-[280px] md:min-w-0`}
          >
            <p className="text-sm font-medium text-gray-600 mb-2">
              {card.title}
            </p>
            <p className={`text-3xl font-bold ${card.color} mb-2`}>
              {formatCurrency(card.amount, currency)}
            </p>
            <div className="flex items-center gap-1 text-sm">
              {card.trend >= 0 ? (
                <>
                  <TrendingUp size={16} className="text-red-500" />
                  <span className="text-red-600">
                    +{card.trend.toFixed(1)}%
                  </span>
                </>
              ) : (
                <>
                  <TrendingDown size={16} className="text-green-500" />
                  <span className="text-green-600">
                    {card.trend.toFixed(1)}%
                  </span>
                </>
              )}
              <span className="text-gray-500 ml-1">vs last month</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
