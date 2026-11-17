/**
 * Presentational states for the owner loyalty report.
 *
 * Every money value is rendered exactly as the server returns it. This module
 * never adds, subtracts or recomputes a total (for example, `net` is not
 * `gross - discounts`).
 */

'use client';

import { AlertTriangle, BarChart3, ShieldOff } from 'lucide-react';
import type { LoyaltyReport } from '@/lib/hooks/queries/useLoyaltyReport';

const ERROR_BANNER =
  'flex items-start gap-2 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700';

/** Permission-denied state. */
export function LoyaltyReportPermissionDenied() {
  return (
    <div className="min-h-screen bg-gray-50/50 pb-20">
      <div className="mx-auto max-w-3xl space-y-5 px-5 pt-4 md:px-6">
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-6">
          <div className="flex items-start gap-3">
            <ShieldOff className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-700" />
            <div>
              <h2 className="text-lg font-semibold text-amber-900">
                Rewards reports are owner-managed
              </h2>
              <p className="mt-1 text-sm text-amber-800">
                You need the loyalty:report permission to view visits, rewards
                and promotion redemptions.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Error state with a retry action. */
export function LoyaltyReportErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <div className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
      <div role="alert" className={ERROR_BANNER}>
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

function money(value: string, currency: string): string {
  return `${currency} ${value}`;
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase text-gray-500">{label}</dt>
      <dd className="mt-0.5 text-sm font-medium text-gray-900">{value}</dd>
    </div>
  );
}

function hasNoActivity(report: LoyaltyReport): boolean {
  return (
    report.visits.count === 0 &&
    report.rewards.applied === 0 &&
    report.promotionRedemptions.total === 0 &&
    report.members.newInRange === 0
  );
}

/** The report itself. All figures are server strings. */
export function LoyaltyReportView({ report }: { report: LoyaltyReport }) {
  const currency = report.range.currency;

  return (
    <div className="space-y-5">
      {hasNoActivity(report) && (
        <div className="rounded-xl border border-gray-100 bg-white p-8 text-center shadow-sm">
          <BarChart3 className="mx-auto h-8 w-8 text-gray-400" />
          <h2 className="mt-3 text-base font-semibold text-gray-900">
            No loyalty activity in this range
          </h2>
          <p className="mt-1 text-sm text-gray-500">
            Visits, rewards and promotion redemptions will appear here once
            members order in the selected business-date range.
          </p>
        </div>
      )}

      <section
        aria-labelledby="loyalty-report-money"
        className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm"
      >
        <h2
          id="loyalty-report-money"
          className="text-base font-semibold text-gray-900"
        >
          Sales and discounts
        </h2>
        <p className="mt-1 text-xs text-gray-500">
          Amounts are shown exactly as the server returns them.
        </p>
        <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Metric label="Gross" value={money(report.gross, currency)} />
          <Metric
            label="Discounts"
            value={money(report.discounts.total, currency)}
          />
          <Metric label="Net" value={money(report.net, currency)} />
          <Metric label="Refunds" value={money(report.refunds, currency)} />
        </dl>
        <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Metric
            label="Promotion discounts"
            value={money(report.discounts.bySource.PROMOTION, currency)}
          />
          <Metric
            label="Reward discounts"
            value={money(report.discounts.bySource.LOYALTY_REWARD, currency)}
          />
        </dl>
      </section>

      <section
        aria-labelledby="loyalty-report-visits"
        className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm"
      >
        <h2
          id="loyalty-report-visits"
          className="text-base font-semibold text-gray-900"
        >
          Visits and rewards
        </h2>
        <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Metric label="Visits" value={report.visits.count} />
          <Metric label="Unique members" value={report.visits.uniqueMembers} />
          <Metric label="Repeat members" value={report.visits.repeatMembers} />
          <Metric
            label="Repeat rate (ratio)"
            value={report.visits.repeatRate}
          />
          <Metric label="Rewards applied" value={report.rewards.applied} />
          <Metric
            label="Reward amount"
            value={money(report.rewards.amount, currency)}
          />
        </dl>
      </section>

      <section
        aria-labelledby="loyalty-report-promotions"
        className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm"
      >
        <h2
          id="loyalty-report-promotions"
          className="text-base font-semibold text-gray-900"
        >
          Promotion redemptions
        </h2>
        <p className="mt-1 text-sm text-gray-600">
          Total: {report.promotionRedemptions.total}
        </p>
        <dl className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Metric
            label="Whole order"
            value={`${report.promotionRedemptions.byScope.ORDER.count} · ${money(
              report.promotionRedemptions.byScope.ORDER.amount,
              currency
            )}`}
          />
          <Metric
            label="Category"
            value={`${report.promotionRedemptions.byScope.CATEGORY.count} · ${money(
              report.promotionRedemptions.byScope.CATEGORY.amount,
              currency
            )}`}
          />
          <Metric
            label="Item"
            value={`${report.promotionRedemptions.byScope.ITEM.count} · ${money(
              report.promotionRedemptions.byScope.ITEM.amount,
              currency
            )}`}
          />
        </dl>
      </section>

      <section
        aria-labelledby="loyalty-report-members"
        className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm"
      >
        <h2
          id="loyalty-report-members"
          className="text-base font-semibold text-gray-900"
        >
          Members
        </h2>
        <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-5">
          <Metric label="Total" value={report.members.total} />
          <Metric label="Active" value={report.members.active} />
          <Metric label="Anonymised" value={report.members.anonymized} />
          <Metric label="New in range" value={report.members.newInRange} />
          <Metric
            label="Marketing opt-in"
            value={report.members.marketingOptIn}
          />
        </dl>
      </section>
    </div>
  );
}
