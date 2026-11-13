import {
  buildBillMessage,
  buildPaymentResultMessage,
  buildQuoteMessage,
  buildReceiptMessage,
  type LoyaltyCopyContext,
} from '../message';

const snapshot: LoyaltyCopyContext = {
  visitState: 'COUNTS',
  completedVisits: 2,
  visitsRequired: 5,
  rewardLabel: 'RM5 off',
  minDailySpend: '30.00',
  amountToMinimum: '8.00',
  promotionScope: 'ITEM',
  promotionLabel: 'Lunch offer',
  promotionItems: [{ itemId: 'item-1', name: 'Pasta' }],
};

const HARDCODED = ['3rd', '10%', 'RM20', '3 of 3'];

function expectNoHardcodedCopy(message: string | null) {
  expect(message).not.toBeNull();
  for (const token of HARDCODED) {
    expect(message).not.toContain(token);
  }
}

describe('loyalty copy builders', () => {
  describe('QR quote', () => {
    it('renders the visit count from the snapshot', () => {
      const message = buildQuoteMessage(snapshot);

      expect(message).toBe('This visit counts: 2 of 5.');
      expectNoHardcodedCopy(message);
    });

    it('renders a projected reward label from the snapshot', () => {
      const message = buildQuoteMessage({
        ...snapshot,
        rewardApplied: true,
      });

      expect(message).toBe('RM5 off applied; card resets.');
      expectNoHardcodedCopy(message);
    });

    it('names the blocking items for a partial promotion', () => {
      const message = buildQuoteMessage({
        ...snapshot,
        visitState: 'PROMOTION',
      });

      expect(message).toContain('Lunch offer applied to Pasta.');
      expect(message).toContain('Your card stays at 2 of 5');
      expect(message).toContain('Remove Pasta to let the visit count.');
      expectNoHardcodedCopy(message);
    });

    it('says "this order" for an ORDER-scope promotion', () => {
      const message = buildQuoteMessage({
        ...snapshot,
        visitState: 'PROMOTION',
        promotionScope: 'ORDER',
        promotionItems: [],
      });

      expect(message).toContain('applied to this order');
      expect(message).not.toContain('Pasta');
      expectNoHardcodedCopy(message);
    });

    it('omits the card clause for a guest promotion', () => {
      const message = buildQuoteMessage({
        ...snapshot,
        visitState: 'GUEST',
      });

      expect(message).toBe('Promotion applied. No visit tracked.');
      expect(message).not.toContain('card stays');
    });

    it('shows guest promotion copy with no phone instead of the phone prompt', () => {
      const message = buildQuoteMessage({
        ...snapshot,
        visitState: 'GUEST',
        noPhone: true,
      });

      expect(message).toBe('Promotion applied. No visit tracked.');
    });

    it('shows guest promotion copy with a phone', () => {
      const message = buildQuoteMessage({
        ...snapshot,
        visitState: 'GUEST',
        noPhone: false,
      });

      expect(message).toBe('Promotion applied. No visit tracked.');
    });

    it('renders mixed-bill promotion copy', () => {
      const message = buildQuoteMessage({
        ...snapshot,
        visitState: 'PROMOTION',
        promotionScope: 'MULTIPLE',
        promotionLabel: 'Promotions',
        promotionItems: [
          { itemId: 'item-1', name: 'Pasta' },
          { itemId: 'item-2', name: 'Soup' },
        ],
      });

      expect(message).toContain('Promotions applied to Pasta and Soup.');
      expectNoHardcodedCopy(message);
    });

    it('invites a phone number when none was entered', () => {
      expect(
        buildQuoteMessage({
          ...snapshot,
          visitState: 'GUEST',
          noPhone: true,
          promotionScope: null,
          promotionLabel: null,
          promotionItems: [],
        })
      ).toBe('Earn a visit. Add your mobile number.');
    });

    it('uses no-amount copy below the minimum at QR', () => {
      const message = buildQuoteMessage({
        ...snapshot,
        visitState: 'BELOW_MINIMUM',
      });

      expect(message).toBe(
        'This visit needs the minimum daily spend. Staff can help at the counter.'
      );
      expect(message).not.toContain('8.00');
      expect(message).not.toContain('RM8');
    });

    it('renders already-counted copy', () => {
      expect(
        buildQuoteMessage({ ...snapshot, visitState: 'ALREADY_COUNTED' })
      ).toBe("Today's visit is already counted.");
    });
  });

  describe('QR error copy', () => {
    const guestError = (code: string, retryAfterSeconds?: number) =>
      buildQuoteMessage({
        ...snapshot,
        visitState: 'GUEST',
        noPhone: true,
        promotionScope: null,
        promotionLabel: null,
        promotionItems: [],
        loyaltyErrorCode: code,
        retryAfterSeconds,
      });

    it('maps PHONE_INVALID to a field-level message', () => {
      expect(guestError('PHONE_INVALID')).toContain('valid mobile number');
    });

    it('maps CONSENT_REQUIRED to inline consent copy', () => {
      expect(guestError('CONSENT_REQUIRED')).toBe(
        'Please agree to the rewards notice to join.'
      );
    });

    it('maps CONSENT_STALE to re-show the notice', () => {
      expect(guestError('CONSENT_STALE')).toBe(
        'The rewards notice changed. Review and agree again.'
      );
    });

    it('maps CONSENT_VERSION_REQUIRED to review the notice', () => {
      expect(guestError('CONSENT_VERSION_REQUIRED')).toBe(
        'Review the rewards notice before joining.'
      );
    });

    it('maps RATE_LIMITED to the retry window', () => {
      expect(guestError('RATE_LIMITED', 30)).toBe('Try again in 30 seconds.');
      expect(guestError('RATE_LIMITED', 1)).toBe('Try again in 1 second.');
      expect(guestError('RATE_LIMITED')).toBe('Try again later.');
    });

    it('maps LOYALTY_DISABLED to neutral copy', () => {
      expect(guestError('LOYALTY_DISABLED')).toBe(
        'Loyalty is off for this restaurant.'
      );
    });

    it('uses staff-help copy only for non-recoverable codes', () => {
      expect(guestError('SOMETHING_UNEXPECTED')).toBe(
        'Could not add rewards. Staff can help at the counter.'
      );
    });
  });

  describe('Counter bill', () => {
    it('renders a counted visit', () => {
      const message = buildBillMessage(snapshot);

      expect(message).toBe('Visit counted: 2 of 5.');
      expectNoHardcodedCopy(message);
    });

    it('renders a reward reset', () => {
      expect(buildBillMessage({ ...snapshot, rewardApplied: true })).toBe(
        'RM5 off applied; card resets.'
      );
    });

    it('names the blocking items for a partial promotion', () => {
      const message = buildBillMessage({
        ...snapshot,
        visitState: 'PROMOTION',
      });

      expect(message).toContain('Pasta');
      expect(message).toContain('card remains at 2 of 5');
      expect(message).toContain('Remove Pasta');
      expectNoHardcodedCopy(message);
    });

    it('renders mixed-bill copy', () => {
      const message = buildBillMessage({
        ...snapshot,
        visitState: 'PROMOTION',
        promotionScope: 'MULTIPLE',
        promotionLabel: 'Promotions',
        promotionItems: [
          { itemId: 'item-1', name: 'Pasta' },
          { itemId: 'item-2', name: 'Soup' },
        ],
      });

      expect(message).toContain('Promotions applied to Pasta and Soup.');
      expect(message).toContain('card remains at 2 of 5');
    });

    it('may show the amount below the minimum at the Counter', () => {
      const message = buildBillMessage({
        ...snapshot,
        visitState: 'BELOW_MINIMUM',
      });

      expect(message).toBe('Spend RM8.00 more today to make this visit count.');
    });

    it('renders guest copy', () => {
      expect(
        buildBillMessage({
          ...snapshot,
          visitState: 'GUEST',
          promotionScope: null,
          promotionLabel: null,
          promotionItems: [],
        })
      ).toBe(
        'Guest order - no visit tracked; staff can attach at the counter.'
      );
    });
  });

  describe('payment result', () => {
    it.each([
      ['VISIT_COUNTED', 'Visit counted: 2 of 5.'],
      ['REWARD_APPLIED', 'RM5 off applied; card resets.'],
      [
        'PROMOTION_APPLIED',
        'Promotion applied; visit not counted; card stays at 2 of 5.',
      ],
      ['BELOW_MINIMUM', 'Visit not counted; minimum daily spend not met.'],
      ['ALREADY_COUNTED', "Today's visit is already counted."],
      ['GUEST', 'Guest order - no visit tracked.'],
    ] as const)('renders %s from the snapshot', (outcome, expected) => {
      const message = buildPaymentResultMessage({
        ...snapshot,
        outcome,
      });

      expect(message).toBe(expected);
      expectNoHardcodedCopy(message);
    });

    it('omits the card clause for a guest promotion', () => {
      const message = buildPaymentResultMessage({
        ...snapshot,
        visitState: 'GUEST',
        outcome: 'PROMOTION_APPLIED',
      });

      expect(message).toBe('Promotion applied. No visit tracked.');
      expect(message).not.toContain('card');
    });

    it('renders mixed-bill payment copy', () => {
      const message = buildPaymentResultMessage({
        ...snapshot,
        visitState: 'PROMOTION',
        outcome: 'PROMOTION_APPLIED',
        promotionScope: 'MULTIPLE',
        promotionLabel: 'Promotions',
        promotionItems: [
          { itemId: 'item-1', name: 'Pasta' },
          { itemId: 'item-2', name: 'Soup' },
        ],
      });

      expect(message).toContain(
        'Promotions applied to Pasta and Soup; visit not counted; card stays at 2 of 5.'
      );
    });

    it('returns no loyalty copy for NO_BENEFIT', () => {
      expect(
        buildPaymentResultMessage({ ...snapshot, outcome: 'NO_BENEFIT' })
      ).toBeNull();
    });
  });

  describe('receipt', () => {
    it('renders a counted visit', () => {
      const message = buildReceiptMessage(snapshot);

      expect(message).toBe('Visit counted: 2 of 5.');
      expectNoHardcodedCopy(message);
    });

    it('renders a reward reset', () => {
      expect(buildReceiptMessage({ ...snapshot, rewardApplied: true })).toBe(
        'RM5 off applied; card resets.'
      );
    });

    it('renders promotion copy with the card snapshot', () => {
      const message = buildReceiptMessage({
        ...snapshot,
        visitState: 'PROMOTION',
      });

      expect(message).toContain('Lunch offer applied to Pasta.');
      expect(message).toContain('card remains at 2 of 5');
      expectNoHardcodedCopy(message);
    });

    it('includes the promotion label for an ORDER-scope receipt', () => {
      const message = buildReceiptMessage({
        ...snapshot,
        visitState: 'PROMOTION',
        promotionScope: 'ORDER',
        promotionItems: [],
      });

      expect(message).toContain('Lunch offer applied to this order.');
      expect(message).toContain('card remains at 2 of 5');
    });

    it('transliterates a non-ASCII label to ASCII', () => {
      const message = buildReceiptMessage({
        ...snapshot,
        visitState: 'PROMOTION',
        promotionScope: 'ORDER',
        promotionItems: [],
        promotionLabel: 'Café 20%',
      });

      expect(message).not.toBeNull();
      expect(message).toMatch(/^[\x20-\x7E]*$/);
      expect(message).toContain('Cafe 20% applied');
      expect(message).not.toContain('Café');
    });

    it('uses no-amount below-minimum copy', () => {
      const message = buildReceiptMessage({
        ...snapshot,
        visitState: 'BELOW_MINIMUM',
      });

      expect(message).toBe('Visit not counted; minimum daily spend not met.');
      expect(message).not.toContain('8.00');
      expect(message).not.toContain('30.00');
    });

    it('is ASCII-only for every receipt state', () => {
      const contexts: LoyaltyCopyContext[] = [
        snapshot,
        { ...snapshot, rewardApplied: true },
        { ...snapshot, visitState: 'PROMOTION' },
        { ...snapshot, visitState: 'ALREADY_COUNTED' },
        { ...snapshot, visitState: 'BELOW_MINIMUM' },
        { ...snapshot, visitState: 'GUEST' },
      ];

      for (const context of contexts) {
        const message = buildReceiptMessage(context);
        expect(message).not.toBeNull();
        expect(message).toMatch(/^[\x20-\x7E]*$/);
      }
    });
  });

  it('never hardcodes snapshot values in any builder', () => {
    const builders = [
      buildQuoteMessage,
      buildBillMessage,
      buildPaymentResultMessage,
      buildReceiptMessage,
    ];
    const states: LoyaltyCopyContext[] = [
      snapshot,
      { ...snapshot, rewardApplied: true },
      { ...snapshot, visitState: 'PROMOTION' },
      { ...snapshot, visitState: 'ALREADY_COUNTED' },
      { ...snapshot, visitState: 'BELOW_MINIMUM' },
      {
        ...snapshot,
        visitState: 'GUEST',
        promotionScope: null,
        promotionItems: [],
        promotionLabel: null,
      },
    ];

    for (const builder of builders) {
      for (const state of states) {
        const message = builder(state);
        for (const token of HARDCODED) {
          expect(message ?? '').not.toContain(token);
        }
      }
    }
  });

  describe('loyalty disabled precedence', () => {
    const promotionContext: LoyaltyCopyContext = {
      ...snapshot,
      visitState: 'PROMOTION',
      outcome: 'PROMOTION_APPLIED',
      loyaltyDisabled: true,
    };

    it('wins over promotion copy on the QR quote', () => {
      expect(buildQuoteMessage(promotionContext)).toBe(
        'Loyalty is off for this restaurant.'
      );
    });

    it('wins over promotion copy on the bill', () => {
      expect(buildBillMessage(promotionContext)).toBe(
        'Loyalty is off for this restaurant.'
      );
    });

    it('wins over promotion copy on the payment result', () => {
      expect(buildPaymentResultMessage(promotionContext)).toBe(
        'Loyalty is off for this restaurant.'
      );
    });

    it('wins over promotion copy on the receipt', () => {
      expect(buildReceiptMessage(promotionContext)).toBe(
        'Loyalty is off for this restaurant.'
      );
    });
  });

  it('renders the disabled state from the flag', () => {
    expect(buildQuoteMessage({ ...snapshot, loyaltyDisabled: true })).toBe(
      'Loyalty is off for this restaurant.'
    );
  });
});
