import { NextRequest } from 'next/server';
import {
  getTenantContext,
  requireAuth,
  requirePermission,
} from '@/lib/tenant-context';
import { prisma } from '@/lib/database';
import { counterAccessDenied } from '@/lib/counter/access';
import { requireTableAccess } from '@/lib/rbac/resource-auth';
import { closeDiningSession } from '@/lib/dining-session';
import { PostgresEventManager } from '@/lib/postgres-pubsub';
import { POST as clearTable } from '@/app/api/counter/tables/[tableId]/clear/route';

jest.mock('@/lib/tenant-context', () => ({
  getTenantContext: jest.fn(),
  requireAuth: jest.fn(),
  requirePermission: jest.fn(),
}));

jest.mock('@/lib/counter/access', () => ({
  counterAccessDenied: jest.fn(() => null),
}));

jest.mock('@/lib/rbac/resource-auth', () => ({
  requireTableAccess: jest.fn(),
}));

jest.mock('@/lib/dining-session', () => ({
  closeDiningSession: jest.fn(),
}));

jest.mock('@/lib/postgres-pubsub', () => ({
  PostgresEventManager: {
    publishTableStatusChange: jest.fn(),
  },
}));

jest.mock('@/lib/database', () => ({
  prisma: {
    table: { findUnique: jest.fn() },
    order: { count: jest.fn() },
    auditLog: { create: jest.fn() },
    $transaction: jest.fn(),
  },
}));

const restaurantId = '550e8400-e29b-41d4-a716-446655440001';
const tableId = '550e8400-e29b-41d4-a716-446655440002';
const sessionId = '550e8400-e29b-41d4-a716-446655440003';

const context = {
  userId: 'user-1',
  userType: 'restaurant_owner',
  email: 'owner@example.test',
  restaurantId,
  permissions: {},
  isAdmin: false,
  roleTemplate: 'restaurant_owner',
  mustChangePassword: false,
};

const table = {
  id: tableId,
  tableNumber: '1',
  restaurantId,
  status: 'OCCUPIED',
};

const tx = {
  table: {
    findUnique: jest.fn(),
    update: jest.fn(),
  },
  auditLog: { create: jest.fn() },
};

describe('Counter clear table route', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getTenantContext as jest.Mock).mockResolvedValue(context);
    (requireAuth as jest.Mock).mockReturnValue(context);
    (requirePermission as jest.Mock).mockReturnValue(undefined);
    (counterAccessDenied as jest.Mock).mockReturnValue(null);
    (requireTableAccess as jest.Mock).mockResolvedValue(undefined);
    (prisma.table.findUnique as jest.Mock).mockResolvedValue(table);
    (prisma.order.count as jest.Mock).mockResolvedValue(0);
    (closeDiningSession as jest.Mock).mockResolvedValue({ id: sessionId });
    (
      PostgresEventManager.publishTableStatusChange as jest.Mock
    ).mockResolvedValue(undefined);
    tx.table.findUnique.mockResolvedValue({
      id: tableId,
      tableNumber: '1',
      status: 'AVAILABLE',
    });
    tx.auditLog.create.mockResolvedValue({});
    (prisma.$transaction as jest.Mock).mockImplementation(
      async (callback: (client: typeof tx) => unknown) => callback(tx)
    );
  });

  it('closes the dining session and returns the cleared table', async () => {
    const response = await clearTable(
      new NextRequest(`http://localhost/api/counter/tables/${tableId}/clear`, {
        method: 'POST',
      }),
      { params: Promise.resolve({ tableId }) }
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(closeDiningSession).toHaveBeenCalledWith(
      tx,
      tableId,
      expect.objectContaining({ userId: context.userId })
    );
    expect(json.table).toMatchObject({
      id: tableId,
      status: 'AVAILABLE',
      closedDiningSessionId: sessionId,
    });
    expect(PostgresEventManager.publishTableStatusChange).toHaveBeenCalledWith(
      expect.objectContaining({
        tableId,
        newStatus: 'AVAILABLE',
      })
    );
  });

  it('does not clear when a blocking order remains', async () => {
    (prisma.order.count as jest.Mock).mockResolvedValue(1);

    const response = await clearTable(
      new NextRequest(`http://localhost/api/counter/tables/${tableId}/clear`, {
        method: 'POST',
      }),
      { params: Promise.resolve({ tableId }) }
    );
    const json = await response.json();

    expect(response.status).toBe(409);
    expect(json.code).toBe('TABLE_NOT_CLEAR');
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(closeDiningSession).not.toHaveBeenCalled();
  });
});
