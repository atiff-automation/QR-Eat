import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * P7c migration guard. The real proof is `prisma migrate deploy` against a
 * database with pre-existing rows (recorded in the run log); this test pins the
 * properties that make that apply safe:
 *
 * - the new `loyalty_settings` column is NOT NULL **with a default**, so every
 *   existing row is valid without a backfill;
 * - `security_events.restaurantId` is nullable, so existing platform-wide rows
 *   stay valid;
 * - the CHECK is added `NOT VALID` and validated in place;
 * - nothing is dropped, truncated or rewritten.
 */

const MIGRATIONS = [
  'prisma/migrations/20261114120000_loyalty_rate_limit_rebalance/migration.sql',
  'prisma/migrations/20261114120100_loyalty_rate_limit_rebalance_checks/migration.sql',
];

function readMigration(path: string): string {
  return readFileSync(join(process.cwd(), path), 'utf8');
}

describe('P7c migration', () => {
  const combined = MIGRATIONS.map(readMigration).join('\n');

  it('adds the settings ceiling with a default so existing rows stay valid', () => {
    expect(combined).toMatch(
      /ADD COLUMN\s+"lookupLimitPerHour"\s+INTEGER\s+NOT NULL\s+DEFAULT 30/
    );
  });

  it('adds a nullable restaurantId to security events', () => {
    expect(combined).toMatch(/ADD COLUMN\s+"restaurantId"\s+TEXT/);
    expect(combined).not.toMatch(/"restaurantId"\s+TEXT\s+NOT NULL/);
  });

  it('adds the security event lookup index', () => {
    expect(combined).toContain(
      'CREATE INDEX "security_events_eventType_ipAddress_createdAt_idx"'
    );
  });

  it('enforces the 1–1000 bound without scanning existing rows', () => {
    expect(combined).toContain('"loyalty_settings_lookupLimitPerHour_check"');
    expect(combined).toMatch(/"lookupLimitPerHour"\s*>=\s*1/);
    expect(combined).toMatch(/"lookupLimitPerHour"\s*<=\s*1000/);
    expect(combined).toContain('NOT VALID');
    expect(combined).toContain(
      'VALIDATE CONSTRAINT "loyalty_settings_lookupLimitPerHour_check"'
    );
  });

  it('is additive: no drop, truncate, delete or backfill update', () => {
    expect(combined).not.toMatch(/\bDROP\s+(COLUMN|TABLE|CONSTRAINT)\b/i);
    expect(combined).not.toMatch(/\bTRUNCATE\b/i);
    expect(combined).not.toMatch(/\bDELETE\s+FROM\b/i);
    expect(combined).not.toMatch(/\bUPDATE\s+"[a-z_]+"\s+SET\b/i);
  });
});
