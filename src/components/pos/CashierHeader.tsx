/**
 * Cashier Header Component
 *
 * Following CLAUDE.md principles:
 * - Type Safety
 * - No Hardcoding
 *
 * @see claudedocs/POS_IMPLEMENTATION_PLAN.md
 */

'use client';

import { DollarSign, ShoppingCart, Clock } from 'lucide-react';
import { formatCurrency } from '@/lib/utils/format';

interface CashierHeaderProps {
  totalOrders: number;
  totalRevenue: number;
  averageProcessingTime: string;
}

export function CashierHeader({
  totalOrders,
  totalRevenue,
  averageProcessingTime,
}: CashierHeaderProps) {
  return (
    <div className="bg-white border-b border-gray-200 p-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">
            Cashier Dashboard
          </h1>
          <p className="text-xs sm:text-sm text-gray-600">
            Process payments for completed orders
          </p>
        </div>

        <div className="grid grid-cols-3 sm:flex sm:gap-6 gap-3">
          <div className="flex items-center gap-2">
            <ShoppingCart className="w-4 h-4 sm:w-5 sm:h-5 text-blue-600 flex-shrink-0" />
            <div>
              <p className="text-xs text-gray-600 hidden sm:block">
                Pending Orders
              </p>
              <p className="text-base sm:text-lg font-semibold text-gray-900">
                {totalOrders}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <DollarSign className="w-4 h-4 sm:w-5 sm:h-5 text-green-600 flex-shrink-0" />
            <div>
              <p className="text-xs text-gray-600 hidden sm:block">
                Total Revenue
              </p>
              <p className="text-base sm:text-lg font-semibold text-gray-900">
                {formatCurrency(totalRevenue)}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 sm:w-5 sm:h-5 text-orange-600 flex-shrink-0" />
            <div>
              <p className="text-xs text-gray-600 hidden sm:block">
                Avg. Processing Time
              </p>
              <p className="text-base sm:text-lg font-semibold text-gray-900">
                {averageProcessingTime}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
