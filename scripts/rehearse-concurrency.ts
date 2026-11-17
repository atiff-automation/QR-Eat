/**
 * P9c/P9d — live concurrency and rollback drills.
 *
 * Every race runs against real PostgreSQL with real advisory locks. The service
 * functions use the shared Prisma client, so each racing call is executed in a
 * separate child process: each child owns a distinct Prisma client (and pool),
 * which is what makes the locks meaningful. The parent process only creates
 * fixtures and asserts the final rows.
 *
 * Drills:
 *   1. two concurrent payments on one bill — one charge, one visit, one card
 *      increment; the loser gets BILL_CHANGED/BILL_PAID;
 *   2. member change vs payment — one wins, the other gets BILL_CHANGED;
 *   3. rename vs anonymise — no name on an ANONYMIZED row;
 *   4. concurrent rate-limit increments — exact count; a refusal rolls back;
 *   5. rollback (P9d) — with LOYALTY_ENABLED unset but the restaurant row still
 *      enabled, a guest bill and a member-attached bill take the pre-feature
 *      path and write no loyalty rows.
 *
 * Usage: npx tsx scripts/rehearse-concurrency.ts
 *
 * The script creates its own synthetic tenant and deletes every row it created.
 * It never reads a real customer, phone number or secret.
 */

import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { hashPhone } from '@/lib/loyalty/phone';
import { getBusinessDate } from '@/lib/time/business-day';

const REPO_ROOT = process.cwd();
const SCRIPT_PATH = process.argv[1];
const HMAC_KEY = 'p9-rehearsal-only-hmac-key';
const NOTICE_TEXT = 'P9 rehearsal loyalty notice';
const FIXTURE_CLOCK = {
  timezone: 'Asia/Kuala_Lumpur',
  closeTime: '04:00',
};
/** Bounded wait for the readiness barrier. A timeout fails the drill. */
const BARRIER_TIMEOUT_MS = 20_000;
/** Bounded wait for the children to reach the parent's lock after `go`. */
const WAITER_TIMEOUT_MS = 3_000;
/** The child fails if the parent never creates its `go` file. */
const CHILD_GO_TIMEOUT_MS = 30_000;
const BARRIER_POLL_MS = 25;
const RUN_ID = randomUUID().slice(0, 8);
const APP_PREFIX = `drill-${RUN_ID}-`;

interface WorkerResult {
  ok: boolean;
  code?: string;
  message?: string;
  status?: number;
  unexpected?: boolean;
  error?: string;
  result?: unknown;
}

interface Fixture {
  ownerId: string;
  restaurantId: string;
  rollbackRestaurantId: string;
}

interface BillFixture {
  tableId: string;
  sessionId: string;
  orderId: string;
  customerId: string | null;
  cardId: string | null;
  phone: string | null;
}

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

function delay(ms: number): Promise<void> {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, ms));
}

/**
 * The advisory lock keys the services themselves take. They must stay
 * byte-for-byte identical to `loyalty-payment-service.ts` /
 * `loyalty-bill-service.ts`, otherwise the parent would not block the child.
 */
function billLockKey(restaurantId: string, sessionId: string): string {
  return `loyalty-bill:${restaurantId}:${sessionId}`;
}

function dayLockKey(
  restaurantId: string,
  customerId: string,
  businessDate: string
): string {
  return `loyalty-day:${restaurantId}:${customerId}:${businessDate}`;
}

interface BarrierObservation {
  ok: boolean;
  reason: string;
}

/**
 * Wait until every child has written its ready marker. The children do not
 * enter the service until the parent creates their `go` files, so a slow
 * import cannot burn the service's interactive-transaction timeout.
 */
async function waitForFiles(
  paths: string[],
  timeoutMs: number,
  label: string
): Promise<BarrierObservation> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (paths.every((path) => existsSync(path))) {
      console.log(`MARKERS  ${label} — ready`);
      return { ok: true, reason: 'markers ready' };
    }
    await delay(BARRIER_POLL_MS);
  }
  const missing = paths.filter((path) => !existsSync(path)).length;
  return {
    ok: false,
    reason: `${label}: markers missing=${missing} after ${timeoutMs}ms`,
  };
}

/**
 * Count distinct waiters whose PostgreSQL session carries this drill's
 * application_name prefix. Scoping by the child sessions means an unrelated
 * session on the same database can never satisfy the barrier.
 */
async function countScopedWaiters(
  db: PrismaClient,
  applicationPrefix: string
): Promise<number> {
  const rows = await db.$queryRaw<Array<{ count: number }>>`
    SELECT count(DISTINCT l.pid)::int AS count
    FROM pg_locks l
    JOIN pg_stat_activity a ON a.pid = l.pid
    WHERE NOT l.granted
      AND a.application_name LIKE ${`${applicationPrefix}%`}
  `;
  return rows[0]?.count ?? 0;
}

async function waitForScopedWaiters(
  db: PrismaClient,
  applicationPrefix: string,
  minimumWaiters: number,
  label: string
): Promise<BarrierObservation> {
  const deadline = Date.now() + WAITER_TIMEOUT_MS;
  let waiters = 0;
  while (Date.now() < deadline) {
    waiters = await countScopedWaiters(db, applicationPrefix);
    if (waiters >= minimumWaiters) {
      console.log(
        `BARRIER  ${label} — app=${applicationPrefix}*, waiters=${waiters}/${minimumWaiters}`
      );
      return { ok: true, reason: `waiters=${waiters}` };
    }
    await delay(BARRIER_POLL_MS);
  }
  return {
    ok: false,
    reason: `${label}: scoped waiters ${waiters}/${minimumWaiters} after ${WAITER_TIMEOUT_MS}ms (app=${applicationPrefix}*)`,
  };
}

function createMarkerDir(): string {
  return mkdtempSync(join(tmpdir(), 'p9-drill-'));
}

function markReady(markerPath: string | undefined): void {
  if (markerPath) writeFileSync(markerPath, 'ready');
}

async function waitForGo(goPath: string | undefined): Promise<void> {
  if (!goPath) return;
  const deadline = Date.now() + CHILD_GO_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (existsSync(goPath)) return;
    await delay(5);
  }
  throw new Error(`go file did not appear within ${CHILD_GO_TIMEOUT_MS}ms`);
}

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

function npxCommand(): string {
  return process.platform === 'win32' ? 'npx.cmd' : 'npx';
}

function appendApplicationName(url: string, applicationName: string): string {
  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}application_name=${encodeURIComponent(applicationName)}`;
}

function workerEnv(applicationName?: string): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    LOYALTY_ENABLED: 'true',
    LOYALTY_PHONE_HMAC_KEY: process.env.LOYALTY_PHONE_HMAC_KEY ?? HMAC_KEY,
  };
  if (applicationName && env.DATABASE_URL) {
    env.DATABASE_URL = appendApplicationName(env.DATABASE_URL, applicationName);
  }
  return env;
}

function emit(result: WorkerResult): void {
  console.log(`__DRILL_RESULT__${JSON.stringify(result)}`);
}

function errorResult(error: unknown): WorkerResult {
  if (typeof error === 'object' && error !== null) {
    const record = error as {
      code?: unknown;
      message?: unknown;
      statusCode?: unknown;
    };
    if (typeof record.code === 'string') {
      return {
        ok: false,
        code: record.code,
        message:
          typeof record.message === 'string' ? record.message : undefined,
        status:
          typeof record.statusCode === 'number' ? record.statusCode : undefined,
      };
    }
  }
  return {
    ok: false,
    unexpected: true,
    error: error instanceof Error ? error.message : 'unknown worker error',
  };
}

// ---------------------------------------------------------------------------
// Worker side
// ---------------------------------------------------------------------------

async function runWorker(
  role: string,
  encoded: string,
  markerPath?: string,
  goPath?: string
): Promise<void> {
  ensureDatabaseUrl();
  process.env.LOYALTY_ENABLED = 'true';
  process.env.LOYALTY_PHONE_HMAC_KEY =
    process.env.LOYALTY_PHONE_HMAC_KEY ?? HMAC_KEY;

  const payload = JSON.parse(
    Buffer.from(encoded, 'base64').toString('utf8')
  ) as Record<string, unknown>;

  try {
    switch (role) {
      case 'payment': {
        const { processTablePaymentBatch } = await import(
          '@/lib/services/payment-batch-service'
        );
        markReady(markerPath);
        await waitForGo(goPath);
        const result = await processTablePaymentBatch({
          tableId: String(payload.tableId),
          restaurantId: String(payload.restaurantId),
          userId: String(payload.userId),
          userType: String(payload.userType),
          idempotencyKey: String(payload.idempotencyKey),
          paymentMethod: payload.paymentMethod as 'cash' | 'card' | 'ewallet',
          cashReceived: payload.cashReceived as string,
          expectedTotal: payload.expectedTotal as string,
          expectedCashPayable: payload.expectedCashPayable as string,
          expectedBillRevision: Number(payload.expectedBillRevision),
        });
        emit({ ok: true, result });
        break;
      }
      case 'member-change': {
        const { changeMember } = await import(
          '@/lib/services/loyalty-bill-service'
        );
        markReady(markerPath);
        await waitForGo(goPath);
        const result = await changeMember({
          restaurantId: String(payload.restaurantId),
          target: { kind: 'table', tableId: String(payload.tableId) },
          userId: String(payload.userId),
          phone: String(payload.phone),
          expectedBillRevision: Number(payload.expectedBillRevision),
          idempotencyKey: String(payload.idempotencyKey),
        });
        const body = result.body as { success?: boolean; code?: string };
        emit({
          ok: result.status === 200 && body.success !== false,
          code: body.code,
          status: result.status,
          result,
        });
        break;
      }
      case 'rename': {
        const { renameMember } = await import(
          '@/lib/services/loyalty-member-service'
        );
        markReady(markerPath);
        await waitForGo(goPath);
        const result = await renameMember({
          restaurantId: String(payload.restaurantId),
          memberId: String(payload.memberId),
          actorId: String(payload.actorId),
          actorType: 'restaurant_owner',
          idempotencyKey: String(payload.idempotencyKey),
          name: String(payload.name),
          revealPhone: false,
        });
        emit({ ok: true, result });
        break;
      }
      case 'anonymise': {
        const { deleteMember } = await import(
          '@/lib/services/loyalty-member-service'
        );
        markReady(markerPath);
        await waitForGo(goPath);
        const result = await deleteMember({
          restaurantId: String(payload.restaurantId),
          memberId: String(payload.memberId),
          actorId: String(payload.actorId),
          actorType: 'restaurant_owner',
          idempotencyKey: String(payload.idempotencyKey),
        });
        emit({ ok: true, result });
        break;
      }
      case 'rate-increment': {
        const { incrementRateLimit } = await import('@/lib/loyalty/rate-limit');
        let count = 0;
        const times = Number(payload.times);
        for (let index = 0; index < times; index += 1) {
          count = await incrementRateLimit({
            restaurantId: String(payload.restaurantId),
            scope: payload.scope as
              | 'PHONE_HASH'
              | 'RESTAURANT'
              | 'QR_SESSION'
              | 'EDGE_IP',
            subject: String(payload.subject),
          });
        }
        emit({ ok: true, result: { count } });
        break;
      }
      case 'rate-enforce': {
        const { enforceRateLimits } = await import('@/lib/loyalty/rate-limit');
        const outcomes: Array<{
          allowed: boolean;
          code: string | null;
          failedOpen: boolean;
        }> = [];
        const times = Number(payload.times);
        const now = new Date(String(payload.now));
        for (let index = 0; index < times; index += 1) {
          const decision = await enforceRateLimits(
            {
              restaurantId: String(payload.restaurantId),
              sessionId: String(payload.sessionId),
              phone: String(payload.phone),
              ip: String(payload.ip),
              limits: { restaurant: Number(payload.limit) },
            },
            now
          );
          outcomes.push({
            allowed: decision.allowed,
            code: decision.refusal?.code ?? null,
            failedOpen: decision.failedOpen,
          });
        }
        emit({ ok: true, result: { outcomes } });
        break;
      }
      default:
        emit({ ok: false, unexpected: true, error: `unknown role ${role}` });
    }
  } catch (error) {
    emit(errorResult(error));
  } finally {
    try {
      const { prisma } = await import('@/lib/database');
      await prisma.$disconnect();
    } catch {
      // Process exit closes the pool anyway.
    }
  }
}

function runWorkerProcess(
  role: string,
  payload: Record<string, unknown>,
  markerPath?: string,
  goPath?: string,
  applicationName?: string
): Promise<WorkerResult> {
  const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString(
    'base64'
  );
  const args = ['tsx', SCRIPT_PATH, '--worker', role, encoded];
  if (markerPath) args.push(markerPath);
  if (goPath) args.push(goPath);
  return new Promise((resolveWorker, rejectWorker) => {
    const child = spawn(npxCommand(), args, {
      cwd: REPO_ROOT,
      env: workerEnv(applicationName),
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on('error', rejectWorker);
    child.on('close', (code) => {
      const marker = '__DRILL_RESULT__';
      const line = stdout
        .split('\n')
        .reverse()
        .find((entry) => entry.startsWith(marker));
      if (!line) {
        rejectWorker(
          new Error(
            `worker ${role} produced no result (exit ${code}): ${stderr.slice(0, 500)}`
          )
        );
        return;
      }
      try {
        resolveWorker(JSON.parse(line.slice(marker.length)) as WorkerResult);
      } catch (error) {
        rejectWorker(error);
      }
    });
  });
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

async function createOwnerAndRestaurant(
  db: PrismaClient,
  suffix: string,
  withLoyalty: boolean
): Promise<{ ownerId: string; restaurantId: string }> {
  const ownerId = randomUUID();
  const restaurantId = randomUUID();
  await db.restaurantOwner.create({
    data: {
      id: ownerId,
      email: `p9-rehearsal-${suffix}@example.invalid`,
      passwordHash: 'not-a-real-hash',
      firstName: 'P9',
      lastName: 'Rehearsal',
    },
  });
  await db.restaurant.create({
    data: {
      id: restaurantId,
      ownerId,
      name: `P9 Rehearsal ${suffix}`,
      slug: `p9-rehearsal-${suffix}`,
      address: '1 Rehearsal Street',
      timezone: 'Asia/Kuala_Lumpur',
      currency: 'MYR',
      taxRate: 0,
      serviceChargeRate: 0,
      taxLabel: 'Tax',
      serviceChargeLabel: 'Service Charge',
      businessDayCloseTime: '04:00',
      cashRounding: 'NONE',
    },
  });
  if (withLoyalty) {
    const { hashNoticeText } = await import('@/lib/loyalty/consent');
    await db.loyaltySettings.create({
      data: {
        restaurantId,
        enabled: true,
        visitsRequired: 3,
        rewardType: 'PERCENT',
        rewardValue: 10,
        maxDiscount: 15,
        minDailySpend: 0,
        rewardLabel: '10% off',
        noticeVersion: 'v1',
        noticeText: NOTICE_TEXT,
        noticeTextHash: hashNoticeText(NOTICE_TEXT),
        privacyUrl: 'https://example.invalid/privacy',
        lookupLimitPerHour: 30,
      },
    });
  }
  return { ownerId, restaurantId };
}

async function createMember(
  db: PrismaClient,
  restaurantId: string,
  phone: string,
  name: string
): Promise<{ customerId: string; cardId: string }> {
  const { hashPhone } = await import('@/lib/loyalty/phone');
  const { hashNoticeText } = await import('@/lib/loyalty/consent');
  const customerId = randomUUID();
  await db.customer.create({
    data: {
      id: customerId,
      restaurantId,
      phone,
      phoneHash: hashPhone(phone),
      name,
      consentAt: new Date(),
      consentVersion: 'v1',
      consentTextHash: hashNoticeText(NOTICE_TEXT),
      consentSource: 'COUNTER',
      status: 'ACTIVE',
    },
  });
  const card = await db.loyaltyCard.create({
    data: {
      restaurantId,
      customerId,
      visitsInCycle: 0,
      cycleNumber: 1,
      visitsRequired: 3,
      rewardType: 'PERCENT',
      rewardValue: 10,
      maxDiscount: 15,
      rewardLabel: '10% off',
      minDailySpend: 0,
    },
  });
  return { customerId, cardId: card.id };
}

async function createBill(
  db: PrismaClient,
  restaurantId: string,
  tableNumber: string,
  customerId: string | null
): Promise<BillFixture> {
  const tableId = randomUUID();
  const sessionId = randomUUID();
  const orderId = randomUUID();
  await db.table.create({
    data: {
      id: tableId,
      restaurantId,
      tableNumber,
      qrCodeToken: randomUUID(),
      status: 'OCCUPIED',
      capacity: 4,
    },
  });
  await db.diningSession.create({
    data: {
      id: sessionId,
      restaurantId,
      tableId,
      status: 'OPEN',
      customerId,
      billRevision: 0,
    },
  });
  await db.table.update({
    where: { id: tableId },
    data: { activeDiningSessionId: sessionId },
  });
  await db.order.create({
    data: {
      id: orderId,
      orderNumber: `P9-${randomUUID().slice(0, 8)}`,
      restaurantId,
      tableId,
      diningSessionId: sessionId,
      customerId,
      subtotalAmount: 100,
      taxAmount: 0,
      serviceCharge: 0,
      discountAmount: 0,
      totalAmount: 100,
      status: 'CONFIRMED',
      paymentStatus: 'PENDING',
      source: 'COUNTER',
      orderType: 'DINE_IN',
      taxRateSnapshot: 0,
      serviceChargeRateSnapshot: 0,
      taxLabelSnapshot: 'Tax',
      serviceChargeLabelSnapshot: 'Service Charge',
      discountVersion: 0,
    },
  });
  return {
    tableId,
    sessionId,
    orderId,
    customerId,
    cardId: null,
    phone: null,
  };
}

// ---------------------------------------------------------------------------
// Drills
// ---------------------------------------------------------------------------

async function raceTwoPayments(
  db: PrismaClient,
  fixture: Fixture,
  bill: BillFixture,
  ownerId: string
): Promise<void> {
  console.log('\nDrill 1 — two concurrent payments on one bill');
  if (!bill.customerId) {
    throw new Error('Drill 1 requires a member bill');
  }
  // A member bill's first service lock is `loyalty-card`, then `loyalty-day`.
  // The parent holds the day lock, so child A acquires the card lock and waits
  // on the day lock; child B then waits on the card lock A holds. The barrier
  // therefore observes two scoped waiters — one directly on the day lock, one
  // queued behind the card lock — and neither has reached the bill lock.
  const lockKey = dayLockKey(
    fixture.restaurantId,
    bill.customerId,
    getBusinessDate(new Date(), FIXTURE_CLOCK)
  );

  const markerDir = createMarkerDir();
  const markers = [
    join(markerDir, 'payment-a.ready'),
    join(markerDir, 'payment-b.ready'),
  ];
  const goFiles = [
    join(markerDir, 'payment-a.go'),
    join(markerDir, 'payment-b.go'),
  ];
  const applicationNames = [`${APP_PREFIX}1a`, `${APP_PREFIX}1b`];

  try {
    const outcome = await db.$transaction(
      async (tx) => {
        await tx.$queryRaw`
          SELECT pg_advisory_xact_lock(hashtext(${lockKey})::bigint)::text AS lock
        `;
        const first = runWorkerProcess(
          'payment',
          {
            restaurantId: fixture.restaurantId,
            tableId: bill.tableId,
            userId: ownerId,
            userType: 'restaurant_owner',
            idempotencyKey: `p9-race-pay-a-${randomUUID()}`,
            paymentMethod: 'cash',
            cashReceived: '100.00',
            expectedTotal: '100.00',
            expectedCashPayable: '100.00',
            expectedBillRevision: 0,
          },
          markers[0],
          goFiles[0],
          applicationNames[0]
        );
        const second = runWorkerProcess(
          'payment',
          {
            restaurantId: fixture.restaurantId,
            tableId: bill.tableId,
            userId: ownerId,
            userType: 'restaurant_owner',
            idempotencyKey: `p9-race-pay-b-${randomUUID()}`,
            paymentMethod: 'cash',
            cashReceived: '100.00',
            expectedTotal: '100.00',
            expectedCashPayable: '100.00',
            expectedBillRevision: 0,
          },
          markers[1],
          goFiles[1],
          applicationNames[1]
        );
        const markersReady = await waitForFiles(
          markers,
          BARRIER_TIMEOUT_MS,
          'drill 1'
        );
        // Let both children enter the service together. They then queue on the
        // card lock; the first waits on the day lock the parent holds and the
        // second waits behind the card lock.
        writeFileSync(goFiles[0], 'go');
        writeFileSync(goFiles[1], 'go');
        const barrier = markersReady.ok
          ? await waitForScopedWaiters(db, APP_PREFIX, 2, 'drill 1')
          : markersReady;
        return { workers: [first, second] as const, barrier };
      },
      { timeout: 60_000 }
    );

    const results = await Promise.all(outcome.workers);
    if (!outcome.barrier.ok) {
      fail(
        'the parent released only after two waiters',
        outcome.barrier.reason
      );
    }
    const successes = results.filter((result) => result.ok);
    const losers = results.filter((result) => !result.ok);
    check(
      'exactly one payment succeeded',
      successes.length === 1,
      `successes=${successes.length}`
    );
    check(
      'the loser got BILL_CHANGED or BILL_PAID',
      losers.length === 1 &&
        (losers[0]?.code === 'BILL_CHANGED' || losers[0]?.code === 'BILL_PAID'),
      losers[0]?.code
    );
    check(
      'the loser never reported an unexpected error',
      losers.every((result) => result.unexpected !== true)
    );

    const batches = await db.paymentBatch.count({
      where: { restaurantId: fixture.restaurantId, tableId: bill.tableId },
    });
    check('exactly one PaymentBatch', batches === 1, `count=${batches}`);

    const visits = await db.loyaltyVisit.count({
      where: {
        restaurantId: fixture.restaurantId,
        customerId: bill.customerId ?? undefined,
      },
    });
    check('exactly one LoyaltyVisit', visits === 1, `count=${visits}`);

    const card = bill.cardId
      ? await db.loyaltyCard.findUnique({ where: { id: bill.cardId } })
      : null;
    check(
      'exactly one card increment',
      card?.visitsInCycle === 1,
      `visitsInCycle=${card?.visitsInCycle}`
    );

    const payments = await db.payment.count({
      where: { order: { id: bill.orderId } },
    });
    check('exactly one Payment row', payments === 1, `count=${payments}`);

    const order = await db.order.findUnique({ where: { id: bill.orderId } });
    check(
      'the bill is PAID',
      order?.paymentStatus === 'PAID',
      order?.paymentStatus
    );

    const discounts = await db.orderDiscount.count({
      where: { restaurantId: fixture.restaurantId, orderId: bill.orderId },
    });
    check(
      'no double benefit (no discount rows)',
      discounts === 0,
      `count=${discounts}`
    );
  } finally {
    rmSync(markerDir, { recursive: true, force: true });
  }
}

async function raceMemberChangeVsPayment(
  db: PrismaClient,
  fixture: Fixture,
  bill: BillFixture,
  ownerId: string,
  phone: string
): Promise<void> {
  console.log('\nDrill 2 — member change vs payment');
  const lockKey = billLockKey(fixture.restaurantId, bill.sessionId);

  const markerDir = createMarkerDir();
  const memberMarker = join(markerDir, 'member.ready');
  const memberGo = join(markerDir, 'member.go');
  const paymentMarker = join(markerDir, 'payment.ready');
  const paymentGo = join(markerDir, 'payment.go');

  try {
    const outcome = await db.$transaction(
      async (tx) => {
        await tx.$queryRaw`
          SELECT pg_advisory_xact_lock(hashtext(${lockKey})::bigint)::text AS lock
        `;
        const member = runWorkerProcess(
          'member-change',
          {
            restaurantId: fixture.restaurantId,
            tableId: bill.tableId,
            userId: ownerId,
            phone,
            expectedBillRevision: 0,
            idempotencyKey: `p9-race-member-${randomUUID()}`,
          },
          memberMarker,
          memberGo,
          `${APP_PREFIX}2m`
        );
        const payment = runWorkerProcess(
          'payment',
          {
            restaurantId: fixture.restaurantId,
            tableId: bill.tableId,
            userId: ownerId,
            userType: 'restaurant_owner',
            idempotencyKey: `p9-race-member-pay-${randomUUID()}`,
            paymentMethod: 'cash',
            cashReceived: '100.00',
            expectedTotal: '100.00',
            expectedCashPayable: '100.00',
            expectedBillRevision: 0,
          },
          paymentMarker,
          paymentGo,
          `${APP_PREFIX}2p`
        );
        const markersReady = await waitForFiles(
          [memberMarker, paymentMarker],
          BARRIER_TIMEOUT_MS,
          'drill 2'
        );
        // Release the member first and confirm it is queued on the parent's
        // lock before releasing the payment. Both were ready before either
        // entered the service, so the member's transaction cannot time out
        // waiting for a slow payment start.
        writeFileSync(memberGo, 'go');
        const memberQueued = markersReady.ok
          ? await waitForScopedWaiters(
              db,
              APP_PREFIX,
              1,
              'drill 2 member queue'
            )
          : markersReady;
        writeFileSync(paymentGo, 'go');
        const barrier = memberQueued.ok
          ? await waitForScopedWaiters(db, APP_PREFIX, 2, 'drill 2')
          : memberQueued;
        return { workers: [member, payment] as const, barrier };
      },
      { timeout: 60_000 }
    );

    const [member, payment] = await Promise.all(outcome.workers);
    if (!outcome.barrier.ok) {
      fail(
        'the parent released only after two waiters',
        outcome.barrier.reason
      );
    }
    check('the member change succeeded', member.ok, member.code);
    check(
      'the payment got BILL_CHANGED',
      !payment.ok && payment.code === 'BILL_CHANGED',
      payment.code
    );
    check(
      'no payment batch was written',
      (await db.paymentBatch.count({
        where: { restaurantId: fixture.restaurantId, tableId: bill.tableId },
      })) === 0
    );

    const session = await db.diningSession.findUnique({
      where: { id: bill.sessionId },
    });
    check(
      'the bill revision advanced exactly once',
      session?.billRevision === 1,
      `billRevision=${session?.billRevision}`
    );
    check(
      'the member was attached once',
      session?.customerId === bill.customerId,
      String(session?.customerId)
    );

    const visits = await db.loyaltyVisit.count({
      where: {
        restaurantId: fixture.restaurantId,
        customerId: bill.customerId ?? undefined,
      },
    });
    check('no visit was created by the losing payment', visits === 0);
  } finally {
    rmSync(markerDir, { recursive: true, force: true });
  }
}

async function raceRenameVsAnonymise(
  db: PrismaClient,
  fixture: Fixture,
  memberId: string,
  ownerId: string
): Promise<void> {
  console.log('\nDrill 3 — rename vs anonymise');

  const markerDir = createMarkerDir();
  const renameMarker = join(markerDir, 'rename.ready');
  const renameGo = join(markerDir, 'rename.go');
  const anonymiseMarker = join(markerDir, 'anonymise.ready');
  const anonymiseGo = join(markerDir, 'anonymise.go');

  try {
    const outcome = await db.$transaction(
      async (tx) => {
        await tx.$queryRaw`
          SELECT "id" FROM "customers" WHERE "id" = ${memberId} FOR UPDATE
        `;
        // The member services serialise on this row, not on an advisory lock.
        // The barrier scopes the waiter count to these two child sessions.
        const rename = runWorkerProcess(
          'rename',
          {
            restaurantId: fixture.restaurantId,
            memberId,
            actorId: ownerId,
            idempotencyKey: `p9-race-rename-${randomUUID()}`,
            name: 'Renamed By Rehearsal',
          },
          renameMarker,
          renameGo,
          `${APP_PREFIX}3r`
        );
        const anonymise = runWorkerProcess(
          'anonymise',
          {
            restaurantId: fixture.restaurantId,
            memberId,
            actorId: ownerId,
            idempotencyKey: `p9-race-anonymise-${randomUUID()}`,
          },
          anonymiseMarker,
          anonymiseGo,
          `${APP_PREFIX}3a`
        );
        const markersReady = await waitForFiles(
          [renameMarker, anonymiseMarker],
          BARRIER_TIMEOUT_MS,
          'drill 3'
        );
        // Release both children together; they then race for the row lock.
        writeFileSync(renameGo, 'go');
        writeFileSync(anonymiseGo, 'go');
        const barrier = markersReady.ok
          ? await waitForScopedWaiters(db, APP_PREFIX, 2, 'drill 3')
          : markersReady;
        return { workers: [rename, anonymise] as const, barrier };
      },
      { timeout: 60_000 }
    );

    const [rename, anonymise] = await Promise.all(outcome.workers);
    if (!outcome.barrier.ok) {
      fail(
        'the parent released only after two waiters',
        outcome.barrier.reason
      );
    }
    check('the anonymise succeeded', anonymise.ok, anonymise.code);
    check(
      'the rename either succeeded or was refused as anonymised',
      rename.ok || rename.code === 'MEMBER_ANONYMIZED',
      rename.code
    );

    const customer = await db.customer.findUnique({ where: { id: memberId } });
    check(
      'the member is ANONYMIZED',
      customer?.status === 'ANONYMIZED',
      customer?.status
    );
    check(
      'no name remains on the ANONYMIZED row',
      customer?.name === null,
      String(customer?.name)
    );
    check(
      'the anonymised timestamp is set',
      customer?.anonymizedAt !== null,
      String(customer?.anonymizedAt)
    );
  } finally {
    rmSync(markerDir, { recursive: true, force: true });
  }
}

async function renameAfterAnonymise(
  db: PrismaClient,
  fixture: Fixture,
  memberId: string,
  ownerId: string
): Promise<void> {
  console.log('\nDrill 3b — rename after anonymise (deterministic)');

  // The race above is biased towards the safe interleaving: the anonymise may
  // finish first or last. Run the anonymise to completion first so the rename
  // is unambiguously attempted against an ANONYMIZED row.
  const anonymise = await runWorkerProcess('anonymise', {
    restaurantId: fixture.restaurantId,
    memberId,
    actorId: ownerId,
    idempotencyKey: `p9-deterministic-anonymise-${randomUUID()}`,
  });
  check('the deterministic anonymise succeeded', anonymise.ok, anonymise.code);

  const rename = await runWorkerProcess('rename', {
    restaurantId: fixture.restaurantId,
    memberId,
    actorId: ownerId,
    idempotencyKey: `p9-deterministic-rename-${randomUUID()}`,
    name: 'Rename After Anonymise',
  });
  check(
    'the rename is refused with MEMBER_ANONYMIZED',
    !rename.ok && rename.code === 'MEMBER_ANONYMIZED',
    rename.code ?? rename.error
  );

  const customer = await db.customer.findUnique({ where: { id: memberId } });
  check(
    'the member stays ANONYMIZED',
    customer?.status === 'ANONYMIZED',
    customer?.status
  );
  check(
    'the ANONYMIZED row still has no name',
    customer?.name === null,
    String(customer?.name)
  );
}

async function raceRateLimits(
  db: PrismaClient,
  fixture: Fixture
): Promise<void> {
  console.log('\nDrill 4 — concurrent rate-limit increments');

  const incrementSubject = `p9-rate-increment-${randomUUID()}`;
  const incrementResults = await Promise.all([
    runWorkerProcess('rate-increment', {
      restaurantId: fixture.restaurantId,
      scope: 'QR_SESSION',
      subject: incrementSubject,
      times: 25,
    }),
    runWorkerProcess('rate-increment', {
      restaurantId: fixture.restaurantId,
      scope: 'QR_SESSION',
      subject: incrementSubject,
      times: 25,
    }),
  ]);
  check(
    'both increment workers succeeded',
    incrementResults.every((result) => result.ok)
  );
  const counter = await db.rateLimitCounter.findFirst({
    where: {
      restaurantId: fixture.restaurantId,
      scope: 'QR_SESSION',
      subject: incrementSubject,
    },
  });
  check(
    'concurrent increments are exact (50)',
    counter?.count === 50,
    `count=${counter?.count}`
  );

  const now = new Date();
  const sessionId = `p9-rate-refusal-${randomUUID()}`;
  const ip = '203.0.113.50';
  const phone = '+60123456780';
  const refusalResults = await Promise.all([
    runWorkerProcess('rate-enforce', {
      restaurantId: fixture.restaurantId,
      sessionId,
      phone,
      ip,
      limit: 2,
      now: now.toISOString(),
      times: 3,
    }),
    runWorkerProcess('rate-enforce', {
      restaurantId: fixture.restaurantId,
      sessionId,
      phone,
      ip,
      limit: 2,
      now: now.toISOString(),
      times: 2,
    }),
  ]);

  const outcomes = refusalResults.flatMap((result) => {
    if (!result.ok) return [];
    const payload = result.result as {
      outcomes?: Array<{
        allowed: boolean;
        code: string | null;
        failedOpen: boolean;
      }>;
    };
    return payload.outcomes ?? [];
  });
  check('all five refusal attempts reported', outcomes.length === 5);
  check(
    'exactly two requests were allowed',
    outcomes.filter((outcome) => outcome.allowed).length === 2,
    `allowed=${outcomes.filter((outcome) => outcome.allowed).length}`
  );
  check(
    'three requests were refused with RATE_LIMITED',
    outcomes.filter(
      (outcome) => !outcome.allowed && outcome.code === 'RATE_LIMITED'
    ).length === 3
  );
  check(
    'no request failed open',
    outcomes.every((outcome) => outcome.failedOpen === false)
  );

  const counters = await db.rateLimitCounter.findMany({
    where: {
      restaurantId: fixture.restaurantId,
      OR: [
        { scope: 'RESTAURANT', subject: fixture.restaurantId },
        { scope: 'QR_SESSION', subject: sessionId },
        { scope: 'EDGE_IP', subject: ip },
        { scope: 'PHONE_HASH', subject: hashPhone(phone) },
      ],
    },
  });
  check(
    'a refusal left every counter at the limit (2)',
    counters.length === 4 && counters.every((row) => row.count === 2),
    counters.map((row) => `${row.scope}=${row.count}`).join(', ')
  );
}

async function runRollbackDrill(
  db: PrismaClient,
  fixture: Fixture,
  ownerId: string
): Promise<void> {
  console.log('\nDrill 5 (P9d) — rollback with LOYALTY_ENABLED unset');

  // The operator's real rollback is the global flag off while the restaurant
  // row stays on. The rollback restaurant therefore has a `LoyaltySettings`
  // row with `enabled = true`; without it this drill could not tell "honours
  // the env flag" apart from "only checks the per-restaurant row".
  const settingsBefore = await db.loyaltySettings.findUnique({
    where: { restaurantId: fixture.rollbackRestaurantId },
  });
  check(
    'rollback restaurant starts with LoyaltySettings.enabled = true',
    settingsBefore?.enabled === true,
    String(settingsBefore?.enabled)
  );

  const sentinelPhone = '+60123456781';
  const sentinel = await db.customer.create({
    data: {
      restaurantId: fixture.rollbackRestaurantId,
      phone: sentinelPhone,
      phoneHash: hashPhone(sentinelPhone),
      name: 'P9 Sentinel Member',
      consentAt: new Date(),
      consentVersion: 'v1',
      consentTextHash: 'sentinel-hash',
      consentSource: 'COUNTER',
      status: 'ACTIVE',
    },
  });

  const createRollbackBill = async (
    label: string,
    customerId: string | null,
    withSession: boolean
  ): Promise<{ tableId: string; orderId: string }> => {
    const tableId = randomUUID();
    const orderId = randomUUID();
    const sessionId = withSession ? randomUUID() : null;
    await db.table.create({
      data: {
        id: tableId,
        restaurantId: fixture.rollbackRestaurantId,
        tableNumber: `P9-ROLLBACK-${label}`,
        qrCodeToken: randomUUID(),
        status: 'OCCUPIED',
        capacity: 4,
      },
    });
    if (sessionId) {
      await db.diningSession.create({
        data: {
          id: sessionId,
          restaurantId: fixture.rollbackRestaurantId,
          tableId,
          status: 'OPEN',
          customerId,
          billRevision: 0,
        },
      });
      await db.table.update({
        where: { id: tableId },
        data: { activeDiningSessionId: sessionId },
      });
    }
    await db.order.create({
      data: {
        id: orderId,
        orderNumber: `P9-RB-${randomUUID().slice(0, 8)}`,
        restaurantId: fixture.rollbackRestaurantId,
        tableId,
        diningSessionId: sessionId,
        customerId,
        subtotalAmount: 30,
        taxAmount: 0,
        serviceCharge: 0,
        discountAmount: 0,
        totalAmount: 30,
        status: 'CONFIRMED',
        paymentStatus: 'PENDING',
        source: 'COUNTER',
        orderType: 'DINE_IN',
        taxRateSnapshot: 0,
        serviceChargeRateSnapshot: 0,
        taxLabelSnapshot: 'Tax',
        serviceChargeLabelSnapshot: 'Service Charge',
        discountVersion: 0,
      },
    });
    return { tableId, orderId };
  };

  // Keep the guest bill, and add a bill with the sentinel member attached
  // before the flag goes off.
  const guestBill = await createRollbackBill('GUEST', null, false);
  const memberBill = await createRollbackBill('MEMBER', sentinel.id, true);

  const loyaltyCounts = async () => ({
    customers: await db.customer.count({
      where: { restaurantId: fixture.rollbackRestaurantId },
    }),
    visits: await db.loyaltyVisit.count({
      where: { restaurantId: fixture.rollbackRestaurantId },
    }),
    cards: await db.loyaltyCard.count({
      where: { restaurantId: fixture.rollbackRestaurantId },
    }),
    discounts: await db.orderDiscount.count({
      where: { restaurantId: fixture.rollbackRestaurantId },
    }),
    quotes: await db.quote.count({
      where: { restaurantId: fixture.rollbackRestaurantId },
    }),
    rateLimits: await db.rateLimitCounter.count({
      where: { restaurantId: fixture.rollbackRestaurantId },
    }),
  });

  const before = await loyaltyCounts();
  const sentinelBefore = await db.customer.findUnique({
    where: { id: sentinel.id },
  });
  const guestOrderBefore = await db.order.findUnique({
    where: { id: guestBill.orderId },
  });
  const memberOrderBefore = await db.order.findUnique({
    where: { id: memberBill.orderId },
  });

  const { POST: quotePost } = await import('@/app/api/qr/orders/quote/route');
  const { NextRequest } = await import('next/server');
  const { processTablePaymentBatch } = await import(
    '@/lib/services/payment-batch-service'
  );

  delete process.env.LOYALTY_ENABLED;
  try {
    // The per-restaurant switch is still on: only the env flag changed. This
    // assertion is what makes the drill prove the env flag alone wins.
    const settingsDuring = await db.loyaltySettings.findUnique({
      where: { restaurantId: fixture.rollbackRestaurantId },
    });
    check(
      'LoyaltySettings.enabled is still true while LOYALTY_ENABLED is unset',
      settingsDuring?.enabled === true,
      String(settingsDuring?.enabled)
    );

    // QR quote: the route must return the neutral disabled response before any
    // database access. No quote, member or rate-limit row may be written.
    const quoteResponse = await quotePost(
      new NextRequest('http://localhost/api/qr/orders/quote', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ tableId: memberBill.tableId }),
      })
    );
    const quoteBody = (await quoteResponse.json()) as {
      success?: boolean;
      code?: string;
    };
    check(
      'QR quote returns LOYALTY_DISABLED with flag off',
      quoteResponse.status === 200 && quoteBody.code === 'LOYALTY_DISABLED',
      `${quoteResponse.status} ${quoteBody.code}`
    );

    const afterQuote = await loyaltyCounts();
    check(
      'QR quote wrote no loyalty rows',
      JSON.stringify(afterQuote) === JSON.stringify(before),
      JSON.stringify(afterQuote)
    );

    // Guest bill: the legacy payment path must run, with no loyalty rows and
    // the pre-feature response shape.
    const guestResult = await processTablePaymentBatch({
      tableId: guestBill.tableId,
      restaurantId: fixture.rollbackRestaurantId,
      userId: ownerId,
      userType: 'restaurant_owner',
      idempotencyKey: `p9-rollback-guest-${randomUUID()}`,
      paymentMethod: 'cash',
      cashReceived: 30,
    });
    check(
      'guest bill response is the legacy shape',
      guestResult.response.success === true &&
        typeof guestResult.response.paymentBatchId === 'string' &&
        typeof guestResult.response.payment === 'object' &&
        !('loyalty' in guestResult.response) &&
        !('outcome' in guestResult.response)
    );
    const guestBatches = await db.paymentBatch.count({
      where: {
        restaurantId: fixture.rollbackRestaurantId,
        tableId: guestBill.tableId,
      },
    });
    check(
      'the guest legacy path wrote exactly one PaymentBatch',
      guestBatches === 1,
      `count=${guestBatches}`
    );

    // Member-attached bill: the legacy path must ignore the member entirely.
    const memberResult = await processTablePaymentBatch({
      tableId: memberBill.tableId,
      restaurantId: fixture.rollbackRestaurantId,
      userId: ownerId,
      userType: 'restaurant_owner',
      idempotencyKey: `p9-rollback-member-${randomUUID()}`,
      paymentMethod: 'cash',
      cashReceived: 30,
    });
    check(
      'member-attached bill response is the legacy shape',
      memberResult.response.success === true &&
        typeof memberResult.response.paymentBatchId === 'string' &&
        typeof memberResult.response.payment === 'object' &&
        !('loyalty' in memberResult.response) &&
        !('outcome' in memberResult.response)
    );
    const memberBatches = await db.paymentBatch.count({
      where: {
        restaurantId: fixture.rollbackRestaurantId,
        tableId: memberBill.tableId,
      },
    });
    check(
      'the member legacy path wrote exactly one PaymentBatch',
      memberBatches === 1,
      `count=${memberBatches}`
    );

    const afterPayment = await loyaltyCounts();
    check(
      'neither bill wrote a loyalty row',
      JSON.stringify(afterPayment) === JSON.stringify(before),
      JSON.stringify(afterPayment)
    );

    const sentinelAfter = await db.customer.findUnique({
      where: { id: sentinel.id },
    });
    check(
      'existing member row is untouched',
      sentinelAfter?.name === sentinelBefore?.name &&
        sentinelAfter?.phoneHash === sentinelBefore?.phoneHash &&
        sentinelAfter?.status === sentinelBefore?.status &&
        sentinelAfter?.lastVisitAt === sentinelBefore?.lastVisitAt
    );
    check(
      'the member attached to the bill has no LoyaltyCard',
      (await db.loyaltyCard.count({
        where: {
          restaurantId: fixture.rollbackRestaurantId,
          customerId: sentinel.id,
        },
      })) === 0
    );

    const guestOrderAfter = await db.order.findUnique({
      where: { id: guestBill.orderId },
    });
    const memberOrderAfter = await db.order.findUnique({
      where: { id: memberBill.orderId },
    });
    check(
      'both bill totals are untouched',
      guestOrderAfter?.totalAmount.toString() ===
        guestOrderBefore?.totalAmount.toString() &&
        guestOrderAfter?.subtotalAmount.toString() ===
          guestOrderBefore?.subtotalAmount.toString() &&
        memberOrderAfter?.totalAmount.toString() ===
          memberOrderBefore?.totalAmount.toString() &&
        memberOrderAfter?.subtotalAmount.toString() ===
          memberOrderBefore?.subtotalAmount.toString(),
      `${guestOrderAfter?.totalAmount.toString()}/${memberOrderAfter?.totalAmount.toString()}`
    );
    check(
      'both bills were paid by the legacy path',
      guestOrderAfter?.paymentStatus === 'PAID' &&
        memberOrderAfter?.paymentStatus === 'PAID',
      `${guestOrderAfter?.paymentStatus}/${memberOrderAfter?.paymentStatus}`
    );

    const settingsAfter = await db.loyaltySettings.findUnique({
      where: { restaurantId: fixture.rollbackRestaurantId },
    });
    check(
      'LoyaltySettings.enabled is still true after the legacy payments',
      settingsAfter?.enabled === true,
      String(settingsAfter?.enabled)
    );

    const totalBatches = await db.paymentBatch.count({
      where: { restaurantId: fixture.rollbackRestaurantId },
    });
    check(
      'the legacy path wrote exactly one PaymentBatch per bill',
      totalBatches === 2,
      `count=${totalBatches}`
    );
  } finally {
    process.env.LOYALTY_ENABLED = 'true';
  }
}

// ---------------------------------------------------------------------------
// Cleanup
// ---------------------------------------------------------------------------

async function cleanup(
  db: PrismaClient,
  restaurantIds: string[],
  ownerId: string
): Promise<void> {
  console.log('\nCleaning up rehearsal rows…');
  const where = { restaurantId: { in: restaurantIds } };

  await db.orderDiscount.deleteMany({ where });
  await db.loyaltyVisit.deleteMany({ where });
  await db.payment.deleteMany({
    where: { order: { restaurantId: { in: restaurantIds } } },
  });
  await db.paymentBatch.deleteMany({ where });
  await db.quotePromotion.deleteMany({ where });
  await db.quote.deleteMany({ where });
  await db.promotionCategory.deleteMany({ where });
  await db.promotionItem.deleteMany({ where });
  await db.promotion.deleteMany({ where });
  await db.orderEvent.deleteMany({ where });
  await db.order.deleteMany({ where });
  await db.loyaltyCard.deleteMany({ where });
  // DiningSession.customer is ON DELETE RESTRICT, so sessions must go before
  // the customer row. Sessions reference the table, so the table follows.
  await db.diningSession.deleteMany({ where });
  await db.table.deleteMany({ where });
  await db.customer.deleteMany({ where });
  await db.station.deleteMany({ where });
  await db.orderActionReceipt.deleteMany({ where });
  await db.idempotencyRecord.deleteMany({ where });
  await db.auditLog.deleteMany({ where });
  await db.securityEvent.deleteMany({ where });
  await db.restaurantChange.deleteMany({ where });
  await db.rateLimitCounter.deleteMany({ where });
  await db.dailySequence.deleteMany({ where });
  await db.loyaltySettings.deleteMany({ where });
  await db.restaurant.deleteMany({ where: { id: { in: restaurantIds } } });
  await db.restaurantOwner.deleteMany({ where: { id: ownerId } });
}

// ---------------------------------------------------------------------------
// Parent
// ---------------------------------------------------------------------------

async function runParent(): Promise<void> {
  ensureDatabaseUrl();
  process.env.LOYALTY_ENABLED = 'true';
  process.env.LOYALTY_PHONE_HMAC_KEY =
    process.env.LOYALTY_PHONE_HMAC_KEY ?? HMAC_KEY;

  const db = new PrismaClient();
  const suffix = randomUUID().slice(0, 8);
  let fixture: Fixture | null = null;
  let remaining = -1;
  try {
    const primary = await createOwnerAndRestaurant(db, suffix, true);
    fixture = {
      ownerId: primary.ownerId,
      restaurantId: primary.restaurantId,
      rollbackRestaurantId: '',
    };

    const rollback = await createOwnerAndRestaurant(
      db,
      `${suffix}-rollback`,
      true
    );
    fixture.rollbackRestaurantId = rollback.restaurantId;
    // Both restaurants share one synthetic owner. Re-point the rollback
    // restaurant at the primary owner so cleanup has one owner to remove.
    await db.restaurant.update({
      where: { id: rollback.restaurantId },
      data: { ownerId: primary.ownerId },
    });
    await db.restaurantOwner.delete({ where: { id: rollback.ownerId } });

    const memberPhone = '+60123456782';
    const member = await createMember(
      db,
      fixture.restaurantId,
      memberPhone,
      'P9 Rehearsal Member'
    );
    const paidBill = await createBill(
      db,
      fixture.restaurantId,
      'P9-RACE-1',
      member.customerId
    );
    paidBill.cardId = member.cardId;

    const guestMemberPhone = '+60123456783';
    const guestMember = await createMember(
      db,
      fixture.restaurantId,
      guestMemberPhone,
      'P9 Guest Bill Member'
    );
    const guestBill = await createBill(
      db,
      fixture.restaurantId,
      'P9-RACE-2',
      null
    );
    guestBill.customerId = guestMember.customerId;
    guestBill.cardId = guestMember.cardId;
    // The guest bill is not attached to the member until the member-change
    // worker wins; the order copy stays null.
    await db.order.update({
      where: { id: guestBill.orderId },
      data: { customerId: null },
    });

    const renamePhone = '+60123456784';
    const renameMember = await createMember(
      db,
      fixture.restaurantId,
      renamePhone,
      'Original Rehearsal Name'
    );

    // A separate member for the deterministic anonymise-then-rename case, so
    // the race above cannot decide the outcome.
    const deterministicRenamePhone = '+60123456785';
    const deterministicRenameMember = await createMember(
      db,
      fixture.restaurantId,
      deterministicRenamePhone,
      'Deterministic Rename Member'
    );

    await raceTwoPayments(db, fixture, paidBill, fixture.ownerId);
    await raceMemberChangeVsPayment(
      db,
      fixture,
      guestBill,
      fixture.ownerId,
      guestMemberPhone
    );
    await raceRenameVsAnonymise(
      db,
      fixture,
      renameMember.customerId,
      fixture.ownerId
    );
    await renameAfterAnonymise(
      db,
      fixture,
      deterministicRenameMember.customerId,
      fixture.ownerId
    );
    await raceRateLimits(db, fixture);
    await runRollbackDrill(db, fixture, fixture.ownerId);

    await cleanup(
      db,
      [fixture.restaurantId, fixture.rollbackRestaurantId],
      fixture.ownerId
    );
    remaining = await db.restaurant.count({
      where: {
        id: { in: [fixture.restaurantId, fixture.rollbackRestaurantId] },
      },
    });
  } finally {
    await db.$disconnect();
  }

  if (fixture) {
    check(
      'every rehearsal restaurant was removed',
      remaining === 0,
      `remaining=${remaining}`
    );
  }

  console.log(
    `\n${failures === 0 ? 'PASS' : 'FAIL'} — ${checks - failures}/${checks} checks passed`
  );
  if (failures > 0) {
    process.exitCode = 1;
  }
}

async function main(): Promise<void> {
  const workerIndex = process.argv.indexOf('--worker');
  if (workerIndex !== -1) {
    const role = process.argv[workerIndex + 1];
    const payload = process.argv[workerIndex + 2];
    const markerPath = process.argv[workerIndex + 3];
    const goPath = process.argv[workerIndex + 4];
    if (!role || !payload) {
      throw new Error('Worker mode requires a role and a payload');
    }
    await runWorker(role, payload, markerPath, goPath);
    return;
  }

  await runParent();
}

main().catch((error) => {
  console.error('Concurrency rehearsal failed:', error);
  process.exitCode = 1;
});
