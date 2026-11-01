import { NextRequest } from 'next/server';
import { prisma } from '@/lib/database';
import { POST as pairDevice } from '@/app/api/devices/pair/route';

jest.mock('@/lib/database', () => ({
  prisma: {
    device: {
      findUnique: jest.fn(),
      updateMany: jest.fn(),
    },
  },
}));

jest.mock('@/lib/device-auth', () => {
  const actual = jest.requireActual('@/lib/device-auth');
  return {
    ...actual,
    generateDeviceSecret: jest.fn(() => 'minted-device-secret-value'),
    // bcrypt at 12 rounds is too slow for a unit test; the hash itself is
    // covered by the auth tests.
    hashDeviceSecret: jest.fn(async () => 'hashed-secret'),
  };
});

const mockedPrisma = prisma as unknown as {
  device: {
    findUnique: jest.Mock;
    updateMany: jest.Mock;
  };
};

const INVALID_CODE = 'This code is not valid. Generate a new one.';

const pendingDevice = {
  id: 'device-1',
  restaurantId: 'restaurant-1',
  stationId: 'station-1',
  name: 'Kitchen tablet',
  platform: 'android',
  appVersion: null,
  deviceModel: null,
  secretHash: 'placeholder-hash',
  tokenVersion: 1,
  isActive: false,
  pairingCode: 'K7F29QXM',
  pairedAt: null,
  station: { id: 'station-1', name: 'Kitchen', isActive: true },
  restaurant: { id: 'restaurant-1', name: "Mario's", isActive: true },
};

function pairRequest(body: Record<string, unknown>) {
  return new NextRequest('http://localhost/api/devices/pair', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
}

describe('POST /api/devices/pair', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('redeems a pending code and returns the secret once', async () => {
    mockedPrisma.device.findUnique.mockResolvedValue(pendingDevice);
    mockedPrisma.device.updateMany.mockResolvedValue({ count: 1 });

    const response = await pairDevice(
      pairRequest({
        code: 'K7F2-9QXM',
        platform: 'android',
        appVersion: '0.4.1',
        deviceModel: 'SM-A736B',
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.deviceId).toBe('device-1');
    expect(body.deviceSecret).toBe('minted-device-secret-value');
    expect(typeof body.accessToken).toBe('string');
    expect(body.station).toEqual({ id: 'station-1', name: 'Kitchen' });
    expect(body.restaurant).toEqual({ id: 'restaurant-1', name: "Mario's" });
  });

  it('looks the device up by the normalized code', async () => {
    mockedPrisma.device.findUnique.mockResolvedValue(pendingDevice);
    mockedPrisma.device.updateMany.mockResolvedValue({ count: 1 });

    await pairDevice(pairRequest({ code: 'k7f2 9qxm' }));

    expect(mockedPrisma.device.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { pairingCode: 'K7F29QXM' } })
    );
  });

  it('clears the code, activates the device and stamps pairedAt', async () => {
    mockedPrisma.device.findUnique.mockResolvedValue(pendingDevice);
    mockedPrisma.device.updateMany.mockResolvedValue({ count: 1 });

    await pairDevice(pairRequest({ code: 'K7F2-9QXM' }));

    const update = mockedPrisma.device.updateMany.mock.calls[0][0];
    expect(update.data.pairingCode).toBeNull();
    expect(update.data.isActive).toBe(true);
    expect(update.data.secretHash).toBe('hashed-secret');
    expect(update.data.pairedAt).toBeInstanceOf(Date);
  });

  it('guards redemption with a compare-and-set on the code', async () => {
    mockedPrisma.device.findUnique.mockResolvedValue(pendingDevice);
    mockedPrisma.device.updateMany.mockResolvedValue({ count: 1 });

    await pairDevice(pairRequest({ code: 'K7F2-9QXM' }));

    expect(mockedPrisma.device.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'device-1', pairingCode: 'K7F29QXM', isActive: false },
      })
    );
  });

  it('rejects a lost race with the same generic message', async () => {
    mockedPrisma.device.findUnique.mockResolvedValue(pendingDevice);
    mockedPrisma.device.updateMany.mockResolvedValue({ count: 0 });

    const response = await pairDevice(pairRequest({ code: 'K7F2-9QXM' }));

    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe(INVALID_CODE);
  });

  it('returns 400, never 401, for an unknown code', async () => {
    mockedPrisma.device.findUnique.mockResolvedValue(null);

    const response = await pairDevice(pairRequest({ code: 'K7F2-9QXM' }));

    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe(INVALID_CODE);
    expect(mockedPrisma.device.updateMany).not.toHaveBeenCalled();
  });

  it('rejects a device that is already paired', async () => {
    mockedPrisma.device.findUnique.mockResolvedValue({
      ...pendingDevice,
      isActive: true,
    });

    const response = await pairDevice(pairRequest({ code: 'K7F2-9QXM' }));

    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe(INVALID_CODE);
    expect(mockedPrisma.device.updateMany).not.toHaveBeenCalled();
  });

  it('rejects a malformed code without touching the database', async () => {
    const response = await pairDevice(pairRequest({ code: 'K7F2' }));

    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe(INVALID_CODE);
    expect(mockedPrisma.device.findUnique).not.toHaveBeenCalled();
  });

  it('refuses an inactive station before minting a secret', async () => {
    mockedPrisma.device.findUnique.mockResolvedValue({
      ...pendingDevice,
      station: { ...pendingDevice.station, isActive: false },
    });

    const response = await pairDevice(pairRequest({ code: 'K7F2-9QXM' }));

    expect(response.status).toBe(403);
    expect(mockedPrisma.device.updateMany).not.toHaveBeenCalled();
  });

  it('refuses an inactive restaurant', async () => {
    mockedPrisma.device.findUnique.mockResolvedValue({
      ...pendingDevice,
      restaurant: { ...pendingDevice.restaurant, isActive: false },
    });

    const response = await pairDevice(pairRequest({ code: 'K7F2-9QXM' }));

    expect(response.status).toBe(403);
    expect(mockedPrisma.device.updateMany).not.toHaveBeenCalled();
  });
});
