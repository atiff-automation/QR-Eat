'use client';

import React from 'react';
import { useAuth } from '@/lib/hooks/queries/useAuth';
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
  const { user, isLoading: authLoading } = useAuth();

  // Period state
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const [period, setPeriod] = React.useState<PeriodType>('month');
  const [startDate, setStartDate] = React.useState(startOfMonth);
  const [endDate, setEndDate] = React.useState(now);

  // Fetch P&L data (call hook before early returns)
  const restaurantId = user?.restaurantId || '';
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

  // Handle authentication
  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <LoadingSpinner />
      </div>
    );
  }

  if (!user || !user.restaurantId) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">
            Access Denied
          </h1>
          <p className="text-gray-600">
            You must be logged in to view this page.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <h1 className="text-2xl font-bold text-gray-900">
            Profit & Loss Report
          </h1>
        </div>
      </div>

      {/* Period Selector */}
      <ProfitLossHeader
        period={period}
        startDate={startDate}
        endDate={endDate}
        onPeriodChange={handlePeriodChange}
      />

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 py-6">
        {plLoading ? (
          <div className="flex items-center justify-center py-12">
            <LoadingSpinner />
          </div>
        ) : plData ? (
          <div className="space-y-6">
            {/* Revenue Section */}
            <RevenueSection revenue={plData.revenue} />

            {/* COGS Section */}
            <COGSSection cogs={plData.cogs} />

            {/* Gross Profit */}
            <GrossProfitSection grossProfit={plData.grossProfit} />

            {/* Operating Expenses */}
            <OperatingExpensesSection
              operatingExpenses={plData.operatingExpenses}
            />

            {/* Net Profit */}
            <NetProfitSection netProfit={plData.netProfit} />

            {/* Key Metrics */}
            <KeyMetrics keyMetrics={plData.keyMetrics} />
          </div>
        ) : (
          <div className="text-center text-gray-600 py-12">
            No data available for the selected period.
          </div>
        )}
      </div>
    </div>
  );
}
