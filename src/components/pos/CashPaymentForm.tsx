/**
 * Cash Payment Form Component
 *
 * Following CLAUDE.md principles:
 * - Type Safety
 * - Input Validation
 *
 * @see claudedocs/POS_IMPLEMENTATION_PLAN.md
 */

'use client';

import { useState, useEffect, useRef } from 'react';
import type { CashPaymentFormProps } from '@/types/pos';
import { formatCurrency } from '@/lib/utils/format';
import { Loader2 } from 'lucide-react';

const QUICK_AMOUNTS = [10, 20, 50, 100];

export function CashPaymentForm({
  totalAmount,
  onSubmit,
  onCancel,
  isProcessing,
}: CashPaymentFormProps) {
  const [cashReceived, setCashReceived] = useState<string>('');
  const [error, setError] = useState<string>('');
  const formRef = useRef<HTMLFormElement>(null);

  const cashReceivedNum = parseFloat(cashReceived) || 0;
  const change = cashReceivedNum - totalAmount;
  const isValid = cashReceivedNum >= totalAmount;

  // Auto-scroll to bottom when change appears
  // Auto-scroll to bottom when component mounts OR when change appears
  useEffect(() => {
    // Check if form is mounted
    if (formRef.current) {
      setTimeout(() => {
        formRef.current?.scrollIntoView({
          behavior: 'smooth',
          block: 'end',
        });
      }, 100);
    }
  }, [isValid, change]); // Keep dependencies to ensure it updates with change

  const handleQuickAmount = (amount: number) => {
    setCashReceived((totalAmount + amount).toFixed(2));
    setError('');
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    console.log('[CashPaymentForm] Submit triggered', {
      isValid,
      cashReceivedNum,
      totalAmount,
    });

    if (!isValid) {
      console.log('[CashPaymentForm] Validation failed');
      setError('Cash received must be greater than or equal to total amount');
      return;
    }

    console.log('[CashPaymentForm] Validation passed, calling onSubmit');
    onSubmit({ cashReceived: cashReceivedNum });
  };

  return (
    <form
      ref={formRef}
      onSubmit={handleSubmit}
      className="bg-white rounded-lg border border-gray-200 p-6"
    >
      <h3 className="text-lg font-semibold text-gray-900 mb-4">Cash Payment</h3>

      <div className="mb-6">
        <p className="text-sm text-gray-600 mb-2">Total Amount</p>
        <p className="text-3xl font-bold text-gray-900">
          {formatCurrency(totalAmount)}
        </p>
      </div>

      <div className="mb-4">
        <label
          htmlFor="cashReceived"
          className="block text-sm font-medium text-gray-700 mb-2"
        >
          Cash Received
        </label>
        <input
          id="cashReceived"
          type="number"
          inputMode="decimal"
          step="0.01"
          min="0"
          value={cashReceived}
          onChange={(e) => {
            setCashReceived(e.target.value);
            setError('');
          }}
          className="w-full px-4 py-3 text-lg border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          placeholder="0.00"
          disabled={isProcessing}
          autoFocus
        />
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      </div>

      <div className="mb-6">
        <p className="text-sm text-gray-600 mb-2">Quick Amounts</p>
        <div className="grid grid-cols-4 gap-2">
          {QUICK_AMOUNTS.map((amount) => (
            <button
              key={amount}
              type="button"
              onClick={() => handleQuickAmount(amount)}
              className="px-3 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded hover:bg-gray-200 transition-colors"
              disabled={isProcessing}
            >
              +RM{amount}
            </button>
          ))}
        </div>
      </div>

      {isValid && change > 0 && (
        <div className="mb-3 p-2.5 bg-green-50 border border-green-200 rounded-lg">
          <p className="text-xs text-green-700 mb-0.5">Change to Return</p>
          <p className="text-xl font-bold text-green-900">
            {formatCurrency(change)}
          </p>
        </div>
      )}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 h-10 px-4 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 font-medium transition-colors"
          disabled={isProcessing}
        >
          Cancel
        </button>
        <button
          type="submit"
          className="flex-1 h-10 px-4 text-white bg-blue-600 rounded-lg hover:bg-blue-700 font-medium transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          disabled={!isValid || isProcessing}
        >
          {isProcessing ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Processing...
            </>
          ) : (
            'Pay'
          )}
        </button>
      </div>
    </form>
  );
}
