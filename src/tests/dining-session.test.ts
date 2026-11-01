import type { DiningSession, Prisma } from '@prisma/client';
import {
  DiningSessionError,
  closeDiningSession,
  ensureOpenDiningSession,
  getOpenDiningSession,
} from '@/lib/dining-session';

const restaurantId = '550e8400-e29b-41d4-a716-446655440001';
const tableId = '550e8400-e29b-41d4-a716-446655440002';
const sessionId = '550e8400-e29b-41d4-a716-446655440003';

function session(overrides: Partial<DiningSession> = {}): DiningSession {
  return {
    id: sessionId,
    restaurantId,
    tableId,
    status: 'OPEN',
    openedAt: new Date('2026-11-01T12:00:00.000Z'),
    closedAt: null,
    openedBy: null,
    closedBy: null,
    ...overrides,
  } as DiningSession;
}

function lockedTable(overrides: Record<string, unknown> = {}) {
  return {
    id: tableId,
    restaurantId,
    activeDiningSessionId: null,
    status: 'AVAILABLE',
    ...overrides,
  };
}

function makeTx() {
  return {
    $queryRaw: jest.fn(),
    diningSession: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    table: {
      update: jest.fn(),
    },
  } as unknown as Prisma.TransactionClient & {
    $queryRaw: jest.Mock;
    diningSession: {
      findUnique: jest.Mock;
      findFirst: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
    table: { update: jest.Mock };
  };
}

describe('dining session helpers', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('opens one session and marks the table occupied', async () => {
    const tx = makeTx();
    const opened = session({ openedBy: 'user-1' });

    tx.$queryRaw.mockResolvedValue([lockedTable()]);
    tx.diningSession.findFirst.mockResolvedValue(null);
    tx.diningSession.create.mockResolvedValue(opened);
    tx.table.update.mockResolvedValue({});

    const result = await ensureOpenDiningSession(tx, tableId, {
      userId: 'user-1',
    });

    expect(result).toBe(opened);
    expect(tx.diningSession.create).toHaveBeenCalledWith({
      data: {
        restaurantId,
        tableId,
        status: 'OPEN',
        openedBy: 'user-1',
      },
    });
    expect(tx.table.update).toHaveBeenCalledWith({
      where: { id: tableId },
      data: {
        activeDiningSessionId: sessionId,
        status: 'OCCUPIED',
      },
    });
  });

  it('reuses the active open session without creating another', async () => {
    const tx = makeTx();
    const existing = session();

    tx.$queryRaw.mockResolvedValue([
      lockedTable({
        activeDiningSessionId: sessionId,
        status: 'OCCUPIED',
      }),
    ]);
    tx.diningSession.findUnique.mockResolvedValue(existing);

    const result = await ensureOpenDiningSession(tx, tableId);

    expect(result).toBe(existing);
    expect(tx.diningSession.findFirst).not.toHaveBeenCalled();
    expect(tx.diningSession.create).not.toHaveBeenCalled();
    expect(tx.table.update).not.toHaveBeenCalled();
  });

  it('repairs a missing active pointer when an open session exists', async () => {
    const tx = makeTx();
    const existing = session();

    tx.$queryRaw.mockResolvedValue([lockedTable()]);
    tx.diningSession.findFirst.mockResolvedValue(existing);
    tx.table.update.mockResolvedValue({});

    const result = await ensureOpenDiningSession(tx, tableId);

    expect(result).toBe(existing);
    expect(tx.diningSession.create).not.toHaveBeenCalled();
    expect(tx.table.update).toHaveBeenCalledWith({
      where: { id: tableId },
      data: {
        activeDiningSessionId: sessionId,
        status: 'OCCUPIED',
      },
    });
  });

  it('does not reuse a closed session', async () => {
    const tx = makeTx();
    const closed = session({
      status: 'CLOSED',
      closedAt: new Date('2026-11-01T13:00:00.000Z'),
    });
    const opened = session({ id: 'session-new', openedBy: 'user-2' });

    tx.$queryRaw.mockResolvedValue([
      lockedTable({
        activeDiningSessionId: sessionId,
        status: 'AVAILABLE',
      }),
    ]);
    tx.diningSession.findUnique.mockResolvedValue(closed);
    tx.diningSession.findFirst.mockResolvedValue(null);
    tx.diningSession.create.mockResolvedValue(opened);
    tx.table.update.mockResolvedValue({});

    const result = await ensureOpenDiningSession(tx, tableId, {
      userId: 'user-2',
    });

    expect(result).toBe(opened);
    expect(tx.diningSession.create).toHaveBeenCalled();
  });

  it('closes the active session and makes the table available', async () => {
    const tx = makeTx();
    const active = session();

    tx.$queryRaw.mockResolvedValue([
      lockedTable({
        activeDiningSessionId: sessionId,
        status: 'OCCUPIED',
      }),
    ]);
    tx.diningSession.findUnique.mockResolvedValue(active);
    tx.diningSession.update.mockResolvedValue({});
    tx.table.update.mockResolvedValue({});

    const result = await closeDiningSession(tx, tableId, {
      userId: 'user-3',
    });

    expect(result).toBe(active);
    expect(tx.diningSession.update).toHaveBeenCalledWith({
      where: { id: sessionId },
      data: {
        status: 'CLOSED',
        closedAt: expect.any(Date),
        closedBy: 'user-3',
      },
    });
    expect(tx.table.update).toHaveBeenCalledWith({
      where: { id: tableId },
      data: {
        activeDiningSessionId: null,
        status: 'AVAILABLE',
      },
    });
  });

  it('closes the table even when no open session exists', async () => {
    const tx = makeTx();

    tx.$queryRaw.mockResolvedValue([lockedTable()]);
    tx.diningSession.findFirst.mockResolvedValue(null);
    tx.table.update.mockResolvedValue({});

    const result = await closeDiningSession(tx, tableId);

    expect(result).toBeNull();
    expect(tx.diningSession.update).not.toHaveBeenCalled();
    expect(tx.table.update).toHaveBeenCalledWith({
      where: { id: tableId },
      data: {
        activeDiningSessionId: null,
        status: 'AVAILABLE',
      },
    });
  });

  it('fails clearly when the table does not exist', async () => {
    const tx = makeTx();
    tx.$queryRaw.mockResolvedValue([]);

    await expect(ensureOpenDiningSession(tx, tableId)).rejects.toMatchObject({
      code: 'TABLE_NOT_FOUND',
      statusCode: 404,
    });
    await expect(ensureOpenDiningSession(tx, tableId)).rejects.toBeInstanceOf(
      DiningSessionError
    );
  });

  it('reads the open session without creating one', async () => {
    const tx = makeTx();
    const existing = session();
    tx.diningSession.findFirst.mockResolvedValue(existing);

    const result = await getOpenDiningSession(tx, tableId);

    expect(result).toBe(existing);
    expect(tx.diningSession.findFirst).toHaveBeenCalledWith({
      where: { tableId, status: 'OPEN' },
      orderBy: { openedAt: 'desc' },
    });
    expect(tx.diningSession.create).not.toHaveBeenCalled();
  });
});
