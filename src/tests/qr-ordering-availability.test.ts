import { prisma } from '@/lib/database';
import {
  getQrOrderingAvailability,
  QR_ORDERING_COUNTER_WINDOW_MS,
} from '@/lib/qr-ordering-availability';

jest.mock('@/lib/database', () => ({
  prisma: {
    restaurant: { findUnique: jest.fn() },
    userSession: { findFirst: jest.fn() },
  },
}));

const restaurantId = '550e8400-e29b-41d4-a716-446655440001';
const now = new Date('2026-11-02T12:00:00.000Z');

describe('QR ordering availability', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (prisma.restaurant.findUnique as jest.Mock).mockResolvedValue({
      isActive: true,
      qrOrderingPaused: false,
    });
    (prisma.userSession.findFirst as jest.Mock).mockResolvedValue(null);
  });

  it('reports a closed restaurant', async () => {
    (prisma.restaurant.findUnique as jest.Mock).mockResolvedValue({
      isActive: false,
      qrOrderingPaused: false,
    });

    const result = await getQrOrderingAvailability(restaurantId, now);

    expect(result.available).toBe(false);
    expect(result.reason).toBe('RESTAURANT_CLOSED');
  });

  it('reports a manual pause before checking presence', async () => {
    (prisma.restaurant.findUnique as jest.Mock).mockResolvedValue({
      isActive: true,
      qrOrderingPaused: true,
    });

    const result = await getQrOrderingAvailability(restaurantId, now);

    expect(result.available).toBe(false);
    expect(result.reason).toBe('MANUAL_PAUSE');
    expect(prisma.userSession.findFirst).not.toHaveBeenCalled();
  });

  it('pauses when no recent Counter session exists', async () => {
    const result = await getQrOrderingAvailability(restaurantId, now);

    expect(result.available).toBe(false);
    expect(result.reason).toBe('COUNTER_OFFLINE');
    expect(prisma.userSession.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          restaurantContextId: restaurantId,
          deviceType: 'counter',
          expiresAt: { gt: now },
          lastActivity: {
            gte: new Date(now.getTime() - QR_ORDERING_COUNTER_WINDOW_MS),
          },
        }),
      })
    );
  });

  it('allows ordering when a recent Counter session exists', async () => {
    const lastActivity = new Date(now.getTime() - 30_000);
    (prisma.userSession.findFirst as jest.Mock).mockResolvedValue({
      lastActivity,
    });

    const result = await getQrOrderingAvailability(restaurantId, now);

    expect(result.available).toBe(true);
    expect(result.reason).toBe('AVAILABLE');
    expect(result.lastCounterActivityAt).toEqual(lastActivity);
  });
});
