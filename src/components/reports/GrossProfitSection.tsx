interface GrossProfitSectionProps {
  grossProfit: {
    amount: number;
    margin: number;
  };
}

export function GrossProfitSection({ grossProfit }: GrossProfitSectionProps) {
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-MY', {
      style: 'currency',
      currency: 'MYR',
    }).format(amount);
  };

  const formatPercentage = (value: number) => {
    return `${value.toFixed(1)}%`;
  };

  const isPositive = grossProfit.amount >= 0;

  return (
    <div
      className={`rounded-lg border-2 p-6 ${
        isPositive ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'
      }`}
    >
      <h2 className="text-xl font-bold text-gray-900 mb-4">Gross Profit</h2>

      <div className="flex items-center justify-between">
        <div>
          <div
            className={`text-4xl font-bold ${
              isPositive ? 'text-green-600' : 'text-red-600'
            }`}
          >
            {formatCurrency(grossProfit.amount)}
          </div>
          <div className="text-sm text-gray-600 mt-1">
            Net Sales - Total COGS
          </div>
        </div>
        <div
          className={`px-4 py-2 rounded-lg ${
            isPositive ? 'bg-green-100' : 'bg-red-100'
          }`}
        >
          <div className="text-sm text-gray-600">Margin</div>
          <div
            className={`text-2xl font-bold ${
              isPositive ? 'text-green-700' : 'text-red-700'
            }`}
          >
            {formatPercentage(grossProfit.margin)}
          </div>
        </div>
      </div>
    </div>
  );
}
