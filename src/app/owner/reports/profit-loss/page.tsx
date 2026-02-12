'use client';

import React from 'react';
import { useRole } from '@/components/rbac/RoleProvider';
import { useProfitLoss } from '@/hooks/reports/useProfitLoss';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { ProfitLossHeader } from '@/components/reports/ProfitLossHeader';
import { RevenueSection } from '@/components/reports/RevenueSection';
import { COGSSection } from '@/components/reports/COGSSection';
import { GrossProfitSection } from '@/components/reports/GrossProfitSection';
import { OperatingExpensesSection } from '@/components/reports/OperatingExpensesSection';
import { NetProfitSection } from '@/components/reports/NetProfitSection';
import { KeyMetrics } from '@/components/reports/KeyMetrics';

type PeriodType = 'today' | 'week' | 'month' | 'custom';

export default function ProfitLossReportPage() {
  const { user, restaurantContext, isLoading } = useRole();

  // Period state
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const [period, setPeriod] = React.useState<PeriodType>('month');
  const [startDate, setStartDate] = React.useState(startOfMonth);
  const [endDate, setEndDate] = React.useState(now);

  // Fetch P&L data (call hook before early returns)
  const restaurantId = restaurantContext?.id || '';
  const { data: plData, isLoading: plLoading } = useProfitLoss({
    restaurantId,
    startDate,
    endDate,
  });

  const handlePeriodChange = (
    newPeriod: PeriodType,
    newStartDate: Date,
    newEndDate: Date
  ) => {
    setPeriod(newPeriod);
    setStartDate(newStartDate);
    setEndDate(newEndDate);
  };

  // RoleProvider already handles auth loading and redirects to login
  if (isLoading || !user || !restaurantId) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-50/80">
      {/* Header — compact */}
      <div className="bg-white/80 backdrop-blur-lg border-b border-gray-100 sticky top-0 z-10">
        <div className="max-w-lg mx-auto px-4 py-3">
          <h1 className="text-lg font-bold text-gray-900">P&L Report</h1>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-lg mx-auto">
        {/* Period Selector */}
        <ProfitLossHeader
          period={period}
          startDate={startDate}
          endDate={endDate}
          onPeriodChange={handlePeriodChange}
        />

        <div className="px-4 pb-6">
          {plLoading ? (
            <div className="flex items-center justify-center py-16">
              <LoadingSpinner />
            </div>
          ) : plData ? (
            <div className="space-y-3">
              {/* 1. Net Profit Hero Card — answer first */}
              <NetProfitSection netProfit={plData.netProfit} variant="hero" />

              {/* 2. Revenue (collapsible) */}
              <RevenueSection revenue={plData.revenue} />

              {/* 3. COGS (collapsible) */}
              <COGSSection cogs={plData.cogs} />

              {/* 4. Gross Profit — inline divider */}
              <GrossProfitSection grossProfit={plData.grossProfit} />

              {/* 5. Operating Expenses (collapsible) */}
              <OperatingExpensesSection
                operatingExpenses={plData.operatingExpenses}
              />

              {/* 6. Key Metrics */}
              <KeyMetrics keyMetrics={plData.keyMetrics} />
            </div>
          ) : (
            <div className="text-center text-gray-500 py-16 text-sm">
              No data available for the selected period.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
