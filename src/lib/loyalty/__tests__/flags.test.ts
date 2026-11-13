import {
  isLoyaltyActive,
  isLoyaltyGloballyEnabled,
  type LoyaltyFlagEnv,
} from '../flags';

describe('loyalty flags', () => {
  describe('isLoyaltyGloballyEnabled', () => {
    it.each<[string, LoyaltyFlagEnv, boolean]>([
      ['unset', {}, false],
      ['exact true', { LOYALTY_ENABLED: 'true' }, true],
      ['uppercase TRUE', { LOYALTY_ENABLED: 'TRUE' }, false],
      ['numeric 1', { LOYALTY_ENABLED: '1' }, false],
      ['yes', { LOYALTY_ENABLED: 'yes' }, false],
      ['false', { LOYALTY_ENABLED: 'false' }, false],
      ['padded true', { LOYALTY_ENABLED: ' true ' }, false],
      ['empty', { LOYALTY_ENABLED: '' }, false],
    ])('%s', (_label, env, expected) => {
      expect(isLoyaltyGloballyEnabled(env)).toBe(expected);
    });
  });

  describe('isLoyaltyActive', () => {
    const on = { LOYALTY_ENABLED: 'true' };

    it('requires both the global flag and the restaurant setting', () => {
      expect(isLoyaltyActive({ enabled: true }, on)).toBe(true);
    });

    it('is inactive when the global flag is off', () => {
      expect(isLoyaltyActive({ enabled: true }, {})).toBe(false);
      expect(isLoyaltyActive({ enabled: true }, { LOYALTY_ENABLED: '1' })).toBe(
        false
      );
    });

    it('is inactive when the restaurant setting is off', () => {
      expect(isLoyaltyActive({ enabled: false }, on)).toBe(false);
    });

    it('is inactive when settings are missing', () => {
      expect(isLoyaltyActive(null, on)).toBe(false);
      expect(isLoyaltyActive(undefined, on)).toBe(false);
    });
  });
});
