'use client';

import { useState, useEffect, memo } from 'react';
import {
  useComprehensiveReport,
  useDownloadReport,
} from '@/lib/hooks/queries/useReports';

const ComprehensiveReportPage = memo(function ComprehensiveReportPage() {
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [format, setFormat] = useState<'json' | 'csv' | 'pdf'>('json');
  const [downloadMessage, setDownloadMessage] = useState('');

  // Set default date range (last 7 days)
  useEffect(() => {
    const today = new Date();
    const weekAgo = new Date(today);
    weekAgo.setDate(today.getDate() - 7);

    setEndDate(today.toISOString().split('T')[0]);
    setStartDate(weekAgo.toISOString().split('T')[0]);
  }, []);

  // Fetch report data
  const {
    data: report,
    isLoading: isFetching,
    error: fetchError,
  } = useComprehensiveReport({
    dateRange: {
      start: startDate ? new Date(startDate).toISOString() : '',
      end: endDate ? new Date(endDate + 'T23:59:59.999Z').toISOString() : '',
    },
    includeCharts: true,
    includeDetails: true,
    format: 'json',
  });

  // Download mutation
  const downloadReportMutation = useDownloadReport();

  const handleDownload = async () => {
    try {
      setDownloadMessage('');
      const blob = await downloadReportMutation.mutateAsync({
        reportType: 'comprehensive',
        params: {
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
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `comprehensive-report-${startDate}-to-${endDate}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
        setDownloadMessage('CSV file downloaded successfully!');
      } else if (format === 'pdf') {
        const htmlContent = await blob.text();
        const newWindow = window.open('', '_blank');
        if (newWindow) {
          newWindow.document.write(htmlContent);
          newWindow.document.close();
        }
        setDownloadMessage('PDF report opened in new tab!');
      }
    } catch (error) {
      console.error('Download failed:', error);
    }
  };

  const isDownload = format === 'csv' || format === 'pdf';

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">
          Comprehensive Report
        </h1>
        <p className="text-gray-600">
          Executive summary with all key metrics and insights
        </p>
      </div>

      {/* Report Configuration */}
      <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">
          Report Configuration
        </h3>
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
              onChange={(e) =>
                setFormat(e.target.value as 'json' | 'csv' | 'pdf')
              }
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="json">View Online</option>
              <option value="csv">Download CSV</option>
              <option value="pdf">Download PDF</option>
            </select>
          </div>
          <div className="flex items-end">
            {isDownload ? (
              <button
                onClick={handleDownload}
                disabled={
                  downloadReportMutation.isPending || !startDate || !endDate
                }
                className="w-full bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {downloadReportMutation.isPending
                  ? 'Downloading...'
                  : 'Download Report'}
              </button>
            ) : (
              <button
                disabled={true} // Auto-fetches now
                className="w-full bg-gray-100 text-gray-500 px-4 py-2 rounded-md cursor-not-allowed"
              >
                {isFetching ? 'Loading...' : 'Auto-updating'}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Error Display */}
      {(fetchError || downloadReportMutation.error) && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex">
            <div className="flex-shrink-0">
              <span className="text-red-400 text-xl">⚠️</span>
            </div>
            <div className="ml-3">
              <h3 className="text-sm font-medium text-red-800">Error</h3>
              <p className="text-sm text-red-700 mt-1">
                {fetchError?.message ||
                  downloadReportMutation.error?.message ||
                  'An error occurred'}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Loading State */}
      {isFetching && !report && (
        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
          <div className="animate-pulse space-y-4">
            <div className="h-8 bg-gray-200 rounded w-64"></div>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-24 bg-gray-200 rounded"></div>
              ))}
            </div>
            <div className="h-64 bg-gray-200 rounded"></div>
          </div>
        </div>
      )}

      {/* Download Success Message */}
      {downloadMessage && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <div className="flex">
            <div className="flex-shrink-0">
              <span className="text-green-400 text-xl">✅</span>
            </div>
            <div className="ml-3">
              <h3 className="text-sm font-medium text-green-800">Success</h3>
              <p className="text-sm text-green-700 mt-1">{downloadMessage}</p>
            </div>
          </div>
        </div>
      )}

      {/* Report Display */}
      {report && !isDownload && (
        <div className="space-y-6">
          {/* Report Header */}
          <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">
                  Comprehensive Business Report
                </h3>
                <p className="text-sm text-gray-600">
                  Generated on {new Date().toLocaleDateString()}
                </p>
              </div>
              <div className="text-right">
                <p className="text-sm text-gray-600">Period</p>
                <p className="text-sm font-medium text-gray-900">
                  {startDate} - {endDate}
                </p>
              </div>
            </div>
          </div>

          {/* Executive Summary */}
          {report.data?.executive_summary && (
            <div className="bg-gradient-to-r from-blue-50 to-indigo-50 p-6 rounded-lg border border-blue-200">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">
                Executive Summary
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="text-center">
                  <div className="text-2xl font-bold text-blue-600">
                    ${report.data.executive_summary.total_revenue.toFixed(2)}
                  </div>
                  <div className="text-sm text-gray-600">Total Revenue</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-green-600">
                    {report.data.executive_summary.total_orders}
                  </div>
                  <div className="text-sm text-gray-600">Total Orders</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-purple-600">
                    {report.data.executive_summary.customer_conversion_rate}%
                  </div>
                  <div className="text-sm text-gray-600">Conversion Rate</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-orange-600">
                    {report.data.executive_summary.top_performing_item}
                  </div>
                  <div className="text-sm text-gray-600">Top Item</div>
                </div>
              </div>
            </div>
          )}

          {/* Sales Summary */}
          {report.data?.sales && (
            <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">
                Sales Performance
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="text-center p-4 bg-gray-50 rounded-lg">
                  <div className="text-xl font-semibold text-gray-900">
                    ${report.data.sales.summary.totalRevenue.toFixed(2)}
                  </div>
                  <div className="text-sm text-gray-600">Total Revenue</div>
                </div>
                <div className="text-center p-4 bg-gray-50 rounded-lg">
                  <div className="text-xl font-semibold text-gray-900">
                    {report.data.sales.summary.totalOrders}
                  </div>
                  <div className="text-sm text-gray-600">Total Orders</div>
                </div>
                <div className="text-center p-4 bg-gray-50 rounded-lg">
                  <div className="text-xl font-semibold text-gray-900">
                    ${report.data.sales.summary.averageOrderValue.toFixed(2)}
                  </div>
                  <div className="text-sm text-gray-600">Avg Order Value</div>
                </div>
                <div className="text-center p-4 bg-gray-50 rounded-lg">
                  <div className="text-xl font-semibold text-gray-900">
                    ${report.data.sales.summary.totalTax.toFixed(2)}
                  </div>
                  <div className="text-sm text-gray-600">Total Tax</div>
                </div>
              </div>
            </div>
          )}

          {/* Menu Performance */}
          {report.data?.menu && (
            <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">
                Menu Performance
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
                <div className="text-center p-4 bg-gray-50 rounded-lg">
                  <div className="text-xl font-semibold text-gray-900">
                    {report.data.menu.summary.totalMenuItems}
                  </div>
                  <div className="text-sm text-gray-600">Total Items</div>
                </div>
                <div className="text-center p-4 bg-green-50 rounded-lg">
                  <div className="text-xl font-semibold text-green-900">
                    {report.data.menu.summary.activeItems}
                  </div>
                  <div className="text-sm text-green-600">Active Items</div>
                </div>
                <div className="text-center p-4 bg-blue-50 rounded-lg">
                  <div className="text-xl font-semibold text-blue-900">
                    {report.data.menu.summary.itemsOrdered}
                  </div>
                  <div className="text-sm text-blue-600">Items Ordered</div>
                </div>
                <div className="text-center p-4 bg-red-50 rounded-lg">
                  <div className="text-xl font-semibold text-red-900">
                    {report.data.menu.summary.itemsNotOrdered}
                  </div>
                  <div className="text-sm text-red-600">Items Not Ordered</div>
                </div>
              </div>

              {/* Top Performers */}
              {report.data.menu.topPerformers &&
                report.data.menu.topPerformers.length > 0 && (
                  <div>
                    <h4 className="text-md font-medium text-gray-900 mb-3">
                      Top Performing Items
                    </h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {report.data.menu.topPerformers
                        .slice(0, 6)
                        .map(
                          (
                            item: {
                              name: string;
                              category: string;
                              quantitySold: number;
                              revenue: number;
                            },
                            index: number
                          ) => (
                            <div
                              key={index}
                              className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                            >
                              <div className="flex items-center">
                                <div className="flex-shrink-0 w-6 h-6 bg-green-100 rounded-full flex items-center justify-center">
                                  <span className="text-green-600 text-xs font-medium">
                                    {index + 1}
                                  </span>
                                </div>
                                <div className="ml-3">
                                  <p className="text-sm font-medium text-gray-900">
                                    {item.name}
                                  </p>
                                  <p className="text-xs text-gray-500">
                                    {item.category}
                                  </p>
                                </div>
                              </div>
                              <div className="text-right">
                                <p className="text-sm font-medium text-gray-900">
                                  {item.quantitySold} sold
                                </p>
                                <p className="text-xs text-gray-500">
                                  ${item.revenue.toFixed(2)}
                                </p>
                              </div>
                            </div>
                          )
                        )}
                    </div>
                  </div>
                )}
            </div>
          )}

          {/* Financial Summary */}
          {report.data?.financial && (
            <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">
                Financial Summary
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="text-center p-4 bg-green-50 rounded-lg">
                  <div className="text-xl font-semibold text-green-900">
                    ${report.data.financial.revenue.gross.toFixed(2)}
                  </div>
                  <div className="text-sm text-green-600">Gross Revenue</div>
                </div>
                <div className="text-center p-4 bg-blue-50 rounded-lg">
                  <div className="text-xl font-semibold text-blue-900">
                    ${report.data.financial.revenue.net.toFixed(2)}
                  </div>
                  <div className="text-sm text-blue-600">Net Revenue</div>
                </div>
                <div className="text-center p-4 bg-purple-50 rounded-lg">
                  <div className="text-xl font-semibold text-purple-900">
                    ${report.data.financial.revenue.tax.toFixed(2)}
                  </div>
                  <div className="text-sm text-purple-600">Tax Collected</div>
                </div>
              </div>
            </div>
          )}

          {/* Customer Summary */}
          {report.data?.customer && (
            <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">
                Customer Analytics
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="text-center p-4 bg-gray-50 rounded-lg">
                  <div className="text-xl font-semibold text-gray-900">
                    {report.data.customer.summary.totalSessions}
                  </div>
                  <div className="text-sm text-gray-600">Total Sessions</div>
                </div>
                <div className="text-center p-4 bg-green-50 rounded-lg">
                  <div className="text-xl font-semibold text-green-900">
                    {report.data.customer.summary.conversionRate}%
                  </div>
                  <div className="text-sm text-green-600">Conversion Rate</div>
                </div>
                <div className="text-center p-4 bg-blue-50 rounded-lg">
                  <div className="text-xl font-semibold text-blue-900">
                    $
                    {report.data.customer.summary.averageSessionValue.toFixed(
                      2
                    )}
                  </div>
                  <div className="text-sm text-blue-600">Avg Session Value</div>
                </div>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              Export Options
            </h3>
            <div className="flex space-x-3">
              <button
                onClick={() => window.print()}
                className="inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
              >
                <span className="mr-2">🖨️</span>
                Print Report
              </button>
              <button
                onClick={() => {
                  const dataStr = JSON.stringify(report, null, 2);
                  const dataUri =
                    'data:application/json;charset=utf-8,' +
                    encodeURIComponent(dataStr);
                  const exportFileDefaultName = `comprehensive-report-${startDate}-to-${endDate}.json`;
                  const linkElement = document.createElement('a');
                  linkElement.setAttribute('href', dataUri);
                  linkElement.setAttribute('download', exportFileDefaultName);
                  linkElement.click();
                }}
                className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700"
              >
                <span className="mr-2">📄</span>
                Download JSON
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
});

export default ComprehensiveReportPage;
