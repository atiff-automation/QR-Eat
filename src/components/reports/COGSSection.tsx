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
    <div className="bg-white rounded-lg border border-gray-200 p-6">
      <h2 className="text-xl font-bold text-gray-900 mb-4">
        Cost of Goods Sold (COGS)
      </h2>

      <div className="space-y-3">
        {/* Breakdown by category */}
        {cogs.breakdown.map((item) => (
          <div
            key={item.categoryName}
            className="flex justify-between items-center"
          >
            <div className="flex items-center gap-2">
              <span className="text-gray-700">{item.categoryName}</span>
              <span className="text-xs text-gray-500">
                ({formatPercentage(item.percentage)})
              </span>
            </div>
            <span className="font-medium text-gray-900">
              {formatCurrency(item.amount)}
            </span>
          </div>
        ))}

        {/* Divider */}
        <div className="border-t border-gray-300 my-2"></div>

        {/* Total COGS */}
        <div className="flex justify-between items-center bg-red-50 -mx-6 px-6 py-3 rounded">
          <div className="flex items-center gap-2">
            <span className="text-lg font-bold text-gray-900">Total COGS</span>
            <span className="text-sm text-gray-600">
              ({formatPercentage(cogs.cogsPercentage)} of sales)
            </span>
          </div>
          <span className="text-2xl font-bold text-red-600">
            {formatCurrency(cogs.totalCOGS)}
          </span>
        </div>
      </div>
    </div>
  );
}
