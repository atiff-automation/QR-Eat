/**
 * Disposable-database guard for the tenant-isolation integration suite.
 *
 * The integration suite writes real rows. It must never be able to point at a
 * shared, staging or production database, even by a stray `.env`. This module
 * therefore reads a dedicated variable (`INTEGRATION_DATABASE_URL`) and refuses
 * anything that is not a loopback host with a disposable database name.
 *
 * The error messages name the host and database only. They never include the
 * URL, because the URL may carry credentials.
 */

export const INTEGRATION_DATABASE_URL_ENV = 'INTEGRATION_DATABASE_URL';

/** Exact loopback names only. `127.0.0.1.example.com` is not loopback. */
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

/**
 * Disposable names: `qreat_it*` (for example `qreat_it_ame013`) or a name
 * ending in `_integration` (for example `qreat_integration`). Anything else is
 * treated as a database that may hold data we must not touch.
 */
const DISPOSABLE_DATABASE_NAME =
  /^(?:qreat_it[0-9a-z_]*|[0-9a-z_]+_integration)$/;

/**
 * Query parameters that can redirect a PostgreSQL client away from the URL's
 * validated host/database. `pg` and Prisma both accept some of these, so a URL
 * that passed the host check could otherwise be re-pointed at a shared server.
 */
const FORBIDDEN_QUERY_PARAMETERS = new Set([
  'host',
  'hostaddr',
  'port',
  'dbname',
  'database',
  'user',
  'password',
  'passfile',
  'service',
  'socket',
]);

export type IntegrationDatabaseGuardCode =
  | 'INTEGRATION_DATABASE_URL_MISSING'
  | 'INTEGRATION_DATABASE_INVALID'
  | 'INTEGRATION_DATABASE_HOST_REJECTED'
  | 'INTEGRATION_DATABASE_NAME_REJECTED';

export class IntegrationDatabaseGuardError extends Error {
  readonly code: IntegrationDatabaseGuardCode;

  constructor(message: string, code: IntegrationDatabaseGuardCode) {
    super(message);
    this.name = 'IntegrationDatabaseGuardError';
    this.code = code;
  }
}

export interface DisposableDatabaseTarget {
  /** Hostname only. Safe to log. */
  host: string;
  /** Database name only. Safe to log. */
  database: string;
  /** The validated connection URL. Never log this value. */
  url: string;
}

function safeHint(): string {
  return (
    `${INTEGRATION_DATABASE_URL_ENV} must point at a disposable database, ` +
    'for example postgresql://<user>@127.0.0.1:5432/qreat_integration. ' +
    'The unit suite does not read it.'
  );
}

/**
 * Validate a candidate URL and return its safe target description.
 *
 * Throws `IntegrationDatabaseGuardError` before any caller can connect or write.
 */
export function assertDisposableDatabase(
  rawUrl: string | undefined | null
): DisposableDatabaseTarget {
  const value = rawUrl?.trim() ?? '';

  if (value.length === 0) {
    throw new IntegrationDatabaseGuardError(
      `${INTEGRATION_DATABASE_URL_ENV} is not set. ${safeHint()}`,
      'INTEGRATION_DATABASE_URL_MISSING'
    );
  }

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new IntegrationDatabaseGuardError(
      `${INTEGRATION_DATABASE_URL_ENV} is not a valid PostgreSQL URL. ${safeHint()}`,
      'INTEGRATION_DATABASE_INVALID'
    );
  }

  if (parsed.protocol !== 'postgresql:' && parsed.protocol !== 'postgres:') {
    throw new IntegrationDatabaseGuardError(
      `${INTEGRATION_DATABASE_URL_ENV} uses protocol "${parsed.protocol}". ${safeHint()}`,
      'INTEGRATION_DATABASE_INVALID'
    );
  }

  const host = parsed.hostname.toLowerCase();
  if (!LOOPBACK_HOSTS.has(host)) {
    throw new IntegrationDatabaseGuardError(
      `Refusing to run integration tests against host "${host}": ` +
        'the host must be loopback (localhost, 127.0.0.1 or ::1). ' +
        safeHint(),
      'INTEGRATION_DATABASE_HOST_REJECTED'
    );
  }

  for (const key of parsed.searchParams.keys()) {
    if (FORBIDDEN_QUERY_PARAMETERS.has(key.toLowerCase())) {
      throw new IntegrationDatabaseGuardError(
        `Refusing to run integration tests: query parameter "${key}" can ` +
          'redirect the connection and is not allowed in ' +
          `${INTEGRATION_DATABASE_URL_ENV}. ${safeHint()}`,
        'INTEGRATION_DATABASE_INVALID'
      );
    }
  }

  let database: string;
  try {
    database = decodeURIComponent(parsed.pathname.replace(/^\/+/, ''));
  } catch {
    throw new IntegrationDatabaseGuardError(
      `${INTEGRATION_DATABASE_URL_ENV} has an unreadable database name. ${safeHint()}`,
      'INTEGRATION_DATABASE_INVALID'
    );
  }

  if (database.length === 0) {
    throw new IntegrationDatabaseGuardError(
      `${INTEGRATION_DATABASE_URL_ENV} does not name a database. ${safeHint()}`,
      'INTEGRATION_DATABASE_INVALID'
    );
  }

  if (!DISPOSABLE_DATABASE_NAME.test(database)) {
    throw new IntegrationDatabaseGuardError(
      `Refusing to run integration tests against database "${database}" on "${host}": ` +
        'the name must match qreat_it* or *_integration ' +
        '(for example qreat_integration). ' +
        safeHint(),
      'INTEGRATION_DATABASE_NAME_REJECTED'
    );
  }

  return { host, database, url: value };
}

/**
 * Read and validate `INTEGRATION_DATABASE_URL`.
 *
 * `env` is injectable so the guard can be tested without touching the process
 * environment.
 */
export function resolveIntegrationDatabaseUrl(
  env: NodeJS.ProcessEnv = process.env
): DisposableDatabaseTarget {
  return assertDisposableDatabase(env[INTEGRATION_DATABASE_URL_ENV]);
}

/** Host/database label for logs and evidence. Never includes credentials. */
export function describeDatabaseTarget(
  target: DisposableDatabaseTarget
): string {
  return `${target.host}/${target.database}`;
}
