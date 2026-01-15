/**
 * Reports Query Hooks
 *
 * Centralized hooks for fetching analytics reports using TanStack Query.
 * Replaces manual ApiClient calls in report pages.
 *
 * Features:
 * - Automatic restaurant ID resolution from auth state
 * - Unified fetcher logic for all report types
 * - Typed parameters and responses
 * - File download capability
 *
 * @see phase6_implementation_plan.md
 */

import { useQuery, useMutation } from '@tanstack/react-query';
import { ApiClient } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-client';
import { useAuthUser } from './useAuth';

// =============================================================================
// Type Definitions
// =============================================================================

export interface ReportDateRange {
  start: string;
  end: string;
}

export interface ReportParams {
  dateRange: ReportDateRange;
  format?: 'json' | 'csv' | 'pdf';
  includeCharts?: boolean;
  includeDetails?: boolean;
}

// Generic interface for report response - specific structure depends on report type
// We use 'any' here for flexibility as report structures vary widely,
// but specific hooks can type their return values better if needed.
export interface ReportResponse {
  report: unknown;
  message?: string;
}

// =============================================================================
// Generic Fetcher
// =============================================================================

/**
 * Hook to fetch a specific report type
 *
 * @param reportType - The type of report to fetch (sales, operational, etc.)
 * @param params - Date range and other parameters
 * @param options - Additional query options
 */
export function useReport(
  reportType: string,
  params: ReportParams,
  options: { enabled?: boolean } = {}
) {
  const { data: authData } = useAuthUser();
  const restaurantId = authData?.restaurantContext?.id;

  // We explicitly include params in the query key to trigger refetch on change
  return useQuery({
    queryKey: queryKeys.reports.byType(reportType, params),
    queryFn: async () => {
      if (!restaurantId) throw new Error('Restaurant ID not found');

      // The API uses POST for generating reports with filters
      const data = await ApiClient.post<ReportResponse>(
        `/api/staff/analytics/${restaurantId}/report`,
        {
          reportType,
          ...params,
          // Default to json if not specified, though UI usually handles this
          format: params.format || 'json',
        }
      );
      return data.report;
    },
    // Only fetch if we have a restaurant ID and it's enabled (e.g. valid dates)
    enabled:
      !!restaurantId &&
      (options.enabled ?? true) &&
      !!params.dateRange.start &&
      !!params.dateRange.end,
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
    gcTime: 10 * 60 * 1000,
    retry: false, // Don't retry reports as they might fail due to validation
  });
}

// =============================================================================
// Specific Report Hooks
// =============================================================================

export function useSalesReport(params: ReportParams) {
  return useReport('sales', params);
}

export function useOperationalReport(params: ReportParams) {
  return useReport('operational', params);
}

export function useMenuReport(params: ReportParams) {
  return useReport('menu', params);
}

export function useFinancialReport(params: ReportParams) {
  return useReport('financial', params);
}

export function useCustomerReport(params: ReportParams) {
  return useReport('customer', params);
}

export function useComprehensiveReport(params: ReportParams) {
  return useReport('comprehensive', params);
}

// =============================================================================
// Download Hook
// =============================================================================

/**
 * Mutation to download a report as CSV or PDF
 */
export function useDownloadReport() {
  const { data: authData } = useAuthUser();
  const restaurantId = authData?.restaurantContext?.id;

  return useMutation({
    mutationFn: async ({
      reportType,
      params,
    }: {
      reportType: string;
      params: ReportParams;
    }) => {
      if (!restaurantId) throw new Error('Restaurant ID not found');

      const blob = await ApiClient.downloadFile(
        `/api/staff/analytics/${restaurantId}/report`,
        {
          method: 'POST',
          body: {
            reportType,
            ...params,
          },
        }
      );
      return blob;
    },
  });
}
