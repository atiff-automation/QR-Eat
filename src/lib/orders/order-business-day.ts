import { prisma } from '@/lib/database';
import { getBusinessDate, toDbBusinessDate } from '@/lib/time/business-day';

/**
 * Returns true only when the order's business day has an explicit CLOSED
 * record. Legacy orders without a business-day row remain adjustable for now;
 * that behavior can be tightened after the historical data is backfilled.
 */
export async function isOrderBusinessDayClosed(
  restaurantId: string,
  orderCreatedAt: Date
): Promise<boolean> {
  const restaurant = await prisma.restaurant.findUnique({
    where: { id: restaurantId },
    select: { timezone: true, businessDayCloseTime: true },
  });
  if (!restaurant) return true;

  const businessDate = getBusinessDate(orderCreatedAt, {
    timezone: restaurant.timezone || 'Asia/Kuala_Lumpur',
    closeTime: restaurant.businessDayCloseTime || '04:00',
  });

  const day = await prisma.businessDay.findFirst({
    where: {
      restaurantId,
      businessDate: toDbBusinessDate(businessDate),
      status: 'CLOSED',
    },
    select: { id: true },
  });

  return Boolean(day);
}
