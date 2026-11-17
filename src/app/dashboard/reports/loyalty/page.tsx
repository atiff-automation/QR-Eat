/**
 * Owner loyalty report — `/dashboard/reports/loyalty`.
 *
 * `GET /api/reports/loyalty` over an inclusive business-date range. Requires
 * `loyalty:report`. The query is disabled until permissions resolve. Every
 * figure is rendered from the server response; no money arithmetic happens in
 * the browser.
 */

'use client';

import { useState } from 'react';
import { useRole } from '@/components/rbac/RoleProvider';
import { Button } from '@/components/ui/Button';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import {
  isValidReportRange,
  useLoyaltyReport,
  type LoyaltyReportRange,
} from '@/lib/hooks/queries/useLoyaltyReport';
import {
  LoyaltyReportErrorState,
  LoyaltyReportPermissionDenied,
  LoyaltyReportView,
} from './LoyaltyReportStates';

const INPUT_CLASS =
  'h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-gray-900 outline-none focus:ring-2 focus:ring-blue-500';

function toDateInput(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function defaultRange(): LoyaltyReportRange {
  const to = new Date();
  const from = new Date(to.getTime() - 6 * 24 * 60 * 60 * 1000);
  return { from: toDateInput(from), to: toDateInput(to) };
}

export default function LoyaltyReportPage() {
  const { hasPermission, isLoading: roleLoading } = useRole();
  const canReport = hasPermission('loyalty:report');

  const [formRange, setFormRange] = useState<LoyaltyReportRange>(defaultRange);
  const [range, setRange] = useState<LoyaltyReportRange>(defaultRange);
  const [formError, setFormError] = useState<string | null>(null);

  const reportQuery = useLoyaltyReport(range, {
    enabled: !roleLoading && canReport,
  });

  if (roleLoading) {
    return <LoadingSpinner message="Checking permissions..." />;
  }

  if (!canReport) {
    return <LoyaltyReportPermissionDenied />;
  }

  const handleApply = (event: React.FormEvent) => {
    event.preventDefault();
    if (!isValidReportRange(formRange)) {
      setFormError(
        'Choose a valid business-date range; From cannot be after To.'
      );
      return;
    }
    setFormError(null);
    setRange({ ...formRange });
  };

  return (
    <div className="min-h-screen bg-gray-50/50 pb-20">
      <div className="mx-auto max-w-7xl space-y-5 px-5 pt-4 md:px-6">
        <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
          <form
            onSubmit={handleApply}
            className="flex flex-col gap-3 sm:flex-row sm:items-end"
            noValidate
          >
            <div className="sm:w-52">
              <label
                htmlFor="loyalty-report-from"
                className="mb-1 block text-xs font-semibold uppercase text-gray-500"
              >
                From
              </label>
              <input
                id="loyalty-report-from"
                type="date"
                value={formRange.from}
                onChange={(event) =>
                  setFormRange((previous) => ({
                    ...previous,
                    from: event.target.value,
                  }))
                }
                className={INPUT_CLASS}
              />
            </div>
            <div className="sm:w-52">
              <label
                htmlFor="loyalty-report-to"
                className="mb-1 block text-xs font-semibold uppercase text-gray-500"
              >
                To
              </label>
              <input
                id="loyalty-report-to"
                type="date"
                value={formRange.to}
                onChange={(event) =>
                  setFormRange((previous) => ({
                    ...previous,
                    to: event.target.value,
                  }))
                }
                className={INPUT_CLASS}
              />
            </div>
            <Button type="submit" className="min-h-11">
              Apply range
            </Button>
          </form>
          <p className="mt-2 text-xs text-gray-500">
            Business dates are inclusive and use the restaurant’s close time.
          </p>
          {formError && (
            <p role="alert" className="mt-2 text-sm font-medium text-red-700">
              {formError}
            </p>
          )}
        </div>

        {reportQuery.isLoading ? (
          <LoadingSpinner message="Loading loyalty report..." />
        ) : reportQuery.isError ? (
          <LoyaltyReportErrorState
            message={
              reportQuery.error instanceof Error
                ? reportQuery.error.message
                : 'Could not load the loyalty report.'
            }
            onRetry={() => {
              void reportQuery.refetch();
            }}
          />
        ) : reportQuery.data ? (
          <LoyaltyReportView report={reportQuery.data} />
        ) : (
          <LoyaltyReportErrorState
            message="Could not load the loyalty report."
            onRetry={() => {
              void reportQuery.refetch();
            }}
          />
        )}
      </div>
    </div>
  );
}
