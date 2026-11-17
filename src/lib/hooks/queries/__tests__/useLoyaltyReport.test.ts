/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Loyalty report hook and range validation.
 *
 * Node environment, so the hook test inspects the config passed to TanStack
 * Query. The range is a business-date range and never contains customer data.
 */

const mockUseQuery = jest.fn();

jest.mock('@tanstack/react-query', () => ({
  QueryClient: jest.fn().mockImplementation(() => ({ defaultOptions: {} })),
  useQuery: (...args: unknown[]) => {
    mockUseQuery(...args);
    return { data: null, isLoading: false, error: null };
  },
}));

jest.mock('@/lib/api-client', () => ({
  ApiClient: { get: jest.fn() },
}));

import { ApiClient } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-client';

function getQueryConfig(hookFn: (...args: unknown[]) => unknown) {
  mockUseQuery.mockClear();
  hookFn();
  return mockUseQuery.mock.calls[0]?.[0];
}

describe('loyalty report hook', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('reads the report with an inclusive business-date range', async () => {
    const {
      useLoyaltyReport,
    } = require('@/lib/hooks/queries/useLoyaltyReport');
    const range = { from: '2026-11-01', to: '2026-11-07' };
    const config = getQueryConfig(() => useLoyaltyReport(range));

    expect(config.queryKey).toEqual(queryKeys.reports.loyalty(range));
    expect(config.enabled).toBe(true);

    const report = { gross: '0.00' };
    (ApiClient.get as jest.Mock).mockResolvedValue({ report });
    await expect(config.queryFn()).resolves.toEqual(report);

    expect(ApiClient.get).toHaveBeenCalledWith('/reports/loyalty', {
      params: { from: '2026-11-01', to: '2026-11-07' },
    });
  });

  it('stays disabled until permission resolves', () => {
    const {
      useLoyaltyReport,
    } = require('@/lib/hooks/queries/useLoyaltyReport');
    const config = getQueryConfig(() =>
      useLoyaltyReport(
        { from: '2026-11-01', to: '2026-11-07' },
        { enabled: false }
      )
    );

    expect(config.enabled).toBe(false);
  });

  it('rejects an inverted or malformed range', () => {
    const {
      isValidReportRange,
    } = require('@/lib/hooks/queries/useLoyaltyReport');

    expect(isValidReportRange({ from: '2026-11-07', to: '2026-11-01' })).toBe(
      false
    );
    expect(isValidReportRange({ from: '2026-11-01', to: '2026-11-07' })).toBe(
      true
    );
    expect(isValidReportRange({ from: '01/11/2026', to: '2026-11-07' })).toBe(
      false
    );
    expect(isValidReportRange({ from: '2026-13-40', to: '2026-11-07' })).toBe(
      false
    );
  });
});
