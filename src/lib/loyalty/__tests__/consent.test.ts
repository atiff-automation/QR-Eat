import {
  hashNoticeText,
  resolveNotice,
  verifyConsent,
  type LoyaltyNoticeSettings,
} from '../consent';

const text =
  'We store your mobile number and visit count to run the rewards programme.';

function settings(
  overrides: Partial<LoyaltyNoticeSettings> = {}
): LoyaltyNoticeSettings {
  return {
    noticeVersion: 'v1',
    noticeText: text,
    noticeTextHash: hashNoticeText(text),
    privacyUrl: 'https://example.test/privacy',
    termsText: 'One visit per day.',
    ...overrides,
  };
}

describe('loyalty consent', () => {
  describe('resolveNotice', () => {
    it('returns the server-derived notice', () => {
      expect(resolveNotice(settings())).toEqual({
        version: 'v1',
        text,
        textHash: hashNoticeText(text),
        privacyUrl: 'https://example.test/privacy',
        termsText: 'One visit per day.',
      });
    });

    it('accepts an uppercase stored hash but returns the canonical hash', () => {
      const notice = resolveNotice(
        settings({ noticeTextHash: hashNoticeText(text).toUpperCase() })
      );

      expect(notice?.textHash).toBe(hashNoticeText(text));
    });

    it.each([
      ['null settings', null],
      ['undefined settings', undefined],
      ['missing version', settings({ noticeVersion: null })],
      ['empty version', settings({ noticeVersion: '   ' })],
      ['missing text', settings({ noticeText: null })],
      ['missing hash', settings({ noticeTextHash: null })],
      ['missing privacy URL', settings({ privacyUrl: null })],
      ['inconsistent hash', settings({ noticeTextHash: 'deadbeef' })],
    ])('returns null for %s', (_label, input) => {
      expect(resolveNotice(input)).toBeNull();
    });

    it('returns null when the stored hash is for different text', () => {
      expect(
        resolveNotice(
          settings({ noticeTextHash: hashNoticeText('other text') })
        )
      ).toBeNull();
    });
  });

  describe('verifyConsent', () => {
    const notice = resolveNotice(settings());
    if (!notice) throw new Error('test notice must resolve');

    it('accepts a matching version and hash', () => {
      const result = verifyConsent(
        { clientVersion: 'v1', clientTextHash: hashNoticeText(text) },
        notice
      );

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.consent.version).toBe('v1');
      expect(result.consent.textHash).toBe(hashNoticeText(text));
      expect(result.consent.text).toBe(text);
    });

    it('returns server values, never client strings', () => {
      const result = verifyConsent(
        {
          clientVersion: 'v1',
          clientTextHash: hashNoticeText(text).toUpperCase(),
        },
        notice
      );

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.consent.version).toBe(notice.version);
      expect(result.consent.textHash).toBe(notice.textHash);
      expect(result.consent.text).toBe(notice.text);
    });

    it('requires consent when nothing is supplied', () => {
      expect(verifyConsent({}, notice)).toMatchObject({
        ok: false,
        code: 'CONSENT_REQUIRED',
      });
      expect(verifyConsent(null, notice)).toMatchObject({
        ok: false,
        code: 'CONSENT_REQUIRED',
      });
    });

    it('requires a version when only a hash is supplied', () => {
      expect(
        verifyConsent({ clientTextHash: hashNoticeText(text) }, notice)
      ).toMatchObject({ ok: false, code: 'CONSENT_VERSION_REQUIRED' });
    });

    it('requires consent when a version is supplied without a hash', () => {
      expect(verifyConsent({ clientVersion: 'v1' }, notice)).toMatchObject({
        ok: false,
        code: 'CONSENT_REQUIRED',
      });
    });

    it('rejects a stale version', () => {
      expect(
        verifyConsent(
          { clientVersion: 'v0', clientTextHash: hashNoticeText(text) },
          notice
        )
      ).toMatchObject({ ok: false, code: 'CONSENT_STALE' });
    });

    it('rejects a stale hash', () => {
      expect(
        verifyConsent(
          { clientVersion: 'v1', clientTextHash: hashNoticeText('old text') },
          notice
        )
      ).toMatchObject({ ok: false, code: 'CONSENT_STALE' });
    });

    it('rejects a different-length hash without throwing', () => {
      expect(
        verifyConsent({ clientVersion: 'v1', clientTextHash: 'abc' }, notice)
      ).toMatchObject({ ok: false, code: 'CONSENT_STALE' });
    });
  });
});
