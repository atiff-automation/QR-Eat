'use client';

import { useEffect, useMemo, useState } from 'react';
import { ApiClient } from '@/lib/api-client';
import { Button } from '@/components/ui/Button';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';

interface DailyOrder {
  id: string;
  orderNumber: string;
  status: string;
  paymentStatus: string;
  orderType: string;
  createdAt: string;
  tableNumber: string | null;
  tableName: string | null;
  totalAmount: string;
  items: Array<{ id: string; name: string; quantity: number; unitPrice: string; totalAmount: string }>;
  payments: Array<{ method: string; amount: string; receiptNumber: string | null }>;
}

interface DailyReport {
  businessDate: string;
  currency: string;
  orders: DailyOrder[];
  totals: {
    orderCount: number;
    gross: string;
    subtotal: string;
    tax: string;
    serviceCharge: string;
    discounts: string;
  };
}

function todayString(): string {
  const now = new Date();
  const offset = now.getTimezoneOffset();
  return new Date(now.getTime() - offset * 60_000).toISOString().slice(0, 10);
}

export default function DailyOrdersPage() {
  const [date, setDate] = useState(todayString());
  const [report, setReport] = useState<DailyReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    setLoading(true);
    setError('');
    ApiClient.get<{ success: boolean } & DailyReport>('/api/reports/daily/orders', {
      params: { date },
    })
      .then((data) => setReport(data))
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load report'))
      .finally(() => setLoading(false));
  }, [date]);

  const csv = useMemo(() => {
    if (!report) return '';
    const lines = [
      ['Order', 'Time', 'Type', 'Table', 'Status', 'Payment', 'Item', 'Qty', 'Unit', 'Total'],
    ];
    report.orders.forEach((order) => {
      order.items.forEach((item) => {
        lines.push([
          order.orderNumber,
          order.createdAt,
          order.orderType,
          order.tableNumber ?? '',
          order.status,
          order.paymentStatus,
          item.name,
          String(item.quantity),
          item.unitPrice,
          item.totalAmount,
        ]);
      });
    });
    return lines
      .map((row) => row.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(','))
      .join('\n');
  }, [report]);

  const downloadCsv = () => {
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `daily-orders-${date}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-gray-50/50 pb-20">
      <div className="mx-auto max-w-7xl space-y-5 px-5 pt-4 md:px-6">
        <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-end gap-3">
            <label className="text-sm font-medium text-gray-700">
              Business date
              <input
                type="date"
                value={date}
                onChange={(event) => setDate(event.target.value)}
                className="mt-1 block h-10 rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-900"
              />
            </label>
            <Button variant="outline" onClick={downloadCsv} disabled={!report}>
              Download CSV
            </Button>
          </div>
        </div>

        {error && (
          <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600">
            {error}
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-10">
            <LoadingSpinner />
          </div>
        ) : report ? (
          <>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
              {[
                ['Orders', String(report.totals.orderCount)],
                ['Gross', `${report.currency} ${report.totals.gross}`],
                ['Subtotal', `${report.currency} ${report.totals.subtotal}`],
                ['Tax', `${report.currency} ${report.totals.tax}`],
                ['Service', `${report.currency} ${report.totals.serviceCharge}`],
                ['Discounts', `${report.currency} ${report.totals.discounts}`],
              ].map(([label, value]) => (
                <div key={label} className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
                  <p className="text-xs uppercase text-gray-500">{label}</p>
                  <p className="mt-1 font-semibold text-gray-900">{value}</p>
                </div>
              ))}
            </div>

            <div className="space-y-2">
              {report.orders.length === 0 ? (
                <div className="rounded-xl border border-gray-100 bg-white p-10 text-center text-sm text-gray-500">
                  No orders for this business date.
                </div>
              ) : (
                report.orders.map((order) => (
                  <div key={order.id} className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
                    <div className="flex flex-wrap justify-between gap-2">
                      <div>
                        <p className="font-semibold text-gray-900">{order.orderNumber}</p>
                        <p className="text-xs text-gray-500">
                          {order.orderType} · {order.tableNumber ? `Table ${order.tableNumber}` : 'Takeaway'} · {order.status} · {order.paymentStatus}
                        </p>
                      </div>
                      <p className="font-semibold text-gray-900">{report.currency} {order.totalAmount}</p>
                    </div>
                    <div className="mt-2 divide-y divide-gray-100 text-sm">
                      {order.items.map((item) => (
                        <div key={item.id} className="flex justify-between py-1">
                          <span>{item.quantity}× {item.name}</span>
                          <span>{report.currency} {item.totalAmount}</span>
                        </div>
                      ))}
                    </div>
                    <p className="mt-2 text-xs text-gray-500">
                      {order.payments.map((payment) => `${payment.method} ${payment.amount}`).join(' · ')}
                    </p>
                  </div>
                ))
              )}
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
