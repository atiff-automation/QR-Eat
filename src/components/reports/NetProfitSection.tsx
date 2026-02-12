interface NetProfitSectionProps {
  netProfit: {
    amount: number;
    margin: number;
  };
  variant?: 'hero' | 'inline';
}

export function NetProfitSection({
  netProfit,
  variant = 'inline',
}: NetProfitSectionProps) {
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

  // Hero variant — shown at top of page
  if (variant === 'hero') {
    return (
      <div
        className={`rounded-2xl p-5 ${
          isPositive
            ? 'bg-gradient-to-br from-green-500 to-emerald-600'
            : 'bg-gradient-to-br from-red-500 to-rose-600'
        }`}
      >
        <div className="flex items-center justify-between mb-1">
          <span className="text-sm font-medium text-white/80">Net Profit</span>
          <span
            className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${
              isPositive ? 'bg-white/20 text-white' : 'bg-white/20 text-white'
            }`}
          >
            {isPositive ? '✓ Profitable' : '✗ Loss'}
          </span>
        </div>
        <div className="text-3xl font-bold text-white mb-1">
          {formatCurrency(netProfit.amount)}
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-white/70">
            {formatPercentage(netProfit.margin)} margin
          </span>
        </div>
      </div>
    );
  }

  // Inline variant — fallback
  return (
    <div
      className={`rounded-xl border-2 p-5 ${
        isPositive ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'
      }`}
    >
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-medium text-gray-500 mb-1">Net Profit</p>
          <div
            className={`text-2xl font-bold ${
              isPositive ? 'text-green-700' : 'text-red-700'
            }`}
          >
            {formatCurrency(netProfit.amount)}
          </div>
        </div>
        <div
          className={`px-3 py-2 rounded-xl ${
            isPositive ? 'bg-green-100' : 'bg-red-100'
          }`}
        >
          <div className="text-xs text-gray-500">Margin</div>
          <div
            className={`text-lg font-bold ${
              isPositive ? 'text-green-700' : 'text-red-700'
            }`}
          >
            {formatPercentage(netProfit.margin)}
          </div>
        </div>
      </div>
    </div>
  );
}
