import { prisma } from '@/lib/database';
import { PostgresEventManager } from '@/lib/postgres-pubsub';
import { closeDiningSession } from '@/lib/dining-session';
import { autoUpdateTableStatus } from '@/lib/table-status-manager';

jest.mock('@/lib/database', () => ({
  prisma: {
    $transaction: jest.fn(),
    table: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    order: { count: jest.fn() },
  },
}));

jest.mock('@/lib/postgres-pubsub', () => ({
  PostgresEventManager: {
    publishTableStatusChange: jest.fn(),
  },
}));

jest.mock('@/lib/dining-session', () => ({
  closeDiningSession: jest.fn(),
}));

const tableId = '550e8400-e29b-41d4-a716-446655440002';
const restaurantId = '550e8400-e29b-41d4-a716-446655440001';

describe('autoUpdateTableStatus', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (prisma.table.findUnique as jest.Mock).mockResolvedValue({
      status: 'OCCUPIED',
      tableNumber: '1',
      restaurantId,
    });
    (prisma.table.update as jest.Mock).mockResolvedValue({});
    (prisma.order.count as jest.Mock).mockResolvedValue(0);
    (prisma.$transaction as jest.Mock).mockImplementation(
      async (callback: (tx: typeof prisma) => Promise<unknown>) =>
        callback(prisma)
    );
    (closeDiningSession as jest.Mock).mockResolvedValue({
      id: 'session-1',
    });
    (
      PostgresEventManager.publishTableStatusChange as jest.Mock
    ).mockResolvedValue(undefined);
  });

  it('auto-releases a fully served and paid table', async () => {
    (prisma.order.count as jest.Mock)
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(1);

    await autoUpdateTableStatus(tableId);

    expect(closeDiningSession).toHaveBeenCalledWith(prisma, tableId);
    expect(prisma.table.update).not.toHaveBeenCalled();
    expect(PostgresEventManager.publishTableStatusChange).toHaveBeenCalledWith(
      expect.objectContaining({
        tableId,
        previousStatus: 'OCCUPIED',
        newStatus: 'AVAILABLE',
        updatedBy: 'system',
      })
    );
  });

  it('does not release a served but unpaid table', async () => {
    (prisma.order.count as jest.Mock).mockResolvedValueOnce(1);

    await autoUpdateTableStatus(tableId);

    expect(closeDiningSession).not.toHaveBeenCalled();
    expect(
      PostgresEventManager.publishTableStatusChange
    ).not.toHaveBeenCalled();
  });

  it('does not release a table with preparing or ready orders', async () => {
    (prisma.order.count as jest.Mock).mockResolvedValueOnce(1);

    await autoUpdateTableStatus(tableId);

    expect(closeDiningSession).not.toHaveBeenCalled();
    expect(prisma.table.update).not.toHaveBeenCalled();
  });

  it('does not auto-release an orphan table with no orders', async () => {
    (prisma.order.count as jest.Mock)
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0);

    await autoUpdateTableStatus(tableId);

    expect(closeDiningSession).not.toHaveBeenCalled();
    expect(prisma.table.update).not.toHaveBeenCalled();
  });

  it('sets an available table back to occupied when it has active orders', async () => {
    (prisma.table.findUnique as jest.Mock).mockResolvedValue({
      status: 'AVAILABLE',
      tableNumber: '1',
      restaurantId,
    });
    (prisma.order.count as jest.Mock).mockResolvedValue(1);

    await autoUpdateTableStatus(tableId);

    expect(prisma.table.update).toHaveBeenCalledWith({
      where: { id: tableId },
      data: {
        status: 'OCCUPIED',
        updatedAt: expect.any(Date),
      },
    });
    expect(PostgresEventManager.publishTableStatusChange).toHaveBeenCalledWith(
      expect.objectContaining({
        tableId,
        previousStatus: 'AVAILABLE',
        newStatus: 'OCCUPIED',
      })
    );
    expect(closeDiningSession).not.toHaveBeenCalled();
  });

  it('does not change a reserved table', async () => {
    (prisma.table.findUnique as jest.Mock).mockResolvedValue({
      status: 'RESERVED',
      tableNumber: '1',
      restaurantId,
    });

    await autoUpdateTableStatus(tableId);

    expect(prisma.table.update).not.toHaveBeenCalled();
    expect(closeDiningSession).not.toHaveBeenCalled();
  });

  it('does nothing for takeaway', async () => {
    await autoUpdateTableStatus(null);

    expect(prisma.table.findUnique).not.toHaveBeenCalled();
    expect(prisma.table.update).not.toHaveBeenCalled();
    expect(closeDiningSession).not.toHaveBeenCalled();
  });
});
