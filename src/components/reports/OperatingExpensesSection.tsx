interface OperatingExpensesSectionProps {
  operatingExpenses: {
    breakdown: Array<{
      categoryName: string;
      amount: number;
      percentage: number;
    }>;
    totalOperatingExpenses: number;
    opexPercentage: number;
  };
}

export function OperatingExpensesSection({
  operatingExpenses,
}: OperatingExpensesSectionProps) {
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
        Operating Expenses
      </h2>

      <div className="space-y-3">
        {/* Breakdown by category */}
        {operatingExpenses.breakdown.map((item) => (
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

        {/* Total Operating Expenses */}
        <div className="flex justify-between items-center bg-orange-50 -mx-6 px-6 py-3 rounded">
          <div className="flex items-center gap-2">
            <span className="text-lg font-bold text-gray-900">
              Total Operating Expenses
            </span>
            <span className="text-sm text-gray-600">
              ({formatPercentage(operatingExpenses.opexPercentage)} of sales)
            </span>
          </div>
          <span className="text-2xl font-bold text-orange-600">
            {formatCurrency(operatingExpenses.totalOperatingExpenses)}
          </span>
        </div>
      </div>
    </div>
  );
}
