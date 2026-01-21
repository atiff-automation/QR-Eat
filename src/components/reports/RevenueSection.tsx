interface RevenueSectionProps {
  revenue: {
    grossSales: number;
    discounts: number;
    refunds: number;
    netSales: number;
  };
}

export function RevenueSection({ revenue }: RevenueSectionProps) {
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-MY', {
      style: 'currency',
      currency: 'MYR',
    }).format(amount);
  };

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6">
      <h2 className="text-xl font-bold text-gray-900 mb-4">Revenue</h2>

      <div className="space-y-3">
        {/* Gross Sales */}
        <div className="flex justify-between items-center">
          <span className="text-gray-700">Gross Sales</span>
          <span className="font-semibold text-gray-900">
            {formatCurrency(revenue.grossSales)}
          </span>
        </div>

        {/* Discounts */}
        <div className="flex justify-between items-center">
          <span className="text-gray-600">Less: Discounts</span>
          <span className="text-red-600">
            -{formatCurrency(revenue.discounts)}
          </span>
        </div>

        {/* Refunds */}
        <div className="flex justify-between items-center">
          <span className="text-gray-600">Less: Refunds</span>
          <span className="text-red-600">
            -{formatCurrency(revenue.refunds)}
          </span>
        </div>

        {/* Divider */}
        <div className="border-t border-gray-300 my-2"></div>

        {/* Net Sales */}
        <div className="flex justify-between items-center bg-green-50 -mx-6 px-6 py-3 rounded">
          <span className="text-lg font-bold text-gray-900">Net Sales</span>
          <span className="text-2xl font-bold text-green-600">
            {formatCurrency(revenue.netSales)}
          </span>
        </div>
      </div>
    </div>
  );
}
