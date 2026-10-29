/**
 * Business Day & Cash Drawer settings.
 * Timezone, cutoff, default opening float and drawer enablement.
 */

'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle, Clock } from 'lucide-react';
import { ApiClient } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-client';
import { Button } from '@/components/ui/Button';

interface BusinessDaySettings {
  timezone: string;
  businessDayCloseTime: string;
  openingFloatDefault: string;
  cashDrawerEnabled: boolean;
}

interface Props {
  initialData: BusinessDaySettings;
  onUpdate: () => void;
}

export function BusinessDaySection({ initialData, onUpdate }: Props) {
  const [form, setForm] = useState(initialData);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async () => {
      const payload = {
        timezone: form.timezone.trim(),
        businessDayCloseTime: form.businessDayCloseTime,
        openingFloatDefault: Number(form.openingFloatDefault) || 0,
        cashDrawerEnabled: form.cashDrawerEnabled,
      };
      return ApiClient.put('/settings/restaurant/business-day', payload);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: queryKeys.restaurants.settings,
      });
      setSuccess('Business-day settings updated.');
      onUpdate();
      setTimeout(() => setSuccess(''), 3000);
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : 'Failed to save settings.');
    },
  });

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setSuccess('');
    mutation.mutate();
  };

  return (
    <div className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
      <div className="mb-5 flex items-center gap-2">
        <Clock className="h-5 w-5 text-blue-600" />
        <h2 className="text-lg font-bold text-gray-900">
          Business Day & Cash Drawer
        </h2>
      </div>

      {error && (
        <div className="mb-4 flex items-center gap-2 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600">
          <AlertTriangle className="h-4 w-4 flex-shrink-0" />
          {error}
        </div>
      )}
      {success && (
        <div className="mb-4 flex items-center gap-2 rounded-xl border border-green-100 bg-green-50 px-4 py-3 text-sm text-green-700">
          <CheckCircle className="h-4 w-4 flex-shrink-0" />
          {success}
        </div>
      )}

      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className="mb-1 block text-xs font-semibold uppercase text-gray-500">
            Restaurant timezone
          </label>
          <input
            value={form.timezone}
            onChange={(event) =>
              setForm((prev) => ({ ...prev, timezone: event.target.value }))
            }
            placeholder="Asia/Kuala_Lumpur"
            className="h-10 w-full rounded-lg border border-gray-300 bg-white px-3 font-medium text-gray-900 outline-none focus:ring-2 focus:ring-blue-500"
            disabled={mutation.isPending}
          />
          <p className="mt-1 text-xs text-gray-500">
            IANA timezone. Used for business-day boundaries and reports.
          </p>
        </div>

        <div>
          <label className="mb-1 block text-xs font-semibold uppercase text-gray-500">
            Business-day cutoff
          </label>
          <input
            type="time"
            value={form.businessDayCloseTime}
            onChange={(event) =>
              setForm((prev) => ({
                ...prev,
                businessDayCloseTime: event.target.value,
              }))
            }
            className="h-10 w-full rounded-lg border border-gray-300 bg-white px-3 font-medium text-gray-900 outline-none focus:ring-2 focus:ring-blue-500"
            disabled={mutation.isPending}
          />
          <p className="mt-1 text-xs text-gray-500">
            Default 04:00. This is a warning boundary; Close Day remains a
            manager action.
          </p>
        </div>

        <div>
          <label className="mb-1 block text-xs font-semibold uppercase text-gray-500">
            Default opening float
          </label>
          <input
            type="number"
            min="0"
            step="0.01"
            value={form.openingFloatDefault}
            onChange={(event) =>
              setForm((prev) => ({
                ...prev,
                openingFloatDefault: event.target.value,
              }))
            }
            className="h-10 w-full rounded-lg border border-gray-300 bg-white px-3 font-medium text-gray-900 outline-none focus:ring-2 focus:ring-blue-500"
            disabled={mutation.isPending}
          />
        </div>

        <label className="flex items-center justify-between rounded-lg border border-gray-100 bg-gray-50 p-3">
          <span>
            <span className="block text-sm font-medium text-gray-900">
              Cash drawer enabled
            </span>
            <span className="mt-0.5 block text-xs text-gray-500">
              Require opening float confirmation and counted cash at close.
            </span>
          </span>
          <input
            type="checkbox"
            checked={form.cashDrawerEnabled}
            onChange={(event) =>
              setForm((prev) => ({
                ...prev,
                cashDrawerEnabled: event.target.checked,
              }))
            }
            className="h-5 w-5 rounded border-gray-300 text-blue-600"
            disabled={mutation.isPending}
          />
        </label>

        <Button type="submit" loading={mutation.isPending}>
          Save changes
        </Button>
      </form>
    </div>
  );
}
