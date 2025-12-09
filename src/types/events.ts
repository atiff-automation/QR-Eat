/**
 * Event Type Definitions for Real-Time System
 *
 * Type-safe event structures for PostgreSQL PubSub and SSE.
 * All events must match these interfaces for type safety.
 *
 * @see claudedocs/SSE_REAL_TIME_SYSTEM_FIX.md
 * @see CLAUDE.md - Type Safety (No `any` types)
 */

import type {
  OrderStatusChangedEvent,
  OrderCreatedEvent,
  OrderItemStatusChangedEvent,
  KitchenNotificationEvent,
  RestaurantNotificationEvent,
} from '@/lib/postgres-pubsub';

// Re-export event types from postgres-pubsub for consistency
export type {
  OrderStatusChangedEvent,
  OrderCreatedEvent,
  OrderItemStatusChangedEvent,
  KitchenNotificationEvent,
  RestaurantNotificationEvent,
};

// Union type of all possible event types
export type OrderEvent =
  | OrderCreatedEvent
  | OrderStatusChangedEvent
  | OrderItemStatusChangedEvent
  | KitchenNotificationEvent
  | RestaurantNotificationEvent;

// Pending event structure for database persistence
export interface PendingEvent {
  id: string;
  eventType: string;
  eventData: OrderEvent;
  restaurantId: string;
  createdAt: Date;
  deliveredAt: Date | null;
}

// SSE event wrapper (what gets sent to clients)
export interface SSEEvent {
  type: string;
  data: OrderEvent;
  timestamp: number;
}

// Event emission result
export interface EventEmissionResult {
  success: boolean;
  emittedViaSSE: boolean;
  persistedToDatabase: boolean;
  error?: string;
}
