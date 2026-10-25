/**
 * Safe maintenance for stale table/session state.
 *
 * Dry-run by default. Set APPLY=1 to:
 *  - mark expired ACTIVE customer sessions EXPIRED;
 *  - clear OCCUPIED tables that have no active orders and no unexpired session.
 */
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
const apply = process.env.APPLY === '1';

async function main() {
  const now = new Date();
  const [expiredSessions, tables] = await Promise.all([
    prisma.customerSession.findMany({
      where: { status: 'ACTIVE', expiresAt: { lt: now } },
      select: { id: true, tableId: true, expiresAt: true },
    }),
    prisma.table.findMany({
      where: { status: 'OCCUPIED' },
      select: {
        id: true,
        tableNumber: true,
        restaurantId: true,
        orders: {
          where: {
            status: { in: ['PENDING', 'CONFIRMED', 'PREPARING', 'READY'] },
          },
          select: { id: true },
        },
        customerSessions: {
          where: { status: 'ACTIVE', expiresAt: { gt: now } },
          select: { id: true },
        },
      },
    }),
  ]);

  const staleTables = tables.filter(
    (t) => t.orders.length === 0 && t.customerSessions.length === 0
  );

  console.log(
    JSON.stringify(
      {
        mode: apply ? 'apply' : 'dry-run',
        expiredActiveSessions: expiredSessions.length,
        staleOccupiedTables: staleTables.map((t) => ({
          id: t.id,
          tableNumber: t.tableNumber,
          restaurantId: t.restaurantId,
        })),
      },
      null,
      2
    )
  );

  if (apply && expiredSessions.length > 0) {
    await prisma.customerSession.updateMany({
      where: { id: { in: expiredSessions.map((s) => s.id) } },
      data: { status: 'EXPIRED', endedAt: now },
    });
  }
  if (apply && staleTables.length > 0) {
    await prisma.table.updateMany({
      where: { id: { in: staleTables.map((t) => t.id) } },
      data: { status: 'AVAILABLE' },
    });
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
