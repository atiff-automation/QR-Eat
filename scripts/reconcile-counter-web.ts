/**
 * Read-only Counter/web reconciliation.
 *
 * Compares order totals, item sums, payment-ledger net amounts, payment-batch
 * totals and table occupancy for a date window. Never writes to the database.
 *
 * Usage:
 *   DAYS=7 DATABASE_URL=... npx tsx scripts/reconcile-counter-web.ts
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const days = Number(process.env.DAYS || 7);
const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
const money = (n: number) => Math.round(n * 100) / 100;
const same = (a: number, b: number, tolerance = 0.01) =>
  Math.abs(a - b) <= tolerance;
const num = (v: unknown) => Number(v ?? 0);

async function main() {
  const [orders, batches, tables, expiredActiveSessions] = await Promise.all([
    prisma.order.findMany({
      where: { createdAt: { gte: since } },
      include: {
        restaurant: { select: { id: true, name: true } },
        table: { select: { id: true, tableNumber: true, status: true } },
        items: { select: { totalAmount: true } },
        payments: {
          select: { amount: true, status: true, receiptNumber: true },
        },
      },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.paymentBatch.findMany({
      where: { createdAt: { gte: since } },
      include: {
        payments: {
          select: { amount: true, status: true, receiptNumber: true },
        },
      },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.table.findMany({
      select: {
        id: true,
        tableNumber: true,
        status: true,
        restaurantId: true,
        restaurant: { select: { name: true } },
        orders: {
          where: {
            status: { in: ['PENDING', 'CONFIRMED', 'PREPARING', 'READY'] },
          },
          select: { id: true, orderNumber: true, status: true },
        },
        customerSessions: {
          where: { status: 'ACTIVE' },
          select: { id: true, expiresAt: true },
        },
      },
    }),
    prisma.customerSession.count({
      where: { status: 'ACTIVE', expiresAt: { lt: new Date() } },
    }),
  ]);

  const issues: Array<{ kind: string; ref: string; detail: string }> = [];
  const restaurantTotals = new Map<
    string,
    {
      name: string;
      orders: number;
      revenue: number;
      paid: number;
      refunded: number;
    }
  >();

  for (const order of orders) {
    const key = order.restaurantId;
    const total = restaurantTotals.get(key) || {
      name: order.restaurant.name,
      orders: 0,
      revenue: 0,
      paid: 0,
      refunded: 0,
    };
    total.orders += 1;
    total.revenue += num(order.totalAmount);
    const paid = order.payments
      .filter((p) => p.status === 'PAID')
      .reduce((sum, p) => sum + num(p.amount), 0);
    const refunded = order.payments
      .filter((p) => p.status === 'PAID' && num(p.amount) < 0)
      .reduce((sum, p) => sum + Math.abs(num(p.amount)), 0);
    total.paid += Math.max(0, paid);
    total.refunded += refunded;
    restaurantTotals.set(key, total);

    const expectedTotal =
      num(order.subtotalAmount) +
      num(order.taxAmount) +
      num(order.serviceCharge) -
      num(order.discountAmount);
    if (!same(expectedTotal, num(order.totalAmount))) {
      issues.push({
        kind: 'ORDER_TOTAL_MATH',
        ref: order.orderNumber,
        detail: `expected ${money(expectedTotal)} got ${money(num(order.totalAmount))}`,
      });
    }

    const itemSum = order.items.reduce(
      (sum, item) => sum + num(item.totalAmount),
      0
    );
    if (!same(itemSum, num(order.subtotalAmount))) {
      issues.push({
        kind: 'ORDER_ITEM_SUM',
        ref: order.orderNumber,
        detail: `items ${money(itemSum)} vs subtotal ${money(num(order.subtotalAmount))}`,
      });
    }

    if (order.paymentStatus === 'PAID' && !same(paid, num(order.totalAmount))) {
      issues.push({
        kind: 'PAID_LEDGER_MISMATCH',
        ref: order.orderNumber,
        detail: `paid ${money(paid)} vs order ${money(num(order.totalAmount))}`,
      });
    }
    if (order.paymentStatus === 'PENDING' && !same(paid, 0)) {
      issues.push({
        kind: 'PENDING_HAS_PAYMENT',
        ref: order.orderNumber,
        detail: `net paid ${money(paid)} while PENDING`,
      });
    }
    if (order.paymentStatus === 'REFUNDED' && !same(paid, 0)) {
      issues.push({
        kind: 'REFUND_LEDGER_MISMATCH',
        ref: order.orderNumber,
        detail: `net paid ${money(paid)} while REFUNDED`,
      });
    }
    if (
      order.status === 'CANCELLED' &&
      !['REFUNDED', 'PENDING', 'FAILED'].includes(order.paymentStatus)
    ) {
      issues.push({
        kind: 'CANCELLED_NOT_REFUNDED',
        ref: order.orderNumber,
        detail: `paymentStatus ${order.paymentStatus}`,
      });
    }
  }

  for (const batch of batches) {
    const batchSum = batch.payments
      .filter((p) => p.status === 'PAID')
      .reduce((sum, p) => sum + num(p.amount), 0);
    if (!same(batchSum, num(batch.totalAmount))) {
      issues.push({
        kind: 'PAYMENT_BATCH_SUM',
        ref: batch.receiptNumber,
        detail: `payments ${money(batchSum)} vs batch ${money(num(batch.totalAmount))}`,
      });
    }
    if (batch.payments.length === 0) {
      issues.push({
        kind: 'EMPTY_PAYMENT_BATCH',
        ref: batch.receiptNumber,
        detail: 'batch has no payments',
      });
    }
  }

  const activeStatuses = ['PENDING', 'CONFIRMED', 'PREPARING', 'READY'];
  for (const table of tables) {
    const active = table.orders.filter((o) =>
      activeStatuses.includes(o.status)
    );
    const hasLiveSession = table.customerSessions.some(
      (session) => session.expiresAt > new Date()
    );
    if (table.status === 'OCCUPIED' && active.length === 0 && !hasLiveSession) {
      issues.push({
        kind: 'STALE_OCCUPIED_TABLE',
        ref: `${table.restaurant.name} / ${table.tableNumber}`,
        detail: 'table is OCCUPIED with no active order or unexpired session',
      });
    }
    if (table.status === 'AVAILABLE' && active.length > 0) {
      issues.push({
        kind: 'TABLE_AVAILABLE_WITH_ACTIVE_ORDER',
        ref: `${table.restaurant.name} / ${table.tableNumber}`,
        detail: active.map((o) => o.orderNumber).join(','),
      });
    }
  }

  console.log(
    JSON.stringify(
      {
        window: {
          days,
          since: since.toISOString(),
          until: new Date().toISOString(),
        },
        counts: {
          orders: orders.length,
          paymentBatches: batches.length,
          tables: tables.length,
          expiredActiveSessions,
          issues: issues.length,
        },
        restaurants: Array.from(restaurantTotals.values()).map((r) => ({
          ...r,
          revenue: money(r.revenue),
          paid: money(r.paid),
          refunded: money(r.refunded),
        })),
        issues,
      },
      null,
      2
    )
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
