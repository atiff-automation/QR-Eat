import { NextRequest } from 'next/server';
import { authenticateDevice } from '@/lib/device-auth';
import { GET as getStationSettings } from '@/app/api/stations/me/settings/route';

jest.mock('@/lib/device-auth', () => ({
  authenticateDevice: jest.fn(),
}));

describe('GET /api/stations/me/settings', () => {
  beforeEach(() => {
    (authenticateDevice as jest.Mock).mockResolvedValue({
      ok: true,
      station: {
        id: 'station-1',
        settings: { warnMinutes: 7, lateMinutes: 12, density: 'compact' },
      },
    });
  });

  it('returns normalized station policy', async () => {
    const response = await getStationSettings(
      new NextRequest('http://localhost/api/stations/me/settings')
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.settings).toEqual({
      warnMinutes: 7,
      lateMinutes: 12,
      density: 'compact',
      textScale: 'normal',
    });
  });

  it('rejects an unauthenticated device', async () => {
    (authenticateDevice as jest.Mock).mockResolvedValue({
      ok: false,
      status: 401,
      error: 'Device authentication required',
    });

    const response = await getStationSettings(
      new NextRequest('http://localhost/api/stations/me/settings')
    );
    expect(response.status).toBe(401);
  });
});
