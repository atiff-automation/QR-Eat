'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ApiClient } from '@/lib/api-client';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';

function formatBusinessDate(value: string): string {
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('en-MY', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

interface ZRow {
  id: string;
  businessDate: string;
  zNumber: string | null;
  closedAt: string | null;
  netSales: string;
  cashExpected: string;
  cashCounted: string | null;
  cashVariance: string | null;
}

export default function ZReportsPage() {
  const [rows, setRows] = useState<ZRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    ApiClient.get<{ success: boolean; rows: ZRow[] }>('/api/reports/z')
      .then((data) => setRows(data.rows))
      .catch((err) =>
        setError(
          err instanceof Error ? err.message : 'Failed to load Z reports'
        )
      )
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="min-h-screen bg-gray-50/50 pb-20">
      <div className="mx-auto max-w-7xl space-y-5 px-5 pt-4 md:px-6">
        <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-900">Z reports</h2>
          <p className="mt-1 text-sm text-gray-500">
            Closed business days and their printable Z snapshots.
          </p>
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
        ) : rows.length === 0 ? (
          <div className="rounded-xl border border-gray-100 bg-white p-10 text-center text-sm text-gray-500">
            No closed business days yet.
          </div>
        ) : (
          <div className="space-y-2">
            {rows.map((row) => (
              <div
                key={row.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gray-100 bg-white p-4 shadow-sm"
              >
                <div>
                  <p className="font-semibold text-gray-900">
                    {formatBusinessDate(row.businessDate)}
                  </p>
                  <p className="text-xs text-gray-500">
                    {row.zNumber ?? 'No Z number'} · Net MYR {row.netSales}
                  </p>
                  <p className="text-xs text-gray-500">
                    Cash expected MYR {row.cashExpected} · counted MYR {row.cashCounted ?? '—'} · variance MYR {row.cashVariance ?? '—'}
                  </p>
                </div>
                <Link
                  href={`/api/counter/business-day/close/${row.id}/pdf`}
                  className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Print / PDF
                </Link>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
