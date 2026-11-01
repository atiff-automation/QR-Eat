/**
 * Station pairing codes.
 *
 * A device used to be set up by copying a UUID and a 43-character secret from
 * the owner dashboard into a tablet keyboard. This module replaces that with one
 * short code the installer can read off a screen and type (D63).
 *
 * The alphabet is Crockford base32 minus the ambiguous letters: `I`, `L`, `O`
 * and `U` are not in it, and `I`/`L` fold to `1`, `O` folds to `0` on input, so
 * a code read aloud or typed from a photo still resolves.
 *
 * Eight symbols is 40 bits. The code therefore needs no expiry: it is single
 * use, and revocation is the control. Never widen this alphabet without also
 * revisiting the entropy argument in `docs/API-CONTRACT.md` §2.1.1.
 */

import { randomInt } from 'crypto';

/** Crockford base32 without `I`, `L`, `O` and `U`. */
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

const CODE_LENGTH = 8;

/** A fresh code. Stored verbatim; the unique index rejects a duplicate. */
export function generatePairingCode(): string {
  let code = '';
  for (let index = 0; index < CODE_LENGTH; index += 1) {
    code += ALPHABET[randomInt(0, ALPHABET.length)];
  }
  return code;
}

/**
 * Upper-cases, folds confusable characters and drops separators. Idempotent, so
 * it is safe to apply to a value that came back from the database.
 */
export function normalizePairingCode(raw: string): string {
  return raw
    .toUpperCase()
    .replace(/[^0-9A-Z]/g, '')
    .replace(/[IL]/g, '1')
    .replace(/O/g, '0');
}

/** True only for an exact, in-alphabet, eight-symbol code. */
export function isValidPairingCode(raw: string): boolean {
  const code = normalizePairingCode(raw);
  if (code.length !== CODE_LENGTH) return false;
  return [...code].every((character) => ALPHABET.includes(character));
}

/** Groups the code for display: `K7F2-9QXM`. */
export function formatPairingCode(raw: string): string {
  const code = normalizePairingCode(raw);
  if (code.length !== CODE_LENGTH) return code;
  return `${code.slice(0, 4)}-${code.slice(4)}`;
}
