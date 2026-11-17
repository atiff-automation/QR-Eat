import { createHmac } from 'node:crypto';
import {
  LoyaltyConfigurationError,
  hashPhone,
  maskPhone,
  normalisePhone,
} from '../phone';

describe('loyalty phone helpers', () => {
  describe('normalisePhone', () => {
    it.each([
      ['local Malaysian', '0123456789', '+60123456789'],
      ['local with separators', '012-345 6789', '+60123456789'],
      ['local with parentheses and dots', '(012) 345.6789', '+60123456789'],
      ['local landline', '03-1234 5678', '+60312345678'],
      ['Malaysian without plus', '60123456789', '+60123456789'],
      ['Malaysian with plus', '+60123456789', '+60123456789'],
      ['Malaysian with plus and separators', '+60 12-345 6789', '+60123456789'],
      ['Singapore', '+6591234567', '+6591234567'],
      ['Singapore with separators', '+65 9123 4567', '+6591234567'],
      ['United States', '+14155552671', '+14155552671'],
    ])('normalises %s', (_label, input, expected) => {
      expect(normalisePhone(input)).toEqual({ ok: true, phone: expected });
    });

    it.each([
      ['empty string', ''],
      ['whitespace only', '   '],
      ['null', null],
      ['undefined', undefined],
      ['letters', 'abcdef'],
      ['mixed letters', '+60123abc789'],
      ['bare national number', '12345678'],
      ['too short local', '012345'],
      ['too short international', '+6012'],
      ['too long local', '012345678901'],
      ['too long international', '+601234567890123456'],
      ['double plus', '++60123456789'],
      ['plus in the middle', '60+123456789'],
    ])('rejects %s', (_label, input) => {
      expect(normalisePhone(input)).toEqual({
        ok: false,
        code: 'PHONE_INVALID',
      });
    });

    it('is idempotent', () => {
      const once = normalisePhone('012-345 6789');
      expect(once.ok).toBe(true);
      if (!once.ok) throw new Error('expected a valid phone');

      expect(normalisePhone(once.phone)).toEqual(once);
    });

    it('never echoes the full number in a failure', () => {
      const result = normalisePhone('+60123456789x');
      expect(result.ok).toBe(false);
      expect(JSON.stringify(result)).not.toContain('60123456789');
    });
  });

  describe('hashPhone', () => {
    const phone = '+60123456789';
    const key = 'test-hmac-key';

    it('is deterministic HMAC-SHA-256 hex', () => {
      const expected = createHmac('sha256', key)
        .update(phone, 'utf8')
        .digest('hex');

      expect(hashPhone(phone, key)).toBe(expected);
      expect(hashPhone(phone, key)).toBe(hashPhone(phone, key));
      expect(hashPhone(phone, key)).toMatch(/^[a-f0-9]{64}$/);
    });

    it('differs per key', () => {
      expect(hashPhone(phone, 'key-a')).not.toBe(hashPhone(phone, 'key-b'));
    });

    it.each([
      ['undefined', undefined],
      ['empty', ''],
      ['whitespace', '   '],
    ])('throws a typed error for a %s key', (_label, missingKey) => {
      expect(() => hashPhone(phone, missingKey)).toThrow(
        LoyaltyConfigurationError
      );
    });

    it('never puts the phone in the configuration error', () => {
      try {
        hashPhone(phone, '');
        throw new Error('expected hashPhone to throw');
      } catch (error) {
        expect(error).toBeInstanceOf(LoyaltyConfigurationError);
        expect(String((error as Error).message)).not.toContain('60123456789');
      }
    });
  });

  describe('maskPhone', () => {
    it.each([
      ['+6012345678', '+60••••••78'],
      ['+60123456789', '+60•••••••89'],
      ['+6591234567', '+65••••••67'],
      ['+14155552671', '+1••••••••71'],
    ])('masks %s as %s', (input, expected) => {
      expect(maskPhone(input)).toBe(expected);
    });

    it.each(['+601', '+6012', '+1'])(
      'returns a fully generic mask when the national part is too short: %s',
      (input) => {
        const masked = maskPhone(input);

        expect(masked).toBe('+••••');
        expect(masked).not.toMatch(/\d/);
      }
    );

    it('still masks a valid E.164 number with the country code and last two digits', () => {
      expect(maskPhone('+6012345678')).toBe('+60••••••78');
    });

    it('keeps the country code and only the last two digits', () => {
      const masked = maskPhone('+6012345678');

      expect(masked.startsWith('+60')).toBe(true);
      expect(masked.endsWith('78')).toBe(true);
      expect(masked).toContain('•');
    });

    it('never returns the full number', () => {
      const input = '+60123456789';
      const masked = maskPhone(input);

      expect(masked).not.toBe(input);
      expect(masked).not.toContain('123456789');
    });

    it('masks invalid input defensively', () => {
      expect(maskPhone('abc')).toBe('+••••');
      expect(maskPhone('+1')).toBe('+••••');
    });
  });
});
