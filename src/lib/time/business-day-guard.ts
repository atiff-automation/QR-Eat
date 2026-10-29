import { prisma } from '@/lib/database';

/**
 * New orders are blocked once the manager starts Close Day. Existing bills can
 * still be paid and resolved while the day is CLOSING.
 */
export async function isBusinessDayClosing(
  restaurantId: string
): Promise<boolean> {
  const closing = await prisma.businessDay.findFirst({
    where: { restaurantId, status: 'CLOSING' },
    select: { id: true },
  });
  return Boolean(closing);
}
