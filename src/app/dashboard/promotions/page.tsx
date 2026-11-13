/**
 * Owner promotions page — `/dashboard/promotions`.
 *
 * List, create, edit and soft-delete promotions at ORDER, CATEGORY and ITEM
 * scope (§18.20.7). Category and item choices come from the restaurant's own
 * menu. Every mutation sends a fresh `Idempotency-Key`.
 *
 * Money is rendered from server values and sent as 2dp strings. `startsAt`
 * and `endsAt` are date-only inputs; the server expands `endsAt` to the
 * restaurant-local end of day.
 */

'use client';

import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle,
  Pencil,
  Plus,
  Trash2,
  X,
} from 'lucide-react';
import { useRole } from '@/components/rbac/RoleProvider';
import { Button } from '@/components/ui/Button';
import { ConfirmationModal } from '@/components/ui/ConfirmationModal';
import { CurrencyInput } from '@/components/ui/CurrencyInput';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import {
  emptyPromotionForm,
  PromotionsEmptyState,
  PromotionsErrorState,
  PromotionsPermissionDenied,
} from './PromotionsStates';
import { useRestaurantSettings } from '@/lib/hooks/queries/useRestaurantSettings';
import {
  useMenuCategories,
  type MenuCategory,
} from '@/lib/hooks/queries/useMenu';
import {
  buildPromotionForm,
  buildPromotionPayload,
  useCreatePromotion,
  useDeletePromotion,
  usePromotions,
  useUpdatePromotion,
  validatePromotionForm,
  type Promotion,
  type PromotionErrors,
  type PromotionFormValues,
} from '@/lib/hooks/queries/usePromotions';

const INPUT_CLASS =
  'h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-gray-900 outline-none focus:ring-2 focus:ring-blue-500';
const CURRENCY_CLASS =
  'h-10 rounded-lg border border-gray-300 bg-white px-3 text-gray-900 outline-none focus:ring-2 focus:ring-blue-500';

type Banner = { kind: 'success' | 'error'; message: string } | null;

function formatMoney(value: string, currency: string): string {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return value;
  return new Intl.NumberFormat('en-MY', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

function formatWindow(
  startsAt: string,
  endsAt: string,
  timezone: string
): string {
  const start = new Date(startsAt);
  const end = new Date(endsAt);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return `${startsAt} – ${endsAt}`;
  }
  try {
    const formatter = new Intl.DateTimeFormat('en-MY', {
      timeZone: timezone,
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
    return `${formatter.format(start)} – ${formatter.format(end)}`;
  } catch {
    return `${start.toISOString().slice(0, 10)} – ${end
      .toISOString()
      .slice(0, 10)}`;
  }
}

function scopeLabel(scope: Promotion['scope']): string {
  if (scope === 'ORDER') return 'Whole order';
  if (scope === 'CATEGORY') return 'Category';
  return 'Item';
}

function typeValueLabel(promotion: Promotion, currency: string): string {
  if (promotion.type === 'PERCENT') {
    return `${promotion.value}% off`;
  }
  return `${formatMoney(promotion.value, currency)} off`;
}

function promotionStatus(promotion: Promotion): {
  label: string;
  className: string;
} {
  if (!promotion.isActive) {
    return { label: 'Inactive', className: 'bg-gray-100 text-gray-700' };
  }
  const now = Date.now();
  if (new Date(promotion.startsAt).getTime() > now) {
    return { label: 'Scheduled', className: 'bg-amber-100 text-amber-800' };
  }
  if (new Date(promotion.endsAt).getTime() <= now) {
    return { label: 'Expired', className: 'bg-gray-100 text-gray-700' };
  }
  return { label: 'Active', className: 'bg-green-100 text-green-800' };
}

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} role="alert" className="mt-1 text-xs font-medium text-red-700">
      {message}
    </p>
  );
}

function PromotionForm({
  form,
  errors,
  categories,
  currency,
  isSaving,
  isEditing,
  onChange,
  onSubmit,
  onCancel,
}: {
  form: PromotionFormValues;
  errors: PromotionErrors;
  categories: MenuCategory[];
  currency: string;
  isSaving: boolean;
  isEditing: boolean;
  onChange: <K extends keyof PromotionFormValues>(
    key: K,
    value: PromotionFormValues[K]
  ) => void;
  onSubmit: (event: React.FormEvent) => void;
  onCancel: () => void;
}) {
  const items = useMemo(
    () => categories.flatMap((category) => category.menuItems),
    [categories]
  );

  const toggle = (key: 'categoryIds' | 'itemIds', id: string) => {
    const current = form[key];
    onChange(
      key,
      current.includes(id)
        ? current.filter((value) => value !== id)
        : [...current, id]
    );
  };

  return (
    <div className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-lg font-bold text-gray-900">
          {isEditing ? 'Edit promotion' : 'New promotion'}
        </h2>
        <button
          type="button"
          onClick={onCancel}
          className="min-h-11 min-w-11 rounded-lg text-gray-500 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
          aria-label="Close promotion form"
          title="Close promotion form"
        >
          <X className="mx-auto h-5 w-5" />
        </button>
      </div>

      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        {errors.form && (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700"
          >
            <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
            <span>{errors.form}</span>
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label
              htmlFor="promotion-name"
              className="mb-1 block text-xs font-semibold uppercase text-gray-500"
            >
              Name
            </label>
            <input
              id="promotion-name"
              type="text"
              maxLength={80}
              value={form.name}
              onChange={(event) => onChange('name', event.target.value)}
              className={INPUT_CLASS}
              disabled={isSaving}
              aria-invalid={Boolean(errors.name)}
              aria-describedby={
                errors.name ? 'promotion-name-error' : undefined
              }
            />
            <FieldError id="promotion-name-error" message={errors.name} />
          </div>

          <div>
            <label
              htmlFor="promotion-receipt-label"
              className="mb-1 block text-xs font-semibold uppercase text-gray-500"
            >
              Receipt label
            </label>
            <input
              id="promotion-receipt-label"
              type="text"
              maxLength={20}
              value={form.receiptLabel}
              onChange={(event) => onChange('receiptLabel', event.target.value)}
              className={INPUT_CLASS}
              disabled={isSaving}
              aria-invalid={Boolean(errors.receiptLabel)}
              aria-describedby={
                errors.receiptLabel
                  ? 'promotion-receipt-label-error'
                  : undefined
              }
            />
            <p className="mt-1 text-xs text-gray-500">
              Printed on receipts. ASCII only, maximum 20 characters.
            </p>
            <FieldError
              id="promotion-receipt-label-error"
              message={errors.receiptLabel}
            />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label
              htmlFor="promotion-scope"
              className="mb-1 block text-xs font-semibold uppercase text-gray-500"
            >
              Scope
            </label>
            <select
              id="promotion-scope"
              value={form.scope}
              onChange={(event) =>
                onChange(
                  'scope',
                  event.target.value as PromotionFormValues['scope']
                )
              }
              className={INPUT_CLASS}
              disabled={isSaving}
            >
              <option value="ORDER">Whole order</option>
              <option value="CATEGORY">Category</option>
              <option value="ITEM">Item</option>
            </select>
          </div>

          <div>
            <label
              htmlFor="promotion-type"
              className="mb-1 block text-xs font-semibold uppercase text-gray-500"
            >
              Type
            </label>
            <select
              id="promotion-type"
              value={form.type}
              onChange={(event) =>
                onChange(
                  'type',
                  event.target.value as PromotionFormValues['type']
                )
              }
              className={INPUT_CLASS}
              disabled={isSaving}
            >
              <option value="PERCENT">Percentage off</option>
              <option value="FIXED">Fixed amount off</option>
            </select>
          </div>

          <div>
            <label
              htmlFor="promotion-value"
              className="mb-1 block text-xs font-semibold uppercase text-gray-500"
            >
              {form.type === 'PERCENT' ? 'Value (%)' : 'Value'}
            </label>
            {form.type === 'PERCENT' ? (
              <input
                id="promotion-value"
                type="number"
                min={0}
                max={100}
                step={0.01}
                inputMode="decimal"
                value={form.value}
                onChange={(event) => onChange('value', event.target.value)}
                className={INPUT_CLASS}
                disabled={isSaving}
                aria-invalid={Boolean(errors.value)}
                aria-describedby={
                  errors.value ? 'promotion-value-error' : undefined
                }
              />
            ) : (
              <CurrencyInput
                id="promotion-value"
                ariaLabel="Promotion value"
                ariaInvalid={Boolean(errors.value)}
                ariaDescribedBy={
                  errors.value ? 'promotion-value-error' : undefined
                }
                value={Number(form.value) || 0}
                onChange={(value) => onChange('value', value.toFixed(2))}
                currency={currency}
                className={CURRENCY_CLASS}
                disabled={isSaving}
              />
            )}
            <FieldError id="promotion-value-error" message={errors.value} />
          </div>
        </div>

        {form.scope === 'CATEGORY' && (
          <fieldset className="rounded-lg border border-gray-100 bg-gray-50 p-3">
            <legend className="px-1 text-sm font-medium text-gray-900">
              Categories
            </legend>
            {categories.length === 0 ? (
              <p className="mt-1 text-sm text-gray-500">
                No menu categories yet. Add menu categories before creating a
                category promotion.
              </p>
            ) : (
              <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                {categories.map((category) => (
                  <label
                    key={category.id}
                    className="flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700"
                  >
                    <input
                      type="checkbox"
                      checked={form.categoryIds.includes(category.id)}
                      onChange={() => toggle('categoryIds', category.id)}
                      className="h-4 w-4 rounded border-gray-300 text-blue-600"
                      disabled={isSaving}
                    />
                    <span className="flex-1">{category.name}</span>
                  </label>
                ))}
              </div>
            )}
            <FieldError
              id="promotion-category-ids-error"
              message={errors.categoryIds}
            />
          </fieldset>
        )}

        {form.scope === 'ITEM' && (
          <fieldset className="rounded-lg border border-gray-100 bg-gray-50 p-3">
            <legend className="px-1 text-sm font-medium text-gray-900">
              Items
            </legend>
            {items.length === 0 ? (
              <p className="mt-1 text-sm text-gray-500">
                No menu items yet. Add menu items before creating an item
                promotion.
              </p>
            ) : (
              <div className="mt-2 space-y-3">
                {categories.map((category) => {
                  const categoryItems = category.menuItems;
                  if (categoryItems.length === 0) return null;
                  return (
                    <div key={category.id}>
                      <p className="text-xs font-semibold uppercase text-gray-500">
                        {category.name}
                      </p>
                      <div className="mt-1 grid grid-cols-1 gap-2 sm:grid-cols-2">
                        {categoryItems.map((item) => (
                          <label
                            key={item.id}
                            className="flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700"
                          >
                            <input
                              type="checkbox"
                              checked={form.itemIds.includes(item.id)}
                              onChange={() => toggle('itemIds', item.id)}
                              className="h-4 w-4 rounded border-gray-300 text-blue-600"
                              disabled={isSaving}
                            />
                            <span className="flex-1">{item.name}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            <FieldError
              id="promotion-item-ids-error"
              message={errors.itemIds}
            />
          </fieldset>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label
              htmlFor="promotion-min-spend"
              className="mb-1 block text-xs font-semibold uppercase text-gray-500"
            >
              Minimum spend
            </label>
            <CurrencyInput
              id="promotion-min-spend"
              ariaLabel="Minimum spend"
              ariaInvalid={Boolean(errors.minSpend)}
              ariaDescribedBy={
                errors.minSpend ? 'promotion-min-spend-error' : undefined
              }
              value={Number(form.minSpend) || 0}
              onChange={(value) => onChange('minSpend', value.toFixed(2))}
              currency={currency}
              className={CURRENCY_CLASS}
              disabled={isSaving}
            />
            <FieldError
              id="promotion-min-spend-error"
              message={errors.minSpend}
            />
          </div>

          <div>
            <label
              htmlFor="promotion-max-discount"
              className="mb-1 block text-xs font-semibold uppercase text-gray-500"
            >
              Maximum discount
            </label>
            <CurrencyInput
              id="promotion-max-discount"
              ariaLabel="Maximum discount"
              ariaInvalid={Boolean(errors.maxDiscount)}
              ariaDescribedBy={
                errors.maxDiscount ? 'promotion-max-discount-error' : undefined
              }
              value={Number(form.maxDiscount) || 0}
              onChange={(value) => onChange('maxDiscount', value.toFixed(2))}
              currency={currency}
              className={CURRENCY_CLASS}
              disabled={isSaving}
            />
            <FieldError
              id="promotion-max-discount-error"
              message={errors.maxDiscount}
            />
          </div>

          <div>
            <label
              htmlFor="promotion-starts-at"
              className="mb-1 block text-xs font-semibold uppercase text-gray-500"
            >
              Starts
            </label>
            <input
              id="promotion-starts-at"
              type="date"
              value={form.startsAt}
              onChange={(event) => onChange('startsAt', event.target.value)}
              className={INPUT_CLASS}
              disabled={isSaving}
              aria-invalid={Boolean(errors.startsAt)}
              aria-describedby={
                errors.startsAt ? 'promotion-starts-at-error' : undefined
              }
            />
            <FieldError
              id="promotion-starts-at-error"
              message={errors.startsAt}
            />
          </div>

          <div>
            <label
              htmlFor="promotion-ends-at"
              className="mb-1 block text-xs font-semibold uppercase text-gray-500"
            >
              Ends
            </label>
            <input
              id="promotion-ends-at"
              type="date"
              value={form.endsAt}
              onChange={(event) => onChange('endsAt', event.target.value)}
              className={INPUT_CLASS}
              disabled={isSaving}
              aria-invalid={Boolean(errors.endsAt)}
              aria-describedby={
                errors.endsAt ? 'promotion-ends-at-error' : undefined
              }
            />
            <p className="mt-1 text-xs text-gray-500">
              The promotion runs to the end of this day.
            </p>
            <FieldError id="promotion-ends-at-error" message={errors.endsAt} />
          </div>
        </div>

        <label className="flex min-h-11 items-center justify-between rounded-lg border border-gray-100 bg-gray-50 p-3">
          <span>
            <span className="block text-sm font-medium text-gray-900">
              Active
            </span>
            <span className="mt-0.5 block text-xs text-gray-500">
              Inactive promotions are kept but never applied.
            </span>
          </span>
          <input
            type="checkbox"
            checked={form.isActive}
            onChange={(event) => onChange('isActive', event.target.checked)}
            className="h-5 w-5 rounded border-gray-300 text-blue-600 focus:ring-2 focus:ring-blue-500"
            disabled={isSaving}
            aria-label="Promotion is active"
          />
        </label>

        <div className="flex flex-col gap-2 pt-1 sm:flex-row">
          <Button type="submit" loading={isSaving} className="min-h-11">
            {isEditing ? 'Save promotion' : 'Create promotion'}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={onCancel}
            className="min-h-11"
            disabled={isSaving}
          >
            Cancel
          </Button>
        </div>
      </form>
    </div>
  );
}

export default function PromotionsPage() {
  const { hasPermission, isLoading: roleLoading } = useRole();
  const canManage = hasPermission('promotions:manage');
  const queriesEnabled = !roleLoading && canManage;

  const promotionsQuery = usePromotions({}, { enabled: queriesEnabled });
  const menuQuery = useMenuCategories({ enabled: queriesEnabled });
  const settingsQuery = useRestaurantSettings({ enabled: queriesEnabled });

  const categories = menuQuery.data ?? [];

  const createMutation = useCreatePromotion();
  const updateMutation = useUpdatePromotion();
  const deleteMutation = useDeletePromotion();

  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<PromotionFormValues>(emptyPromotionForm());
  const [formErrors, setFormErrors] = useState<PromotionErrors>({});
  const [banner, setBanner] = useState<Banner>(null);
  const [deleteTarget, setDeleteTarget] = useState<Promotion | null>(null);

  if (roleLoading) {
    return <LoadingSpinner message="Loading rewards..." />;
  }

  if (!canManage) {
    return <PromotionsPermissionDenied />;
  }

  // Money is only rendered once the restaurant currency has resolved. A
  // fallback would show MYR for one frame in a non-MYR restaurant (L-05).
  if (promotionsQuery.isLoading || settingsQuery.isLoading) {
    return <LoadingSpinner message="Loading promotions..." />;
  }

  if (promotionsQuery.isError || settingsQuery.isError || !settingsQuery.data) {
    const message = promotionsQuery.isError
      ? promotionsQuery.error instanceof Error
        ? promotionsQuery.error.message
        : 'Could not load promotions.'
      : settingsQuery.error instanceof Error
        ? settingsQuery.error.message
        : 'Could not load restaurant settings.';

    return (
      <div className="min-h-screen bg-gray-50/50 pb-20">
        <div className="mx-auto max-w-7xl space-y-5 px-5 pt-4 md:px-6">
          <PromotionsErrorState
            message={message}
            onRetry={() => {
              if (promotionsQuery.isError) {
                void promotionsQuery.refetch();
              }
              if (settingsQuery.isError) {
                void settingsQuery.refetch();
              }
            }}
          />
        </div>
      </div>
    );
  }

  const timezone = settingsQuery.data.timezone;
  const currency = settingsQuery.data.currency;
  const promotions = promotionsQuery.data ?? [];

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyPromotionForm());
    setFormErrors({});
    setBanner(null);
    setFormOpen(true);
  };

  const openEdit = (promotion: Promotion) => {
    setEditingId(promotion.id);
    setForm(buildPromotionForm(promotion, timezone));
    setFormErrors({});
    setBanner(null);
    setFormOpen(true);
  };

  const closeForm = () => {
    if (createMutation.isPending || updateMutation.isPending) return;
    setFormOpen(false);
    setEditingId(null);
    setFormErrors({});
  };

  const changeField = <K extends keyof PromotionFormValues>(
    key: K,
    value: PromotionFormValues[K]
  ) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setFormErrors((prev) => ({ ...prev, [key]: undefined, form: undefined }));
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBanner(null);
    const nextErrors = validatePromotionForm(form);
    setFormErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      setBanner({
        kind: 'error',
        message: 'Please fix the highlighted fields before saving.',
      });
      return;
    }

    const payload = buildPromotionPayload(form);
    try {
      if (editingId) {
        await updateMutation.mutateAsync({ id: editingId, payload });
        setBanner({ kind: 'success', message: 'Promotion updated.' });
      } else {
        await createMutation.mutateAsync(payload);
        setBanner({ kind: 'success', message: 'Promotion created.' });
      }
      setFormOpen(false);
      setEditingId(null);
    } catch (error) {
      setBanner({
        kind: 'error',
        message:
          error instanceof Error
            ? error.message
            : 'Could not save the promotion. Please try again.',
      });
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setBanner(null);
    try {
      await deleteMutation.mutateAsync(deleteTarget.id);
      setBanner({ kind: 'success', message: 'Promotion deleted.' });
      setDeleteTarget(null);
    } catch (error) {
      setBanner({
        kind: 'error',
        message:
          error instanceof Error
            ? error.message
            : 'Could not delete the promotion. Please try again.',
      });
    }
  };

  const isSaving = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="min-h-screen bg-gray-50/50 pb-20">
      <div className="mx-auto max-w-7xl space-y-5 px-5 pt-4 md:px-6">
        <div className="flex flex-col gap-3 rounded-xl border border-gray-100 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm text-gray-600">
              A promotion applies to the bill instead of a visit. The visit card
              stays as it is.
            </p>
          </div>
          <Button onClick={openCreate} className="min-h-11">
            <Plus className="mr-2 h-4 w-4" />
            New promotion
          </Button>
        </div>

        {banner?.kind === 'error' && (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700"
          >
            <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
            <span>{banner.message}</span>
          </div>
        )}

        {banner?.kind === 'success' && (
          <div
            role="status"
            className="flex items-start gap-2 rounded-xl border border-green-100 bg-green-50 px-4 py-3 text-sm text-green-700"
          >
            <CheckCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
            <span>{banner.message}</span>
          </div>
        )}

        {formOpen && (
          <PromotionForm
            form={form}
            errors={formErrors}
            categories={categories}
            currency={currency}
            isSaving={isSaving}
            isEditing={Boolean(editingId)}
            onChange={changeField}
            onSubmit={handleSubmit}
            onCancel={closeForm}
          />
        )}

        {menuQuery.isError && (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-xl border border-amber-100 bg-amber-50 px-4 py-3 text-sm text-amber-800"
          >
            <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
            <span>
              Could not load the menu. Category and item promotions cannot be
              configured until the menu loads.
            </span>
          </div>
        )}

        {promotions.length === 0 ? (
          <PromotionsEmptyState />
        ) : (
          <div className="space-y-3">
            {promotions.map((promotion) => {
              const status = promotionStatus(promotion);
              return (
                <article
                  key={promotion.id}
                  className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h2 className="text-base font-semibold text-gray-900">
                        {promotion.name}
                      </h2>
                      <p className="mt-1 text-sm text-gray-600">
                        {scopeLabel(promotion.scope)} ·{' '}
                        {typeValueLabel(promotion, currency)}
                      </p>
                    </div>
                    <span
                      className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${status.className}`}
                    >
                      {status.label}
                    </span>
                  </div>

                  <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-3">
                    <div>
                      <dt className="text-xs font-semibold uppercase text-gray-500">
                        Window
                      </dt>
                      <dd className="text-gray-900">
                        {formatWindow(
                          promotion.startsAt,
                          promotion.endsAt,
                          timezone
                        )}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs font-semibold uppercase text-gray-500">
                        Minimum spend
                      </dt>
                      <dd className="text-gray-900">
                        {formatMoney(promotion.minSpend, currency)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs font-semibold uppercase text-gray-500">
                        Maximum discount
                      </dt>
                      <dd className="text-gray-900">
                        {formatMoney(promotion.maxDiscount, currency)}
                      </dd>
                    </div>
                  </dl>

                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => openEdit(promotion)}
                      className="min-h-11"
                      aria-label={`Edit ${promotion.name}`}
                    >
                      <Pencil className="mr-1.5 h-4 w-4" />
                      Edit
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setDeleteTarget(promotion)}
                      className="min-h-11 text-red-700 hover:bg-red-50"
                      aria-label={`Delete ${promotion.name}`}
                    >
                      <Trash2 className="mr-1.5 h-4 w-4" />
                      Delete
                    </Button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>

      <ConfirmationModal
        isOpen={Boolean(deleteTarget)}
        title="Delete promotion?"
        message={
          deleteTarget
            ? `Delete “${deleteTarget.name}”? Past receipts keep their printed label; the promotion will not apply to new bills.`
            : ''
        }
        confirmText="Delete"
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
        isLoading={deleteMutation.isPending}
      />
    </div>
  );
}
