/**
 * Jest `setupFiles` entry for the integration suite.
 *
 * Runs before any test module (and therefore before the app modules read their
 * environment at import time). It validates `INTEGRATION_DATABASE_URL` and then
 * points the application at that same validated database:
 *
 * - `DATABASE_URL` is derived from the guarded variable, so a local `.env` or a
 *   stale shell value cannot redirect the suite at a shared database.
 * - `JWT_SECRET` is a per-run disposable value. Tokens only need to verify
 *   inside this process; nothing is committed and nothing outlives the run.
 */

import { randomBytes } from 'crypto';
import {
  describeDatabaseTarget,
  INTEGRATION_DATABASE_URL_ENV,
  resolveIntegrationDatabaseUrl,
} from './guard';

const target = resolveIntegrationDatabaseUrl();

// The Prisma singleton, the pg LISTEN/NOTIFY clients and any other module that
// reads DATABASE_URL at import time now all use the guarded target.
process.env.DATABASE_URL = target.url;

// A real signing key is needed to build the same tokens the app verifies. It is
// generated per run, never printed, and never stored in a committed file.
if (!process.env.JWT_SECRET) {
  process.env.JWT_SECRET = randomBytes(32).toString('hex');
}
if (!process.env.JWT_EXPIRES_IN) {
  process.env.JWT_EXPIRES_IN = '1h';
}

// Safe label only: no credentials, no port.
console.log(
  `[integration] guarded database target: ${describeDatabaseTarget(target)} ` +
    `(${INTEGRATION_DATABASE_URL_ENV})`
);
