'use client';

import { useState, useEffect } from 'react';
import { ApiClient, ApiClientError } from '@/lib/api-client';

export default function MenuReportPage() {
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
      const staffData = await ApiClient.get<{ staff: { restaurant: { id: string } } }>('/api/auth/me');
      const restaurantId = staffData.staff.restaurant.id;

      // Generate report
      if (format === 'csv' || format === 'pdf') {
        const blob = await ApiClient.downloadFile(`/api/staff/analytics/${restaurantId}/report`, {
          method: 'POST',
          body: {
            reportType: 'menu',
            dateRange: {
              start: new Date(startDate).toISOString(),
              end: new Date(endDate + 'T23:59:59.999Z').toISOString(),
            },
            format: format,
            includeCharts: true,
            includeDetails: true,
          },
        });

        if (format === 'csv') {
          // Download CSV file
          const url = window.URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `menu-report-${startDate}-to-${endDate}.csv`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          window.URL.revokeObjectURL(url);
          setReport({ message: 'CSV file downloaded successfully!' });
        } else if (format === 'pdf') {
          // Open PDF in new tab
          const htmlContent = await blob.text();
          const newWindow = window.open('', '_blank');
          if (newWindow) {
            newWindow.document.write(htmlContent);
            newWindow.document.close();
          }
          setReport({ message: 'PDF report opened in new tab!' });
        }
      } else {
        const response = await ApiClient.post<{ report: any }>(`/api/staff/analytics/${restaurantId}/report`, {
          reportType: 'menu',
          dateRange: {
            start: new Date(startDate).toISOString(),
            end: new Date(endDate + 'T23:59:59.999Z').toISOString(),
          },
          format: format,
          includeCharts: true,
          includeDetails: true,
        });
        setReport(response.report);
      }
    } catch (error) {
      console.error('Error generating report:', error);
      if (error instanceof ApiClientError) {
        setError(error.message);
      } else {
        setError('Failed to generate report');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6 space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Menu Performance Report</h1>
          <p className="text-gray-600">
            Analyze menu item performance and identify optimization opportunities
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
                  <h3 className="text-lg font-semibold text-gray-900">Menu Performance Report</h3>
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

            {/* Summary Cards */}
            {report.data?.summary && (
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
                  <div className="flex items-center">
                    <div className="flex-shrink-0">
                      <span className="text-2xl">🍽️</span>
                    </div>
                    <div className="ml-3">
                      <p className="text-sm font-medium text-gray-500">Total Menu Items</p>
                      <p className="text-2xl font-semibold text-gray-900">{report.data.summary.totalMenuItems}</p>
                    </div>
                  </div>
                </div>

                <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
                  <div className="flex items-center">
                    <div className="flex-shrink-0">
                      <span className="text-2xl">✅</span>
                    </div>
                    <div className="ml-3">
                      <p className="text-sm font-medium text-gray-500">Active Items</p>
                      <p className="text-2xl font-semibold text-gray-900">{report.data.summary.activeItems}</p>
                    </div>
                  </div>
                </div>

                <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
                  <div className="flex items-center">
                    <div className="flex-shrink-0">
                      <span className="text-2xl">📈</span>
                    </div>
                    <div className="ml-3">
                      <p className="text-sm font-medium text-gray-500">Items Ordered</p>
                      <p className="text-2xl font-semibold text-gray-900">{report.data.summary.itemsOrdered}</p>
                    </div>
                  </div>
                </div>

                <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
                  <div className="flex items-center">
                    <div className="flex-shrink-0">
                      <span className="text-2xl">❌</span>
                    </div>
                    <div className="ml-3">
                      <p className="text-sm font-medium text-gray-500">Items Not Ordered</p>
                      <p className="text-2xl font-semibold text-gray-900">{report.data.summary.itemsNotOrdered}</p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Top Performers */}
            {report.data?.topPerformers && (
              <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Top Performing Items</h3>
                <div className="space-y-3">
                  {report.data.topPerformers.map((item: any, index: number) => (
                    <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                      <div className="flex items-center">
                        <div className="flex-shrink-0 w-8 h-8 bg-green-100 rounded-full flex items-center justify-center">
                          <span className="text-green-600 text-sm font-medium">{index + 1}</span>
                        </div>
                        <div className="ml-3">
                          <p className="text-sm font-medium text-gray-900">{item.name}</p>
                          <p className="text-xs text-gray-500">{item.category} • ${item.price}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-medium text-gray-900">{item.quantitySold} sold</p>
                        <p className="text-xs text-gray-500">${item.revenue.toFixed(2)} revenue</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Items Not Ordered */}
            {report.data?.itemsNotOrdered && report.data.itemsNotOrdered.length > 0 && (
              <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Items Not Ordered</h3>
                <div className="space-y-3">
                  {report.data.itemsNotOrdered.map((item: any, index: number) => (
                    <div key={index} className="flex items-center justify-between p-3 bg-red-50 rounded-lg">
                      <div className="flex items-center">
                        <div className="flex-shrink-0">
                          <span className="text-red-400 text-xl">⚠️</span>
                        </div>
                        <div className="ml-3">
                          <p className="text-sm font-medium text-gray-900">{item.name}</p>
                          <p className="text-xs text-gray-500">{item.category} • ${item.price}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-medium text-red-600">No orders</p>
                        <p className="text-xs text-red-500">Consider promotion</p>
                      </div>
                    </div>
                  ))}
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
  );
}