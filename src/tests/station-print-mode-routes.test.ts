import { NextRequest } from 'next/server';
import { requireAuth } from '@/lib/rbac/middleware';
import { authenticateDevice } from '@/lib/device-auth';
import { resolveRouting } from '@/lib/order-events';
import { prisma } from '@/lib/database';
import { POST as createStation } from '@/app/api/stations/route';
import {
  GET as getStation,
  PATCH as updateStation,
} from '@/app/api/stations/[id]/route';
import { GET as getDeviceSettings } from '@/app/api/stations/me/settings/route';
import { GET as getSnapshot } from '@/app/api/stations/me/snapshot/route';

jest.mock('@/lib/rbac/middleware', () => ({
  requireAuth: jest.fn(),
}));

jest.mock('@/lib/device-auth', () => ({
  authenticateDevice: jest.fn(),
}));

jest.mock('@/lib/order-events', () => ({
  resolveRouting: jest.fn(),
  orderFulfillment: jest.fn(),
}));

jest.mock('@/lib/database', () => ({
  prisma: {
    menuCategory: { count: jest.fn() },
    station: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      findUniqueOrThrow: jest.fn(),
    },
    stationCategory: {
      findMany: jest.fn(),
      deleteMany: jest.fn(),
      createMany: jest.fn(),
    },
    orderEvent: { findFirst: jest.fn() },
    order: { findMany: jest.fn() },
    device: { update: jest.fn() },
    $transaction: jest.fn(),
  },
}));

const storedSettings = {
  warnMinutes: 5,
  lateMinutes: 10,
  density: 'normal',
  textScale: 'normal',
  printMode: 'COUNTER',
};

function jsonRequest(path: string, method: string, body: unknown) {
  return new NextRequest(`http://localhost${path}`, {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('station printMode API (§4.2)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (requireAuth as jest.Mock).mockResolvedValue({
      success: true,
      user: { restaurantContext: { id: 'restaurant-1' } },
    });
    (prisma.menuCategory.count as jest.Mock).mockResolvedValue(0);
    (prisma.station.count as jest.Mock).mockResolvedValue(1);
    (prisma.orderEvent.findFirst as jest.Mock).mockResolvedValue({
      id: BigInt(7),
    });
    (prisma.stationCategory.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.order.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.device.update as jest.Mock).mockResolvedValue({});
  });

  it('creates a new station with COUNTER by default', async () => {
    const create = jest.fn().mockResolvedValue({ id: 'station-1' });
    const findUniqueOrThrow = jest.fn().mockResolvedValue({
      id: 'station-1',
      settings: storedSettings,
    });
    (prisma.$transaction as jest.Mock).mockImplementation(
      async (callback: (tx: unknown) => unknown) =>
        callback({
          station: {
            count: jest.fn().mockResolvedValue(0),
            updateMany: jest.fn(),
            create,
            findUniqueOrThrow,
          },
          stationCategory: {
            deleteMany: jest.fn(),
            createMany: jest.fn(),
          },
        })
    );

    const response = await createStation(
      jsonRequest('/api/stations', 'POST', { name: 'Counter' })
    );

    expect(response.status).toBe(201);
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          settings: expect.objectContaining({ printMode: 'COUNTER' }),
        }),
      })
    );
  });

  it('honours an explicit printMode on create', async () => {
    const create = jest.fn().mockResolvedValue({ id: 'station-1' });
    (prisma.$transaction as jest.Mock).mockImplementation(
      async (callback: (tx: unknown) => unknown) =>
        callback({
          station: {
            count: jest.fn().mockResolvedValue(0),
            updateMany: jest.fn(),
            create,
            findUniqueOrThrow: jest.fn().mockResolvedValue({ id: 'station-1' }),
          },
          stationCategory: {
            deleteMany: jest.fn(),
            createMany: jest.fn(),
          },
        })
    );

    const response = await createStation(
      jsonRequest('/api/stations', 'POST', {
        name: 'KDS',
        printMode: 'NONE',
      })
    );

    expect(response.status).toBe(201);
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          settings: expect.objectContaining({ printMode: 'NONE' }),
        }),
      })
    );
  });

  it('rejects an invalid printMode on create with 400', async () => {
    const response = await createStation(
      jsonRequest('/api/stations', 'POST', {
        name: 'Bad',
        printMode: 'PRINTER',
      })
    );

    expect(response.status).toBe(400);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('merges settings.printMode on PATCH and preserves other keys', async () => {
    (prisma.station.findFirst as jest.Mock).mockResolvedValue({
      id: 'station-1',
      isDefault: false,
      settings: storedSettings,
    });
    const update = jest.fn().mockResolvedValue({
      id: 'station-1',
      settings: { ...storedSettings, printMode: 'NONE', warnMinutes: 8 },
    });
    (prisma.$transaction as jest.Mock).mockImplementation(
      async (callback: (tx: unknown) => unknown) =>
        callback({
          station: {
            updateMany: jest.fn(),
            update,
          },
          stationCategory: {
            deleteMany: jest.fn(),
            createMany: jest.fn(),
          },
        })
    );

    const response = await updateStation(
      jsonRequest('/api/stations/station-1', 'PATCH', {
        settings: { printMode: 'NONE', warnMinutes: 8 },
      }),
      { params: Promise.resolve({ id: 'station-1' }) }
    );

    expect(response.status).toBe(200);
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          settings: expect.objectContaining({
            printMode: 'NONE',
            warnMinutes: 8,
            lateMinutes: 10,
            density: 'normal',
            textScale: 'normal',
          }),
        }),
      })
    );
  });

  it('rejects an invalid settings.printMode on PATCH with 400', async () => {
    const response = await updateStation(
      jsonRequest('/api/stations/station-1', 'PATCH', {
        settings: { printMode: 'PRINTER' },
      }),
      { params: Promise.resolve({ id: 'station-1' }) }
    );

    expect(response.status).toBe(400);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('returns the stored settings object from GET', async () => {
    (prisma.station.findFirst as jest.Mock).mockResolvedValue({
      id: 'station-1',
      settings: { ...storedSettings, printMode: 'NONE' },
    });

    const response = await getStation(
      new NextRequest('http://localhost/api/stations/station-1'),
      { params: Promise.resolve({ id: 'station-1' }) }
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.station.settings.printMode).toBe('NONE');
  });

  it('returns printMode from the device settings normalizer', async () => {
    (authenticateDevice as jest.Mock).mockResolvedValue({
      ok: true,
      station: {
        id: 'station-1',
        settings: { ...storedSettings, printMode: 'COUNTER' },
      },
    });

    const response = await getDeviceSettings(
      new NextRequest('http://localhost/api/stations/me/settings')
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.settings.printMode).toBe('COUNTER');
  });

  it('returns printMode in the device snapshot settings', async () => {
    (authenticateDevice as jest.Mock).mockResolvedValue({
      ok: true,
      device: { id: 'device-1' },
      station: {
        id: 'station-1',
        name: 'Kitchen',
        settings: { ...storedSettings, printMode: 'NONE' },
      },
      restaurant: { id: 'restaurant-1', name: 'Demo' },
    });
    (resolveRouting as jest.Mock).mockResolvedValue({
      byCategory: new Map(),
      defaultStationId: 'station-1',
      stationIds: new Set(['station-1']),
      printModes: new Map([['station-1', 'NONE']]),
    });
    (prisma.$transaction as jest.Mock).mockImplementation(
      async (callback: (tx: unknown) => unknown) =>
        callback({
          orderEvent: {
            findFirst: jest.fn().mockResolvedValue({ id: BigInt(9) }),
          },
          order: { findMany: jest.fn().mockResolvedValue([]) },
        })
    );

    const response = await getSnapshot(
      new NextRequest('http://localhost/api/stations/me/snapshot')
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.settings.printMode).toBe('NONE');
  });
});
