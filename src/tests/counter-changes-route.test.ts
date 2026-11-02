import { NextRequest } from 'next/server';
import {
  getTenantContext,
  requireAuth,
  requirePermission,
} from '@/lib/tenant-context';
import { counterAccessDenied } from '@/lib/counter/access';
import { prisma } from '@/lib/database';
import { GET as getChanges } from '@/app/api/counter/changes/route';

jest.mock('@/lib/tenant-context', () => ({
  getTenantContext: jest.fn(),
  requireAuth: jest.fn(),
  requirePermission: jest.fn(),
}));

jest.mock('@/lib/counter/access', () => ({
  counterAccessDenied: jest.fn(() => null),
}));

jest.mock('@/lib/database', () => ({
  prisma: {
    restaurantChange: { findFirst: jest.fn(), findMany: jest.fn() },
  },
}));

const restaurantId = '550e8400-e29b-41d4-a716-446655440001';
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

function request(query: string): NextRequest {
  return new NextRequest(`http://localhost/api/counter/changes${query}`);
}

describe('Counter changes route', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getTenantContext as jest.Mock).mockResolvedValue(context);
    (requireAuth as jest.Mock).mockReturnValue(context);
    (requirePermission as jest.Mock).mockReturnValue(undefined);
    (counterAccessDenied as jest.Mock).mockReturnValue(null);
    (prisma.restaurantChange.findFirst as jest.Mock).mockResolvedValue({
      id: BigInt(42),
    });
    (prisma.restaurantChange.findMany as jest.Mock).mockResolvedValue([]);
  });

  it('returns the current cursor without replaying history on first sync', async () => {
    const response = await getChanges(request('?since=0'));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.changes).toEqual([]);
    expect(json.cursor).toBe(42);
    expect(prisma.restaurantChange.findMany).not.toHaveBeenCalled();
  });

  it('returns changes after the cursor', async () => {
    (prisma.restaurantChange.findMany as jest.Mock).mockResolvedValue([
      {
        id: BigInt(11),
        entityType: 'order',
        entityId: 'order-1',
        operation: 'upsert',
        createdAt: new Date('2026-11-02T12:00:00.000Z'),
      },
      {
        id: BigInt(12),
        entityType: 'table',
        entityId: 'table-1',
        operation: 'upsert',
        createdAt: new Date('2026-11-02T12:01:00.000Z'),
      },
    ]);

    const response = await getChanges(request('?since=10&limit=1'));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.changes).toHaveLength(1);
    expect(json.changes[0]).toMatchObject({
      seq: 11,
      entityType: 'order',
      entityId: 'order-1',
    });
    expect(json.nextSeq).toBe(11);
    expect(json.hasMore).toBe(true);
  });

  it('rejects an invalid cursor', async () => {
    const response = await getChanges(request('?since=-1'));
    expect(response.status).toBe(400);
  });
});
