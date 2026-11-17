import { NextRequest } from 'next/server';
import { authenticateDevice } from '@/lib/device-auth';
import { prisma } from '@/lib/database';
import { POST as devicePrintAck } from '@/app/api/stations/me/print-ack/route';

jest.mock('@/lib/device-auth', () => ({
  authenticateDevice: jest.fn(),
}));

jest.mock('@/lib/database', () => ({
  prisma: {
    $transaction: jest.fn(),
  },
}));

function printEvent(overrides: Record<string, unknown> = {}) {
  return {
    id: BigInt(40218),
    restaurantId: 'restaurant-1',
    orderId: 'order-1',
    stationId: 'st-1',
    type: 'order.created',
    payload: { printMode: 'STATION' },
    printStatus: 'PENDING',
    printAttemptedAt: null,
    printedAt: null,
    printError: null,
    printDeviceId: null,
    station: { settings: { printMode: 'STATION' } },
    ...overrides,
  };
}

function ackRequest(body: unknown) {
  return new NextRequest('http://localhost/api/stations/me/print-ack', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/stations/me/print-ack authority and audit', () => {
  let txEvent: ReturnType<typeof printEvent> | null;
  let updateMany: jest.Mock;
  let auditCreate: jest.Mock;
  let deviceUpdate: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    (authenticateDevice as jest.Mock).mockResolvedValue({
      ok: true,
      device: { id: 'device-1', stationId: 'st-1' },
      restaurant: { id: 'restaurant-1' },
    });

    txEvent = printEvent();
    updateMany = jest.fn().mockResolvedValue({ count: 1 });
    auditCreate = jest.fn().mockResolvedValue({});
    deviceUpdate = jest.fn().mockResolvedValue({
      id: 'device-1',
      name: 'Kitchen phone',
      lastSeenAt: new Date(),
      lastPrintAt: null,
    });

    (prisma.$transaction as jest.Mock).mockImplementation(
      async (callback: (tx: unknown) => unknown) =>
        callback({
          orderEvent: {
            findUnique: jest.fn().mockImplementation(async () => txEvent),
            updateMany,
          },
          auditLog: { create: auditCreate },
          device: { update: deviceUpdate },
        })
    );
  });

  it('keeps the legacy no-seq advisory response with no event change', async () => {
    const response = await devicePrintAck(ackRequest({ success: true }));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.print.seq).toBeNull();
    expect(updateMany).not.toHaveBeenCalled();
    expect(auditCreate).not.toHaveBeenCalled();
    expect(deviceUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ lastPrintAt: expect.any(Date) }),
      })
    );
  });

  it('prints a STATION ticket and audits the device ack', async () => {
    const response = await devicePrintAck(
      ackRequest({ seq: 40218, success: true })
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.print).toMatchObject({
      success: true,
      skipped: false,
      seq: '40218',
    });
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: BigInt(40218) }),
        data: expect.objectContaining({
          printStatus: 'PRINTED',
          printDeviceId: 'device-1',
        }),
      })
    );
    expect(auditCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tableName: 'order_events',
          recordId: '40218',
          restaurantId: 'restaurant-1',
          changedBy: 'device-1',
          changedByType: 'device',
          category: 'orders',
          description: 'print.ack',
          metadata: expect.objectContaining({
            source: 'DEVICE',
            result: 'PRINTED',
          }),
          ipAddress: 'unknown',
        }),
      })
    );
  });

  it('rejects a device print on a COUNTER ticket with 409', async () => {
    txEvent = printEvent({ payload: { printMode: 'COUNTER' } });

    const response = await devicePrintAck(
      ackRequest({ seq: 40218, success: true })
    );
    const json = await response.json();

    expect(response.status).toBe(409);
    expect(json.code).toBe('PRINT_AUTHORITY_INVALID');
    expect(updateMany).not.toHaveBeenCalled();
    expect(auditCreate).not.toHaveBeenCalled();
    // Presence may still refresh.
    expect(deviceUpdate).toHaveBeenCalled();
  });

  it('records a non-authority COUNTER skip as audit-only (C-13)', async () => {
    txEvent = printEvent({ payload: { printMode: 'COUNTER' } });

    const response = await devicePrintAck(
      ackRequest({ seq: 40218, skipped: true })
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.print.skipped).toBe(true);
    // The event row is untouched: a PENDING ticket stays PENDING for B2.
    expect(updateMany).not.toHaveBeenCalled();
    expect(auditCreate).toHaveBeenCalledTimes(1);
    const audit = auditCreate.mock.calls[0][0].data;
    expect(audit.metadata.result).toBe('SKIPPED');
    expect(audit.metadata.source).toBe('DEVICE');
    expect(audit.newValues.printStatus).toBe('PENDING');
    expect(audit.newValues.printDeviceId).toBeNull();
  });

  it('audits a NONE skip without touching the ticket', async () => {
    txEvent = printEvent({
      payload: { printMode: 'NONE' },
      printStatus: 'SKIPPED',
      printError: 'KDS only — not printed',
    });

    const response = await devicePrintAck(
      ackRequest({ seq: 40218, skipped: true })
    );

    expect(response.status).toBe(200);
    expect(updateMany).not.toHaveBeenCalled();
    expect(auditCreate.mock.calls[0][0].data.newValues.printStatus).toBe(
      'SKIPPED'
    );
  });

  it('never downgrades a printed STATION ticket on a late skip', async () => {
    const printedAt = new Date('2026-11-17T09:59:00.000Z');
    txEvent = printEvent({ printStatus: 'PRINTED', printedAt });

    const response = await devicePrintAck(
      ackRequest({ seq: 40218, skipped: true })
    );

    expect(response.status).toBe(200);
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          printStatus: 'PRINTED',
          printedAt,
        }),
      })
    );
    expect(auditCreate.mock.calls[0][0].data.metadata.result).toBe(
      'NO_DOWNGRADE'
    );
  });

  it('retries a concurrent ack instead of downgrading a concurrent PRINTED', async () => {
    const printedAt = new Date('2026-11-17T10:00:01.000Z');
    let readAttempt = 0;
    const casUpdate = jest
      .fn()
      .mockResolvedValueOnce({ count: 0 })
      .mockResolvedValueOnce({ count: 1 });
    const findUnique = jest.fn().mockImplementation(async () => {
      readAttempt += 1;
      return readAttempt === 1
        ? printEvent({ printStatus: 'PENDING' })
        : printEvent({ printStatus: 'PRINTED', printedAt });
    });
    (prisma.$transaction as jest.Mock).mockImplementation(
      async (callback: (tx: unknown) => unknown) =>
        callback({
          orderEvent: { findUnique, updateMany: casUpdate },
          auditLog: { create: auditCreate },
          device: { update: deviceUpdate },
        })
    );

    const response = await devicePrintAck(
      ackRequest({ seq: 40218, skipped: true })
    );

    expect(response.status).toBe(200);
    expect(findUnique).toHaveBeenCalledTimes(2);
    expect(casUpdate.mock.calls[1][0].data.printStatus).toBe('PRINTED');
    expect(casUpdate.mock.calls[1][0].data.printedAt).toBe(printedAt);
    expect(auditCreate).toHaveBeenCalledTimes(1);
    expect(auditCreate.mock.calls[0][0].data.metadata.result).toBe(
      'NO_DOWNGRADE'
    );
  });

  it('returns 404 for an unknown station event', async () => {
    txEvent = printEvent({ stationId: 'st-2' });

    const response = await devicePrintAck(
      ackRequest({ seq: 40218, success: true })
    );
    const json = await response.json();

    expect(response.status).toBe(404);
    expect(json.code).toBe('UNKNOWN_TICKET_EVENT');
    expect(updateMany).not.toHaveBeenCalled();
  });

  it('rejects an event from another restaurant as defence in depth', async () => {
    txEvent = printEvent({ restaurantId: 'restaurant-2' });

    const response = await devicePrintAck(
      ackRequest({ seq: 40218, success: true })
    );

    expect(response.status).toBe(404);
    expect(updateMany).not.toHaveBeenCalled();
  });

  it('returns 404 for a non-printable event', async () => {
    txEvent = printEvent({ type: 'order.status.changed' });

    const response = await devicePrintAck(
      ackRequest({ seq: 40218, success: true })
    );

    expect(response.status).toBe(404);
    expect(updateMany).not.toHaveBeenCalled();
  });

  it('rejects a non-positive seq with 400', async () => {
    const response = await devicePrintAck(
      ackRequest({ seq: 0, success: true })
    );

    expect(response.status).toBe(400);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
