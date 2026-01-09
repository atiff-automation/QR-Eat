'use client';

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { format, parseISO } from 'date-fns';
import { useMemo } from 'react';
import { useCurrency } from '@/contexts/RestaurantContext';
import { formatPrice } from '@/lib/qr-utils';

interface SalesData {
  date: string;
  revenue: number;
  order_count: number;
}

interface SalesChartProps {
  data: SalesData[];
  loading?: boolean;
  timeframe: 'daily' | 'weekly' | 'monthly' | 'yearly';
}

export function SalesChart({ data, loading, timeframe }: SalesChartProps) {
  const currency = useCurrency();

  const chartData = useMemo(() => {
    return data.map((item) => ({
      ...item,
      // Ensure date is parsed correctly if it comes as a string
      parsedDate:
        typeof item.date === 'string'
          ? parseISO(item.date)
          : new Date(item.date),
    }));
  }, [data]);

  const formatDateLabel = (date: Date) => {
    switch (timeframe) {
      case 'daily':
        return format(date, 'HH:mm');
      case 'weekly':
        return format(date, 'EEE');
      case 'monthly':
        return format(date, 'd MMM');
      case 'yearly':
        return format(date, 'MMM');
      default:
        return format(date, 'dd/MM');
    }
  };

  const formatTooltipDate = (date: Date) => {
    switch (timeframe) {
      case 'daily':
        return format(date, 'h:mm a, MMM d');
      case 'weekly':
        return format(date, 'EEEE, MMM d');
      case 'monthly':
        return format(date, 'MMM d, yyyy');
      case 'yearly':
        return format(date, 'MMMM yyyy');
      default:
        return format(date, 'PP');
    }
  };

  if (loading) {
    return (
      <div className="h-[300px] w-full bg-gray-50 rounded-xl flex items-center justify-center animate-pulse">
        <div className="text-gray-400 text-sm">Loading chart data...</div>
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="h-[300px] w-full bg-gray-50 rounded-xl border border-dashed border-gray-200 flex flex-col items-center justify-center text-gray-400">
        <svg
          className="w-10 h-10 mb-2 opacity-50"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
          />
        </svg>
        <p className="text-sm font-medium">No sales data for this period</p>
      </div>
    );
  }

  return (
    <div className="h-[300px] w-full">
      <ResponsiveContainer width="100%" height="100%" minWidth={0}>
        <AreaChart
          data={chartData}
          margin={{ top: 10, right: 0, left: -20, bottom: 0 }}
        >
          <defs>
            <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
              <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid
            strokeDasharray="3 3"
            vertical={false}
            stroke="#f0f0f0"
          />
          <XAxis
            dataKey="parsedDate"
            tickFormatter={formatDateLabel}
            axisLine={false}
            tickLine={false}
            tick={{ fontSize: 12, fill: '#9ca3af' }}
            dy={10}
            minTickGap={30}
          />
          <YAxis
            axisLine={false}
            tickLine={false}
            tick={{ fontSize: 12, fill: '#9ca3af' }}
            tickFormatter={(value) =>
              new Intl.NumberFormat('en-US', {
                notation: 'compact',
                compactDisplay: 'short',
              }).format(value)
            }
          />
          <Tooltip
            content={({ active, payload, label }) => {
              if (active && payload && payload.length) {
                return (
                  <div className="bg-white p-3 border border-gray-100 shadow-lg rounded-lg">
                    <p className="text-xs text-gray-500 mb-1">
                      {formatTooltipDate(label as unknown as Date)}
                    </p>
                    <p className="font-bold text-gray-900 text-lg">
                      {formatPrice(Number(payload[0].value), currency)}
                    </p>
                    <p className="text-xs text-blue-600 mt-1">
                      {payload[0].payload.order_count} orders
                    </p>
                  </div>
                );
              }
              return null;
            }}
          />
          <Area
            type="monotone"
            dataKey="revenue"
            stroke="#3b82f6"
            strokeWidth={2}
            fillOpacity={1}
            fill="url(#colorRevenue)"
            activeDot={{ r: 6, strokeWidth: 0, fill: '#2563eb' }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
