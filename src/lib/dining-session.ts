import type { DiningSession, Prisma } from '@prisma/client';

export interface DiningSessionActor {
  userId?: string | null;
}

export class DiningSessionError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode = 409
  ) {
    super(message);
    this.name = 'DiningSessionError';
  }
}

interface LockedTable {
  id: string;
  restaurantId: string;
  activeDiningSessionId: string | null;
  status: string;
}

/**
 * Lock and read the table row for a dining-session transition.
 *
 * The row lock serializes two concurrent first orders for the same table so
 * they cannot create two open sessions. The partial unique index in the
 * migration is the database-level safety net.
 */
async function lockTable(
  tx: Prisma.TransactionClient,
  tableId: string
): Promise<LockedTable> {
  const rows = await tx.$queryRaw<LockedTable[]>`
    SELECT
      "id",
      "restaurantId",
      "activeDiningSessionId",
      "status"::text AS "status"
    FROM "tables"
    WHERE "id" = ${tableId}
    FOR UPDATE
  `;

  const table = rows[0];
  if (!table) {
    throw new DiningSessionError('Table not found', 'TABLE_NOT_FOUND', 404);
  }
  return table;
}

async function findOpenSession(
  tx: Prisma.TransactionClient,
  tableId: string
): Promise<DiningSession | null> {
  return tx.diningSession.findFirst({
    where: { tableId, status: 'OPEN' },
    orderBy: { openedAt: 'desc' },
  });
}

/**
 * Return the active dining session for a table, opening one when needed.
 *
 * Call this inside the same transaction that creates the dine-in order. Do not
 * call it for takeaway orders.
 */
export async function ensureOpenDiningSession(
  tx: Prisma.TransactionClient,
  tableId: string,
  actor?: DiningSessionActor
): Promise<DiningSession> {
  const table = await lockTable(tx, tableId);

  if (table.activeDiningSessionId) {
    const active = await tx.diningSession.findUnique({
      where: { id: table.activeDiningSessionId },
    });

    if (active?.status === 'OPEN') {
      if (table.status !== 'OCCUPIED') {
        await tx.table.update({
          where: { id: tableId },
          data: { status: 'OCCUPIED' },
        });
      }
      return active;
    }
  }

  // Repair a missing/stale pointer if an open session already exists.
  const existingOpen = await findOpenSession(tx, tableId);
  if (existingOpen) {
    await tx.table.update({
      where: { id: tableId },
      data: {
        activeDiningSessionId: existingOpen.id,
        status: 'OCCUPIED',
      },
    });
    return existingOpen;
  }

  const created = await tx.diningSession.create({
    data: {
      restaurantId: table.restaurantId,
      tableId,
      status: 'OPEN',
      openedBy: actor?.userId ?? null,
    },
  });

  await tx.table.update({
    where: { id: tableId },
    data: {
      activeDiningSessionId: created.id,
      status: 'OCCUPIED',
    },
  });

  return created;
}

/**
 * Close the current dining session and make the table available.
 *
 * The caller must still enforce the table-clear blocking rules before calling
 * this helper. This function only owns the session/table transition.
 */
export async function closeDiningSession(
  tx: Prisma.TransactionClient,
  tableId: string,
  actor?: DiningSessionActor
): Promise<DiningSession | null> {
  const table = await lockTable(tx, tableId);
  const now = new Date();

  let open: DiningSession | null = null;

  if (table.activeDiningSessionId) {
    const active = await tx.diningSession.findUnique({
      where: { id: table.activeDiningSessionId },
    });
    if (active?.status === 'OPEN') open = active;
  }

  if (!open) {
    open = await findOpenSession(tx, tableId);
  }

  if (open) {
    await tx.diningSession.update({
      where: { id: open.id },
      data: {
        status: 'CLOSED',
        closedAt: now,
        closedBy: actor?.userId ?? null,
      },
    });
  }

  await tx.table.update({
    where: { id: tableId },
    data: {
      activeDiningSessionId: null,
      status: 'AVAILABLE',
    },
  });

  return open;
}

/** Read-only helper for bill/reporting code that only needs the open session. */
export async function getOpenDiningSession(
  tx: Prisma.TransactionClient,
  tableId: string
): Promise<DiningSession | null> {
  return findOpenSession(tx, tableId);
}
