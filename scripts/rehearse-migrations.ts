/**
 * P9b — upgrade drill for the loyalty migrations.
 *
 * Proves that a database created before the loyalty feature can be upgraded in
 * place: drop the `public` schema, replay the pre-loyalty migrations, insert
 * representative rows, replay the loyalty migrations, and assert that the old
 * rows survived with the new columns taking their defaults and every CHECK
 * constraint validating. It also inserts a legacy `idempotency_records` row
 * once the first loyalty migration has created the table, and proves the row
 * and its restaurant FK survive the remaining loyalty migrations.
 *
 * The script only touches the database named by `DATABASE_URL`. It is a
 * rehearsal tool: run it against a throwaway database, never production.
 *
 * Usage:
 *   npx tsx scripts/rehearse-migrations.ts
 *   npx tsx scripts/rehearse-migrations.ts --permissions-only
 *
 * `--permissions-only` checks the seeded permission matrix (P9e) and does not
 * touch the schema.
 *
 * The script leaves the schema fully migrated but does not run the seed. Run
 * `npx prisma db seed` afterwards if you need the seed data (P9e does).
 */

import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';

const REPO_ROOT = process.cwd();
const MIGRATIONS_DIR = resolve(REPO_ROOT, 'prisma/migrations');
const SCHEMA_PATH = resolve(REPO_ROOT, 'prisma/schema.prisma');

/** First loyalty migration. Everything before it is the pre-loyalty schema. */
const LOYALTY_CUTOFF = '20261113120000';

/**
 * The P7c rebalance pair is replayed after inserting a `loyalty_settings` row,
 * so the drill can prove that an existing row takes `lookupLimitPerHour = 30`.
 */
const REBALANCE_MIGRATIONS = new Set([
  '20261114120000_loyalty_rate_limit_rebalance',
  '20261114120100_loyalty_rate_limit_rebalance_checks',
]);

/** The ten loyalty permissions of §18.20.14 A. */
const LOYALTY_PERMISSIONS = [
  'loyalty:attach',
  'loyalty:configure',
  'loyalty:report',
  'promotions:manage',
  'members:read',
  'members:pii',
  'members:export',
  'members:delete',
  'members:consent_withdraw',
  'settings:write',
] as const;

/** §18.20.14 A: owner gets all ten; manager gets all except export/delete. */
const OWNER_PERMISSIONS = new Set<string>(LOYALTY_PERMISSIONS);
const MANAGER_PERMISSIONS = new Set<string>(
  LOYALTY_PERMISSIONS.filter(
    (permission) =>
      permission !== 'members:export' && permission !== 'members:delete'
  )
);

const EXPECTED_CHECKS = [
  'rate_limit_counters_scope_check',
  'loyalty_settings_visitsRequired_check',
  'loyalty_settings_minDailySpend_check',
  'loyalty_settings_maxDiscount_check',
  'loyalty_settings_rewardValue_check',
  'loyalty_settings_lookupLimitPerHour_check',
  'loyalty_cards_visitsInCycle_check',
  'loyalty_cards_visitsRequired_check',
  'loyalty_cards_minDailySpend_check',
  'loyalty_cards_maxDiscount_check',
  'loyalty_cards_rewardValue_check',
  'promotions_endsAt_check',
  'promotions_maxDiscount_check',
  'promotions_value_check',
  'order_discounts_amount_check',
  'order_discounts_snapshot_check',
  'payment_batches_roundingAdjustment_check',
];

let failures = 0;
let checks = 0;

function pass(name: string, detail?: string): void {
  checks += 1;
  console.log(`PASS  ${name}${detail ? ` — ${detail}` : ''}`);
}

function fail(name: string, detail?: string): void {
  checks += 1;
  failures += 1;
  console.error(`FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
}

function check(name: string, condition: boolean, detail?: string): void {
  if (condition) pass(name, detail);
  else fail(name, detail);
}

/**
 * Load `.env` the same way the Prisma CLI does, without printing any value.
 * Existing scripts assume `DATABASE_URL` is already exported; the rehearsal
 * commands are run from a shell where it is not, so load the local file once.
 */
function ensureDatabaseUrl(): void {
  if (process.env.DATABASE_URL) return;
  const envPath = resolve(REPO_ROOT, '.env');
  if (existsSync(envPath) && typeof process.loadEnvFile === 'function') {
    process.loadEnvFile(envPath);
  }
  if (!process.env.DATABASE_URL) {
    throw new Error(
      'DATABASE_URL is not set and no readable .env file was found.'
    );
  }
}

function migrationNames(): string[] {
  return readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && /^\d{14}_/.test(entry.name))
    .map((entry) => entry.name)
    .sort();
}

function npxCommand(): string {
  return process.platform === 'win32' ? 'npx.cmd' : 'npx';
}

/** Apply one `migration.sql` through `prisma db execute`, exactly as the task requires. */
function applyMigration(name: string): void {
  const file = join(MIGRATIONS_DIR, name, 'migration.sql');
  if (!existsSync(file)) {
    throw new Error(`Missing migration.sql for ${name}`);
  }
  execFileSync(
    npxCommand(),
    ['prisma', 'db', 'execute', '--file', file, '--schema', SCHEMA_PATH],
    { env: process.env, stdio: 'pipe' }
  );
}

async function dropPublicSchema(db: PrismaClient): Promise<void> {
  await db.$executeRawUnsafe('DROP SCHEMA IF EXISTS public CASCADE');
  await db.$executeRawUnsafe('CREATE SCHEMA public');
  await db.$executeRawUnsafe('GRANT ALL ON SCHEMA public TO public');
}

interface LegacyIds {
  ownerId: string;
  restaurantId: string;
  tableId: string;
  stationId: string;
  sessionId: string;
  orderId: string;
  paymentBatchId: string;
  securityEventId: string;
  loyaltySettingsId: string;
  idempotencyRecordId: string;
}

function ids(): LegacyIds {
  // Deterministic, clearly synthetic UUIDs; no real person or tenant data.
  return {
    ownerId: '9e000000-0000-4000-8000-000000000001',
    restaurantId: '9e000000-0000-4000-8000-000000000002',
    tableId: '9e000000-0000-4000-8000-000000000003',
    stationId: '9e000000-0000-4000-8000-000000000004',
    sessionId: '9e000000-0000-4000-8000-000000000005',
    orderId: '9e000000-0000-4000-8000-000000000006',
    paymentBatchId: '9e000000-0000-4000-8000-000000000007',
    securityEventId: '9e000000-0000-4000-8000-000000000008',
    loyaltySettingsId: '9e000000-0000-4000-8000-000000000009',
    idempotencyRecordId: '9e000000-0000-4000-8000-000000000011',
  };
}

async function insertLegacyRows(
  db: PrismaClient,
  id: LegacyIds
): Promise<void> {
  await db.$executeRaw`
    INSERT INTO "restaurant_owners"
      ("id", "email", "passwordHash", "firstName", "lastName", "createdAt", "updatedAt")
    VALUES
      (${id.ownerId}, ${'p9-rehearsal-owner@example.invalid'}, ${'not-a-real-hash'},
       ${'P9'}, ${'Rehearsal'}, NOW(), NOW())
  `;

  await db.$executeRaw`
    INSERT INTO "restaurants"
      ("id", "ownerId", "name", "slug", "address", "timezone", "currency",
       "taxRate", "serviceChargeRate", "isActive", "businessType",
       "taxLabel", "serviceChargeLabel", "businessDayCloseTime",
       "createdAt", "updatedAt")
    VALUES
      (${id.restaurantId}, ${id.ownerId}, ${'P9 Rehearsal Restaurant'},
       ${'p9-rehearsal-restaurant'}, ${'1 Rehearsal Street'},
       ${'Asia/Kuala_Lumpur'}, ${'MYR'}, 0.0000, 0.0000, true, ${'restaurant'},
       ${'Tax'}, ${'Service Charge'}, ${'04:00'}, NOW(), NOW())
  `;

  await db.$executeRaw`
    INSERT INTO "tables"
      ("id", "restaurantId", "tableNumber", "qrCodeToken", "status", "createdAt", "updatedAt")
    VALUES
      (${id.tableId}, ${id.restaurantId}, ${'P9-1'},
       ${'9e000000-0000-4000-8000-000000000010'}, 'OCCUPIED', NOW(), NOW())
  `;

  await db.$executeRaw`
    INSERT INTO "stations"
      ("id", "restaurantId", "name", "createdAt", "updatedAt")
    VALUES
      (${id.stationId}, ${id.restaurantId}, ${'P9 Pass'}, NOW(), NOW())
  `;

  await db.$executeRaw`
    INSERT INTO "dining_sessions"
      ("id", "restaurantId", "tableId", "status", "openedAt")
    VALUES
      (${id.sessionId}, ${id.restaurantId}, ${id.tableId}, 'OPEN', NOW())
  `;

  await db.$executeRaw`
    UPDATE "tables" SET "activeDiningSessionId" = ${id.sessionId}
    WHERE "id" = ${id.tableId}
  `;

  await db.$executeRaw`
    INSERT INTO "orders"
      ("id", "orderNumber", "restaurantId", "tableId", "diningSessionId",
       "subtotalAmount", "taxAmount", "serviceCharge", "discountAmount",
       "totalAmount", "status", "paymentStatus", "orderType",
       "taxRateSnapshot", "serviceChargeRateSnapshot", "taxLabelSnapshot",
       "serviceChargeLabelSnapshot", "createdAt", "updatedAt")
    VALUES
      (${id.orderId}, ${'P9-LEGACY-0001'}, ${id.restaurantId}, ${id.tableId},
       ${id.sessionId}, 25.00, 0.00, 0.00, 0.00, 25.00, 'CONFIRMED', 'PAID',
       'DINE_IN', 0.0000, 0.0000, ${'Tax'}, ${'Service Charge'}, NOW(), NOW())
  `;

  await db.$executeRaw`
    INSERT INTO "payment_batches"
      ("id", "idempotencyKey", "requestHash", "restaurantId", "tableId",
       "paymentMethod", "totalAmount", "receiptNumber", "status", "response",
       "createdAt", "updatedAt")
    VALUES
      (${id.paymentBatchId}, ${'p9-rehearsal-batch-key'}, ${'p9-rehearsal-hash'},
       ${id.restaurantId}, ${id.tableId}, ${'cash'}, 25.00,
       ${'P9-RCP-0001'}, 'COMPLETED', '{}'::jsonb, NOW(), NOW())
  `;

  await db.$executeRaw`
    INSERT INTO "order_events"
      ("restaurantId", "stationId", "orderId", "type", "payload", "createdAt")
    VALUES
      (${id.restaurantId}, ${id.stationId}, ${id.orderId},
       ${'order.created'}, '{"rehearsal":true}'::jsonb, NOW())
  `;

  // A platform-wide security event from before the tenant column existed.
  await db.$executeRaw`
    INSERT INTO "security_events"
      ("id", "eventType", "severity", "eventData", "createdAt")
    VALUES
      (${id.securityEventId}, ${'p9_rehearsal_event'}, ${'info'},
       '{"rehearsal":true}'::jsonb, NOW())
  `;
}

async function insertLegacyIdempotencyRecord(
  db: PrismaClient,
  id: LegacyIds
): Promise<void> {
  // `idempotency_records` is created by the first loyalty-core migration, and
  // that migration also adds `idempotency_records_restaurantId_fkey`. Insert
  // the row immediately after that migration and before the remaining loyalty
  // migrations, so the row must survive them with a valid restaurant FK.
  await db.$executeRaw`
    INSERT INTO "idempotency_records"
      ("id", "restaurantId", "scope", "key", "requestHash", "responseJson",
       "status", "createdAt", "expiresAt")
    VALUES
      (${id.idempotencyRecordId}, ${id.restaurantId}, 'ORDER_CREATE',
       ${'p9-legacy-idempotency-key'}, ${'p9-legacy-request-hash'},
       '{"rehearsal":true}'::jsonb, 'COMPLETED', NOW(), NOW() + interval '1 day')
  `;
}

async function insertPreRebalanceLoyaltySettings(
  db: PrismaClient,
  id: LegacyIds
): Promise<void> {
  // Created after the core loyalty migration and before the P7c rebalance, so
  // the new `lookupLimitPerHour` column must take its DEFAULT 30.
  await db.$executeRaw`
    INSERT INTO "loyalty_settings"
      ("id", "restaurantId", "enabled", "visitsRequired", "rewardType",
       "rewardValue", "maxDiscount", "minDailySpend", "rewardLabel", "updatedAt")
    VALUES
      (${id.loyaltySettingsId}, ${id.restaurantId}, false, 3, 'PERCENT',
       10.00, 15.00, 20.00, ${'10% off'}, NOW())
  `;
}

async function assertUpgrade(db: PrismaClient, id: LegacyIds): Promise<void> {
  const order = await db.$queryRaw<
    Array<{
      id: string;
      totalAmount: string;
      discountVersion: number;
      customerId: string | null;
      discountSource: string | null;
      discountLabel: string | null;
    }>
  >`
    SELECT "id", "totalAmount"::text, "discountVersion", "customerId",
           "discountSource"::text, "discountLabel"
    FROM "orders" WHERE "id" = ${id.orderId}
  `;
  check('legacy order survived', order.length === 1, `rows=${order.length}`);
  if (order[0]) {
    check(
      'legacy order total unchanged',
      order[0].totalAmount === '25.00',
      order[0].totalAmount
    );
    check(
      'Order.discountVersion took DEFAULT 0',
      order[0].discountVersion === 0,
      String(order[0].discountVersion)
    );
    check(
      'legacy order has no member copy',
      order[0].customerId === null && order[0].discountSource === null
    );
  }

  const session = await db.$queryRaw<
    Array<{
      id: string;
      billRevision: number;
      customerId: string | null;
      discountAmount: string;
    }>
  >`
    SELECT "id", "billRevision", "customerId", "discountAmount"::text
    FROM "dining_sessions" WHERE "id" = ${id.sessionId}
  `;
  check(
    'legacy dining session survived',
    session.length === 1,
    `rows=${session.length}`
  );
  if (session[0]) {
    check(
      'DiningSession.billRevision took DEFAULT 0',
      session[0].billRevision === 0,
      String(session[0].billRevision)
    );
    check(
      'legacy dining session has no member',
      session[0].customerId === null
    );
    check(
      'DiningSession.discountAmount took DEFAULT 0.00',
      session[0].discountAmount === '0.00',
      session[0].discountAmount
    );
  }

  const batch = await db.$queryRaw<
    Array<{
      id: string;
      totalAmount: string;
      cashPayable: string | null;
      roundingAdjustment: string | null;
      businessDate: Date | null;
      outcome: string | null;
    }>
  >`
    SELECT "id", "totalAmount"::text, "cashPayable"::text,
           "roundingAdjustment"::text, "businessDate", "outcome"::text
    FROM "payment_batches" WHERE "id" = ${id.paymentBatchId}
  `;
  check(
    'legacy payment batch survived',
    batch.length === 1,
    `rows=${batch.length}`
  );
  if (batch[0]) {
    check(
      'payment_batches.roundingAdjustment is still null',
      batch[0].roundingAdjustment === null,
      String(batch[0].roundingAdjustment)
    );
    check(
      'payment_batches.cashPayable is still null',
      batch[0].cashPayable === null
    );
    check(
      'payment_batches.businessDate is still null',
      batch[0].businessDate === null
    );
    check('payment_batches.outcome is still null', batch[0].outcome === null);
    check(
      'legacy payment batch total unchanged',
      batch[0].totalAmount === '25.00',
      batch[0].totalAmount
    );
  }

  const security = await db.$queryRaw<
    Array<{ id: string; restaurantId: string | null }>
  >`
    SELECT "id", "restaurantId" FROM "security_events"
    WHERE "id" = ${id.securityEventId}
  `;
  check(
    'legacy security event survived',
    security.length === 1,
    `rows=${security.length}`
  );
  if (security[0]) {
    check(
      'security_events.restaurantId is null for the old row',
      security[0].restaurantId === null,
      String(security[0].restaurantId)
    );
  }

  const settings = await db.$queryRaw<
    Array<{ id: string; lookupLimitPerHour: number }>
  >`
    SELECT "id", "lookupLimitPerHour" FROM "loyalty_settings"
    WHERE "id" = ${id.loyaltySettingsId}
  `;
  check(
    'pre-rebalance loyalty settings row survived',
    settings.length === 1,
    `rows=${settings.length}`
  );
  if (settings[0]) {
    check(
      'LoyaltySettings.lookupLimitPerHour took DEFAULT 30',
      settings[0].lookupLimitPerHour === 30,
      String(settings[0].lookupLimitPerHour)
    );
  }

  const event = await db.$queryRaw<Array<{ count: bigint }>>`
    SELECT COUNT(*)::bigint AS "count" FROM "order_events"
    WHERE "restaurantId" = ${id.restaurantId}
      AND "orderId" = ${id.orderId}
  `;
  check(
    'legacy order event survived',
    Number(event[0]?.count ?? 0) === 1,
    String(event[0]?.count)
  );

  const idempotency = await db.$queryRaw<
    Array<{
      id: string;
      scope: string;
      key: string;
      status: string;
      restaurantId: string;
      restaurantExists: boolean;
      fkValidated: boolean;
    }>
  >`
    SELECT r."id", r."scope"::text AS "scope", r."key", r."status"::text AS "status",
           r."restaurantId",
           EXISTS (
             SELECT 1 FROM "restaurants" x WHERE x."id" = r."restaurantId"
           ) AS "restaurantExists",
           EXISTS (
             SELECT 1 FROM pg_constraint c
             WHERE c."conname" = 'idempotency_records_restaurantId_fkey'
               AND c."convalidated" = true
           ) AS "fkValidated"
    FROM "idempotency_records" r
    WHERE r."id" = ${id.idempotencyRecordId}
  `;
  check(
    'legacy idempotency record survived',
    idempotency.length === 1 &&
      idempotency[0]?.key === 'p9-legacy-idempotency-key' &&
      idempotency[0]?.status === 'COMPLETED' &&
      idempotency[0]?.scope === 'ORDER_CREATE',
    idempotency[0]
      ? `${idempotency[0].scope}/${idempotency[0].status}`
      : 'missing'
  );
  check(
    'idempotency_records_restaurantId_fkey validates and references a live restaurant',
    idempotency[0]?.fkValidated === true &&
      idempotency[0]?.restaurantExists === true,
    `fk=${String(idempotency[0]?.fkValidated)} restaurant=${String(
      idempotency[0]?.restaurantExists
    )}`
  );

  const constraintRows = await db.$queryRaw<
    Array<{ conname: string; convalidated: boolean }>
  >`
    SELECT "conname", "convalidated" FROM pg_constraint WHERE "contype" = 'c'
  `;
  const validated = new Map(
    constraintRows.map((row) => [row.conname, row.convalidated])
  );
  for (const name of EXPECTED_CHECKS) {
    check(`CHECK validates: ${name}`, validated.get(name) === true);
  }

  // Prove two representative CHECKs actually reject bad data. A failed
  // statement outside a transaction does not change the row.
  const settingsBefore = await db.$queryRaw<
    Array<{ visitsRequired: number; lookupLimitPerHour: number }>
  >`
    SELECT "visitsRequired", "lookupLimitPerHour" FROM "loyalty_settings"
    WHERE "id" = ${id.loyaltySettingsId}
  `;

  await expectCheckViolation(
    'loyalty_settings_visitsRequired_check rejects 11',
    db,
    'loyalty_settings_visitsRequired_check',
    `UPDATE "loyalty_settings" SET "visitsRequired" = 11 WHERE "id" = '${id.loyaltySettingsId}'`
  );
  await expectCheckViolation(
    'loyalty_settings_lookupLimitPerHour_check rejects 0',
    db,
    'loyalty_settings_lookupLimitPerHour_check',
    `UPDATE "loyalty_settings" SET "lookupLimitPerHour" = 0 WHERE "id" = '${id.loyaltySettingsId}'`
  );
  await expectCheckViolation(
    'payment_batches_roundingAdjustment_check rejects a bad adjustment',
    db,
    'payment_batches_roundingAdjustment_check',
    `UPDATE "payment_batches" SET "cashPayable" = 25.05, "roundingAdjustment" = 0.00 WHERE "id" = '${id.paymentBatchId}'`
  );

  const settingsAfter = await db.$queryRaw<
    Array<{ visitsRequired: number; lookupLimitPerHour: number }>
  >`
    SELECT "visitsRequired", "lookupLimitPerHour" FROM "loyalty_settings"
    WHERE "id" = ${id.loyaltySettingsId}
  `;
  check(
    'rejected writes left loyalty settings unchanged',
    settingsBefore[0]?.visitsRequired === settingsAfter[0]?.visitsRequired &&
      settingsBefore[0]?.lookupLimitPerHour ===
        settingsAfter[0]?.lookupLimitPerHour
  );

  const indexes = await db.$queryRaw<Array<{ indexname: string }>>`
    SELECT "indexname" FROM pg_indexes WHERE "schemaname" = 'public'
      AND "indexname" IN (
        'customers_restaurantId_phoneHash_active_key',
        'order_discounts_orderId_active_key'
      )
  `;
  const indexNames = new Set(indexes.map((row) => row.indexname));
  check(
    'partial unique index customers_restaurantId_phoneHash_active_key exists',
    indexNames.has('customers_restaurantId_phoneHash_active_key')
  );
  check(
    'partial unique index order_discounts_orderId_active_key exists',
    indexNames.has('order_discounts_orderId_active_key')
  );
}

async function expectCheckViolation(
  label: string,
  db: PrismaClient,
  constraint: string,
  sql: string
): Promise<void> {
  try {
    await db.$executeRawUnsafe(sql);
    fail(label, 'the invalid row was accepted');
  } catch (error) {
    const message = String(error);
    check(
      label,
      message.includes('23514') || message.includes(constraint),
      message.includes(constraint) ? constraint : 'check_violation'
    );
  }
}

async function restoreRecordedMigrationState(): Promise<void> {
  // `prisma db execute` does not write `_prisma_migrations`, so the replayed
  // schema has no migration history. Drop and re-apply through the real
  // migration engine so `prisma migrate status` is meaningful afterwards.
  console.log(
    '\nRestoring recorded migration state with prisma migrate deploy…'
  );
  const db = new PrismaClient();
  try {
    await dropPublicSchema(db);
  } finally {
    await db.$disconnect();
  }
  execFileSync(
    npxCommand(),
    ['prisma', 'migrate', 'deploy', '--schema', SCHEMA_PATH],
    { env: process.env, stdio: 'pipe' }
  );
}

async function runUpgradeDrill(): Promise<void> {
  ensureDatabaseUrl();

  const all = migrationNames();
  const preLoyalty = all.filter((name) => name < LOYALTY_CUTOFF);
  const loyaltyCore = all.filter(
    (name) => name >= LOYALTY_CUTOFF && !REBALANCE_MIGRATIONS.has(name)
  );
  const rebalance = all.filter((name) => REBALANCE_MIGRATIONS.has(name));

  console.log('P9b — upgrade drill');
  console.log(`Migrations found: ${all.length}`);
  console.log(`Pre-loyalty: ${preLoyalty.length}`);
  console.log(`Loyalty core: ${loyaltyCore.length}`);
  console.log(`Rebalance: ${rebalance.length}`);

  const expectedLast = '20261108120000_add_counter_reference';
  check(
    'pre-loyalty cutoff is the expected migration',
    preLoyalty[preLoyalty.length - 1] === expectedLast,
    preLoyalty[preLoyalty.length - 1]
  );

  const db = new PrismaClient();
  try {
    console.log('\nDropping and recreating the public schema…');
    await dropPublicSchema(db);

    console.log('Replaying pre-loyalty migrations…');
    for (const name of preLoyalty) {
      console.log(`  ${name}`);
      applyMigration(name);
    }

    const id = ids();
    console.log('Inserting representative pre-loyalty rows…');
    await insertLegacyRows(db, id);

    // `idempotency_records` is created by the first loyalty-core migration.
    // Apply that one, insert the legacy row, then replay the rest so the row
    // has to survive the remaining loyalty migrations.
    const [firstLoyalty, ...remainingLoyalty] = loyaltyCore;
    if (!firstLoyalty) {
      throw new Error('No loyalty core migrations found');
    }
    console.log('Replaying the first loyalty migration…');
    console.log(`  ${firstLoyalty}`);
    applyMigration(firstLoyalty);

    console.log('Inserting a legacy idempotency record…');
    await insertLegacyIdempotencyRecord(db, id);

    console.log('Replaying the remaining loyalty migrations…');
    for (const name of remainingLoyalty) {
      console.log(`  ${name}`);
      applyMigration(name);
    }

    console.log('Inserting a pre-rebalance loyalty settings row…');
    await insertPreRebalanceLoyaltySettings(db, id);

    console.log('Replaying the rebalance migrations…');
    for (const name of rebalance) {
      console.log(`  ${name}`);
      applyMigration(name);
    }

    console.log('\nAssertions');
    await assertUpgrade(db, id);
  } finally {
    await db.$disconnect();
  }

  await restoreRecordedMigrationState();
}

async function runPermissionsCheck(): Promise<void> {
  ensureDatabaseUrl();
  const db = new PrismaClient();
  try {
    console.log('P9e — seeded loyalty permission matrix');

    const seeded = await db.permission.findMany({
      where: { permissionKey: { in: [...LOYALTY_PERMISSIONS] } },
      select: { permissionKey: true, isActive: true },
    });
    const seededKeys = new Set(seeded.map((row) => row.permissionKey));
    for (const permission of LOYALTY_PERMISSIONS) {
      check(`permission exists: ${permission}`, seededKeys.has(permission));
    }
    check(
      'all ten loyalty permissions are active',
      seeded.every((row) => row.isActive)
    );

    const mappings = await db.rolePermission.findMany({
      where: {
        roleTemplate: { in: ['restaurant_owner', 'manager'] },
        permissionKey: { in: [...LOYALTY_PERMISSIONS] },
      },
      select: { roleTemplate: true, permissionKey: true },
    });

    const owner = new Set(
      mappings
        .filter((row) => row.roleTemplate === 'restaurant_owner')
        .map((row) => row.permissionKey)
    );
    const manager = new Set(
      mappings
        .filter((row) => row.roleTemplate === 'manager')
        .map((row) => row.permissionKey)
    );

    for (const permission of OWNER_PERMISSIONS) {
      check(
        `owner mapping: ${permission}`,
        owner.has(permission),
        owner.has(permission) ? 'granted' : 'missing'
      );
    }
    for (const permission of MANAGER_PERMISSIONS) {
      check(
        `manager mapping: ${permission}`,
        manager.has(permission),
        manager.has(permission) ? 'granted' : 'missing'
      );
    }
    for (const permission of ['members:export', 'members:delete']) {
      check(
        `manager is denied: ${permission}`,
        !manager.has(permission),
        manager.has(permission) ? 'unexpectedly granted' : 'denied'
      );
    }
  } finally {
    await db.$disconnect();
  }
}

async function main(): Promise<void> {
  const permissionsOnly = process.argv.includes('--permissions-only');
  if (permissionsOnly) {
    await runPermissionsCheck();
  } else {
    await runUpgradeDrill();
  }

  console.log(
    `\n${failures === 0 ? 'PASS' : 'FAIL'} — ${checks - failures}/${checks} checks passed`
  );
  if (failures > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error('Rehearsal failed:', error);
  process.exitCode = 1;
});
