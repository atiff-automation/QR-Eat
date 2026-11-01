import {
  formatPairingCode,
  generatePairingCode,
  isValidPairingCode,
  normalizePairingCode,
} from '@/lib/pairing-code';

const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

describe('pairing code alphabet', () => {
  it('never contains the ambiguous letters', () => {
    for (let attempt = 0; attempt < 200; attempt += 1) {
      const code = generatePairingCode();
      expect(code).not.toMatch(/[ILOU]/);
    }
  });

  it('always generates eight symbols from the alphabet', () => {
    for (let attempt = 0; attempt < 200; attempt += 1) {
      const code = generatePairingCode();
      expect(code).toHaveLength(8);
      expect([...code].every((character) => ALPHABET.includes(character))).toBe(
        true
      );
    }
  });

  it('does not repeat across a batch', () => {
    const codes = new Set(
      Array.from({ length: 500 }, () => generatePairingCode())
    );
    expect(codes.size).toBe(500);
  });
});

describe('normalizePairingCode', () => {
  it('upper-cases', () => {
    expect(normalizePairingCode('k7f29qxm')).toBe('K7F29QXM');
  });

  it('drops separators so a displayed code can be typed verbatim', () => {
    expect(normalizePairingCode('K7F2-9QXM')).toBe('K7F29QXM');
    expect(normalizePairingCode(' K7F2 9QXM ')).toBe('K7F29QXM');
    expect(normalizePairingCode('k7f2.9qxm')).toBe('K7F29QXM');
  });

  it('folds the confusable characters', () => {
    expect(normalizePairingCode('I')).toBe('1');
    expect(normalizePairingCode('L')).toBe('1');
    expect(normalizePairingCode('O')).toBe('0');
  });

  it('is idempotent', () => {
    const once = normalizePairingCode(' k7f2-9qxm ');
    expect(normalizePairingCode(once)).toBe(once);
  });
});

describe('isValidPairingCode', () => {
  it('accepts formatted and raw codes', () => {
    expect(isValidPairingCode('K7F2-9QXM')).toBe(true);
    expect(isValidPairingCode('K7F29QXM')).toBe(true);
    expect(isValidPairingCode('k7f2 9qxm')).toBe(true);
  });

  it('accepts a code typed with the confusable letters', () => {
    expect(isValidPairingCode('K7F2-9QXM')).toBe(true);
    expect(isValidPairingCode('K7F2-9QX0')).toBe(true);
  });

  it('rejects the wrong length', () => {
    expect(isValidPairingCode('K7F2-9QX')).toBe(false);
    expect(isValidPairingCode('K7F2-9QXMM')).toBe(false);
    expect(isValidPairingCode('')).toBe(false);
  });

  it('rejects a code that cannot be folded into the alphabet', () => {
    expect(isValidPairingCode('K7F2-9QXU')).toBe(false);
    expect(isValidPairingCode('K7F2-9QX-')).toBe(false);
  });
});

describe('formatPairingCode', () => {
  it('groups four and four', () => {
    expect(formatPairingCode('K7F29QXM')).toBe('K7F2-9QXM');
  });

  it('formats an already formatted code without doubling the dash', () => {
    expect(formatPairingCode('K7F2-9QXM')).toBe('K7F2-9QXM');
  });

  it('returns a bad length untouched so the caller can show it as typed', () => {
    expect(formatPairingCode('K7F2')).toBe('K7F2');
  });
});
