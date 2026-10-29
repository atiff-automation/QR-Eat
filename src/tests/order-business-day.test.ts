import { prisma } from '@/lib/database';
import { isOrderBusinessDayClosed } from '@/lib/orders/order-business-day';

jest.mock('@/lib/database', () => ({
  prisma: {
    restaurant: { findUnique: jest.fn() },
    businessDay: { findFirst: jest.fn() },
  },
}));

describe('order business-day guard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (prisma.restaurant.findUnique as jest.Mock).mockResolvedValue({
      timezone: 'Asia/Kuala_Lumpur',
      businessDayCloseTime: '04:00',
    });
  });

  it('blocks an order whose business day is explicitly closed', async () => {
    (prisma.businessDay.findFirst as jest.Mock).mockResolvedValue({
      id: 'day-1',
    });

    await expect(
      isOrderBusinessDayClosed(
        'restaurant-1',
        new Date('2026-10-28T01:00:00.000Z')
      )
    ).resolves.toBe(true);
    expect(prisma.businessDay.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: 'CLOSED' }),
      })
    );
  });

  it('allows an order when no closed day record exists', async () => {
    (prisma.businessDay.findFirst as jest.Mock).mockResolvedValue(null);

    await expect(
      isOrderBusinessDayClosed(
        'restaurant-1',
        new Date('2026-10-28T01:00:00.000Z')
      )
    ).resolves.toBe(false);
  });
});
