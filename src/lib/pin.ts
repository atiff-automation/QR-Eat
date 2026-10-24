/**
 * Staff station-PIN helpers.
 *
 * A PIN is a shift-level operator identity on an already-provisioned device,
 * not an account password. The actual PIN is bcrypt-hashed. A keyed
 * fingerprint is stored separately so the database can enforce “one PIN per
 * staff member per restaurant” with a unique constraint and the unlock route
 * can find the candidate without scanning every hash.
 */

import crypto from 'crypto';
import bcrypt from 'bcryptjs';

const PIN_LENGTH = 6;

const BLOCKED_PINS = new Set([
  '000000',
  '111111',
  '222222',
  '333333',
  '444444',
  '555555',
  '666666',
  '777777',
  '888888',
  '999999',
  '123456',
  '654321',
  '121212',
  '112233',
  '123123',
  '123321',
]);

function lookupSecret(): string {
  const secret = process.env.PIN_LOOKUP_SECRET || process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('PIN_LOOKUP_SECRET or JWT_SECRET is required');
  }
  return secret;
}

/** Returns a human-readable error, or null when the PIN is acceptable. */
export function validateStaffPin(pin: string): string | null {
  if (!new RegExp(`^\\d{${PIN_LENGTH}}$`).test(pin)) {
    return `PIN must be exactly ${PIN_LENGTH} digits`;
  }

  if (BLOCKED_PINS.has(pin)) {
    return 'PIN is too common; choose another';
  }

  if (/^(\d)\1+$/.test(pin)) {
    return 'PIN cannot be all the same digit';
  }

  const digits = pin.split('').map(Number);
  const ascending = digits.every(
    (digit, index) => index === 0 || digit === digits[index - 1] + 1
  );
  const descending = digits.every(
    (digit, index) => index === 0 || digit === digits[index - 1] - 1
  );
  if (ascending || descending) {
    return 'PIN cannot be sequential';
  }

  return null;
}

export function pinLookup(restaurantId: string, pin: string): string {
  return crypto
    .createHmac('sha256', lookupSecret())
    .update(`${restaurantId}:${pin}`)
    .digest('hex');
}

export function hashStaffPin(pin: string): Promise<string> {
  return bcrypt.hash(pin, 12);
}

export function verifyStaffPin(pin: string, hash: string): Promise<boolean> {
  return bcrypt.compare(pin, hash);
}
