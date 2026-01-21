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

  // Benchmark ranges
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

  const getStatusColor = (status: 'good' | 'warning' | 'bad') => {
    switch (status) {
      case 'good':
        return 'bg-green-100 text-green-800 border-green-300';
      case 'warning':
        return 'bg-yellow-100 text-yellow-800 border-yellow-300';
      case 'bad':
        return 'bg-red-100 text-red-800 border-red-300';
    }
  };

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6">
      <h2 className="text-xl font-bold text-gray-900 mb-4">
        Key Performance Metrics
      </h2>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Food Cost % */}
        <div
          className={`p-4 rounded-lg border-2 ${getStatusColor(foodCostStatus)}`}
        >
          <div className="text-sm font-medium mb-1">Food Cost %</div>
          <div className="text-3xl font-bold mb-2">
            {formatPercentage(keyMetrics.foodCostPercentage)}
          </div>
          <div className="text-xs">
            Benchmark: 28-35%
            <br />
            {foodCostStatus === 'good' && '✓ Within target'}
            {foodCostStatus === 'warning' && '⚠ Above target'}
            {foodCostStatus === 'bad' && '✗ Well above target'}
          </div>
        </div>

        {/* Labor Cost % */}
        <div
          className={`p-4 rounded-lg border-2 ${getStatusColor(laborCostStatus)}`}
        >
          <div className="text-sm font-medium mb-1">Labor Cost %</div>
          <div className="text-3xl font-bold mb-2">
            {formatPercentage(keyMetrics.laborCostPercentage)}
          </div>
          <div className="text-xs">
            Benchmark: 25-35%
            <br />
            {laborCostStatus === 'good' && '✓ Within target'}
            {laborCostStatus === 'warning' && '⚠ Above target'}
            {laborCostStatus === 'bad' && '✗ Well above target'}
          </div>
        </div>

        {/* Prime Cost % */}
        <div
          className={`p-4 rounded-lg border-2 ${getStatusColor(primeCostStatus)}`}
        >
          <div className="text-sm font-medium mb-1">Prime Cost %</div>
          <div className="text-3xl font-bold mb-2">
            {formatPercentage(keyMetrics.primeCostPercentage)}
          </div>
          <div className="text-xs">
            Benchmark: &lt;60%
            <br />
            {primeCostStatus === 'good' && '✓ Within target'}
            {primeCostStatus === 'warning' && '⚠ Above target'}
            {primeCostStatus === 'bad' && '✗ Well above target'}
          </div>
        </div>
      </div>

      {/* Additional Info */}
      <div className="mt-4 p-3 bg-gray-50 rounded-lg">
        <div className="text-sm text-gray-600">
          <strong>Prime Cost:</strong> {formatCurrency(keyMetrics.primeCost)}{' '}
          (Food + Labor)
        </div>
        <div className="text-sm text-gray-600 mt-1">
          <strong>Break-Even Revenue:</strong>{' '}
          {formatCurrency(keyMetrics.breakEvenRevenue)}
        </div>
      </div>
    </div>
  );
}
