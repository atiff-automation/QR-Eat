'use client';

import { useState, useEffect } from 'react';
import { DollarSign } from 'lucide-react';
import { ApiClient, ApiClientError } from '@/lib/api-client';

export default function FinancialReportPage() {
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
            reportType: 'financial',
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
          a.download = `financial-report-${startDate}-to-${endDate}.csv`;
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
          reportType: 'financial',
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
          <h1 className="text-2xl font-bold text-gray-900">Financial Report</h1>
          <p className="text-gray-600">
            Comprehensive financial analysis including revenue, payments, and refunds
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
                  <h3 className="text-lg font-semibold text-gray-900">Financial Report</h3>
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

            {/* Revenue Summary */}
            {report.data?.revenue && (
              <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Revenue Summary</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="bg-green-50 p-4 rounded-lg">
                    <div className="flex items-center">
                      <div className="flex-shrink-0">
                        <span className="text-2xl">💰</span>
                      </div>
                      <div className="ml-3">
                        <p className="text-sm font-medium text-green-600">Gross Revenue</p>
                        <p className="text-2xl font-semibold text-green-900">${report.data.revenue.gross.toFixed(2)}</p>
                      </div>
                    </div>
                  </div>

                  <div className="bg-blue-50 p-4 rounded-lg">
                    <div className="flex items-center">
                      <div className="flex-shrink-0">
                        <DollarSign className="h-8 w-8 text-blue-600" />
                      </div>
                      <div className="ml-3">
                        <p className="text-sm font-medium text-blue-600">Net Revenue</p>
                        <p className="text-2xl font-semibold text-blue-900">${report.data.revenue.net.toFixed(2)}</p>
                      </div>
                    </div>
                  </div>

                  <div className="bg-purple-50 p-4 rounded-lg">
                    <div className="flex items-center">
                      <div className="flex-shrink-0">
                        <span className="text-2xl">🏛️</span>
                      </div>
                      <div className="ml-3">
                        <p className="text-sm font-medium text-purple-600">Tax Collected</p>
                        <p className="text-2xl font-semibold text-purple-900">${report.data.revenue.tax.toFixed(2)}</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Payment Methods */}
            {report.data?.paymentMethods && (
              <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Payment Methods</h3>
                <div className="space-y-3">
                  {report.data.paymentMethods.map((method: any, index: number) => (
                    <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                      <div className="flex items-center">
                        <div className="flex-shrink-0 w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                          <span className="text-blue-600 text-sm font-medium">💳</span>
                        </div>
                        <div className="ml-3">
                          <p className="text-sm font-medium text-gray-900 capitalize">{method.method}</p>
                          <p className="text-xs text-gray-500">{method.transactions} transactions</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-medium text-gray-900">${method.amount.toFixed(2)}</p>
                        <p className="text-xs text-gray-500">
                          {((method.amount / report.data.revenue.gross) * 100).toFixed(1)}% of total
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Refunds */}
            {report.data?.refunds && (
              <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Refunds & Returns</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="bg-red-50 p-4 rounded-lg">
                    <div className="flex items-center">
                      <div className="flex-shrink-0">
                        <span className="text-2xl">🔄</span>
                      </div>
                      <div className="ml-3">
                        <p className="text-sm font-medium text-red-600">Total Refunds</p>
                        <p className="text-2xl font-semibold text-red-900">${report.data.refunds.totalAmount.toFixed(2)}</p>
                      </div>
                    </div>
                  </div>

                  <div className="bg-orange-50 p-4 rounded-lg">
                    <div className="flex items-center">
                      <div className="flex-shrink-0">
                        <span className="text-2xl">📊</span>
                      </div>
                      <div className="ml-3">
                        <p className="text-sm font-medium text-orange-600">Refund Count</p>
                        <p className="text-2xl font-semibold text-orange-900">{report.data.refunds.totalCount}</p>
                      </div>
                    </div>
                  </div>
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