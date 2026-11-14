'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from 'react';
import { ArrowLeft, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { ApiClient, ApiClientError } from '@/lib/api-client';
import { formatPrice } from '@/lib/qr-utils';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { Button } from '@/components/ui/Button';
import type { Cart } from '@/types/menu';
import { LoyaltyRuleCard } from '@/components/qr/LoyaltyRuleCard';
import {
  buildCreateRequest,
  buildQuoteRequest,
  cartItemSummary,
  describeQuote,
  errorCopyFor,
  guestQuoteNeedsConsentRefresh,
  phoneInputError,
  QR_CREATE_ENDPOINT,
  QR_QUOTE_ENDPOINT,
  quoteNeedsRefresh,
  quoteUnavailableCode,
  resolveCreateFailure,
  sanitizePhoneInput,
  visitStateBadge,
  type ApiFailure,
  type LoyaltyNotice,
  type LoyaltyOrderResult,
  type LoyaltyQuote,
  type QuoteUnavailable,
} from '@/components/qr/loyalty-checkout';

interface LoyaltyReviewProps {
  tableId: string;
  sessionId: string | null;
  notice: LoyaltyNotice;
  cart: Cart;
  currency: string;
  taxLabel: string;
  serviceChargeLabel: string;
  onBack: () => void;
  onOrderCreated: (
    result: LoyaltyOrderResult,
    quote: LoyaltyQuote | null
  ) => void;
  onRefreshNotice: () => Promise<LoyaltyNotice | null>;
}

function failureFromError(error: unknown): ApiFailure {
  if (error instanceof ApiClientError) {
    const details =
      error.details && typeof error.details === 'object'
        ? (error.details as Record<string, unknown>)
        : null;
    return {
      code: typeof details?.code === 'string' ? details.code : null,
      retryAfterSeconds:
        typeof details?.retryAfterSeconds === 'number'
          ? details.retryAfterSeconds
          : null,
    };
  }
  return { code: null };
}

/**
 * Customer-facing review step. One quote call on entry, a fresh quote only when
 * the phone/consent binding changes or the server returns `QUOTE_CHANGED`.
 * The phone lives in component state and in the JSON body only.
 */
export function LoyaltyReview({
  tableId,
  sessionId,
  notice,
  cart,
  currency,
  taxLabel,
  serviceChargeLabel,
  onBack,
  onOrderCreated,
  onRefreshNotice,
}: LoyaltyReviewProps) {
  const [phone, setPhone] = useState('');
  const [consent, setConsent] = useState(false);
  const [quote, setQuote] = useState<LoyaltyQuote | null>(null);
  const [quotedFor, setQuotedFor] = useState<{
    phone: string;
    consent: boolean;
  } | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [consentError, setConsentError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [loyaltyDisabled, setLoyaltyDisabled] = useState(false);
  const [quoting, setQuoting] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const startedQuote = useRef(false);

  const requestQuote = useCallback(
    async (
      nextPhone: string,
      nextConsent: boolean
    ): Promise<LoyaltyQuote | null> => {
      setQuoting(true);
      setFormError(null);
      setFieldError(phoneInputError(nextPhone));
      setConsentError(null);

      try {
        const data = await ApiClient.post<
          LoyaltyQuote | QuoteUnavailable | { success: false; code: string }
        >(
          QR_QUOTE_ENDPOINT,
          buildQuoteRequest({
            tableId,
            sessionId,
            phone: nextPhone,
            consent: nextConsent,
            notice,
          })
        );

        const unavailable = quoteUnavailableCode(data);
        if (unavailable) {
          if (unavailable === 'LOYALTY_DISABLED') {
            setLoyaltyDisabled(true);
            setQuote(null);
            setQuotedFor(null);
            setStatusMessage(errorCopyFor('LOYALTY_DISABLED'));
            return null;
          }
          if (unavailable === 'RATE_LIMITED') {
            setFormError(errorCopyFor('RATE_LIMITED'));
            return null;
          }
          setFormError(errorCopyFor(unavailable));
          return null;
        }

        const nextQuote = data as LoyaltyQuote;
        setQuote(nextQuote);
        setQuotedFor({
          phone: sanitizePhoneInput(nextPhone),
          consent: nextConsent,
        });
        setLoyaltyDisabled(false);
        setStatusMessage(nextQuote.message);

        // The server notice changed between page load and quote, or the
        // member could not be resolved. Re-show the current notice and
        // require consent again before the next attempt. The structural check
        // is needed because promotion copy can replace the consent message.
        if (guestQuoteNeedsConsentRefresh(nextPhone, nextConsent, nextQuote)) {
          setConsent(false);
          setConsentError(errorCopyFor('CONSENT_STALE'));
          const refreshed = await onRefreshNotice();
          // A null notice means loyalty was switched off; the page has
          // already left the review for the cart/menu.
          if (!refreshed) return null;
        }

        return nextQuote;
      } catch (error) {
        setFormError(resolveCreateFailure(failureFromError(error)).message);
        return null;
      } finally {
        setQuoting(false);
      }
    },
    [notice, onRefreshNotice, sessionId, tableId]
  );

  useEffect(() => {
    if (startedQuote.current) return;
    startedQuote.current = true;
    void requestQuote('', false);
  }, [requestQuote]);

  const quoteDirty = quoteNeedsRefresh(quotedFor, phone, consent);
  const summary = cartItemSummary(cart);
  const itemCount = summary.reduce((count, item) => count + item.quantity, 0);
  const quoteView = quote ? describeQuote(quote) : null;

  const handlePhoneChange = (value: string) => {
    setPhone(sanitizePhoneInput(value));
    setFieldError(null);
  };

  const handleConsentChange = (checked: boolean) => {
    setConsent(checked);
    setConsentError(null);
  };

  const handleUpdateRewards = async () => {
    if (quoting || submitting) return;
    await requestQuote(phone, consent);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (quoting || submitting) return;

    setSubmitting(true);
    setFormError(null);
    setFieldError(null);
    setConsentError(null);

    // Field-level hint only; the order still goes through so the server can
    // fall back to a guest order.
    const localPhoneError = phoneInputError(phone);
    if (localPhoneError) setFieldError(localPhoneError);

    try {
      let activeQuote = loyaltyDisabled ? null : quote;
      if (!loyaltyDisabled && quoteNeedsRefresh(quotedFor, phone, consent)) {
        activeQuote = await requestQuote(phone, consent);
        if (!activeQuote) return;
      }

      const result = await ApiClient.post<LoyaltyOrderResult>(
        QR_CREATE_ENDPOINT,
        buildCreateRequest({
          tableId,
          sessionId,
          quote: activeQuote,
          // A disabled programme stores no new member phone.
          phone: loyaltyDisabled ? '' : phone,
          consent,
          notice,
        })
      );

      const loyaltyError = result.loyaltyError ?? null;
      if (loyaltyError?.code === 'PHONE_INVALID') {
        setFieldError(loyaltyError.message);
      }
      if (
        loyaltyError?.code === 'CONSENT_REQUIRED' ||
        loyaltyError?.code === 'CONSENT_VERSION_REQUIRED'
      ) {
        setConsentError(loyaltyError.message);
      }
      if (loyaltyError?.code === 'CONSENT_STALE') {
        setConsent(false);
        setConsentError(loyaltyError.message);
        await onRefreshNotice();
      }

      // A loyalty error never fails the order; the guest order is confirmed.
      onOrderCreated(result, activeQuote);
    } catch (error) {
      const failure = resolveCreateFailure(failureFromError(error));

      switch (failure.action) {
        case 'requote': {
          const fresh = await requestQuote(phone, consent);
          if (fresh) setStatusMessage(failure.message);
          break;
        }
        case 'consent-stale': {
          setConsent(false);
          setConsentError(failure.message);
          const refreshed = await onRefreshNotice();
          if (!refreshed) return;
          break;
        }
        case 'consent-required':
          setConsentError(failure.message);
          break;
        case 'phone-invalid':
          setFieldError(failure.message);
          break;
        case 'rate-limited':
        case 'staff-help':
          setFormError(failure.message);
          break;
        case 'disabled':
          setLoyaltyDisabled(true);
          setStatusMessage(failure.message);
          break;
      }
    } finally {
      setSubmitting(false);
    }
  };

  const busy = quoting || submitting;
  const phoneInvalid = Boolean(fieldError);

  return (
    <div className="mx-auto w-full max-w-2xl pb-8">
      <div className="flex min-h-[44px] items-center gap-2 px-4 py-3">
        <button
          type="button"
          onClick={onBack}
          className="flex h-11 w-11 items-center justify-center rounded-lg text-gray-700 hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-700"
          aria-label="Back to cart"
        >
          <ArrowLeft className="h-6 w-6" aria-hidden="true" />
        </button>
        <h1 className="text-xl font-bold text-gray-900">Review order</h1>
      </div>

      <div className="space-y-4 px-4">
        <LoyaltyRuleCard notice={notice} quote={quote} currency={currency} />

        <section
          aria-labelledby="review-order-items"
          className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm"
        >
          <h2
            id="review-order-items"
            className="text-sm font-bold text-gray-900"
          >
            Order · {itemCount} {itemCount === 1 ? 'item' : 'items'}
          </h2>
          <ul className="mt-2 space-y-1 text-sm text-gray-700">
            {summary.map((item, index) => (
              <li
                key={`${item.name}-${index}`}
                className="flex justify-between"
              >
                <span className="min-w-0 break-words pr-3">{item.name}</span>
                <span className="shrink-0">× {item.quantity}</span>
              </li>
            ))}
          </ul>
        </section>

        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <fieldset className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
            <legend className="px-1 text-sm font-bold text-gray-900">
              Rewards (optional)
            </legend>

            <div className="mt-2 rounded-lg border border-gray-200 bg-gray-50 p-3">
              <h3 className="text-sm font-semibold text-gray-900">
                Rewards notice
              </h3>
              <p className="mt-1 whitespace-pre-line break-words text-sm leading-6 text-gray-800">
                {notice.text}
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                <a
                  href={notice.privacyUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="min-h-[44px] inline-flex items-center font-semibold text-orange-800 underline underline-offset-2 hover:text-orange-900"
                >
                  Privacy notice
                </a>
                {notice.termsText && (
                  <span className="break-words text-gray-700">
                    {notice.termsText}
                  </span>
                )}
              </div>
            </div>

            {!loyaltyDisabled && (
              <>
                <div className="mt-4">
                  <label
                    htmlFor="loyalty-phone"
                    className="block text-sm font-semibold text-gray-900"
                  >
                    Mobile number{' '}
                    <span className="font-normal text-gray-600">
                      (optional)
                    </span>
                  </label>
                  <input
                    id="loyalty-phone"
                    name="phone"
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel"
                    value={phone}
                    onChange={(event) => handlePhoneChange(event.target.value)}
                    onBlur={() => setFieldError(phoneInputError(phone))}
                    aria-describedby={
                      fieldError
                        ? 'loyalty-phone-hint loyalty-phone-error'
                        : 'loyalty-phone-hint'
                    }
                    aria-invalid={phoneInvalid || undefined}
                    placeholder="+60123456789"
                    className="mt-1 h-12 w-full rounded-lg border border-gray-300 bg-white px-3 text-base text-gray-900 placeholder:text-gray-500 focus:border-orange-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-700"
                  />
                  <p
                    id="loyalty-phone-hint"
                    className="mt-1 text-xs leading-5 text-gray-600"
                  >
                    Use + and digits only, e.g. +60123456789.
                  </p>
                  {fieldError && (
                    <p
                      id="loyalty-phone-error"
                      role="alert"
                      className="mt-1 flex items-start gap-1 text-sm font-medium text-red-700"
                    >
                      <AlertTriangle
                        className="mt-0.5 h-4 w-4 shrink-0"
                        aria-hidden="true"
                      />
                      <span>{fieldError}</span>
                    </p>
                  )}
                </div>

                <div className="mt-2">
                  <label
                    htmlFor="loyalty-consent"
                    className="flex min-h-[44px] items-start gap-3 py-2"
                  >
                    <input
                      id="loyalty-consent"
                      name="consent"
                      type="checkbox"
                      checked={consent}
                      onChange={(event) =>
                        handleConsentChange(event.target.checked)
                      }
                      aria-describedby={
                        consentError
                          ? 'loyalty-consent-help loyalty-consent-error'
                          : 'loyalty-consent-help'
                      }
                      aria-invalid={Boolean(consentError) || undefined}
                      className="mt-1 h-5 w-5 shrink-0 rounded border-gray-400 text-orange-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-700"
                    />
                    <span className="text-sm leading-6 text-gray-800">
                      I agree to the rewards notice.
                    </span>
                  </label>
                  <p
                    id="loyalty-consent-help"
                    className="text-xs leading-5 text-gray-600"
                  >
                    Without consent the order is a guest order and no visit is
                    tracked.
                  </p>
                  {consentError && (
                    <p
                      id="loyalty-consent-error"
                      role="alert"
                      className="mt-1 flex items-start gap-1 text-sm font-medium text-red-700"
                    >
                      <AlertTriangle
                        className="mt-0.5 h-4 w-4 shrink-0"
                        aria-hidden="true"
                      />
                      <span>{consentError}</span>
                    </p>
                  )}
                </div>

                {quoteDirty && (
                  <div className="mt-3">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleUpdateRewards}
                      disabled={busy}
                      className="min-h-[44px] w-full"
                    >
                      Update rewards
                    </Button>
                  </div>
                )}
              </>
            )}
          </fieldset>

          {loyaltyDisabled && (
            <div
              role="status"
              aria-live="polite"
              className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-800"
            >
              {errorCopyFor('LOYALTY_DISABLED')} You can still place your order
              as a guest.
            </div>
          )}

          {formError && (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-medium text-red-700"
            >
              <AlertTriangle
                className="mt-0.5 h-4 w-4 shrink-0"
                aria-hidden="true"
              />
              <span>{formError}</span>
            </div>
          )}

          {quoting && !quoteView && (
            <LoadingSpinner size="sm" message="Checking rewards..." />
          )}

          {quoteView && !loyaltyDisabled && (
            <>
              <section
                role="status"
                aria-live="polite"
                aria-atomic="true"
                className="rounded-xl border border-orange-100 bg-orange-50 px-4 py-3"
              >
                <div className="flex items-center gap-2">
                  <CheckCircle2
                    className="h-5 w-5 shrink-0 text-orange-800"
                    aria-hidden="true"
                  />
                  <span className="text-sm font-bold text-gray-900">
                    {visitStateBadge(quoteView.visitState)}
                  </span>
                </div>
                <p className="mt-1 break-words text-sm leading-6 text-gray-900">
                  {quoteView.message}
                </p>
                <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                  <dt className="text-gray-700">Promotion</dt>
                  <dd className="text-right font-semibold text-gray-900">
                    {quoteView.promotionApplied ? 'Applied' : 'Not applied'}
                  </dd>
                  <dt className="text-gray-700">Visit</dt>
                  <dd className="text-right font-semibold text-gray-900">
                    {quoteView.visitCounts ? 'Counts' : 'Does not count'}
                  </dd>
                  {quoteView.visitProgress && (
                    <>
                      <dt className="text-gray-700">Visit count</dt>
                      <dd className="text-right font-semibold text-gray-900">
                        {quoteView.visitProgress}
                      </dd>
                    </>
                  )}
                </dl>
                {quoteView.promotionApplied && (
                  <p className="mt-2 break-words text-sm text-gray-800">
                    {quoteView.promotionLabel ?? 'Promotion'}
                    {quoteView.promotionItems.length > 0
                      ? `: ${quoteView.promotionItems.join(', ')}`
                      : ''}
                  </p>
                )}
              </section>

              <section
                aria-labelledby="review-total"
                className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm"
              >
                <h2
                  id="review-total"
                  className="text-sm font-bold text-gray-900"
                >
                  Total
                </h2>
                <dl className="mt-2 space-y-1 text-sm">
                  <div className="flex justify-between gap-3 text-gray-700">
                    <dt>Subtotal</dt>
                    <dd className="shrink-0">
                      {formatPrice(quoteView.subtotal, currency)}
                    </dd>
                  </div>
                  {quoteView.discountLines.map((line, index) => (
                    <div
                      key={`${line.label}-${index}`}
                      className="flex justify-between gap-3 text-gray-700"
                    >
                      <dt className="min-w-0 break-words">{line.label}</dt>
                      <dd className="shrink-0">
                        −{formatPrice(line.amount, currency)}
                      </dd>
                    </div>
                  ))}
                  <div className="flex justify-between gap-3 text-gray-700">
                    <dt>{taxLabel}</dt>
                    <dd className="shrink-0">
                      {formatPrice(quoteView.taxAmount, currency)}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-3 border-b border-gray-200 pb-2 text-gray-700">
                    <dt>{serviceChargeLabel}</dt>
                    <dd className="shrink-0">
                      {formatPrice(quoteView.serviceCharge, currency)}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-3 pt-1">
                    <dt className="text-sm font-semibold text-gray-900">
                      Total
                    </dt>
                    <dd className="text-2xl font-bold text-gray-900">
                      {formatPrice(quoteView.total, currency)}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-3 text-sm text-gray-700">
                    <dt>Cash payable</dt>
                    <dd className="shrink-0">
                      {formatPrice(quoteView.cashPayable, currency)}
                    </dd>
                  </div>
                </dl>
                {statusMessage && statusMessage !== quoteView.message && (
                  <p
                    role="status"
                    aria-live="polite"
                    className="mt-3 break-words text-sm font-medium text-gray-900"
                  >
                    {statusMessage}
                  </p>
                )}
              </section>
            </>
          )}

          <Button
            type="submit"
            size="lg"
            loading={submitting}
            disabled={busy || (quoting && !quoteView)}
            className="min-h-[44px] w-full bg-orange-700 text-white hover:bg-orange-800 focus-visible:ring-orange-700"
          >
            {submitting ? 'Placing order...' : 'Place order'}
          </Button>

          <p className="text-center text-xs leading-5 text-gray-600">
            Pay at the counter when ready.
          </p>
        </form>

        {loyaltyDisabled && (
          <section className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
            <h2 className="text-sm font-bold text-gray-900">Total</h2>
            <p className="mt-1 text-2xl font-bold text-gray-900">
              {formatPrice(cart.totalAmount, currency)}
            </p>
            <p className="mt-1 text-xs text-gray-600">
              The counter confirms the final total.
            </p>
          </section>
        )}
      </div>
    </div>
  );
}
