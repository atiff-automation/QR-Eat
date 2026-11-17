import {
  nextCardState,
  resolveOutcome,
  resolveVisitOutcome,
  resolveVisitState,
  type OutcomeInput,
  type VisitOutcomeInput,
  type VisitStateInput,
} from '../visit';

function visitInput(overrides: Partial<VisitStateInput> = {}): VisitStateInput {
  return {
    hasMember: true,
    hasConsent: true,
    hasPromotion: false,
    alreadyCounted: false,
    daySubtotal: '30.00',
    minDailySpend: '20.00',
    ...overrides,
  };
}

function outcomeInput(overrides: Partial<OutcomeInput> = {}): OutcomeInput {
  return {
    hasMember: true,
    hasConsent: true,
    hasPromotion: false,
    rewardApplied: false,
    visitCounted: false,
    alreadyCounted: false,
    belowMinimum: false,
    ...overrides,
  };
}

function visitOutcomeInput(
  overrides: Partial<VisitOutcomeInput> = {}
): VisitOutcomeInput {
  return {
    hasMember: true,
    hasConsent: true,
    hasPromotion: false,
    rewardApplied: false,
    alreadyCounted: false,
    daySubtotal: '30.00',
    minDailySpend: '20.00',
    ...overrides,
  };
}

describe('resolveVisitState', () => {
  it('returns COUNTS when the visit qualifies', () => {
    expect(resolveVisitState(visitInput())).toBe('COUNTS');
  });

  it('returns GUEST when there is no member or no consent', () => {
    expect(resolveVisitState(visitInput({ hasMember: false }))).toBe('GUEST');
    expect(resolveVisitState(visitInput({ hasConsent: false }))).toBe('GUEST');
  });

  it('returns PROMOTION when a promotion applies', () => {
    expect(resolveVisitState(visitInput({ hasPromotion: true }))).toBe(
      'PROMOTION'
    );
  });

  it('returns ALREADY_COUNTED when the day is already counted', () => {
    expect(resolveVisitState(visitInput({ alreadyCounted: true }))).toBe(
      'ALREADY_COUNTED'
    );
  });

  it('returns BELOW_MINIMUM when the day subtotal is below the minimum', () => {
    expect(
      resolveVisitState(
        visitInput({ daySubtotal: '19.99', minDailySpend: '20.00' })
      )
    ).toBe('BELOW_MINIMUM');
  });

  it('treats exactly the minimum as qualifying', () => {
    expect(
      resolveVisitState(
        visitInput({ daySubtotal: '20.00', minDailySpend: '20.00' })
      )
    ).toBe('COUNTS');
  });

  describe('precedence GUEST > PROMOTION > ALREADY_COUNTED > BELOW_MINIMUM > COUNTS', () => {
    it('guest beats promotion, already counted and below minimum', () => {
      expect(
        resolveVisitState(
          visitInput({
            hasMember: false,
            hasPromotion: true,
            alreadyCounted: true,
            daySubtotal: '0.00',
          })
        )
      ).toBe('GUEST');
    });

    it('promotion beats already counted and below minimum', () => {
      expect(
        resolveVisitState(
          visitInput({
            hasPromotion: true,
            alreadyCounted: true,
            daySubtotal: '0.00',
          })
        )
      ).toBe('PROMOTION');
    });

    it('already counted beats below minimum', () => {
      expect(
        resolveVisitState(
          visitInput({
            alreadyCounted: true,
            daySubtotal: '0.00',
          })
        )
      ).toBe('ALREADY_COUNTED');
    });

    it.each([
      [
        'GUEST over PROMOTION',
        { hasMember: false, hasPromotion: true },
        'GUEST',
      ],
      [
        'GUEST over ALREADY_COUNTED',
        { hasMember: false, alreadyCounted: true },
        'GUEST',
      ],
      [
        'GUEST over BELOW_MINIMUM',
        { hasMember: false, daySubtotal: '0.00' },
        'GUEST',
      ],
      [
        'PROMOTION over ALREADY_COUNTED',
        { hasPromotion: true, alreadyCounted: true },
        'PROMOTION',
      ],
      [
        'PROMOTION over BELOW_MINIMUM',
        { hasPromotion: true, daySubtotal: '0.00' },
        'PROMOTION',
      ],
      [
        'ALREADY_COUNTED over BELOW_MINIMUM',
        { alreadyCounted: true, daySubtotal: '0.00' },
        'ALREADY_COUNTED',
      ],
    ] as const)('orders %s', (_label, overrides, expected) => {
      expect(resolveVisitState(visitInput(overrides))).toBe(expected);
    });
  });
});

describe('resolveOutcome', () => {
  it('returns NO_BENEFIT when nothing applies', () => {
    expect(resolveOutcome(outcomeInput())).toBe('NO_BENEFIT');
  });

  it('returns VISIT_COUNTED when the visit counts', () => {
    expect(resolveOutcome(outcomeInput({ visitCounted: true }))).toBe(
      'VISIT_COUNTED'
    );
  });

  it('returns REWARD_APPLIED when the reward applies', () => {
    expect(
      resolveOutcome(outcomeInput({ visitCounted: true, rewardApplied: true }))
    ).toBe('REWARD_APPLIED');
  });

  it('returns PROMOTION_APPLIED even for a guest', () => {
    expect(
      resolveOutcome(
        outcomeInput({
          hasMember: false,
          hasPromotion: true,
          belowMinimum: true,
        })
      )
    ).toBe('PROMOTION_APPLIED');
  });

  it('returns GUEST when the customer is not a resolved member', () => {
    expect(
      resolveOutcome(outcomeInput({ hasMember: false, hasConsent: false }))
    ).toBe('GUEST');
  });

  describe('precedence PROMOTION_APPLIED > REWARD_APPLIED > VISIT_COUNTED > ALREADY_COUNTED > BELOW_MINIMUM > GUEST > NO_BENEFIT', () => {
    it('promotion beats reward, visit, already counted and below minimum', () => {
      expect(
        resolveOutcome(
          outcomeInput({
            hasPromotion: true,
            rewardApplied: true,
            visitCounted: true,
            alreadyCounted: true,
            belowMinimum: true,
          })
        )
      ).toBe('PROMOTION_APPLIED');
    });

    it('reward beats visit, already counted and below minimum', () => {
      expect(
        resolveOutcome(
          outcomeInput({
            rewardApplied: true,
            visitCounted: true,
            alreadyCounted: true,
            belowMinimum: true,
          })
        )
      ).toBe('REWARD_APPLIED');
    });

    it('visit beats already counted and below minimum', () => {
      expect(
        resolveOutcome(
          outcomeInput({
            visitCounted: true,
            alreadyCounted: true,
            belowMinimum: true,
          })
        )
      ).toBe('VISIT_COUNTED');
    });

    it('already counted beats below minimum', () => {
      expect(
        resolveOutcome(
          outcomeInput({
            alreadyCounted: true,
            belowMinimum: true,
          })
        )
      ).toBe('ALREADY_COUNTED');
    });

    it('below minimum beats guest', () => {
      expect(
        resolveOutcome(
          outcomeInput({
            hasMember: false,
            hasConsent: false,
            belowMinimum: true,
          })
        )
      ).toBe('BELOW_MINIMUM');
    });

    it.each([
      [
        'PROMOTION_APPLIED over REWARD_APPLIED',
        { hasPromotion: true, rewardApplied: true },
        'PROMOTION_APPLIED',
      ],
      [
        'PROMOTION_APPLIED over VISIT_COUNTED',
        { hasPromotion: true, visitCounted: true },
        'PROMOTION_APPLIED',
      ],
      [
        'PROMOTION_APPLIED over ALREADY_COUNTED',
        { hasPromotion: true, alreadyCounted: true },
        'PROMOTION_APPLIED',
      ],
      [
        'PROMOTION_APPLIED over BELOW_MINIMUM',
        { hasPromotion: true, belowMinimum: true },
        'PROMOTION_APPLIED',
      ],
      [
        'PROMOTION_APPLIED over GUEST',
        { hasPromotion: true, hasMember: false },
        'PROMOTION_APPLIED',
      ],
      [
        'REWARD_APPLIED over VISIT_COUNTED',
        { rewardApplied: true, visitCounted: true },
        'REWARD_APPLIED',
      ],
      [
        'REWARD_APPLIED over ALREADY_COUNTED',
        { rewardApplied: true, alreadyCounted: true },
        'REWARD_APPLIED',
      ],
      [
        'REWARD_APPLIED over BELOW_MINIMUM',
        { rewardApplied: true, belowMinimum: true },
        'REWARD_APPLIED',
      ],
      [
        'REWARD_APPLIED over GUEST',
        { rewardApplied: true, hasMember: false },
        'REWARD_APPLIED',
      ],
      [
        'VISIT_COUNTED over ALREADY_COUNTED',
        { visitCounted: true, alreadyCounted: true },
        'VISIT_COUNTED',
      ],
      [
        'VISIT_COUNTED over BELOW_MINIMUM',
        { visitCounted: true, belowMinimum: true },
        'VISIT_COUNTED',
      ],
      [
        'VISIT_COUNTED over GUEST',
        { visitCounted: true, hasMember: false },
        'VISIT_COUNTED',
      ],
      [
        'ALREADY_COUNTED over BELOW_MINIMUM',
        { alreadyCounted: true, belowMinimum: true },
        'ALREADY_COUNTED',
      ],
      [
        'ALREADY_COUNTED over GUEST',
        { alreadyCounted: true, hasMember: false },
        'ALREADY_COUNTED',
      ],
      [
        'BELOW_MINIMUM over GUEST',
        { belowMinimum: true, hasMember: false },
        'BELOW_MINIMUM',
      ],
    ] as const)('orders %s', (_label, overrides, expected) => {
      expect(resolveOutcome(outcomeInput(overrides))).toBe(expected);
    });
  });
});

describe('resolveVisitOutcome', () => {
  it('resolves a guest with no member data', () => {
    expect(
      resolveVisitOutcome(
        visitOutcomeInput({ hasMember: false, hasConsent: false })
      )
    ).toEqual({ visitState: 'GUEST', outcome: 'GUEST' });
  });

  it('resolves a guest with an applied promotion', () => {
    expect(
      resolveVisitOutcome(
        visitOutcomeInput({ hasMember: false, hasPromotion: true })
      )
    ).toEqual({ visitState: 'GUEST', outcome: 'PROMOTION_APPLIED' });
  });

  it('never turns a guest into BELOW_MINIMUM', () => {
    expect(
      resolveVisitOutcome(
        visitOutcomeInput({
          hasMember: false,
          daySubtotal: '0.00',
          minDailySpend: '20.00',
        })
      )
    ).toEqual({ visitState: 'GUEST', outcome: 'GUEST' });
  });

  it('resolves a member below the minimum as BELOW_MINIMUM', () => {
    expect(
      resolveVisitOutcome(
        visitOutcomeInput({ daySubtotal: '19.99', minDailySpend: '20.00' })
      )
    ).toEqual({ visitState: 'BELOW_MINIMUM', outcome: 'BELOW_MINIMUM' });
  });

  it('resolves an already-counted member', () => {
    expect(
      resolveVisitOutcome(visitOutcomeInput({ alreadyCounted: true }))
    ).toEqual({
      visitState: 'ALREADY_COUNTED',
      outcome: 'ALREADY_COUNTED',
    });
  });

  it('resolves a qualifying member as VISIT_COUNTED', () => {
    expect(
      resolveVisitOutcome(
        visitOutcomeInput({ daySubtotal: '20.00', minDailySpend: '20.00' })
      )
    ).toEqual({ visitState: 'COUNTS', outcome: 'VISIT_COUNTED' });
  });

  it('resolves a member with an applied promotion', () => {
    expect(
      resolveVisitOutcome(visitOutcomeInput({ hasPromotion: true }))
    ).toEqual({ visitState: 'PROMOTION', outcome: 'PROMOTION_APPLIED' });
  });

  it('resolves a qualifying reward visit', () => {
    expect(
      resolveVisitOutcome(visitOutcomeInput({ rewardApplied: true }))
    ).toEqual({ visitState: 'COUNTS', outcome: 'REWARD_APPLIED' });
  });

  it('keeps already-counted above below-minimum', () => {
    expect(
      resolveVisitOutcome(
        visitOutcomeInput({ alreadyCounted: true, daySubtotal: '0.00' })
      )
    ).toEqual({
      visitState: 'ALREADY_COUNTED',
      outcome: 'ALREADY_COUNTED',
    });
  });
});

describe('nextCardState', () => {
  it('increments on a non-reward visit', () => {
    expect(nextCardState({ visitsInCycle: 0, visitsRequired: 3 })).toEqual({
      increments: true,
      resets: false,
      rewardApplies: false,
    });
    expect(nextCardState({ visitsInCycle: 1, visitsRequired: 3 })).toEqual({
      increments: true,
      resets: false,
      rewardApplies: false,
    });
  });

  it('resets and applies the reward on the completing visit', () => {
    expect(nextCardState({ visitsInCycle: 2, visitsRequired: 3 })).toEqual({
      increments: false,
      resets: true,
      rewardApplies: true,
    });
    expect(nextCardState({ visitsInCycle: 1, visitsRequired: 2 })).toEqual({
      increments: false,
      resets: true,
      rewardApplies: true,
    });
  });

  it('honours 0 <= visitsInCycle < visitsRequired', () => {
    expect(() =>
      nextCardState({ visitsInCycle: -1, visitsRequired: 3 })
    ).toThrow(RangeError);
    expect(() =>
      nextCardState({ visitsInCycle: 3, visitsRequired: 3 })
    ).toThrow(RangeError);
    expect(() =>
      nextCardState({ visitsInCycle: 4, visitsRequired: 3 })
    ).toThrow(RangeError);
    expect(() =>
      nextCardState({ visitsInCycle: 0, visitsRequired: 0 })
    ).toThrow(RangeError);
  });
});
