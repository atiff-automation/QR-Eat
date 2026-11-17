/**
 * Presentational states and form defaults for the promotions page.
 *
 * Kept out of `page.tsx` because Next.js only allows the page's default export
 * plus its reserved exports. These are exported for state tests.
 */

'use client';

import { AlertTriangle, Award, ShieldOff } from 'lucide-react';
import type { PromotionFormValues } from '@/lib/hooks/queries/usePromotions';

function toDateInput(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function emptyPromotionForm(): PromotionFormValues {
  const start = new Date();
  const end = new Date(start.getTime() + 30 * 24 * 60 * 60 * 1000);
  return {
    name: '',
    receiptLabel: '',
    type: 'PERCENT',
    value: '10.00',
    scope: 'ORDER',
    categoryIds: [],
    itemIds: [],
    minSpend: '0.00',
    maxDiscount: '15.00',
    startsAt: toDateInput(start),
    endsAt: toDateInput(end),
    isActive: true,
  };
}

/** Permission-denied state. */
export function PromotionsPermissionDenied() {
  return (
    <div className="min-h-screen bg-gray-50/50 pb-20">
      <div className="mx-auto max-w-3xl space-y-5 px-5 pt-4 md:px-6">
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-6">
          <div className="flex items-start gap-3">
            <ShieldOff className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-700" />
            <div>
              <h2 className="text-lg font-semibold text-amber-900">
                Rewards are owner-managed
              </h2>
              <p className="mt-1 text-sm text-amber-800">
                You need the promotions:manage permission to create, edit or
                delete promotions.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Empty state. */
export function PromotionsEmptyState() {
  return (
    <div className="rounded-xl border border-gray-100 bg-white p-8 text-center shadow-sm">
      <Award className="mx-auto h-8 w-8 text-gray-400" />
      <h2 className="mt-3 text-base font-semibold text-gray-900">
        No promotions yet
      </h2>
      <p className="mt-1 text-sm text-gray-500">
        Create a promotion to give a discount on a whole order, a category or an
        item. A promotion replaces the visit for that bill; the visit card stays
        as it is.
      </p>
    </div>
  );
}

/** Error state. */
export function PromotionsErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <div className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
      <div
        role="alert"
        className="flex items-start gap-2 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700"
      >
        <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
        <span>{message}</span>
      </div>
      <button
        type="button"
        onClick={onRetry}
        className="mt-3 min-h-11 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
      >
        Retry
      </button>
    </div>
  );
}
