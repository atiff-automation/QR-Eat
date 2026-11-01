import { prisma } from '@/lib/database';
import { PostgresEventManager } from '@/lib/postgres-pubsub';
import { autoUpdateTableStatus } from '@/lib/table-status-manager';

jest.mock('@/lib/database', () => ({
  prisma: {
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
    (
      PostgresEventManager.publishTableStatusChange as jest.Mock
    ).mockResolvedValue(undefined);
  });

  it('does not auto-clear a paid+served table; manual clear owns it', async () => {
    await autoUpdateTableStatus(tableId);

    expect(prisma.order.count).toHaveBeenCalled();
    expect(prisma.table.update).not.toHaveBeenCalled();
    expect(
      PostgresEventManager.publishTableStatusChange
    ).not.toHaveBeenCalled();
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
  });

  it('does nothing for takeaway', async () => {
    await autoUpdateTableStatus(null);

    expect(prisma.table.findUnique).not.toHaveBeenCalled();
    expect(prisma.table.update).not.toHaveBeenCalled();
  });
});
