import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  buildCreateRequest,
  buildLegacyCreateRequest,
  buildQuoteRequest,
  buildRuleCopy,
  checkoutMode,
  confirmationFromCreate,
  describeQuote,
  errorCopyFor,
  guestQuoteNeedsConsentRefresh,
  phoneDigitCount,
  phoneInputError,
  quoteNeedsRefresh,
  quoteUnavailableCode,
  resolveCreateFailure,
  sanitizePhoneInput,
  shouldShowLoginRows,
  TOTAL_UPDATED_MESSAGE,
  viewAfterNoticeRefresh,
  visitStateBadge,
  visitStateCopy,
  type LoyaltyNotice,
  type LoyaltyOrderResult,
  type LoyaltyQuote,
} from '@/components/qr/loyalty-checkout';

const tableId = '550e8400-e29b-41d4-a716-446655440002';
const sessionId = '550e8400-e29b-41d4-a716-446655440003';

const notice: LoyaltyNotice = {
  version: 'v1',
  text: 'Rewards notice v1',
  textHash: 'notice-hash',
  privacyUrl: 'https://example.test/privacy',
  termsText: null,
  visitsRequired: 3,
  rewardLabel: '10% off, max RM15',
};

function quote(overrides: Partial<LoyaltyQuote> = {}): LoyaltyQuote {
  return {
    quoteId: 'q_opaque_1',
    quoteRevision: 7,
    subtotal: '60.00',
    promotionDiscountAmount: '12.00',
    projectedRewardAmount: '0.00',
    discountAmount: '12.00',
    discountLines: [
      { source: 'PROMOTION', label: 'Lunch 20%', amount: '12.00' },
    ],
    discountedSubtotal: '48.00',
    taxAmount: '2.88',
    serviceCharge: '4.80',
    totalAmount: '55.68',
    projectedTotal: '55.68',
    cashPayable: '55.70',
    rewardLabel: '10% off, max RM15',
    rewardType: 'PERCENT',
    rewardValue: '10',
    maxDiscount: '15.00',
    promotionApplied: true,
    promotionScope: 'ITEM',
    promotionLabel: 'Lunch 20%',
    promotionItems: [{ itemId: 'item-1', name: 'Pasta' }],
    visitState: 'PROMOTION',
    visit: { completedVisits: 2, visitsRequired: 3 },
    message:
      'Lunch 20% applied to Pasta. This visit will not count. Your card stays at 2 of 3.',
    ...overrides,
  };
}

function orderResult(
  overrides: Partial<LoyaltyOrderResult> = {}
): LoyaltyOrderResult {
  return {
    success: true,
    order: {
      id: 'order-1',
      orderNumber: 'A001',
      status: 'PENDING',
      paymentStatus: 'PENDING',
      subtotalAmount: 60,
      taxAmount: 2.88,
      serviceCharge: 4.8,
      totalAmount: 67.68,
      sessionToken: sessionId,
    },
    projectedTotal: '55.68',
    visitState: 'PROMOTION',
    message:
      'Order submitted successfully! Please pay at the counter when ready.',
    ...overrides,
  };
}

describe('QR phone input', () => {
  it('accepts + only in the first position and strips letters/spaces', () => {
    expect(sanitizePhoneInput('+60 12-345 6789')).toBe('+60123456789');
    expect(sanitizePhoneInput('+6012abc345')).toBe('+6012345');
    expect(sanitizePhoneInput('12+345')).toBe('12345');
    expect(sanitizePhoneInput('++60123')).toBe('+60123');
    expect(sanitizePhoneInput('  +60 12 345 6789 ')).toBe('+60123456789');
  });

  it('handles a pasted international number without mangling it', () => {
    expect(sanitizePhoneInput('+65 9123 4567')).toBe('+6591234567');
    expect(sanitizePhoneInput('+44 (0)20 7946 0958')).toBe('+4402079460958');
  });

  it('sanitises a long formatted paste before applying the 16-char cap', () => {
    // The input must not have a raw maxLength: a raw cap would cut this paste
    // to "+44 (0)20 7946 0" before the separators are stripped.
    expect(sanitizePhoneInput('+44 (0)20 7946 0958')).toBe('+4402079460958');
    expect(sanitizePhoneInput('+1 (415) 555-2671')).toBe('+14155552671');
  });

  it('caps the field at 16 characters (+ and 15 E.164 digits)', () => {
    expect(sanitizePhoneInput('+601234567890123456')).toBe('+601234567890123');
    expect(sanitizePhoneInput('12345678901234567890')).toBe('1234567890123456');
  });

  it('does not reformat or prepend a country code', () => {
    expect(sanitizePhoneInput('0123456789')).toBe('0123456789');
    expect(sanitizePhoneInput('+6591234567')).toBe('+6591234567');
    expect(phoneDigitCount('+60123456789')).toBe(11);
  });

  it('gives a field-level hint without blocking the guest fallback', () => {
    expect(phoneInputError('')).toBeNull();
    expect(phoneInputError('+60123456789')).toBeNull();
    expect(phoneInputError('0123456789')).toBeNull();
    expect(phoneInputError('+6591234567')).toBeNull();
    expect(phoneInputError('123')).toContain('+60123456789');
    expect(phoneInputError('+601')).toContain('+60123456789');
  });
});

describe('flag-off parity', () => {
  it('keeps the legacy mode and body when the notice is null', () => {
    expect(checkoutMode(null)).toBe('legacy');
    expect(checkoutMode(undefined)).toBe('legacy');

    const body = buildLegacyCreateRequest(tableId, sessionId);
    expect(body).toEqual({ tableId, sessionId });
    expect(body).not.toHaveProperty('quoteId');
    expect(body).not.toHaveProperty('expectedTotal');
    expect(body).not.toHaveProperty('customerInfo');
  });

  it('keeps the legacy phone body unchanged when a phone is supplied', () => {
    expect(
      buildLegacyCreateRequest(tableId, sessionId, '+60123456789')
    ).toEqual({
      tableId,
      sessionId,
      customerInfo: { phone: '+60123456789' },
    });
  });

  it('switches to the loyalty mode only when the notice is present', () => {
    expect(checkoutMode(notice)).toBe('loyalty');
  });

  it('hides the cashback/voucher/login rows only in loyalty mode', () => {
    expect(shouldShowLoginRows(null)).toBe(true);
    expect(shouldShowLoginRows(undefined)).toBe(true);
    expect(shouldShowLoginRows(notice)).toBe(false);
  });

  it('returns to the cart when a notice refresh comes back null', () => {
    expect(viewAfterNoticeRefresh(null, true)).toEqual({
      showReview: false,
      showCart: true,
    });
    expect(viewAfterNoticeRefresh(null, false)).toEqual({
      showReview: false,
      showCart: false,
    });
    expect(viewAfterNoticeRefresh(notice, true)).toEqual({
      showReview: true,
      showCart: false,
    });
  });
});

describe('quote and create request bodies', () => {
  it('sends the phone only in the JSON body, never in a URL', () => {
    const quoteBody = buildQuoteRequest({
      tableId,
      sessionId,
      phone: '+60 12-345 6789',
      consent: true,
      notice,
    });
    expect(quoteBody).toEqual({
      tableId,
      sessionId,
      phone: '+60123456789',
      consent: true,
      consentVersion: 'v1',
      consentTextHash: 'notice-hash',
    });

    const createBody = buildCreateRequest({
      tableId,
      sessionId,
      quote: quote(),
      phone: '+60 12-345 6789',
      consent: true,
      notice,
    });
    expect(createBody).toEqual({
      tableId,
      sessionId,
      quoteId: 'q_opaque_1',
      expectedTotal: '55.68',
      customerInfo: {
        phone: '+60123456789',
        consent: true,
        consentVersion: 'v1',
        consentTextHash: 'notice-hash',
      },
    });
  });

  it('does not send consent without a phone', () => {
    expect(
      buildQuoteRequest({
        tableId,
        sessionId,
        phone: '',
        consent: true,
        notice,
      })
    ).toEqual({ tableId, sessionId });
  });

  it('omits a too-short phone from the legacy fallback body', () => {
    const body = buildCreateRequest({
      tableId,
      sessionId,
      quote: null,
      phone: '123',
      consent: true,
      notice,
    });
    expect(body).toEqual({ tableId, sessionId });
  });

  it('detects when the phone/consent binding changed', () => {
    expect(quoteNeedsRefresh(null, '', false)).toBe(true);
    expect(
      quoteNeedsRefresh(
        { phone: '+60123456789', consent: true },
        '+60123456789',
        true
      )
    ).toBe(false);
    expect(
      quoteNeedsRefresh(
        { phone: '+60123456789', consent: true },
        '+60123456789',
        false
      )
    ).toBe(true);
    expect(
      quoteNeedsRefresh(
        { phone: '+60123456789', consent: true },
        '+6591234567',
        true
      )
    ).toBe(true);
  });
});

describe('quote rendering', () => {
  it('renders the server total, promotion and visit state without recomputing', () => {
    const view = describeQuote(quote());
    expect(view.total).toBe('55.68');
    expect(view.cashPayable).toBe('55.70');
    expect(view.subtotal).toBe('60.00');
    expect(view.discountLines).toEqual([
      { label: 'Lunch 20%', amount: '12.00' },
    ]);
    expect(view.promotionApplied).toBe(true);
    expect(view.visitCounts).toBe(false);
    expect(view.visitProgress).toBe('2 of 3');
    expect(view.message).toBe(quote().message);
  });

  it('renders a counting visit', () => {
    const view = describeQuote(
      quote({
        promotionApplied: false,
        promotionScope: null,
        promotionLabel: null,
        promotionItems: [],
        promotionDiscountAmount: '0.00',
        discountAmount: '0.00',
        discountLines: [],
        visitState: 'COUNTS',
        visit: { completedVisits: 2, visitsRequired: 3 },
        message: 'This visit counts: 2 of 3.',
      })
    );
    expect(view.promotionApplied).toBe(false);
    expect(view.visitCounts).toBe(true);
    expect(view.visitProgress).toBe('2 of 3');
    expect(view.message).toBe('This visit counts: 2 of 3.');
  });

  it('renders below-minimum without an amount', () => {
    const view = describeQuote(
      quote({
        promotionApplied: false,
        visitState: 'BELOW_MINIMUM',
        message:
          'This visit needs the minimum daily spend. Staff can help at the counter.',
      })
    );
    expect(view.visitCounts).toBe(false);
    expect(visitStateCopy(view.visitState)).toBe(
      'This visit needs the minimum daily spend. Staff can help at the counter.'
    );
    expect(view.message).not.toMatch(/RM\s?\d/);
  });

  it('renders a guest quote', () => {
    const view = describeQuote(
      quote({
        promotionApplied: false,
        visitState: 'GUEST',
        message:
          'Guest order - no visit tracked; staff can attach at the counter.',
      })
    );
    expect(view.visitCounts).toBe(false);
    expect(view.visitProgress).toBeNull();
    expect(visitStateBadge(view.visitState)).toBe('Guest order');
  });
});

describe('QUOTE_CHANGED and error handling', () => {
  it('re-quotes and asks the customer to review the new total', () => {
    expect(resolveCreateFailure({ code: 'QUOTE_CHANGED' })).toEqual({
      action: 'requote',
      message: TOTAL_UPDATED_MESSAGE,
    });
    expect(TOTAL_UPDATED_MESSAGE).toBe(
      'Total updated. Review the new total before paying.'
    );
  });

  it('maps field and consent errors inline', () => {
    expect(resolveCreateFailure({ code: 'PHONE_INVALID' })).toEqual({
      action: 'phone-invalid',
      message:
        'Enter a valid mobile number (e.g. +60123456789); the client normalises spaces/hyphens to E.164.',
    });
    expect(resolveCreateFailure({ code: 'CONSENT_REQUIRED' })).toEqual({
      action: 'consent-required',
      message: 'Please agree to the rewards notice to join.',
    });
    expect(resolveCreateFailure({ code: 'CONSENT_VERSION_REQUIRED' })).toEqual({
      action: 'consent-required',
      message: 'Review the rewards notice before joining.',
    });
    expect(resolveCreateFailure({ code: 'CONSENT_STALE' })).toEqual({
      action: 'consent-stale',
      message: 'The rewards notice changed. Review and agree again.',
    });
  });

  it('renders the rate-limit window and neutral disabled copy', () => {
    expect(
      resolveCreateFailure({ code: 'RATE_LIMITED', retryAfterSeconds: 12 })
    ).toEqual({
      action: 'rate-limited',
      message: 'Try again in 12 seconds.',
    });
    expect(resolveCreateFailure({ code: 'LOYALTY_DISABLED' })).toEqual({
      action: 'disabled',
      message: 'Loyalty is off for this restaurant.',
    });
    expect(errorCopyFor('RATE_LIMITED', 1)).toBe('Try again in 1 second.');
  });

  it('uses staff-help only for non-recoverable codes', () => {
    expect(resolveCreateFailure({ code: 'QUOTE_UNAVAILABLE' })).toEqual({
      action: 'staff-help',
      message: 'Could not add rewards. Staff can help at the counter.',
    });
  });

  it('detects a LOYALTY_DISABLED quote response', () => {
    expect(
      quoteUnavailableCode({
        success: false,
        code: 'LOYALTY_DISABLED',
        error: 'Loyalty is off for this restaurant.',
      })
    ).toBe('LOYALTY_DISABLED');
    expect(quoteUnavailableCode(quote())).toBeNull();
  });

  it('detects guest+consent even when promotion copy wins the message', () => {
    const promotionGuest = quote({
      promotionApplied: true,
      visitState: 'GUEST',
      message: 'Promotion applied. No visit tracked.',
    });
    expect(
      guestQuoteNeedsConsentRefresh('+60123456789', true, promotionGuest)
    ).toBe(true);
    expect(
      guestQuoteNeedsConsentRefresh('+60123456789', false, promotionGuest)
    ).toBe(false);
    expect(guestQuoteNeedsConsentRefresh('', true, promotionGuest)).toBe(false);
    expect(
      guestQuoteNeedsConsentRefresh(
        '+60123456789',
        true,
        quote({ visitState: 'COUNTS' })
      )
    ).toBe(false);
  });
});

describe('loyaltyError guest fallback', () => {
  it('keeps the order successful and shows the server loyalty copy', () => {
    const result = orderResult({
      visitState: 'GUEST',
      loyaltyError: {
        code: 'CONSENT_STALE',
        message: 'The rewards notice changed. Review and agree again.',
      },
    });
    const confirmation = confirmationFromCreate(
      result,
      quote(),
      'Rewards notice v1'
    )!;
    expect(confirmation.total).toBe('55.68');
    expect(confirmation.visitState).toBe('GUEST');
    expect(confirmation.loyaltyError?.code).toBe('CONSENT_STALE');
    expect(confirmation.message).toBe(result.message);
    expect(confirmation.noticeText).toBe('Rewards notice v1');
    expect(confirmation.visitProgress).toBeNull();
    expect(confirmation.rewardLabel).toBeNull();
  });

  it('does not claim a reward on a promotion confirmation', () => {
    const result = orderResult({ visitState: 'PROMOTION' });
    const confirmation = confirmationFromCreate(result, quote())!;
    expect(confirmation.rewardLabel).toBeNull();
    expect(confirmation.visitProgress).toBe('2 of 3');
  });

  it('renders a discount line and reconciles the confirmation totals', () => {
    const result = orderResult({
      visitState: 'PROMOTION',
      projectedTotal: '55.68',
    });
    const confirmation = confirmationFromCreate(result, quote())!;

    expect(confirmation.subtotal).toBe('60.00');
    expect(confirmation.discountLines).toEqual([
      { label: 'Lunch 20%', amount: '12.00' },
    ]);
    expect(confirmation.taxAmount).toBe('2.88');
    expect(confirmation.serviceCharge).toBe('4.80');
    expect(confirmation.total).toBe('55.68');

    const discountTotal = confirmation.discountLines.reduce(
      (sum, line) => sum + Number(line.amount),
      0
    );
    const reconciled =
      Number(confirmation.subtotal) -
      discountTotal +
      Number(confirmation.taxAmount) +
      Number(confirmation.serviceCharge);
    expect(reconciled).toBeCloseTo(Number(confirmation.total), 2);
  });

  it('returns no loyalty confirmation for a legacy create response', () => {
    const legacy = orderResult({
      projectedTotal: undefined,
      visitState: undefined,
    });
    expect(confirmationFromCreate(legacy, quote())).toBeNull();
  });

  it('shows the reward label only when the create response projects one', () => {
    const result = orderResult({
      visitState: 'COUNTS',
      rewardLabel: '10% off, max RM15',
    });
    const confirmation = confirmationFromCreate(result, quote())!;
    expect(confirmation.rewardLabel).toBe('10% off, max RM15');
  });

  it('shows the PHONE_INVALID example on a guest fallback', () => {
    const result = orderResult({
      visitState: 'GUEST',
      loyaltyError: {
        code: 'PHONE_INVALID',
        message:
          'Enter a valid mobile number (e.g. +60123456789); the client normalises spaces/hyphens to E.164.',
      },
    });
    const confirmation = confirmationFromCreate(result, null)!;
    expect(confirmation.visitState).toBe('GUEST');
    expect(confirmation.loyaltyError?.message).toContain('+60123456789');
  });
});

describe('copy uses server values, never snapshot constants', () => {
  it('changes the rule when the server rule changes', () => {
    const threeVisit = buildRuleCopy(notice, quote());
    const fiveVisit = buildRuleCopy(
      {
        ...notice,
        visitsRequired: 5,
        rewardLabel: 'RM5 off',
      },
      quote({
        visit: { completedVisits: 2, visitsRequired: 5 },
        rewardLabel: 'RM5 off',
        maxDiscount: '9.00',
      })
    );

    expect(threeVisit.visits).toContain('3');
    expect(threeVisit.reward).toContain('10% off, max RM15');
    expect(threeVisit.capAmount).toBe('15.00');
    expect(fiveVisit.visits).toContain('5');
    expect(fiveVisit.reward).toContain('RM5 off');
    expect(fiveVisit.capAmount).toBe('9.00');
    expect(fiveVisit.visits).not.toBe(threeVisit.visits);
  });

  it('prefers the member card snapshot once a quote exists (V-01)', () => {
    // The notice is the current restaurant rule; the quote is the member's
    // card snapshot. The card wins on the member-specific review screen.
    const snapshot = buildRuleCopy(
      { ...notice, visitsRequired: 6, rewardLabel: 'Current rule' },
      quote({
        visit: { completedVisits: 1, visitsRequired: 4 },
        rewardLabel: 'Snapshot rule',
      })
    );

    expect(snapshot.visits).toContain('4');
    expect(snapshot.reward).toContain('Snapshot rule');
    expect(snapshot.visits).not.toContain('6');
    expect(snapshot.reward).not.toContain('Current rule');

    // Before a member is known there is no quote; the notice is all we have.
    const noticeOnly = buildRuleCopy({
      ...notice,
      visitsRequired: 6,
      rewardLabel: 'Current rule',
    });
    expect(noticeOnly.visits).toContain('6');
    expect(noticeOnly.reward).toContain('Current rule');
  });

  it('does not hardcode 3rd, 10%, RM15 or RM20 in static copy', () => {
    const staticCopy = [
      buildRuleCopy(
        { ...notice, visitsRequired: 4, rewardLabel: 'Free item' },
        quote({
          visit: { completedVisits: 1, visitsRequired: 4 },
          rewardLabel: 'Free item',
          maxDiscount: '0.00',
        })
      ),
      visitStateBadge('COUNTS'),
      visitStateBadge('PROMOTION'),
      visitStateBadge('ALREADY_COUNTED'),
      visitStateBadge('BELOW_MINIMUM'),
      visitStateBadge('GUEST'),
      visitStateCopy('COUNTS'),
      visitStateCopy('PROMOTION'),
      visitStateCopy('ALREADY_COUNTED'),
      visitStateCopy('BELOW_MINIMUM'),
      visitStateCopy('GUEST'),
      errorCopyFor('PHONE_INVALID'),
      errorCopyFor('CONSENT_REQUIRED'),
      errorCopyFor('CONSENT_STALE'),
      errorCopyFor('RATE_LIMITED', 9),
      errorCopyFor('LOYALTY_DISABLED'),
      errorCopyFor(null),
    ]
      .map((entry) =>
        typeof entry === 'string' ? entry : Object.values(entry).join(' ')
      )
      .join(' ');

    expect(staticCopy).not.toContain('3rd');
    expect(staticCopy).not.toContain('10%');
    expect(staticCopy).not.toContain('RM15');
    expect(staticCopy).not.toContain('RM20');
  });
});

describe('PII safety', () => {
  const root = process.cwd();
  const files = [
    'src/app/qr/[token]/page.tsx',
    'src/components/qr/loyalty-checkout.ts',
    'src/components/qr/LoyaltyReview.tsx',
    'src/components/qr/LoyaltyRuleCard.tsx',
    'src/components/order/OrderConfirmation.tsx',
    'src/components/cart/CartSummary.tsx',
  ];

  function source(file: string): string {
    return readFileSync(join(root, file), 'utf8');
  }

  it('never puts a phone in a URL or query string', () => {
    for (const file of files) {
      const text = source(file);
      expect(text).not.toMatch(/[?&]phone=/i);
      expect(text).not.toMatch(/\/api\/[^\s'"`]*phone/i);
      expect(text).not.toMatch(/URLSearchParams[\s\S]{0,200}phone/i);
    }
  });

  it('never logs a phone or a request body', () => {
    for (const file of files) {
      const lines = source(file).split('\n');
      for (const line of lines) {
        if (/console\.(log|error|warn|info|debug)/.test(line)) {
          expect(line.toLowerCase()).not.toContain('phone');
          expect(line).not.toContain('customerInfo');
        }
      }
    }
  });

  it('uses a phone keypad with no fixed +60 badge or digit mask', () => {
    const review = source('src/components/qr/LoyaltyReview.tsx');
    expect(review).toContain('inputMode="tel"');
    expect(review).toContain('autoComplete="tel"');
    expect(review).not.toContain('maxLength');
    expect(review).not.toContain('🇲🇾');
    expect(review).not.toMatch(/>\+60</);
    expect(review).not.toMatch(/replace\(\/\\D\/g/);
  });

  it('uses a high-contrast focus ring on the phone field', () => {
    const review = source('src/components/qr/LoyaltyReview.tsx');
    expect(review).toContain('focus-visible:ring-orange-700');
    expect(review).not.toContain('ring-orange-200');
  });
});
