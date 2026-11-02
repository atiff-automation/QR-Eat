'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle, QrCode } from 'lucide-react';
import { useUpdateQrOrdering } from '@/lib/hooks/queries/useRestaurantSettings';

export interface QrOrderingData {
  paused: boolean;
  reason: string;
  pausedAt: string | null;
}

interface QrOrderingSectionProps {
  initialData: QrOrderingData;
  onUpdate?: () => void;
}

export function QrOrderingSection({
  initialData,
  onUpdate,
}: QrOrderingSectionProps) {
  const [formData, setFormData] = useState<QrOrderingData>(initialData);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    setFormData(initialData);
  }, [initialData]);

  const hasChanges =
    formData.paused !== initialData.paused ||
    formData.reason !== initialData.reason;

  const updateMutation = useUpdateQrOrdering();
  const isLoading = updateMutation.isPending;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setSuccess('');

    try {
      await updateMutation.mutateAsync({
        paused: formData.paused,
        reason: formData.paused
          ? formData.reason.trim() || undefined
          : undefined,
      });
      setSuccess(
        formData.paused
          ? 'QR ordering paused. Customers will be told to order at the counter.'
          : 'QR ordering resumed.'
      );
      onUpdate?.();
      setTimeout(() => setSuccess(''), 4000);
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : 'Failed to update QR ordering. Please try again.'
      );
    }
  };

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
      <div className="flex items-center gap-2 mb-2">
        <QrCode className="h-5 w-5 text-blue-600" />
        <h2 className="text-lg font-bold text-gray-900">Online Ordering</h2>
      </div>
      <p className="text-sm text-gray-500 mb-5">
        Pause customer QR ordering for planned maintenance or a known outage.
        The server also pauses QR ordering automatically when no Counter has
        been online recently.
      </p>

      {error && (
        <div className="mb-4 bg-red-50 text-red-600 px-4 py-3 rounded-xl text-sm flex items-center gap-2 border border-red-100">
          <AlertTriangle className="h-4 w-4 flex-shrink-0" />
          {error}
        </div>
      )}

      {success && (
        <div className="mb-4 bg-green-50 text-green-600 px-4 py-3 rounded-xl text-sm flex items-center gap-2 border border-green-100">
          <CheckCircle className="h-4 w-4 flex-shrink-0" />
          {success}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-5">
        <div
          className={`rounded-xl border p-4 ${
            formData.paused
              ? 'border-amber-200 bg-amber-50'
              : 'border-gray-200 bg-gray-50'
          }`}
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="font-semibold text-gray-900">
                {formData.paused
                  ? 'QR ordering is paused'
                  : 'QR ordering is active'}
              </p>
              <p className="text-sm text-gray-600 mt-1">
                {formData.paused
                  ? 'Customers will see “please order at the counter”.'
                  : 'Customers can scan the table QR and place orders.'}
              </p>
              {formData.paused && formData.pausedAt && (
                <p className="text-xs text-gray-500 mt-2">
                  Paused since {new Date(formData.pausedAt).toLocaleString()}
                </p>
              )}
            </div>
            <label className="inline-flex items-center cursor-pointer select-none">
              <input
                type="checkbox"
                className="sr-only peer"
                checked={formData.paused}
                onChange={(event) =>
                  setFormData((prev) => ({
                    ...prev,
                    paused: event.target.checked,
                  }))
                }
                disabled={isLoading}
              />
              <span className="w-11 h-6 bg-gray-300 peer-checked:bg-amber-500 rounded-full transition-colors relative after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-transform peer-checked:after:translate-x-5" />
            </label>
          </div>
        </div>

        {formData.paused && (
          <div>
            <label className="block text-xs font-semibold uppercase text-gray-500 mb-1">
              Reason (optional)
            </label>
            <input
              type="text"
              value={formData.reason}
              onChange={(event) =>
                setFormData((prev) => ({
                  ...prev,
                  reason: event.target.value.slice(0, 200),
                }))
              }
              disabled={isLoading}
              placeholder="e.g. Internet maintenance, private event"
              className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none font-medium text-gray-900"
            />
            <p className="text-xs text-gray-500 mt-1">
              Internal note. Customers only see the standard pause message.
            </p>
          </div>
        )}

        <div className="rounded-xl border border-blue-100 bg-blue-50 p-4 text-sm text-blue-800">
          <p className="font-semibold">Automatic pause</p>
          <p className="mt-1">
            If the Counter has not contacted the server for about three minutes,
            QR ordering pauses automatically. It resumes after the Counter is
            online again. This cannot be overridden from this page.
          </p>
        </div>

        <div className="pt-1">
          <button
            type="submit"
            disabled={isLoading || !hasChanges}
            className="w-full md:w-auto px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg shadow-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? 'Saving...' : 'Save changes'}
          </button>
        </div>
      </form>
    </div>
  );
}
