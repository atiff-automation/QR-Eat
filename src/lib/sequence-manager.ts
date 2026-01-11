import { prisma } from '@/lib/database';

/**
 * Sequence Manager
 * Handles atomic generation of sequential numbers for Orders and Receipts.
 *
 * Strategy:
 * - Uses `DailySequence` table to track counts per restaurant per day.
 * - Transactions ensure atomicity (no duplicates).
 * - Format: ORD-{YYMMDD}-{RX}-{Seq}
 */
export class SequenceManager {
  /**
   * Get the next sequential Order Number and Sequence ID
   * @param restaurantId Restaurant UUID
   * @returns Object containing the formatted string and the sequence integer
   */
  static async getNextOrder(
    restaurantId: string
  ): Promise<{ number: number; formatted: string }> {
    return await prisma.$transaction(async (tx) => {
      // 1. Get today's date string (YYYY-MM-DD) in restaurant's timezone
      // For MVP we use UTC date to ensure consistency, or simple YYYY-MM-DD
      const now = new Date();
      const dateKey = now.toISOString().split('T')[0]; // "2024-01-11"

      // 2. Format Date Part: YYMMDD (e.g., 240111)
      const yy = dateKey.slice(2, 4);
      const mm = dateKey.slice(5, 7);
      const dd = dateKey.slice(8, 10);
      const dateStr = `${yy}${mm}${dd}`;

      // 3. Get Restaurant Code (First 4 chars, Uppercase)
      const resCode = restaurantId.slice(0, 4).toUpperCase();

      // 4. Atomic Upsert: Increment count or create new record
      const sequence = await tx.dailySequence.upsert({
        where: {
          restaurantId_date: {
            restaurantId,
            date: dateKey,
          },
        },
        update: {
          orderCount: { increment: 1 },
        },
        create: {
          restaurantId,
          date: dateKey,
          orderCount: 1,
          paymentCount: 0,
        },
      });

      // 5. Generate Formatted ID
      // ORD-260111-E031-042
      const seqStr = sequence.orderCount.toString().padStart(3, '0');
      const formatted = `ORD-${dateStr}-${resCode}-${seqStr}`;

      return {
        number: sequence.orderCount,
        formatted,
      };
    });
  }

  /**
   * Get the next sequential Receipt Number and Sequence ID
   * @param restaurantId Restaurant UUID
   * @returns Object containing the formatted string and the sequence integer
   */
  static async getNextReceipt(
    restaurantId: string
  ): Promise<{ number: number; formatted: string }> {
    return await prisma.$transaction(async (tx) => {
      // 1. Get today's date string
      const now = new Date();
      const dateKey = now.toISOString().split('T')[0];

      // 2. Format Date Part
      const yy = dateKey.slice(2, 4);
      const mm = dateKey.slice(5, 7);
      const dd = dateKey.slice(8, 10);
      const dateStr = `${yy}${mm}${dd}`;

      // 3. Get Restaurant Code
      const resCode = restaurantId.slice(0, 4).toUpperCase();

      // 4. Atomic Upsert
      const sequence = await tx.dailySequence.upsert({
        where: {
          restaurantId_date: {
            restaurantId,
            date: dateKey,
          },
        },
        update: {
          paymentCount: { increment: 1 },
        },
        create: {
          restaurantId,
          date: dateKey,
          orderCount: 0,
          paymentCount: 1,
        },
      });

      // 5. Generate Formatted ID
      // RCP-260111-E031-042
      const seqStr = sequence.paymentCount.toString().padStart(3, '0');
      const formatted = `RCP-${dateStr}-${resCode}-${seqStr}`;

      return {
        number: sequence.paymentCount,
        formatted,
      };
    });
  }
}
