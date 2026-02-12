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
      <div className="flex gap-3 overflow-x-auto pb-2 mb-4 -mx-4 px-4 scrollbar-hide">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="flex-shrink-0 w-[140px] bg-white rounded-xl border border-gray-100 p-3 animate-pulse"
          >
            <div className="h-3 bg-gray-200 rounded w-2/3 mb-2"></div>
            <div className="h-5 bg-gray-200 rounded w-full mb-1.5"></div>
            <div className="h-3 bg-gray-200 rounded w-1/2"></div>
          </div>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 rounded-xl p-3 mb-4 flex items-center gap-2 text-red-700 text-sm">
        <AlertCircle size={16} />
        <span>Failed to load summary</span>
      </div>
    );
  }

  if (!data) return null;

  const cards = [
    {
      title: 'Total',
      amount: data.total,
      trend: data.trend.total,
      dotColor: 'bg-gray-400',
    },
    {
      title: 'COGS',
      amount: data.cogs,
      trend: data.trend.cogs,
      dotColor: 'bg-orange-400',
    },
    {
      title: 'OpEx',
      amount: data.operating,
      trend: data.trend.operating,
      dotColor: 'bg-blue-400',
    },
  ];

  return (
    <div className="flex gap-3 overflow-x-auto pb-2 mb-4 -mx-4 px-4 scrollbar-hide">
      {cards.map((card, index) => (
        <div
          key={index}
          className="flex-shrink-0 min-w-[130px] flex-1 bg-white rounded-xl border border-gray-100 p-3 shadow-sm"
        >
          <div className="flex items-center gap-1.5 mb-1.5">
            <span className={`w-2 h-2 rounded-full ${card.dotColor}`} />
            <span className="text-xs font-medium text-gray-500">
              {card.title}
            </span>
          </div>
          <p className="text-lg font-bold text-gray-900 leading-tight">
            {formatCurrency(card.amount, currency)}
          </p>
          <div className="flex items-center gap-1 mt-1">
            {card.trend >= 0 ? (
              <>
                <TrendingUp size={12} className="text-red-500" />
                <span className="text-xs text-red-600 font-medium">
                  +{card.trend.toFixed(1)}%
                </span>
              </>
            ) : (
              <>
                <TrendingDown size={12} className="text-green-500" />
                <span className="text-xs text-green-600 font-medium">
                  {card.trend.toFixed(1)}%
                </span>
              </>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
