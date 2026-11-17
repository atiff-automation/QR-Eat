import { NextRequest } from 'next/server';
import {
  getTenantContext,
  requireAuth,
  requirePermission,
} from '@/lib/tenant-context';
import { counterAccessDenied } from '@/lib/counter/access';
import { requireOrderAccess } from '@/lib/rbac/resource-auth';
import { RBACError } from '@/lib/rbac/types';
import { prisma } from '@/lib/database';
import { POST as counterPrintAck } from '@/app/api/counter/orders/[orderId]/print-ack/route';

jest.mock('@/lib/tenant-context', () => ({
  getTenantContext: jest.fn(),
  requireAuth: jest.fn(),
  requirePermission: jest.fn(),
}));

jest.mock('@/lib/counter/access', () => ({
  counterAccessDenied: jest.fn(() => null),
}));

jest.mock('@/lib/rbac/resource-auth', () => ({
  requireOrderAccess: jest.fn(),
}));

jest.mock('@/lib/database', () => ({
  prisma: {
    order: { findUnique: jest.fn() },
    $transaction: jest.fn(),
  },
}));

const context = {
  userId: 'counter-1',
  userType: 'staff',
  roleTemplate: 'cashier',
  restaurantId: 'restaurant-1',
  email: 'cashier@example.test',
  permissions: { orders: ['read', 'write'] },
  isAdmin: false,
  mustChangePassword: false,
};

const firstPrint = new Date('2026-11-17T09:59:00.000Z');

function printEvent(overrides: Record<string, unknown> = {}) {
  return {
    id: BigInt(40218),
    restaurantId: 'restaurant-1',
    orderId: '550e8400-e29b-41d4-a716-446655440010',
    stationId: 'st-1',
    type: 'order.created',
    payload: { printMode: 'COUNTER' },
    printStatus: 'PENDING',
    printAttemptedAt: null,
    printedAt: null,
    printError: null,
    printDeviceId: null,
    station: { name: 'Kitchen', settings: { printMode: 'STATION' } },
    ...overrides,
  };
}

function ackRequest(body: unknown) {
  return new NextRequest(
    'http://localhost/api/counter/orders/550e8400-e29b-41d4-a716-446655440010/print-ack',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }
  );
}

function params() {
  return {
    params: Promise.resolve({
      orderId: '550e8400-e29b-41d4-a716-446655440010',
    }),
  };
}

describe('POST /api/counter/orders/{orderId}/print-ack', () => {
  let txEvent: ReturnType<typeof printEvent>;
  let updateMany: jest.Mock;
  let auditCreate: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    (counterAccessDenied as jest.Mock).mockReturnValue(null);
    (getTenantContext as jest.Mock).mockResolvedValue(context);
    (requireAuth as jest.Mock).mockReturnValue(context);
    (requirePermission as jest.Mock).mockReset();
    (requireOrderAccess as jest.Mock).mockResolvedValue(undefined);
    (prisma.order.findUnique as jest.Mock).mockResolvedValue({
      id: '550e8400-e29b-41d4-a716-446655440010',
      restaurantId: 'restaurant-1',
    });

    txEvent = printEvent();
    updateMany = jest.fn().mockResolvedValue({ count: 1 });
    auditCreate = jest.fn().mockResolvedValue({});
    (prisma.$transaction as jest.Mock).mockImplementation(
      async (callback: (tx: unknown) => unknown) =>
        callback({
          orderEvent: {
            findUnique: jest.fn().mockImplementation(async () => txEvent),
            updateMany,
          },
          auditLog: { create: auditCreate },
        })
    );
  });

  it('prints a COUNTER ticket, nulls the device id and audits the ack', async () => {
    txEvent = printEvent({ printDeviceId: 'device-1' });

    const response = await counterPrintAck(
      ackRequest({ eventId: '40218', success: true }),
      params()
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.downgraded).toBe(false);
    expect(json.replayed).toBe(false);
    expect(json.reprint).toBe(false);
    expect(json.ticket).toMatchObject({
      eventId: '40218',
      stationId: 'st-1',
      stationName: 'Kitchen',
      printMode: 'COUNTER',
      type: 'order.created',
      printStatus: 'PRINTED',
      printError: null,
      printedBy: 'COUNTER',
      canAck: true,
    });
    expect(json.ticket.printedAt).not.toBeNull();
    expect(json.ticket.printAttemptedAt).not.toBeNull();

    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: BigInt(40218) }),
        data: expect.objectContaining({
          printStatus: 'PRINTED',
          printDeviceId: null,
        }),
      })
    );

    expect(auditCreate).toHaveBeenCalledTimes(1);
    const audit = auditCreate.mock.calls[0][0].data;
    expect(audit).toMatchObject({
      tableName: 'order_events',
      recordId: '40218',
      operation: 'UPDATE',
      restaurantId: 'restaurant-1',
      changedBy: 'counter-1',
      changedByType: 'staff',
      category: 'orders',
      description: 'print.ack',
      metadata: {
        orderId: '550e8400-e29b-41d4-a716-446655440010',
        stationId: 'st-1',
        eventType: 'order.created',
        source: 'COUNTER',
        result: 'PRINTED',
      },
    });
    expect(audit.oldValues.printDeviceId).toBe('device-1');
    expect(audit.newValues.printDeviceId).toBeNull();
    // No payload or PII in the audit row.
    expect(audit.oldValues).not.toHaveProperty('payload');
    expect(audit.newValues).not.toHaveProperty('payload');
    expect(JSON.stringify(audit)).not.toContain('Penne');
  });

  it('is idempotent by eventId and preserves the first printedAt', async () => {
    txEvent = printEvent({
      printStatus: 'PRINTED',
      printedAt: firstPrint,
      printAttemptedAt: firstPrint,
    });

    const response = await counterPrintAck(
      ackRequest({ eventId: 40218, success: true }),
      params()
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.replayed).toBe(true);
    expect(json.ticket.printedAt).toBe(firstPrint.toISOString());
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ printedAt: firstPrint }),
      })
    );
  });

  it('retries a concurrent ack instead of moving the first printedAt', async () => {
    const concurrentPrint = new Date('2026-11-17T10:00:01.000Z');
    let readAttempt = 0;
    const casUpdate = jest
      .fn()
      .mockResolvedValueOnce({ count: 0 })
      .mockResolvedValueOnce({ count: 1 });
    const findUnique = jest.fn().mockImplementation(async () => {
      readAttempt += 1;
      return readAttempt === 1
        ? printEvent()
        : printEvent({
            printStatus: 'PRINTED',
            printedAt: concurrentPrint,
          });
    });
    (prisma.$transaction as jest.Mock).mockImplementation(
      async (callback: (tx: unknown) => unknown) =>
        callback({
          orderEvent: { findUnique, updateMany: casUpdate },
          auditLog: { create: auditCreate },
        })
    );

    const response = await counterPrintAck(
      ackRequest({ eventId: '40218', success: true }),
      params()
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(findUnique).toHaveBeenCalledTimes(2);
    expect(casUpdate).toHaveBeenCalledTimes(2);
    expect(json.ticket.printedAt).toBe(concurrentPrint.toISOString());
    expect(json.replayed).toBe(true);
    expect(auditCreate).toHaveBeenCalledTimes(1);
  });

  it('marks a manual reprint in the audit without moving printedAt', async () => {
    txEvent = printEvent({
      printStatus: 'PRINTED',
      printedAt: firstPrint,
      printDeviceId: null,
    });

    const response = await counterPrintAck(
      ackRequest({ eventId: '40218', success: true, reprint: true }),
      params()
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.reprint).toBe(true);
    expect(json.ticket.printedAt).toBe(firstPrint.toISOString());
    expect(auditCreate.mock.calls[0][0].data.description).toBe('print.reprint');
  });

  it('accepts a skip after print as a 200 no-op with downgraded:false', async () => {
    txEvent = printEvent({
      printStatus: 'PRINTED',
      printedAt: firstPrint,
    });

    const response = await counterPrintAck(
      ackRequest({ eventId: '40218', success: false, skipped: true }),
      params()
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.downgraded).toBe(false);
    expect(json.ticket.printStatus).toBe('PRINTED');
    expect(json.ticket.printedAt).toBe(firstPrint.toISOString());
    expect(auditCreate.mock.calls[0][0].data.metadata.result).toBe(
      'NO_DOWNGRADE'
    );
  });

  it('rejects a STATION ticket with 409 PRINT_AUTHORITY_INVALID', async () => {
    txEvent = printEvent({ payload: { printMode: 'STATION' } });

    const response = await counterPrintAck(
      ackRequest({ eventId: '40218', success: true }),
      params()
    );
    const json = await response.json();

    expect(response.status).toBe(409);
    expect(json.code).toBe('PRINT_AUTHORITY_INVALID');
    expect(updateMany).not.toHaveBeenCalled();
    expect(auditCreate).not.toHaveBeenCalled();
  });

  it('rejects a NONE ticket with 409 PRINT_AUTHORITY_INVALID', async () => {
    txEvent = printEvent({ payload: { printMode: 'NONE' } });

    const response = await counterPrintAck(
      ackRequest({ eventId: '40218', success: true }),
      params()
    );

    expect(response.status).toBe(409);
    expect(auditCreate).not.toHaveBeenCalled();
  });

  it('rejects a stationId mismatch with 409 STATION_MISMATCH', async () => {
    const response = await counterPrintAck(
      ackRequest({ eventId: '40218', success: true, stationId: 'st-2' }),
      params()
    );
    const json = await response.json();

    expect(response.status).toBe(409);
    expect(json.code).toBe('STATION_MISMATCH');
    expect(updateMany).not.toHaveBeenCalled();
  });

  it('returns 404 when the event belongs to another order', async () => {
    txEvent = printEvent({ orderId: 'order-2' });

    const response = await counterPrintAck(
      ackRequest({ eventId: '40218', success: true }),
      params()
    );
    const json = await response.json();

    expect(response.status).toBe(404);
    expect(json.code).toBe('TICKET_NOT_FOUND');
    expect(updateMany).not.toHaveBeenCalled();
  });

  it('returns 404 when the event is in another restaurant', async () => {
    txEvent = printEvent({ restaurantId: 'restaurant-2' });

    const response = await counterPrintAck(
      ackRequest({ eventId: '40218', success: true }),
      params()
    );

    expect(response.status).toBe(404);
  });

  it('returns 404 for a non-printable event type', async () => {
    txEvent = printEvent({ type: 'order.status.changed' });

    const response = await counterPrintAck(
      ackRequest({ eventId: '40218', success: true }),
      params()
    );

    expect(response.status).toBe(404);
  });

  it('validates the body per §7.2', async () => {
    const both = await counterPrintAck(
      ackRequest({ eventId: '40218', success: true, skipped: true }),
      params()
    );
    expect(both.status).toBe(400);
    // §7.2 names this specific contradiction INVALID_ACK.
    expect((await both.json()).code).toBe('INVALID_ACK');

    const badId = await counterPrintAck(
      ackRequest({ eventId: '0', success: true }),
      params()
    );
    expect(badId.status).toBe(400);
    expect((await badId.json()).code).toBe('VALIDATION_FAILED');

    const longError = await counterPrintAck(
      ackRequest({ eventId: '40218', success: false, error: 'x'.repeat(501) }),
      params()
    );
    expect(longError.status).toBe(400);
    expect((await longError.json()).code).toBe('VALIDATION_FAILED');

    const missingSuccess = await counterPrintAck(
      ackRequest({ eventId: '40218' }),
      params()
    );
    expect(missingSuccess.status).toBe(400);
    expect((await missingSuccess.json()).code).toBe('VALIDATION_FAILED');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('returns 401 when there is no tenant context', async () => {
    (getTenantContext as jest.Mock).mockResolvedValue(null);
    const { NextResponse } = jest.requireActual('next/server');
    (counterAccessDenied as jest.Mock).mockReturnValue(
      NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    );

    const response = await counterPrintAck(
      ackRequest({ eventId: '40218', success: true }),
      params()
    );

    expect(response.status).toBe(401);
    expect(requireOrderAccess).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('returns the Counter role and password-change 403 responses', async () => {
    const { NextResponse } = jest.requireActual('next/server');
    (counterAccessDenied as jest.Mock).mockReturnValueOnce(
      NextResponse.json(
        { error: 'Counter role required', code: 'COUNTER_ROLE_NOT_ALLOWED' },
        { status: 403 }
      )
    );

    const role = await counterPrintAck(
      ackRequest({ eventId: '40218', success: true }),
      params()
    );
    expect(role.status).toBe(403);
    expect((await role.json()).code).toBe('COUNTER_ROLE_NOT_ALLOWED');

    (counterAccessDenied as jest.Mock).mockReturnValueOnce(
      NextResponse.json(
        { error: 'Change your password', code: 'PASSWORD_CHANGE_REQUIRED' },
        { status: 403 }
      )
    );

    const password = await counterPrintAck(
      ackRequest({ eventId: '40218', success: true }),
      params()
    );
    expect(password.status).toBe(403);
    expect((await password.json()).code).toBe('PASSWORD_CHANGE_REQUIRED');
    expect(requireOrderAccess).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('returns 403 PERMISSION_DENIED without orders:write', async () => {
    (requirePermission as jest.Mock).mockImplementation(() => {
      throw new Error('Permission denied: write on orders');
    });

    const response = await counterPrintAck(
      ackRequest({ eventId: '40218', success: true }),
      params()
    );
    const json = await response.json();

    expect(response.status).toBe(403);
    expect(json.code).toBe('PERMISSION_DENIED');
    expect(requireOrderAccess).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects a non-UUID orderId with 400 VALIDATION_FAILED', async () => {
    const response = await counterPrintAck(
      ackRequest({ eventId: '40218', success: true }),
      { params: Promise.resolve({ orderId: 'not-a-uuid' }) }
    );
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.code).toBe('VALIDATION_FAILED');
    expect(requireOrderAccess).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('maps a cross-tenant 403 from requireOrderAccess to 404', async () => {
    (requireOrderAccess as jest.Mock).mockRejectedValue(
      new RBACError('Access denied', 'FORBIDDEN', 403)
    );

    const response = await counterPrintAck(
      ackRequest({ eventId: '40218', success: true }),
      params()
    );
    const json = await response.json();

    expect(response.status).toBe(404);
    expect(json.code).toBe('ORDER_NOT_FOUND');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
