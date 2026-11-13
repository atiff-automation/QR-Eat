/**
 * Rewards (loyalty) settings section for `/dashboard/settings`.
 *
 * Follows `PaymentMethodsSection`: `initialData` + `onUpdate`, local form
 * state, `hasChanges`, success/error banners. The PATCH body never contains
 * `noticeTextHash`; the server derives it.
 *
 * Settings changes apply to new visit card cycles only. A card already in
 * progress keeps the rules it started with; the copy below says so explicitly.
 */

'use client';

import { useState } from 'react';
import {
  AlertTriangle,
  CheckCircle,
  Gift,
  Info,
  ShieldOff,
} from 'lucide-react';
import { useRole } from '@/components/rbac/RoleProvider';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { CurrencyInput } from '@/components/ui/CurrencyInput';
import {
  buildLoyaltySettingsForm,
  buildLoyaltySettingsPayload,
  useUpdateLoyaltySettings,
  validateLoyaltySettingsForm,
  type LoyaltySettingsErrors,
  type LoyaltySettingsFormValues,
} from '@/lib/hooks/queries/useLoyaltySettings';

interface LoyaltySectionProps {
  initialData: LoyaltySettingsFormValues;
  onUpdate: () => void;
  /** Restaurant currency for money fields. Defaults to MYR. */
  currency?: string;
}

type Banner = { kind: 'success' | 'error'; message: string } | null;

const INPUT_CLASS =
  'h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-gray-900 outline-none focus:ring-2 focus:ring-blue-500';
const CURRENCY_CLASS =
  'h-10 rounded-lg border border-gray-300 bg-white px-3 text-gray-900 outline-none focus:ring-2 focus:ring-blue-500';

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} role="alert" className="mt-1 text-xs font-medium text-red-700">
      {message}
    </p>
  );
}

/** Permission-denied state. Exported for state tests. */
export function LoyaltyPermissionDenied() {
  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 p-6">
      <div className="flex items-start gap-3">
        <ShieldOff className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-700" />
        <div>
          <h2 className="text-lg font-semibold text-amber-900">
            Rewards settings are owner-only
          </h2>
          <p className="mt-1 text-sm text-amber-800">
            You need the loyalty:configure permission to view or change visit
            card rules, reward values and the customer notice.
          </p>
        </div>
      </div>
    </div>
  );
}

export function LoyaltySection({
  initialData,
  onUpdate,
  currency = 'MYR',
}: LoyaltySectionProps) {
  const { hasPermission, isLoading: roleLoading } = useRole();
  const canConfigure = hasPermission('loyalty:configure');

  const [form, setForm] = useState<LoyaltySettingsFormValues>(initialData);
  const [errors, setErrors] = useState<LoyaltySettingsErrors>({});
  const [banner, setBanner] = useState<Banner>(null);
  const mutation = useUpdateLoyaltySettings();

  if (roleLoading) {
    return <LoadingSpinner size="sm" message="Checking permissions..." />;
  }

  if (!canConfigure) {
    return <LoyaltyPermissionDenied />;
  }

  const hasChanges = JSON.stringify(form) !== JSON.stringify(initialData);

  const setField = <K extends keyof LoyaltySettingsFormValues>(
    key: K,
    value: LoyaltySettingsFormValues[K]
  ) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => ({ ...prev, [key]: undefined, form: undefined }));
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBanner(null);

    const nextErrors = validateLoyaltySettingsForm(form);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      setBanner({
        kind: 'error',
        message:
          nextErrors.form ?? 'Please fix the highlighted fields before saving.',
      });
      return;
    }

    try {
      const result = await mutation.mutateAsync(
        buildLoyaltySettingsPayload(form)
      );
      if (result?.settings) {
        setForm(buildLoyaltySettingsForm(result.settings));
      }
      setBanner({
        kind: 'success',
        message:
          'Rewards settings saved. New visit card cycles will use these rules.',
      });
      onUpdate();
    } catch (error) {
      setBanner({
        kind: 'error',
        message:
          error instanceof Error
            ? error.message
            : 'Could not save rewards settings. Please try again.',
      });
    }
  };

  return (
    <div className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center gap-2">
        <Gift className="h-5 w-5 text-blue-600" />
        <h2 className="text-lg font-bold text-gray-900">Rewards</h2>
      </div>

      <div className="mb-4 flex items-start gap-2 rounded-lg border border-blue-100 bg-blue-50 p-3">
        <Info className="mt-0.5 h-4 w-4 flex-shrink-0 text-blue-600" />
        <p className="text-xs text-blue-800">
          Changes apply to new visit card cycles. A visit card already in
          progress keeps the rules it started with.
        </p>
      </div>

      {banner?.kind === 'error' && (
        <div
          role="alert"
          className="mb-4 flex items-start gap-2 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
          <span>{banner.message}</span>
        </div>
      )}

      {banner?.kind === 'success' && (
        <div
          role="status"
          className="mb-4 flex items-start gap-2 rounded-xl border border-green-100 bg-green-50 px-4 py-3 text-sm text-green-700"
        >
          <CheckCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
          <span>{banner.message}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-5" noValidate>
        <label className="flex min-h-11 items-center justify-between rounded-lg border border-gray-100 bg-gray-50 p-3">
          <span>
            <span className="block text-sm font-medium text-gray-900">
              Enable rewards
            </span>
            <span className="mt-0.5 block text-xs text-gray-500">
              When off, customers earn no visits and no reward is applied.
            </span>
          </span>
          <input
            type="checkbox"
            checked={form.enabled}
            onChange={(event) => setField('enabled', event.target.checked)}
            className="h-5 w-5 rounded border-gray-300 text-blue-600 focus:ring-2 focus:ring-blue-500"
            disabled={mutation.isPending}
            aria-label="Enable rewards"
          />
        </label>

        <fieldset className="space-y-4">
          <legend className="text-sm font-semibold text-gray-900">
            Visit card rules
          </legend>

          <div>
            <label
              htmlFor="loyalty-visits-required"
              className="mb-1 block text-xs font-semibold uppercase text-gray-500"
            >
              Visits required
            </label>
            <input
              id="loyalty-visits-required"
              type="number"
              min={2}
              max={10}
              step={1}
              inputMode="numeric"
              value={form.visitsRequired}
              onChange={(event) =>
                setField('visitsRequired', event.target.value)
              }
              className={INPUT_CLASS}
              disabled={mutation.isPending}
              aria-invalid={Boolean(errors.visitsRequired)}
              aria-describedby={
                errors.visitsRequired
                  ? 'loyalty-visits-required-error'
                  : undefined
              }
            />
            <p className="mt-1 text-xs text-gray-500">
              How many counted visits complete a card. Allowed range: 2 to 10.
            </p>
            <FieldError
              id="loyalty-visits-required-error"
              message={errors.visitsRequired}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label
                htmlFor="loyalty-reward-type"
                className="mb-1 block text-xs font-semibold uppercase text-gray-500"
              >
                Reward type
              </label>
              <select
                id="loyalty-reward-type"
                value={form.rewardType}
                onChange={(event) =>
                  setField(
                    'rewardType',
                    event.target
                      .value as LoyaltySettingsFormValues['rewardType']
                  )
                }
                className={INPUT_CLASS}
                disabled={mutation.isPending}
              >
                <option value="PERCENT">Percentage off</option>
                <option value="FIXED">Fixed amount off</option>
              </select>
            </div>

            <div>
              <label
                htmlFor="loyalty-reward-value"
                className="mb-1 block text-xs font-semibold uppercase text-gray-500"
              >
                {form.rewardType === 'PERCENT'
                  ? 'Reward value (%)'
                  : 'Reward value'}
              </label>
              {form.rewardType === 'PERCENT' ? (
                <input
                  id="loyalty-reward-value"
                  type="number"
                  min={0}
                  max={100}
                  step={0.01}
                  inputMode="decimal"
                  value={form.rewardValue}
                  onChange={(event) =>
                    setField('rewardValue', event.target.value)
                  }
                  className={INPUT_CLASS}
                  disabled={mutation.isPending}
                  aria-invalid={Boolean(errors.rewardValue)}
                  aria-describedby={
                    errors.rewardValue
                      ? 'loyalty-reward-value-error'
                      : undefined
                  }
                />
              ) : (
                <CurrencyInput
                  id="loyalty-reward-value"
                  ariaLabel="Reward value"
                  ariaInvalid={Boolean(errors.rewardValue)}
                  ariaDescribedBy={
                    errors.rewardValue
                      ? 'loyalty-reward-value-error'
                      : undefined
                  }
                  value={Number(form.rewardValue) || 0}
                  onChange={(value) =>
                    setField('rewardValue', value.toFixed(2))
                  }
                  currency={currency}
                  className={CURRENCY_CLASS}
                  disabled={mutation.isPending}
                />
              )}
              <FieldError
                id="loyalty-reward-value-error"
                message={errors.rewardValue}
              />
            </div>

            <div>
              <label
                htmlFor="loyalty-max-discount"
                className="mb-1 block text-xs font-semibold uppercase text-gray-500"
              >
                Maximum discount
              </label>
              <CurrencyInput
                id="loyalty-max-discount"
                ariaLabel="Maximum discount"
                ariaInvalid={Boolean(errors.maxDiscount)}
                ariaDescribedBy={
                  errors.maxDiscount ? 'loyalty-max-discount-error' : undefined
                }
                value={Number(form.maxDiscount) || 0}
                onChange={(value) => setField('maxDiscount', value.toFixed(2))}
                currency={currency}
                className={CURRENCY_CLASS}
                disabled={mutation.isPending}
              />
              <p className="mt-1 text-xs text-gray-500">
                The most a reward can take off one bill.
              </p>
              <FieldError
                id="loyalty-max-discount-error"
                message={errors.maxDiscount}
              />
            </div>

            <div>
              <label
                htmlFor="loyalty-min-daily-spend"
                className="mb-1 block text-xs font-semibold uppercase text-gray-500"
              >
                Minimum daily spend
              </label>
              <CurrencyInput
                id="loyalty-min-daily-spend"
                ariaLabel="Minimum daily spend"
                ariaInvalid={Boolean(errors.minDailySpend)}
                ariaDescribedBy={
                  errors.minDailySpend
                    ? 'loyalty-min-daily-spend-error'
                    : undefined
                }
                value={Number(form.minDailySpend) || 0}
                onChange={(value) =>
                  setField('minDailySpend', value.toFixed(2))
                }
                currency={currency}
                className={CURRENCY_CLASS}
                disabled={mutation.isPending}
              />
              <p className="mt-1 text-xs text-gray-500">
                A day below this amount does not count as a visit. Allowed
                range: 0 to 1000.
              </p>
              <FieldError
                id="loyalty-min-daily-spend-error"
                message={errors.minDailySpend}
              />
            </div>
          </div>
        </fieldset>

        <fieldset className="space-y-4">
          <legend className="text-sm font-semibold text-gray-900">
            Labels
          </legend>

          <div>
            <label
              htmlFor="loyalty-reward-label"
              className="mb-1 block text-xs font-semibold uppercase text-gray-500"
            >
              Reward label
            </label>
            <input
              id="loyalty-reward-label"
              type="text"
              maxLength={24}
              value={form.rewardLabel}
              onChange={(event) => setField('rewardLabel', event.target.value)}
              className={INPUT_CLASS}
              disabled={mutation.isPending}
              aria-invalid={Boolean(errors.rewardLabel)}
              aria-describedby={
                errors.rewardLabel ? 'loyalty-reward-label-error' : undefined
              }
            />
            <p className="mt-1 text-xs text-gray-500">
              Shown to customers, for example “10% off”. Maximum 24 characters.
            </p>
            <FieldError
              id="loyalty-reward-label-error"
              message={errors.rewardLabel}
            />
          </div>

          <div>
            <label
              htmlFor="loyalty-receipt-label"
              className="mb-1 block text-xs font-semibold uppercase text-gray-500"
            >
              Receipt label
            </label>
            <input
              id="loyalty-receipt-label"
              type="text"
              maxLength={20}
              value={form.receiptLabel}
              onChange={(event) => setField('receiptLabel', event.target.value)}
              className={INPUT_CLASS}
              disabled={mutation.isPending}
              aria-invalid={Boolean(errors.receiptLabel)}
              aria-describedby={
                errors.receiptLabel ? 'loyalty-receipt-label-error' : undefined
              }
            />
            <p className="mt-1 text-xs text-gray-500">
              Printed on receipts. ASCII only, maximum 20 characters.
            </p>
            <FieldError
              id="loyalty-receipt-label-error"
              message={errors.receiptLabel}
            />
          </div>
        </fieldset>

        <fieldset className="space-y-4">
          <legend className="text-sm font-semibold text-gray-900">
            Customer notice
          </legend>
          <p className="text-xs text-gray-500">
            The server stores a hash of the notice text and uses it to validate
            consent. You do not send the hash from this form.
          </p>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label
                htmlFor="loyalty-notice-version"
                className="mb-1 block text-xs font-semibold uppercase text-gray-500"
              >
                Notice version
              </label>
              <input
                id="loyalty-notice-version"
                type="text"
                maxLength={50}
                value={form.noticeVersion}
                onChange={(event) =>
                  setField('noticeVersion', event.target.value)
                }
                className={INPUT_CLASS}
                placeholder="2026-11"
                disabled={mutation.isPending}
                aria-invalid={Boolean(errors.noticeVersion)}
                aria-describedby={
                  errors.noticeVersion
                    ? 'loyalty-notice-version-error'
                    : undefined
                }
              />
              <FieldError
                id="loyalty-notice-version-error"
                message={errors.noticeVersion}
              />
            </div>

            <div>
              <label
                htmlFor="loyalty-privacy-url"
                className="mb-1 block text-xs font-semibold uppercase text-gray-500"
              >
                Privacy URL
              </label>
              <input
                id="loyalty-privacy-url"
                type="url"
                maxLength={500}
                value={form.privacyUrl}
                onChange={(event) => setField('privacyUrl', event.target.value)}
                className={INPUT_CLASS}
                placeholder="https://example.com/privacy"
                disabled={mutation.isPending}
                aria-invalid={Boolean(errors.privacyUrl)}
                aria-describedby={
                  errors.privacyUrl ? 'loyalty-privacy-url-error' : undefined
                }
              />
              <FieldError
                id="loyalty-privacy-url-error"
                message={errors.privacyUrl}
              />
            </div>
          </div>

          <div>
            <label
              htmlFor="loyalty-notice-text"
              className="mb-1 block text-xs font-semibold uppercase text-gray-500"
            >
              Notice text
            </label>
            <textarea
              id="loyalty-notice-text"
              rows={4}
              maxLength={5000}
              value={form.noticeText}
              onChange={(event) => setField('noticeText', event.target.value)}
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900 outline-none focus:ring-2 focus:ring-blue-500"
              disabled={mutation.isPending}
              aria-invalid={Boolean(errors.noticeText)}
              aria-describedby={
                errors.noticeText ? 'loyalty-notice-text-error' : undefined
              }
            />
            <FieldError
              id="loyalty-notice-text-error"
              message={errors.noticeText}
            />
          </div>

          <div>
            <label
              htmlFor="loyalty-terms-text"
              className="mb-1 block text-xs font-semibold uppercase text-gray-500"
            >
              Terms text (optional)
            </label>
            <textarea
              id="loyalty-terms-text"
              rows={2}
              maxLength={140}
              value={form.termsText}
              onChange={(event) => setField('termsText', event.target.value)}
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900 outline-none focus:ring-2 focus:ring-blue-500"
              disabled={mutation.isPending}
              aria-invalid={Boolean(errors.termsText)}
              aria-describedby={
                errors.termsText ? 'loyalty-terms-text-error' : undefined
              }
            />
            <FieldError
              id="loyalty-terms-text-error"
              message={errors.termsText}
            />
          </div>
        </fieldset>

        <div className="pt-1">
          <button
            type="submit"
            disabled={mutation.isPending || !hasChanges}
            className="min-h-11 w-full rounded-lg bg-blue-600 px-6 py-2.5 font-medium text-white shadow-sm transition-all hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 md:w-auto"
          >
            {mutation.isPending ? 'Saving...' : 'Save rewards settings'}
          </button>
        </div>
      </form>
    </div>
  );
}
