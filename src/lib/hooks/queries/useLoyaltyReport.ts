/**
 * Loyalty Report Hook - TanStack Query
 *
 * Owner dashboard hook for `GET /api/reports/loyalty` (§18.20.7, §18.20.8).
 * The range is an inclusive business-date range (`YYYY-MM-DD`). Every figure
 * is rendered from the server response; the hook performs no arithmetic.
 */

import { useQuery } from '@tanstack/react-query';
import { ApiClient } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-client';

const DATE_ONLY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

export interface LoyaltyReportRange {
  from: string;
  to: string;
}

export interface LoyaltyReportScopeTotals {
  count: number;
  amount: string;
}

export interface LoyaltyReport {
  range: {
    from: string;
    to: string;
    timezone: string;
    currency: string;
  };
  gross: string;
  discounts: {
    total: string;
    bySource: {
      PROMOTION: string;
      LOYALTY_REWARD: string;
    };
  };
  net: string;
  refunds: string;
  visits: {
    count: number;
    uniqueMembers: number;
    repeatMembers: number;
    repeatRate: string;
  };
  rewards: {
    applied: number;
    amount: string;
  };
  promotionRedemptions: {
    total: number;
    byScope: {
      ORDER: LoyaltyReportScopeTotals;
      CATEGORY: LoyaltyReportScopeTotals;
      ITEM: LoyaltyReportScopeTotals;
    };
  };
  members: {
    total: number;
    active: number;
    anonymized: number;
    newInRange: number;
    marketingOptIn: number;
  };
}

export interface LoyaltyReportQueryOptions {
  enabled?: boolean;
}

/** A real date-input value, not a full instant. */
export function isBusinessDate(value: string): boolean {
  const match = DATE_ONLY_PATTERN.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

export function isValidReportRange(range: LoyaltyReportRange): boolean {
  return (
    isBusinessDate(range.from) &&
    isBusinessDate(range.to) &&
    range.from <= range.to
  );
}

export function useLoyaltyReport(
  range: LoyaltyReportRange,
  options: LoyaltyReportQueryOptions = {}
) {
  return useQuery({
    queryKey: queryKeys.reports.loyalty(range),
    queryFn: async () => {
      const data = await ApiClient.get<{ report: LoyaltyReport }>(
        '/reports/loyalty',
        { params: { from: range.from, to: range.to } }
      );
      return data.report;
    },
    enabled: (options.enabled ?? true) && isValidReportRange(range),
    staleTime: 60 * 1000,
    gcTime: 10 * 60 * 1000,
    refetchOnWindowFocus: true,
  });
}
