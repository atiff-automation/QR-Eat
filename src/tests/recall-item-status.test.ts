import { NextRequest } from 'next/server';
import { prisma } from '@/lib/database';
import { AuthServiceV2 } from '@/lib/rbac/auth-service';
import {
  hasActiveRecallForItem,
  clearRecallIfStationReady,
} from '@/lib/recall';
import {
  recordOrderItemStatusChanged,
  recordOrderRecallCleared,
} from '@/lib/order-events';
import { PostgresEventManager } from '@/lib/postgres-pubsub';
import { PATCH as updateItemStatus } from '@/app/api/kitchen/items/[id]/status/route';

jest.mock('@/lib/database', () => ({
  prisma: {
    orderItem: {
      findUnique: jest.fn(),
      update: jest.fn(),
      findMany: jest.fn(),
    },
    order: { findUnique: jest.fn(), updateMany: jest.fn() },
    stationOrderRecall: { findMany: jest.fn() },
  },
}));

jest.mock('@/lib/auth-utils', () => ({
  getTokenFromRequest: jest.fn(() => 'staff-token'),
}));

jest.mock('@/lib/rbac/auth-service', () => ({
  AuthServiceV2: { validateToken: jest.fn() },
}));

jest.mock('@/lib/device-auth', () => ({
  verifyStaffSession: jest.fn(),
}));

jest.mock('@/lib/recall', () => ({
  hasActiveRecallForItem: jest.fn(),
  clearRecallIfStationReady: jest.fn(),
}));

jest.mock('@/lib/order-events', () => ({
  recordOrderItemStatusChanged: jest.fn(),
  recordOrderRecallCleared: jest.fn(),
  recordOrderStatusChanged: jest.fn(),
}));

jest.mock('@/lib/postgres-pubsub', () => ({
  PostgresEventManager: {
    publishOrderItemStatusChange: jest.fn(),
    publishOrderRecallCleared: jest.fn(),
    publishOrderStatusChange: jest.fn(),
  },
}));

const currentItem = {
  status: 'PREPARING',
  orderId: 'order-1',
  order: {
    restaurantId: 'restaurant-1',
    status: 'READY',
    tableId: 'table-1',
    orderNumber: 'ORD-001',
  },
};

const updatedItem = {
  id: 'item-1',
  status: 'READY',
  order: {
    id: 'order-1',
    restaurantId: 'restaurant-1',
    status: 'READY',
    tableId: 'table-1',
    orderNumber: 'ORD-001',
  },
};

function request() {
  return new NextRequest('http://localhost/api/kitchen/items/item-1/status', {
    method: 'PATCH',
    headers: {
      'content-type': 'application/json',
      authorization: 'Bearer staff-token',
    },
    body: JSON.stringify({ status: 'READY' }),
  });
}

describe('kitchen item status during recall', () => {
  beforeEach(() => {
    process.env.RECALL_ENABLED = 'true';
    (AuthServiceV2.validateToken as jest.Mock).mockResolvedValue({
      isValid: true,
      user: {
        id: 'staff-1',
        firstName: 'Kitchen',
        lastName: 'One',
        permissions: ['kitchen:write'],
        currentRole: { restaurantId: 'restaurant-1' },
      },
    });
    (prisma.orderItem.findUnique as jest.Mock).mockResolvedValue(currentItem);
    (prisma.orderItem.update as jest.Mock).mockResolvedValue(updatedItem);
    (prisma.orderItem.findMany as jest.Mock).mockResolvedValue([
      { status: 'READY' },
    ]);
    (prisma.order.findUnique as jest.Mock).mockResolvedValue({
      status: 'READY',
      version: 6,
    });
    (prisma.order.updateMany as jest.Mock).mockResolvedValue({ count: 0 });
    (prisma.stationOrderRecall.findMany as jest.Mock).mockResolvedValue([
      { stationId: 'station-1' },
    ]);
    (hasActiveRecallForItem as jest.Mock).mockResolvedValue(true);
    (clearRecallIfStationReady as jest.Mock).mockResolvedValue(null);
    (recordOrderItemStatusChanged as jest.Mock).mockResolvedValue(1);
    (recordOrderRecallCleared as jest.Mock).mockResolvedValue(undefined);
  });

  afterEach(() => {
    delete process.env.RECALL_ENABLED;
  });

  it('allows item work on a recalled READY order', async () => {
    const response = await updateItemStatus(request(), {
      params: Promise.resolve({ id: 'item-1' }),
    });
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.success).toBe(true);
    expect(prisma.orderItem.update).toHaveBeenCalled();
  });

  it('still rejects item work on a READY order without recall', async () => {
    (hasActiveRecallForItem as jest.Mock).mockResolvedValue(false);

    const response = await updateItemStatus(request(), {
      params: Promise.resolve({ id: 'item-1' }),
    });
    const json = await response.json();

    expect(response.status).toBe(409);
    expect(json.error).toContain('not in a kitchen-action state');
    expect(prisma.orderItem.update).not.toHaveBeenCalled();
  });

  it('clears the recall when the last item is ready', async () => {
    (clearRecallIfStationReady as jest.Mock).mockResolvedValue({
      id: 'recall-1',
      recalledAt: new Date('2026-10-31T10:00:00.000Z'),
      reason: 'garnish',
      clearedAt: new Date('2026-10-31T10:05:00.000Z'),
    });

    const response = await updateItemStatus(request(), {
      params: Promise.resolve({ id: 'item-1' }),
    });

    expect(response.status).toBe(200);
    expect(recordOrderRecallCleared).toHaveBeenCalledWith(
      'order-1',
      'station-1',
      expect.any(Date),
      expect.any(Date),
      'garnish'
    );
    expect(PostgresEventManager.publishOrderRecallCleared).toHaveBeenCalledWith(
      expect.objectContaining({
        orderId: 'order-1',
        stationId: 'station-1',
        reason: 'garnish',
      })
    );
  });
});
