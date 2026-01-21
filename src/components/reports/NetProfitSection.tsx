interface NetProfitSectionProps {
  netProfit: {
    amount: number;
    margin: number;
  };
}

export function NetProfitSection({ netProfit }: NetProfitSectionProps) {
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-MY', {
      style: 'currency',
      currency: 'MYR',
    }).format(amount);
  };

  const formatPercentage = (value: number) => {
    return `${value.toFixed(1)}%`;
  };

  const isPositive = netProfit.amount >= 0;

  return (
    <div
      className={`rounded-lg border-4 p-8 ${
        isPositive
          ? 'bg-gradient-to-br from-green-50 to-green-100 border-green-300'
          : 'bg-gradient-to-br from-red-50 to-red-100 border-red-300'
      }`}
    >
      <h2 className="text-2xl font-bold text-gray-900 mb-6">
        Net Profit (Bottom Line)
      </h2>

      <div className="flex items-center justify-between">
        <div>
          <div
            className={`text-5xl font-bold ${
              isPositive ? 'text-green-700' : 'text-red-700'
            }`}
          >
            {formatCurrency(netProfit.amount)}
          </div>
          <div className="text-sm text-gray-600 mt-2">
            Gross Profit - Operating Expenses
          </div>
        </div>
        <div
          className={`px-6 py-4 rounded-xl ${
            isPositive
              ? 'bg-green-200 border-2 border-green-300'
              : 'bg-red-200 border-2 border-red-300'
          }`}
        >
          <div className="text-sm text-gray-700 font-medium">Net Margin</div>
          <div
            className={`text-3xl font-bold ${
              isPositive ? 'text-green-800' : 'text-red-800'
            }`}
          >
            {formatPercentage(netProfit.margin)}
          </div>
        </div>
      </div>

      {/* Status indicator */}
      <div className="mt-4 text-center">
        <span
          className={`inline-block px-4 py-2 rounded-full text-sm font-semibold ${
            isPositive
              ? 'bg-green-200 text-green-800'
              : 'bg-red-200 text-red-800'
          }`}
        >
          {isPositive ? '✓ Profitable' : '✗ Loss'}
        </span>
      </div>
    </div>
  );
}
