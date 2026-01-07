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

import type { PaymentMethodSelectorProps, PaymentMethod } from '@/types/pos';
import { Banknote, CreditCard, Smartphone } from 'lucide-react';

export function PaymentMethodSelector({
  onSelect,
  enabledMethods = { cash: true, card: true, ewallet: true },
}: PaymentMethodSelectorProps & {
  enabledMethods?: { cash: boolean; card: boolean; ewallet: boolean };
}) {
  const allMethods: {
    value: PaymentMethod;
    label: string;
    Icon: typeof Banknote;
  }[] = [
    { value: 'cash', label: 'Cash', Icon: Banknote },
    { value: 'card', label: 'Card', Icon: CreditCard },
    { value: 'ewallet', label: 'E-Wallet', Icon: Smartphone },
  ];

  // Filter methods based on enabled settings
  const methods = allMethods.filter((method) => enabledMethods[method.value]);

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-3">
      <h3 className="text-sm font-semibold text-gray-900 mb-2">
        Select Payment Method
      </h3>
      {/* Inline horizontal layout for mobile */}
      <div
        className={`grid gap-2 ${methods.length === 1 ? 'grid-cols-1' : methods.length === 2 ? 'grid-cols-2' : 'grid-cols-3'}`}
      >
        {methods.map((method) => (
          <button
            key={method.value}
            onClick={() => onSelect(method.value)}
            className="flex flex-col items-center justify-center p-2 border-2 border-gray-200 rounded-lg hover:border-blue-500 hover:bg-blue-50 transition-all active:scale-95 gap-1"
          >
            <method.Icon className="w-5 h-5 text-gray-700" />
            <span className="text-xs font-medium text-gray-700">
              {method.label}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
