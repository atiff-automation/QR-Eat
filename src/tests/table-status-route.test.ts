import { NextRequest } from 'next/server';
import {
  getTenantContext,
  requireAuth,
  requirePermission,
} from '@/lib/tenant-context';
import { prisma } from '@/lib/database';
import { requireTableAccess } from '@/lib/rbac/resource-auth';
import { closeDiningSession } from '@/lib/dining-session';
import { PostgresEventManager } from '@/lib/postgres-pubsub';
import { PATCH as patchStatus } from '@/app/api/tables/[id]/status/route';

jest.mock('@/lib/tenant-context', () => ({
  getTenantContext: jest.fn(),
  requireAuth: jest.fn(),
  requirePermission: jest.fn(),
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
    table: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
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

const currentTable = {
  id: tableId,
  tableNumber: '1',
  restaurantId,
  status: 'OCCUPIED',
};

const tx = {
  table: { findUnique: jest.fn() },
  auditLog: { create: jest.fn() },
};

function request(status: string) {
  return new NextRequest(`http://localhost/api/tables/${tableId}/status`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ status }),
  });
}

describe('Table status route', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getTenantContext as jest.Mock).mockResolvedValue(context);
    (requireAuth as jest.Mock).mockReturnValue(context);
    (requirePermission as jest.Mock).mockReturnValue(undefined);
    (requireTableAccess as jest.Mock).mockResolvedValue(undefined);
    (prisma.table.findUnique as jest.Mock).mockResolvedValue(currentTable);
    (prisma.order.count as jest.Mock).mockResolvedValue(0);
    (closeDiningSession as jest.Mock).mockResolvedValue({ id: sessionId });
    (
      PostgresEventManager.publishTableStatusChange as jest.Mock
    ).mockResolvedValue(undefined);
    (prisma.table.update as jest.Mock).mockResolvedValue({
      ...currentTable,
      status: 'RESERVED',
    });
    (prisma.auditLog.create as jest.Mock).mockResolvedValue({});
    tx.table.findUnique.mockResolvedValue({
      ...currentTable,
      status: 'AVAILABLE',
    });
    tx.auditLog.create.mockResolvedValue({});
    (prisma.$transaction as jest.Mock).mockImplementation(
      async (callback: (client: typeof tx) => unknown) => callback(tx)
    );
  });

  it('closes the dining session when setting the table available', async () => {
    const response = await patchStatus(request('AVAILABLE'), {
      params: Promise.resolve({ id: tableId }),
    });
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(closeDiningSession).toHaveBeenCalledWith(
      tx,
      tableId,
      expect.objectContaining({ userId: context.userId })
    );
    expect(json.table.status).toBe('AVAILABLE');
  });

  it('blocks AVAILABLE when a blocking order remains', async () => {
    (prisma.order.count as jest.Mock).mockResolvedValue(1);

    const response = await patchStatus(request('AVAILABLE'), {
      params: Promise.resolve({ id: tableId }),
    });
    const json = await response.json();

    expect(response.status).toBe(409);
    expect(json.code).toBe('TABLE_NOT_CLEAR');
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(closeDiningSession).not.toHaveBeenCalled();
  });

  it('keeps the normal status update path for non-AVAILABLE changes', async () => {
    (prisma.table.findUnique as jest.Mock).mockResolvedValue({
      ...currentTable,
      status: 'AVAILABLE',
    });

    const response = await patchStatus(request('RESERVED'), {
      params: Promise.resolve({ id: tableId }),
    });
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(prisma.table.update).toHaveBeenCalled();
    expect(closeDiningSession).not.toHaveBeenCalled();
    expect(json.table.status).toBe('RESERVED');
  });
});
