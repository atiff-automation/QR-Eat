/**
 * Single database entry point for the tenant-isolation integration suite.
 *
 * `setup.ts` has already validated `INTEGRATION_DATABASE_URL` and copied it to
 * `DATABASE_URL` before this module loads. This module re-validates so a test
 * file imported outside that setup still fails closed, and it exports the one
 * Prisma client every fixture and assertion uses.
 */

import { prisma as appPrisma } from '@/lib/database';
import {
  assertDisposableDatabase,
  describeDatabaseTarget,
  IntegrationDatabaseGuardError,
  resolveIntegrationDatabaseUrl,
  type DisposableDatabaseTarget,
} from './guard';

export {
  assertDisposableDatabase,
  describeDatabaseTarget,
  IntegrationDatabaseGuardError,
  resolveIntegrationDatabaseUrl,
};
export type { DisposableDatabaseTarget };

/** The validated target for this run. Host/database only are safe to log. */
export const integrationDatabase: DisposableDatabaseTarget =
  resolveIntegrationDatabaseUrl();

if (
  process.env.DATABASE_URL &&
  process.env.DATABASE_URL !== integrationDatabase.url
) {
  throw new IntegrationDatabaseGuardError(
    'DATABASE_URL does not match INTEGRATION_DATABASE_URL. The integration ' +
      'suite only talks to the guarded disposable database; do not override ' +
      'DATABASE_URL in the environment.',
    'INTEGRATION_DATABASE_INVALID'
  );
}

/**
 * One Prisma client for the whole run: the application singleton, so the route
 * handlers under test and the fixtures see the same connection pool and rows.
 */
export const prisma = appPrisma;

/** Release the pool once the suite has cleaned its rows. */
export async function disconnectIntegrationDatabase(): Promise<void> {
  await prisma.$disconnect();
}
