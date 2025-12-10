'use client';

import { useState, useEffect, memo } from 'react';
import { ApiClient, ApiClientError } from '@/lib/api-client';

const CustomerReportPage = memo(function CustomerReportPage() {
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
            reportType: 'customer',
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
          a.download = `customer-report-${startDate}-to-${endDate}.csv`;
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
        const data = await ApiClient.post<{ report: any }>(`/api/staff/analytics/${restaurantId}/report`, {
          reportType: 'customer',
          dateRange: {
            start: new Date(startDate).toISOString(),
            end: new Date(endDate + 'T23:59:59.999Z').toISOString(),
          },
          format: format,
          includeCharts: true,
          includeDetails: true,
        });
        setReport(data.report);
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
          <h1 className="text-2xl font-bold text-gray-900">Customer Report</h1>
          <p className="text-gray-600">
            Analyze customer behavior, sessions, and conversion rates
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
                  <h3 className="text-lg font-semibold text-gray-900">Customer Report</h3>
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
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
                  <div className="flex items-center">
                    <div className="flex-shrink-0">
                      <span className="text-2xl">👥</span>
                    </div>
                    <div className="ml-3">
                      <p className="text-sm font-medium text-gray-500">Total Sessions</p>
                      <p className="text-2xl font-semibold text-gray-900">{report.data.summary.totalSessions}</p>
                    </div>
                  </div>
                </div>

                <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
                  <div className="flex items-center">
                    <div className="flex-shrink-0">
                      <span className="text-2xl">🛒</span>
                    </div>
                    <div className="ml-3">
                      <p className="text-sm font-medium text-gray-500">Sessions with Orders</p>
                      <p className="text-2xl font-semibold text-gray-900">{report.data.summary.sessionsWithOrders}</p>
                    </div>
                  </div>
                </div>

                <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
                  <div className="flex items-center">
                    <div className="flex-shrink-0">
                      <span className="text-2xl">📊</span>
                    </div>
                    <div className="ml-3">
                      <p className="text-sm font-medium text-gray-500">Conversion Rate</p>
                      <p className="text-2xl font-semibold text-gray-900">{report.data.summary.conversionRate}%</p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Average Session Value */}
            {report.data?.summary && (
              <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Session Value Analysis</h3>
                <div className="bg-green-50 p-4 rounded-lg">
                  <div className="flex items-center">
                    <div className="flex-shrink-0">
                      <span className="text-2xl">💰</span>
                    </div>
                    <div className="ml-3">
                      <p className="text-sm font-medium text-green-600">Average Session Value</p>
                      <p className="text-2xl font-semibold text-green-900">${report.data.summary.averageSessionValue.toFixed(2)}</p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Session Details */}
            {report.data?.sessionDetails && report.data.sessionDetails.length > 0 && (
              <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Recent Sessions</h3>
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Session ID
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Table
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Duration
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Orders
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Total Spent
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {report.data.sessionDetails.slice(0, 20).map((session: any, index: number) => (
                        <tr key={index}>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {session.sessionId.substring(0, 8)}...
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            Table {session.tableId}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {session.duration ? `${session.duration} min` : 'Active'}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {session.orders}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                            ${session.totalSpent.toFixed(2)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Insights */}
            <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Customer Insights</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-blue-50 p-4 rounded-lg">
                  <h4 className="font-medium text-blue-900 mb-2">Engagement</h4>
                  <p className="text-sm text-blue-700">
                    {report.data?.summary?.conversionRate > 70 ? 
                      'High customer engagement with strong conversion rates' :
                      report.data?.summary?.conversionRate > 50 ?
                      'Moderate engagement - room for improvement' :
                      'Low engagement - consider menu optimization'
                    }
                  </p>
                </div>
                <div className="bg-green-50 p-4 rounded-lg">
                  <h4 className="font-medium text-green-900 mb-2">Value</h4>
                  <p className="text-sm text-green-700">
                    {report.data?.summary?.averageSessionValue > 50 ? 
                      'Strong session values indicating satisfied customers' :
                      report.data?.summary?.averageSessionValue > 25 ?
                      'Moderate session values - consider upselling' :
                      'Low session values - review pricing strategy'
                    }
                  </p>
                </div>
              </div>
            </div>

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
});

export default CustomerReportPage;