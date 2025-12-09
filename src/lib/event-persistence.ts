/**
 * Event Persistence Service
 *
 * Provides database-backed event storage for reliability and catchup.
 * Ensures events are never lost even if SSE delivery fails.
 *
 * @see claudedocs/SSE_REAL_TIME_SYSTEM_FIX.md - Phase 2: Event Persistence
 * @see CLAUDE.md - Type Safety, Error Handling, Single Source of Truth
 */

import 'server-only';
import { prisma } from '@/lib/database';
import { EVENT_CONFIG } from './event-config';
import type { OrderEvent } from '@/types/events';

// ============================================================================
// Event Persistence Interface
// ============================================================================

export interface EventPersistenceOptions {
  eventType: string;
  eventData: OrderEvent;
  restaurantId: string;
}

export interface PendingEventsQuery {
  restaurantId: string;
  since?: Date;
  limit?: number;
}

// ============================================================================
// Event Persistence Service
// ============================================================================

export class EventPersistenceService {
  /**
   * Store event in database for reliability and catchup
   *
   * @param options - Event data to persist
   * @returns Promise with event ID
   */
  static async storeEvent(options: EventPersistenceOptions): Promise<string> {
    const { eventType, eventData, restaurantId } = options;

    try {
      const pendingEvent = await prisma.pendingEvent.create({
        data: {
          eventType,
          eventData: eventData as unknown as Record<string, unknown>,
          restaurantId,
        },
      });

      console.log(`📦 [EventPersistence] Event stored:`, {
        id: pendingEvent.id,
        type: eventType,
        restaurantId,
        timestamp: pendingEvent.createdAt,
      });

      return pendingEvent.id;
    } catch (error) {
      console.error('❌ [EventPersistence] Failed to store event:', {
        eventType,
        restaurantId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Mark event as delivered via SSE
   *
   * @param eventId - ID of event to mark as delivered
   */
  static async markDelivered(eventId: string): Promise<void> {
    try {
      await prisma.pendingEvent.update({
        where: { id: eventId },
        data: { deliveredAt: new Date() },
      });

      console.log(`✅ [EventPersistence] Event marked as delivered:`, {
        id: eventId,
      });
    } catch (error) {
      console.error(
        '❌ [EventPersistence] Failed to mark event as delivered:',
        {
          eventId,
          error: error instanceof Error ? error.message : String(error),
        }
      );
      // Don't throw - marking delivery is not critical
    }
  }

  /**
   * Get pending events for SSE catchup
   *
   * Retrieves undelivered events for a restaurant since a given timestamp.
   * Used when client reconnects to catch up on missed events.
   *
   * @param query - Query parameters for pending events
   * @returns Promise with array of pending events
   */
  static async getPendingEvents(query: PendingEventsQuery): Promise<
    Array<{
      id: string;
      eventType: string;
      eventData: OrderEvent;
      createdAt: Date;
    }>
  > {
    const { restaurantId, since, limit = EVENT_CONFIG.BATCH_SIZE } = query;

    try {
      const pendingEvents = await prisma.pendingEvent.findMany({
        where: {
          restaurantId,
          deliveredAt: null,
          ...(since && { createdAt: { gt: since } }),
        },
        orderBy: { createdAt: 'asc' },
        take: limit,
      });

      console.log(`📋 [EventPersistence] Retrieved pending events:`, {
        restaurantId,
        count: pendingEvents.length,
        since: since?.toISOString(),
      });

      return pendingEvents.map((event) => ({
        id: event.id,
        eventType: event.eventType,
        eventData: event.eventData as unknown as OrderEvent,
        createdAt: event.createdAt,
      }));
    } catch (error) {
      console.error('❌ [EventPersistence] Failed to get pending events:', {
        restaurantId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Clean up old delivered events
   *
   * Removes delivered events older than retention period.
   * Should be run periodically (e.g., daily cron job).
   *
   * @returns Promise with count of deleted events
   */
  static async cleanupDeliveredEvents(): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(
      cutoffDate.getDate() - EVENT_CONFIG.EVENT_RETENTION_DAYS
    );

    try {
      const result = await prisma.pendingEvent.deleteMany({
        where: {
          deliveredAt: { not: null, lt: cutoffDate },
        },
      });

      console.log(`🧹 [EventPersistence] Cleaned up old events:`, {
        count: result.count,
        olderThan: cutoffDate.toISOString(),
      });

      return result.count;
    } catch (error) {
      console.error('❌ [EventPersistence] Failed to cleanup events:', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Get event statistics for monitoring
   *
   * @returns Promise with event statistics
   */
  static async getEventStats(): Promise<{
    totalPending: number;
    totalDelivered: number;
    oldestPending: Date | null;
  }> {
    try {
      const [totalPending, totalDelivered, oldestPendingEvent] =
        await Promise.all([
          prisma.pendingEvent.count({
            where: { deliveredAt: null },
          }),
          prisma.pendingEvent.count({
            where: { deliveredAt: { not: null } },
          }),
          prisma.pendingEvent.findFirst({
            where: { deliveredAt: null },
            orderBy: { createdAt: 'asc' },
            select: { createdAt: true },
          }),
        ]);

      return {
        totalPending,
        totalDelivered,
        oldestPending: oldestPendingEvent?.createdAt || null,
      };
    } catch (error) {
      console.error('❌ [EventPersistence] Failed to get event stats:', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }
}
