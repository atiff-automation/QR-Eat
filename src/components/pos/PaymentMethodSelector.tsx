/**
 * Payment Method Selector Component
 *
 * Following CLAUDE.md principles:
 * - Type Safety
 * - Single Source of Truth
 *
 * @see claudedocs/POS_IMPLEMENTATION_PLAN.md
 */

'use client';

import type { PaymentMethodSelectorProps } from '@/types/pos';
import {
  PAYMENT_METHODS,
  PAYMENT_METHOD_LABELS,
} from '@/lib/constants/payment';
import { Banknote, CreditCard, Smartphone } from 'lucide-react';

const PAYMENT_METHOD_ICONS = {
  [PAYMENT_METHODS.CASH]: Banknote,
  [PAYMENT_METHODS.CARD]: CreditCard,
  [PAYMENT_METHODS.EWALLET]: Smartphone,
};

export function PaymentMethodSelector({
  onSelect,
}: PaymentMethodSelectorProps) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">
        Select Payment Method
      </h3>
      <div className="grid grid-cols-3 gap-4">
        {Object.values(PAYMENT_METHODS).map((method) => {
          const Icon = PAYMENT_METHOD_ICONS[method];
          return (
            <button
              key={method}
              onClick={() => onSelect(method)}
              className="flex flex-col items-center gap-3 p-6 border-2 border-gray-200 rounded-lg hover:border-blue-500 hover:bg-blue-50 transition-all"
            >
              <Icon className="w-8 h-8 text-gray-700" />
              <span className="font-medium text-gray-900">
                {PAYMENT_METHOD_LABELS[method]}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
