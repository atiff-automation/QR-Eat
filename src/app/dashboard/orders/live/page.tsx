'use client';

import { useState } from 'react';
import { DashboardLayout } from '@/components/dashboard/DashboardLayout';
import { LiveOrderBoard } from '@/components/orders/LiveOrderBoard';

export default function LiveOrdersPage() {
  const [refreshInterval, setRefreshInterval] = useState(30000); // 30 seconds
  const [isAutoRefresh, setIsAutoRefresh] = useState(true);

  const refreshIntervals = [
    { label: '10 seconds', value: 10000 },
    { label: '30 seconds', value: 30000 },
    { label: '1 minute', value: 60000 },
    { label: '2 minutes', value: 120000 }
  ];

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Live Order Board</h1>
            <p className="text-gray-600">Real-time order tracking and kitchen management</p>
          </div>
          
          <div className="flex items-center space-x-4">
            {/* Auto Refresh Toggle */}
            <div className="flex items-center space-x-2">
              <label className="text-sm font-medium text-gray-700">Auto Refresh:</label>
              <button
                onClick={() => setIsAutoRefresh(!isAutoRefresh)}
                className={`relative inline-flex items-center h-6 rounded-full w-11 transition-colors ${
                  isAutoRefresh ? 'bg-blue-600' : 'bg-gray-200'
                }`}
              >
                <span
                  className={`inline-block w-4 h-4 transform bg-white rounded-full transition-transform ${
                    isAutoRefresh ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>

            {/* Refresh Interval Selector */}
            {isAutoRefresh && (
              <div className="flex items-center space-x-2">
                <label className="text-sm font-medium text-gray-700">Interval:</label>
                <select
                  value={refreshInterval}
                  onChange={(e) => setRefreshInterval(Number(e.target.value))}
                  className="px-3 py-1 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                >
                  {refreshIntervals.map((interval) => (
                    <option key={interval.value} value={interval.value}>
                      {interval.label}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Status Indicator */}
            <div className="flex items-center space-x-2">
              <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse"></div>
              <span className="text-sm text-gray-600">Live</span>
            </div>
          </div>
        </div>

        {/* Live Order Board */}
        <LiveOrderBoard 
          refreshInterval={isAutoRefresh ? refreshInterval : 0} 
        />

        {/* Keyboard Shortcuts Help */}
        <div className="bg-gray-50 rounded-lg p-4">
          <h3 className="text-sm font-semibold text-gray-900 mb-2">Keyboard Shortcuts</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs text-gray-600">
            <div>
              <kbd className="px-2 py-1 bg-white rounded border text-gray-800">R</kbd>
              <span className="ml-2">Refresh orders</span>
            </div>
            <div>
              <kbd className="px-2 py-1 bg-white rounded border text-gray-800">Space</kbd>
              <span className="ml-2">Toggle auto-refresh</span>
            </div>
            <div>
              <kbd className="px-2 py-1 bg-white rounded border text-gray-800">1-4</kbd>
              <span className="ml-2">Filter by status</span>
            </div>
            <div>
              <kbd className="px-2 py-1 bg-white rounded border text-gray-800">F</kbd>
              <span className="ml-2">Toggle fullscreen</span>
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}