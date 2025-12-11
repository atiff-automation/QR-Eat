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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            Cashier Dashboard
          </h1>
          <p className="text-sm text-gray-600">
            Process payments for completed orders
          </p>
        </div>

        <div className="flex gap-6">
          <div className="flex items-center gap-2">
            <ShoppingCart className="w-5 h-5 text-blue-600" />
            <div>
              <p className="text-xs text-gray-600">Pending Orders</p>
              <p className="text-lg font-semibold text-gray-900">
                {totalOrders}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <DollarSign className="w-5 h-5 text-green-600" />
            <div>
              <p className="text-xs text-gray-600">Total Revenue</p>
              <p className="text-lg font-semibold text-gray-900">
                {formatCurrency(totalRevenue)}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Clock className="w-5 h-5 text-orange-600" />
            <div>
              <p className="text-xs text-gray-600">Avg. Processing Time</p>
              <p className="text-lg font-semibold text-gray-900">
                {averageProcessingTime}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
