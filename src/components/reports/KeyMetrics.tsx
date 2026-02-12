interface KeyMetricsProps {
  keyMetrics: {
    foodCostPercentage: number;
    laborCostPercentage: number;
    primeCost: number;
    primeCostPercentage: number;
    breakEvenRevenue: number;
  };
}

export function KeyMetrics({ keyMetrics }: KeyMetricsProps) {
  const formatPercentage = (value: number) => {
    return `${value.toFixed(1)}%`;
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-MY', {
      style: 'currency',
      currency: 'MYR',
    }).format(amount);
  };

  const getBenchmarkStatus = (
    value: number,
    goodMax: number,
    warningMax: number
  ): 'good' | 'warning' | 'bad' => {
    if (value <= goodMax) return 'good';
    if (value <= warningMax) return 'warning';
    return 'bad';
  };

  const foodCostStatus = getBenchmarkStatus(
    keyMetrics.foodCostPercentage,
    35,
    40
  );
  const laborCostStatus = getBenchmarkStatus(
    keyMetrics.laborCostPercentage,
    35,
    40
  );
  const primeCostStatus = getBenchmarkStatus(
    keyMetrics.primeCostPercentage,
    60,
    65
  );

  const getStatusDot = (status: 'good' | 'warning' | 'bad') => {
    switch (status) {
      case 'good':
        return 'bg-green-400';
      case 'warning':
        return 'bg-yellow-400';
      case 'bad':
        return 'bg-red-400';
    }
  };

  const getStatusLabel = (status: 'good' | 'warning' | 'bad') => {
    switch (status) {
      case 'good':
        return 'On target';
      case 'warning':
        return 'Above target';
      case 'bad':
        return 'High';
    }
  };

  const metrics = [
    {
      label: 'Food Cost',
      value: keyMetrics.foodCostPercentage,
      status: foodCostStatus,
    },
    {
      label: 'Labor Cost',
      value: keyMetrics.laborCostPercentage,
      status: laborCostStatus,
    },
    {
      label: 'Prime Cost',
      value: keyMetrics.primeCostPercentage,
      status: primeCostStatus,
    },
  ];

  return (
    <div className="bg-white rounded-xl border border-gray-100 p-4">
      <h3 className="text-sm font-semibold text-gray-900 mb-3">Key Metrics</h3>

      <div className="space-y-3">
        {metrics.map((metric) => (
          <div key={metric.label} className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <span
                className={`w-2 h-2 rounded-full ${getStatusDot(metric.status)}`}
              />
              <span className="text-sm text-gray-600">{metric.label}</span>
            </div>
            <div className="flex items-center gap-2.5">
              <span className="text-sm font-semibold text-gray-900">
                {formatPercentage(metric.value)}
              </span>
              <span
                className={`text-xs ${
                  metric.status === 'good'
                    ? 'text-green-600'
                    : metric.status === 'warning'
                      ? 'text-yellow-600'
                      : 'text-red-600'
                }`}
              >
                {getStatusLabel(metric.status)}
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* Footer info */}
      <div className="mt-3 pt-3 border-t border-gray-50 flex flex-col gap-1">
        <div className="flex justify-between text-xs text-gray-400">
          <span>Prime Cost</span>
          <span>{formatCurrency(keyMetrics.primeCost)}</span>
        </div>
        <div className="flex justify-between text-xs text-gray-400">
          <span>Break-Even Revenue</span>
          <span>{formatCurrency(keyMetrics.breakEvenRevenue)}</span>
        </div>
      </div>
    </div>
  );
}
