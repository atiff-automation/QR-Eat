'use client';

import { useState, useEffect } from 'react';
import { Clock } from 'lucide-react';
import {
  useOperationalReport,
  useDownloadReport,
} from '@/lib/hooks/queries/useReports';

export default function OperationalReportPage() {
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
  } = useOperationalReport({
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
        reportType: 'operational',
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
        a.download = `operational-report-${startDate}-to-${endDate}.csv`;
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
        <h1 className="text-2xl font-bold text-gray-900">Operational Report</h1>
        <p className="text-gray-600">
          Analyze operational efficiency, processing times, and peak hours
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
                  Operational Report
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

          {/* Order Processing */}
          {report.data?.orderProcessing && (
            <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">
                Order Processing Performance
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-blue-50 p-4 rounded-lg">
                  <div className="flex items-center">
                    <div className="flex-shrink-0">
                      <Clock className="h-8 w-8 text-blue-600" />
                    </div>
                    <div className="ml-3">
                      <p className="text-sm font-medium text-blue-600">
                        Average Processing Time
                      </p>
                      <p className="text-2xl font-semibold text-blue-900">
                        {report.data.orderProcessing.averageProcessingTime} min
                      </p>
                    </div>
                  </div>
                </div>

                <div className="bg-green-50 p-4 rounded-lg">
                  <div className="flex items-center">
                    <div className="flex-shrink-0">
                      <span className="text-2xl">📋</span>
                    </div>
                    <div className="ml-3">
                      <p className="text-sm font-medium text-green-600">
                        Total Orders Processed
                      </p>
                      <p className="text-2xl font-semibold text-green-900">
                        {report.data.orderProcessing.totalOrders}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Processing Time Distribution */}
              {report.data.orderProcessing.processingTimeDistribution && (
                <div className="mt-4">
                  <h4 className="text-md font-medium text-gray-900 mb-3">
                    Processing Time Distribution
                  </h4>
                  <div className="space-y-2">
                    {report.data.orderProcessing.processingTimeDistribution.map(
                      (
                        item: {
                          range: string;
                          count: number;
                          percentage: number;
                        },
                        index: number
                      ) => (
                        <div
                          key={index}
                          className="flex items-center justify-between p-2 bg-gray-50 rounded"
                        >
                          <span className="text-sm text-gray-700">
                            {item.range}
                          </span>
                          <div className="flex items-center">
                            <span className="text-sm font-medium text-gray-900 mr-2">
                              {item.count} orders
                            </span>
                            <span className="text-sm text-gray-500">
                              ({item.percentage.toFixed(1)}%)
                            </span>
                          </div>
                        </div>
                      )
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Table Utilization */}
          {report.data?.tableUtilization && (
            <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">
                Table Utilization
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-green-50 p-4 rounded-lg">
                  <div className="flex items-center">
                    <div className="flex-shrink-0">
                      <span className="text-2xl">📊</span>
                    </div>
                    <div className="ml-3">
                      <p className="text-sm font-medium text-green-600">
                        Average Utilization
                      </p>
                      <p className="text-2xl font-semibold text-green-900">
                        {report.data.tableUtilization.averageUtilization}%
                      </p>
                    </div>
                  </div>
                </div>

                <div className="bg-blue-50 p-4 rounded-lg">
                  <div className="flex items-center">
                    <div className="flex-shrink-0">
                      <span className="text-2xl">📈</span>
                    </div>
                    <div className="ml-3">
                      <p className="text-sm font-medium text-blue-600">
                        Peak Utilization
                      </p>
                      <p className="text-2xl font-semibold text-blue-900">
                        {report.data.tableUtilization.peakUtilization}%
                      </p>
                    </div>
                  </div>
                </div>

                <div className="bg-orange-50 p-4 rounded-lg">
                  <div className="flex items-center">
                    <div className="flex-shrink-0">
                      <span className="text-2xl">📉</span>
                    </div>
                    <div className="ml-3">
                      <p className="text-sm font-medium text-orange-600">
                        Low Utilization
                      </p>
                      <p className="text-2xl font-semibold text-orange-900">
                        {report.data.tableUtilization.lowUtilization}%
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Peak Hours */}
          {report.data?.peakHours && (
            <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">
                Peak Hours Analysis
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {report.data.peakHours.map(
                  (hour: { period: string; orders: number }, index: number) => (
                    <div key={index} className="p-3 bg-gray-50 rounded-lg">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-gray-900">
                          {hour.period}
                        </span>
                        <span className="text-sm font-semibold text-blue-600">
                          {hour.orders} orders
                        </span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2 mt-2">
                        <div
                          className="bg-blue-600 h-2 rounded-full"
                          style={{
                            width: `${Math.min((hour.orders / Math.max(...report.data.peakHours.map((h: { orders: number }) => h.orders))) * 100, 100)}%`,
                          }}
                        ></div>
                      </div>
                    </div>
                  )
                )}
              </div>
            </div>
          )}

          {/* Staff Performance */}
          {report.data?.staffPerformance && (
            <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">
                Staff Performance
              </h3>
              <div className="bg-blue-50 p-4 rounded-lg">
                <p className="text-sm text-blue-600">
                  {report.data.staffPerformance.message}
                </p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
