'use client';

import { useState, useEffect } from 'react';
import {
  AlertTriangle,
  CheckCircle,
  DollarSign,
  ClipboardList,
  BarChart3,
  UtensilsCrossed,
  Building2,
} from 'lucide-react';
import {
  useSalesReport,
  useDownloadReport,
} from '@/lib/hooks/queries/useReports';

export default function SalesReportPage() {
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
  // Enabled only when we have valid dates
  const {
    data: report,
    isLoading: isFetching,
    error: fetchError,
  } = useSalesReport({
    dateRange: {
      start: startDate ? new Date(startDate).toISOString() : '',
      end: endDate ? new Date(endDate + 'T23:59:59.999Z').toISOString() : '',
    },
    includeCharts: true,
    includeDetails: true,
    format: 'json', // Always fetch JSON for display
  });

  // Download mutation
  const downloadReportMutation = useDownloadReport();

  const handleDownload = async () => {
    try {
      setDownloadMessage('');
      const blob = await downloadReportMutation.mutateAsync({
        reportType: 'sales',
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
        a.download = `sales-report-${startDate}-to-${endDate}.csv`;
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
        <h1 className="text-2xl font-bold text-gray-900">Sales Report</h1>
        <p className="text-gray-600">
          Generate comprehensive sales reports for your restaurant
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
              <AlertTriangle className="h-5 w-5 text-red-400" />
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

      {/* Download Success Message */}
      {downloadMessage && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <div className="flex">
            <div className="flex-shrink-0">
              <CheckCircle className="h-5 w-5 text-green-400" />
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
                  Sales Report
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

          {/* Summary Cards */}
          {report.data?.summary && (
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
                <div className="flex items-center">
                  <div className="flex-shrink-0">
                    <DollarSign className="h-8 w-8 text-green-600" />
                  </div>
                  <div className="ml-3">
                    <p className="text-sm font-medium text-gray-500">
                      Total Revenue
                    </p>
                    <p className="text-2xl font-semibold text-gray-900">
                      ${report.data.summary.totalRevenue.toFixed(2)}
                    </p>
                  </div>
                </div>
              </div>

              <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
                <div className="flex items-center">
                  <div className="flex-shrink-0">
                    <ClipboardList className="h-8 w-8 text-blue-600" />
                  </div>
                  <div className="ml-3">
                    <p className="text-sm font-medium text-gray-500">
                      Total Orders
                    </p>
                    <p className="text-2xl font-semibold text-gray-900">
                      {report.data.summary.totalOrders}
                    </p>
                  </div>
                </div>
              </div>

              <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
                <div className="flex items-center">
                  <div className="flex-shrink-0">
                    <BarChart3 className="h-8 w-8 text-purple-600" />
                  </div>
                  <div className="ml-3">
                    <p className="text-sm font-medium text-gray-500">
                      Avg Order Value
                    </p>
                    <p className="text-2xl font-semibold text-gray-900">
                      ${report.data.summary.averageOrderValue.toFixed(2)}
                    </p>
                  </div>
                </div>
              </div>

              <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
                <div className="flex items-center">
                  <div className="flex-shrink-0">
                    <Building2 className="h-8 w-8 text-indigo-600" />
                  </div>
                  <div className="ml-3">
                    <p className="text-sm font-medium text-gray-500">
                      Total Tax
                    </p>
                    <p className="text-2xl font-semibold text-gray-900">
                      ${report.data.summary.totalTax.toFixed(2)}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Daily Breakdown */}
          {report.data?.dailyBreakdown && (
            <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">
                Daily Breakdown
              </h3>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Date
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Revenue
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Orders
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {report.data.dailyBreakdown.map(
                      (day: {
                        date: string;
                        revenue: number;
                        orders: number;
                      }) => (
                        <tr key={day.date}>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {new Date(day.date).toLocaleDateString()}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                            ${day.revenue.toFixed(2)}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {day.orders}
                          </td>
                        </tr>
                      )
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Category Breakdown */}
          {report.data?.categoryBreakdown && (
            <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">
                Category Breakdown
              </h3>
              <div className="space-y-3">
                {report.data.categoryBreakdown.map(
                  (category: {
                    categoryId: string;
                    name: string;
                    quantity: number;
                    revenue: number;
                  }) => (
                    <div
                      key={category.categoryId}
                      className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                    >
                      <div className="flex items-center">
                        <div className="flex-shrink-0">
                          <UtensilsCrossed className="h-5 w-5 text-gray-600" />
                        </div>
                        <div className="ml-3">
                          <p className="text-sm font-medium text-gray-900">
                            {category.name}
                          </p>
                          <p className="text-xs text-gray-500">
                            {category.quantity} items sold
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-medium text-gray-900">
                          ${category.revenue.toFixed(2)}
                        </p>
                      </div>
                    </div>
                  )
                )}
              </div>
            </div>
          )}

          {/* Top Selling Items */}
          {report.data?.topSellingItems && (
            <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">
                Top Selling Items
              </h3>
              <div className="space-y-3">
                {report.data.topSellingItems.map(
                  (
                    item: {
                      name: string;
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
                        <div className="flex-shrink-0 w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                          <span className="text-blue-600 text-sm font-medium">
                            {index + 1}
                          </span>
                        </div>
                        <div className="ml-3">
                          <p className="text-sm font-medium text-gray-900">
                            {item.name}
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
    </div>
  );
}
