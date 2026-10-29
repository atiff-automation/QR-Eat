'use client';

import { useEffect, useMemo, useState } from 'react';
import { ApiClient } from '@/lib/api-client';
import { Button } from '@/components/ui/Button';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { ViewOrderDetailsModal } from '@/components/dashboard/modals/ViewOrderDetailsModal';

interface DailyOrderItem {
  id: string;
  name: string;
  quantity: number;
  unitPrice: string;
  totalAmount: string;
  specialInstructions: string | null;
  options: Array<{ id: string; name: string; priceModifier: string }>;
}

interface DailyOrderPayment {
  id: string;
  method: string;
  amount: string;
  status: string;
  receiptNumber: string | null;
  cashReceived: string | null;
  changeGiven: string | null;
  createdAt: string;
}

interface DailyOrder {
  id: string;
  orderNumber: string;
  status: string;
  paymentStatus: string;
  orderType: string;
  createdAt: string;
  servedAt: string | null;
  tableNumber: string | null;
  tableName: string | null;
  pickupNumber: string | null;
  totalAmount: string;
  subtotalAmount: string;
  taxAmount: string;
  serviceCharge: string;
  discountAmount: string;
  itemCount: number;
  items: DailyOrderItem[];
  payments: DailyOrderPayment[];
  cancellationReason: string | null;
  cancellationNotes: string | null;
}

interface DailyReport {
  businessDate: string;
  currency: string;
  orders: DailyOrder[];
  totals: {
    orderCount: number;
    paidCount: number;
    unpaidCount: number;
    openCount: number;
    cancelledCount: number;
    gross: string;
    paid: string;
    unpaid: string;
    openTotal: string;
    subtotal: string;
    tax: string;
    serviceCharge: string;
    discounts: string;
  };
}

type OrderFilter = 'all' | 'completed' | 'unpaid' | 'open' | 'cancelled';

function formatBusinessDate(value: string): string {
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('en-MY', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function formatTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleTimeString('en-MY', {
    hour: 'numeric',
    minute: '2-digit',
  });
}

export default function DailySalesPage() {
  const [date, setDate] = useState('');
  const [report, setReport] = useState<DailyReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<OrderFilter>('all');
  const [detailsOrderId, setDetailsOrderId] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError('');
    ApiClient.get<{ success: boolean } & DailyReport>(
      '/api/reports/daily/orders',
      { params: date ? { date } : undefined }
    )
      .then((data) => {
        setReport(data);
        if (!date) setDate(data.businessDate);
      })
      .catch((err) =>
        setError(err instanceof Error ? err.message : 'Failed to load sales')
      )
      .finally(() => setLoading(false));
  }, [date]);

  const filteredOrders = useMemo(() => {
    if (!report) return [];
    if (filter === 'all') return report.orders;
    if (filter === 'completed') {
      return report.orders.filter((order) => order.status === 'SERVED');
    }
    if (filter === 'cancelled') {
      return report.orders.filter((order) => order.status === 'CANCELLED');
    }
    if (filter === 'unpaid') {
      return report.orders.filter(
        (order) =>
          order.status === 'SERVED' && order.paymentStatus === 'PENDING'
      );
    }
    return report.orders.filter((order) =>
      ['PENDING', 'CONFIRMED', 'PREPARING', 'READY'].includes(order.status)
    );
  }, [filter, report]);

  const csv = useMemo(() => {
    if (!report) return '';
    const lines = [
      [
        'Order',
        'Time',
        'Type',
        'Table',
        'Status',
        'Payment',
        'Item',
        'Qty',
        'Unit',
        'Total',
        'Discount',
        'Payment method',
      ],
    ];
    report.orders.forEach((order) => {
      if (order.items.length === 0) {
        lines.push([
          order.orderNumber,
          order.createdAt,
          order.orderType,
          order.tableNumber ?? '',
          order.status,
          order.paymentStatus,
          '',
          '',
          '',
          order.totalAmount,
          order.discountAmount,
          order.payments.map((payment) => payment.method).join('|'),
        ]);
      }
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
          order.discountAmount,
          order.payments.map((payment) => payment.method).join('|'),
        ]);
      });
    });
    return lines
      .map((row) =>
        row.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(',')
      )
      .join('\n');
  }, [report]);

  const downloadCsv = () => {
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `daily-sales-${report?.businessDate ?? 'day'}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const cards = report
    ? [
        ['Orders', String(report.totals.orderCount)],
        ['Gross', `${report.currency} ${report.totals.gross}`],
        ['Paid', `${report.currency} ${report.totals.paid}`],
        ['Unpaid served', `${report.currency} ${report.totals.unpaid}`],
        ['Open orders', `${report.currency} ${report.totals.openTotal}`],
        ['Cancelled', String(report.totals.cancelledCount)],
        ['Tax', `${report.currency} ${report.totals.tax}`],
        ['Discounts', `${report.currency} ${report.totals.discounts}`],
      ]
    : [];

  return (
    <div className="min-h-screen bg-gray-50/50 pb-20">
      <div className="mx-auto max-w-7xl space-y-5 px-5 pt-4 md:px-6">
        <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">
                Daily Sales
              </h2>
              <p className="mt-1 text-sm text-gray-500">
                {report
                  ? `${formatBusinessDate(report.businessDate)} · every order and item for the business day`
                  : 'Every order and item for the business day'}
              </p>
            </div>
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
              <Button
                variant="outline"
                onClick={downloadCsv}
                disabled={!report}
              >
                Download CSV
              </Button>
            </div>
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
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
              {cards.map(([label, value]) => (
                <div
                  key={label}
                  className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm"
                >
                  <p className="text-xs uppercase text-gray-500">{label}</p>
                  <p className="mt-1 font-semibold text-gray-900">{value}</p>
                </div>
              ))}
            </div>

            <div className="flex flex-wrap gap-2">
              {(
                [
                  ['all', `All ${report.orders.length}`],
                  [
                    'completed',
                    `Completed ${report.orders.filter((o) => o.status === 'SERVED').length}`,
                  ],
                  [
                    'unpaid',
                    `Unpaid ${report.orders.filter((o) => o.status === 'SERVED' && o.paymentStatus === 'PENDING').length}`,
                  ],
                  [
                    'open',
                    `Open ${report.orders.filter((o) => ['PENDING', 'CONFIRMED', 'PREPARING', 'READY'].includes(o.status)).length}`,
                  ],
                  [
                    'cancelled',
                    `Cancelled ${report.orders.filter((o) => o.status === 'CANCELLED').length}`,
                  ],
                ] as Array<[OrderFilter, string]>
              ).map(([id, label]) => (
                <button
                  key={id}
                  onClick={() => setFilter(id)}
                  className={`rounded-lg border px-3 py-2 text-sm font-medium ${
                    filter === id
                      ? 'border-blue-600 bg-blue-600 text-white'
                      : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="space-y-2">
              {filteredOrders.length === 0 ? (
                <div className="rounded-xl border border-gray-100 bg-white p-10 text-center text-sm text-gray-500">
                  No orders in this view.
                </div>
              ) : (
                filteredOrders.map((order) => (
                  <div
                    key={order.id}
                    className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm"
                  >
                    <div className="flex flex-wrap justify-between gap-2">
                      <div>
                        <p className="font-semibold text-gray-900">
                          {order.orderNumber}
                        </p>
                        <p className="text-xs text-gray-500">
                          {formatTime(order.createdAt)} · {order.orderType} ·{' '}
                          {order.tableNumber
                            ? `Table ${order.tableNumber}`
                            : (order.pickupNumber ?? 'Takeaway')}{' '}
                          · {order.status} · {order.paymentStatus}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-semibold text-gray-900">
                          {report.currency} {order.totalAmount}
                        </p>
                        <button
                          onClick={() => setDetailsOrderId(order.id)}
                          className="text-xs font-medium text-blue-600 hover:text-blue-800"
                        >
                          View details
                        </button>
                      </div>
                    </div>
                    <div className="mt-3 divide-y divide-gray-100 text-sm">
                      {order.items.map((item) => (
                        <div
                          key={item.id}
                          className="flex justify-between py-1"
                        >
                          <span>
                            {item.quantity}× {item.name}
                            {item.options.length > 0 && (
                              <span className="text-xs text-gray-500">
                                {' '}
                                (
                                {item.options
                                  .map((option) => option.name)
                                  .join(', ')}
                                )
                              </span>
                            )}
                          </span>
                          <span>
                            {report.currency} {item.totalAmount}
                          </span>
                        </div>
                      ))}
                    </div>
                    {order.payments.length > 0 && (
                      <p className="mt-2 text-xs text-gray-500">
                        {order.payments
                          .map(
                            (payment) =>
                              `${payment.method} ${payment.amount}${
                                payment.receiptNumber
                                  ? ` · ${payment.receiptNumber}`
                                  : ''
                              }`
                          )
                          .join(' · ')}
                      </p>
                    )}
                    {order.status === 'CANCELLED' && (
                      <p className="mt-1 text-xs font-medium text-red-600">
                        Cancelled
                        {order.cancellationReason
                          ? ` · ${order.cancellationReason.replace(/_/g, ' ')}`
                          : ''}
                        {order.cancellationNotes
                          ? ` · ${order.cancellationNotes}`
                          : ''}
                      </p>
                    )}
                  </div>
                ))
              )}
            </div>
          </>
        ) : null}
      </div>

      {detailsOrderId && (
        <ViewOrderDetailsModal
          orderId={detailsOrderId}
          isOpen={!!detailsOrderId}
          onClose={() => setDetailsOrderId(null)}
          currency={report?.currency ?? 'MYR'}
        />
      )}
    </div>
  );
}
