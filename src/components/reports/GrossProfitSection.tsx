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

  const isPositive = grossProfit.amount >= 0;

  return (
    <div className="flex items-center justify-between px-4 py-2.5 bg-gray-50 rounded-xl">
      <div className="flex items-center gap-2">
        <span
          className={`w-1.5 h-6 rounded-full ${isPositive ? 'bg-green-400' : 'bg-red-400'}`}
        />
        <span className="text-sm font-semibold text-gray-700">
          Gross Profit
        </span>
        <span className="text-xs text-gray-400">
          {grossProfit.margin.toFixed(1)}%
        </span>
      </div>
      <span
        className={`text-sm font-bold ${isPositive ? 'text-green-600' : 'text-red-600'}`}
      >
        {formatCurrency(grossProfit.amount)}
      </span>
    </div>
  );
}
