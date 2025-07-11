'use client';

import { useState, useEffect } from 'react';
import { DashboardLayout } from '@/components/dashboard/DashboardLayout';

export default function OperationalReportPage() {
  const [report, setReport] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [format, setFormat] = useState('json');

  useEffect(() => {
    // Set default date range (last 7 days)
    const today = new Date();
    const weekAgo = new Date(today);
    weekAgo.setDate(today.getDate() - 7);
    
    setEndDate(today.toISOString().split('T')[0]);
    setStartDate(weekAgo.toISOString().split('T')[0]);
  }, []);

  const generateReport = async () => {
    try {
      setLoading(true);
      setError(null);
      
      // Get staff info to get restaurant ID
      const staffResponse = await fetch('/api/auth/me');
      if (!staffResponse.ok) {
        throw new Error('Failed to get staff info');
      }
      const staffData = await staffResponse.json();
      const restaurantId = staffData.staff.restaurant.id;

      // Generate report
      const response = await fetch(`/api/staff/analytics/${restaurantId}/report`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          reportType: 'operational',
          dateRange: {
            start: new Date(startDate).toISOString(),
            end: new Date(endDate + 'T23:59:59.999Z').toISOString(),
          },
          format: format,
          includeCharts: true,
          includeDetails: true,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to generate report');
      }

      if (format === 'csv') {
        // Download CSV file
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `operational-report-${startDate}-to-${endDate}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
        setReport({ message: 'CSV file downloaded successfully!' });
      } else if (format === 'pdf') {
        // Open PDF in new tab
        const htmlContent = await response.text();
        const newWindow = window.open('', '_blank');
        if (newWindow) {
          newWindow.document.write(htmlContent);
          newWindow.document.close();
        }
        setReport({ message: 'PDF report opened in new tab!' });
      } else {
        const data = await response.json();
        setReport(data.report);
      }
    } catch (error) {
      console.error('Error generating report:', error);
      setError(error instanceof Error ? error.message : 'Failed to generate report');
    } finally {
      setLoading(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Operational Report</h1>
          <p className="text-gray-600">
            Analyze operational efficiency, processing times, and peak hours
          </p>
        </div>

        {/* Report Configuration */}
        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Report Configuration</h3>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Start Date
              </label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                End Date
              </label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Format
              </label>
              <select
                value={format}
                onChange={(e) => setFormat(e.target.value)}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="json">View Online</option>
                <option value="csv">Download CSV</option>
                <option value="pdf">Download PDF</option>
              </select>
            </div>
            <div className="flex items-end">
              <button
                onClick={generateReport}
                disabled={loading || !startDate || !endDate}
                className="w-full bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? 'Generating...' : 'Generate Report'}
              </button>
            </div>
          </div>
        </div>

        {/* Error Display */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <div className="flex">
              <div className="flex-shrink-0">
                <span className="text-red-400 text-xl">⚠️</span>
              </div>
              <div className="ml-3">
                <h3 className="text-sm font-medium text-red-800">Error</h3>
                <p className="text-sm text-red-700 mt-1">{error}</p>
              </div>
            </div>
          </div>
        )}

        {/* Report Display */}
        {report && (
          <div className="space-y-6">
            {/* Report Header */}
            <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">Operational Report</h3>
                  <p className="text-sm text-gray-600">
                    Generated on {new Date(report.generatedAt).toLocaleDateString()} by {report.generatedBy?.name}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm text-gray-600">Period</p>
                  <p className="text-sm font-medium text-gray-900">
                    {report.dateRange ? 
                      `${new Date(report.dateRange.start).toLocaleDateString()} - ${new Date(report.dateRange.end).toLocaleDateString()}` :
                      `${startDate} - ${endDate}`
                    }
                  </p>
                </div>
              </div>
            </div>

            {/* Order Processing */}
            {report.data?.orderProcessing && (
              <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Order Processing Performance</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="bg-blue-50 p-4 rounded-lg">
                    <div className="flex items-center">
                      <div className="flex-shrink-0">
                        <span className="text-2xl">⏱️</span>
                      </div>
                      <div className="ml-3">
                        <p className="text-sm font-medium text-blue-600">Average Processing Time</p>
                        <p className="text-2xl font-semibold text-blue-900">{report.data.orderProcessing.averageProcessingTime} min</p>
                      </div>
                    </div>
                  </div>

                  <div className="bg-green-50 p-4 rounded-lg">
                    <div className="flex items-center">
                      <div className="flex-shrink-0">
                        <span className="text-2xl">📋</span>
                      </div>
                      <div className="ml-3">
                        <p className="text-sm font-medium text-green-600">Total Orders Processed</p>
                        <p className="text-2xl font-semibold text-green-900">{report.data.orderProcessing.totalOrders}</p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Processing Time Distribution */}
                {report.data.orderProcessing.processingTimeDistribution && (
                  <div className="mt-4">
                    <h4 className="text-md font-medium text-gray-900 mb-3">Processing Time Distribution</h4>
                    <div className="space-y-2">
                      {report.data.orderProcessing.processingTimeDistribution.map((item: any, index: number) => (
                        <div key={index} className="flex items-center justify-between p-2 bg-gray-50 rounded">
                          <span className="text-sm text-gray-700">{item.range}</span>
                          <div className="flex items-center">
                            <span className="text-sm font-medium text-gray-900 mr-2">{item.count} orders</span>
                            <span className="text-sm text-gray-500">({item.percentage.toFixed(1)}%)</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Table Utilization */}
            {report.data?.tableUtilization && (
              <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Table Utilization</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="bg-green-50 p-4 rounded-lg">
                    <div className="flex items-center">
                      <div className="flex-shrink-0">
                        <span className="text-2xl">📊</span>
                      </div>
                      <div className="ml-3">
                        <p className="text-sm font-medium text-green-600">Average Utilization</p>
                        <p className="text-2xl font-semibold text-green-900">{report.data.tableUtilization.averageUtilization}%</p>
                      </div>
                    </div>
                  </div>

                  <div className="bg-blue-50 p-4 rounded-lg">
                    <div className="flex items-center">
                      <div className="flex-shrink-0">
                        <span className="text-2xl">📈</span>
                      </div>
                      <div className="ml-3">
                        <p className="text-sm font-medium text-blue-600">Peak Utilization</p>
                        <p className="text-2xl font-semibold text-blue-900">{report.data.tableUtilization.peakUtilization}%</p>
                      </div>
                    </div>
                  </div>

                  <div className="bg-orange-50 p-4 rounded-lg">
                    <div className="flex items-center">
                      <div className="flex-shrink-0">
                        <span className="text-2xl">📉</span>
                      </div>
                      <div className="ml-3">
                        <p className="text-sm font-medium text-orange-600">Low Utilization</p>
                        <p className="text-2xl font-semibold text-orange-900">{report.data.tableUtilization.lowUtilization}%</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Peak Hours */}
            {report.data?.peakHours && (
              <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Peak Hours Analysis</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {report.data.peakHours.map((hour: any, index: number) => (
                    <div key={index} className="p-3 bg-gray-50 rounded-lg">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-gray-900">{hour.period}</span>
                        <span className="text-sm font-semibold text-blue-600">{hour.orders} orders</span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2 mt-2">
                        <div 
                          className="bg-blue-600 h-2 rounded-full" 
                          style={{ width: `${Math.min((hour.orders / Math.max(...report.data.peakHours.map((h: any) => h.orders))) * 100, 100)}%` }}
                        ></div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Staff Performance */}
            {report.data?.staffPerformance && (
              <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Staff Performance</h3>
                <div className="bg-blue-50 p-4 rounded-lg">
                  <p className="text-sm text-blue-600">{report.data.staffPerformance.message}</p>
                </div>
              </div>
            )}

            {/* Download Message */}
            {report.message && (
              <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                <div className="flex">
                  <div className="flex-shrink-0">
                    <span className="text-green-400 text-xl">✅</span>
                  </div>
                  <div className="ml-3">
                    <h3 className="text-sm font-medium text-green-800">Success</h3>
                    <p className="text-sm text-green-700 mt-1">{report.message}</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}