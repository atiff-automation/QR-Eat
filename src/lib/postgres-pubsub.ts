/**
 * PostgreSQL NOTIFY/LISTEN Pub/Sub System
 *
 * Provides real-time event notifications using PostgreSQL's built-in pub/sub.
 * Replaces Redis for event-driven communication with zero infrastructure cost.
 *
 * @see CLAUDE.md - Type Safety, Error Handling, Single Source of Truth
 */

import 'server-only';
import { Client } from 'pg';
import { EventEmitter } from 'events';
import { EVENT_CONFIG } from './event-config';
import { EventPersistenceService } from './event-persistence';

// ============================================================================
// Event Channel Names (Single Source of Truth)
// ============================================================================

export const PG_EVENTS = {
  ORDER_STATUS_CHANGED: 'order_status_changed',
  ORDER_CREATED: 'order_created',
  ORDER_ITEM_STATUS_CHANGED: 'order_item_status_changed',
  KITCHEN_NOTIFICATION: 'kitchen_notification',
  RESTAURANT_NOTIFICATION: 'restaurant_notification',
  PAYMENT_COMPLETED: 'payment_completed',
  TABLE_STATUS_CHANGED: 'table_status_changed',
} as const;

// ============================================================================
// Event Type Definitions
// ============================================================================

export interface OrderStatusChangedEvent {
  orderId: string;
  oldStatus: string;
  newStatus: string;
  restaurantId: string;
  tableId: string;
  orderNumber: string;
  timestamp: number;
  changedBy?: string;
}

export interface OrderCreatedEvent {
  orderId: string;
  restaurantId: string;
  tableId: string;
  orderNumber: string;
  totalAmount: number;
  timestamp: number;
}

export interface OrderItemStatusChangedEvent {
  orderId: string;
  itemId: string;
  restaurantId: string;
  oldStatus: string;
  newStatus: string;
  timestamp: number;
}

export interface KitchenNotificationEvent {
  type: 'new_order' | 'order_updated' | 'urgent_order';
  orderId: string;
  restaurantId: string;
  message: string;
  timestamp: number;
}

export interface RestaurantNotificationEvent {
  type: 'order_ready' | 'order_served' | 'payment_completed';
  orderId: string;
  restaurantId: string;
  message: string;
  timestamp: number;
}

export interface PaymentCompletedEvent {
  orderId: string;
  paymentId: string;
  restaurantId: string;
  paymentMethod: string;
  amount: number;
  receiptNumber: string;
  processedBy: string;
  timestamp: number;
}

export interface TableStatusChangedEvent {
  tableId: string;
  restaurantId: string;
  previousStatus: string;
  newStatus: string;
  updatedBy: string; // userId or 'system'
  timestamp: number;
}

// ============================================================================
// PostgreSQL Pub/Sub Manager
// ============================================================================

class PostgresPubSubManager extends EventEmitter {
  private listenClient: Client | null = null;
  private notifyClient: Client | null = null;
  private isListening = false;
  private reconnectTimeout: NodeJS.Timeout | null = null;
  private reconnectAttempts = 0;
  private readonly maxReconnectAttempts = 5;
  private readonly reconnectDelay = 5000; // 5 seconds
  private signalHandlersRegistered = false;

  constructor() {
    super();
    this.setMaxListeners(20); // Allow multiple SSE connections
  }

  /**
   * Register signal handlers for graceful shutdown.
   * Only registers once, when initialize() is called at runtime.
   */
  private registerSignalHandlers(): void {
    if (this.signalHandlersRegistered) return;

    process.on('SIGINT', async () => {
      console.log('\n⚠️ SIGINT received, cleaning up PostgreSQL pub/sub...');
      await this.cleanup();
      process.exit(0);
    });

    process.on('SIGTERM', async () => {
      console.log('\n⚠️ SIGTERM received, cleaning up PostgreSQL pub/sub...');
      await this.cleanup();
      process.exit(0);
    });

    this.signalHandlersRegistered = true;
  }

  /**
   * Initialize PostgreSQL clients for pub/sub
   */
  async initialize(): Promise<void> {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL environment variable is required');
    }

    try {
      // Create dedicated client for LISTEN operations
      this.listenClient = new Client({
        connectionString: process.env.DATABASE_URL,
      });

      await this.listenClient.connect();
      console.log('✅ PostgreSQL LISTEN client connected');

      // Set up notification handler
      this.listenClient.on(
        'notification',
        (msg: { channel: string; payload?: string }) => {
          this.handleNotification(msg);
        }
      );

      // Handle connection errors
      this.listenClient.on('error', (err: Error) => {
        console.error('❌ PostgreSQL LISTEN client error:', err);
        this.handleDisconnect();
      });

      this.listenClient.on('end', () => {
        console.log('⚠️ PostgreSQL LISTEN client disconnected');
        this.handleDisconnect();
      });

      // Create dedicated client for NOTIFY operations (non-blocking)
      this.notifyClient = new Client({
        connectionString: process.env.DATABASE_URL,
      });

      await this.notifyClient.connect();
      console.log('✅ PostgreSQL NOTIFY client connected');

      this.notifyClient.on('error', (err: Error) => {
        console.error('❌ PostgreSQL NOTIFY client error:', err);
      });

      this.reconnectAttempts = 0;

      // Register signal handlers for graceful shutdown (runtime only)
      this.registerSignalHandlers();
    } catch (error) {
      console.error('Failed to initialize PostgreSQL pub/sub:', error);
      throw error;
    }
  }

  /**
   * Subscribe to event channels
   */
  async subscribe(...channels: string[]): Promise<void> {
    if (!this.listenClient) {
      await this.initialize();
    }

    if (!this.listenClient) {
      throw new Error('PostgreSQL LISTEN client not initialized');
    }

    try {
      for (const channel of channels) {
        await this.listenClient.query(`LISTEN ${channel}`);
        console.log(`🔔 Subscribed to channel: ${channel}`);
      }
      this.isListening = true;
    } catch (error) {
      console.error('Failed to subscribe to channels:', error);
      throw error;
    }
  }

  /**
   * Unsubscribe from event channels
   */
  async unsubscribe(...channels: string[]): Promise<void> {
    if (!this.listenClient || !this.isListening) {
      return;
    }

    try {
      for (const channel of channels) {
        await this.listenClient.query(`UNLISTEN ${channel}`);
        console.log(`🔕 Unsubscribed from channel: ${channel}`);
      }
    } catch (error) {
      console.error('Failed to unsubscribe from channels:', error);
    }
  }

  /**
   * Publish event to channel with lazy initialization and retry
   *
   * @see cloudedocs/SSE_REAL_TIME_SYSTEM_FIX.md - Phase 1: Lazy Initialization
   */
  async notify(
    channel: string,
    payload: Record<string, unknown>
  ): Promise<void> {
    // Lazy initialization: Initialize if not already initialized
    if (!this.notifyClient) {
      console.log('⚡ [PubSub] Lazy initialization triggered by notify()');

      try {
        await this.initialize();
        console.log('✅ [PubSub] Lazy initialization successful');
      } catch (error) {
        console.error('❌ [PubSub] Lazy initialization failed:', error);
        console.warn(
          '⚠️  [PubSub] Event will not be delivered via SSE (will rely on database persistence)'
        );
        // Event will be persisted in database (Phase 2), delivered on reconnect
        return;
      }
    }

    // Retry logic with exponential backoff
    let attempt = 0;
    let lastError: Error | null = null;

    while (attempt < EVENT_CONFIG.MAX_RETRY_ATTEMPTS) {
      try {
        const payloadStr = JSON.stringify(payload);
        // Escape single quotes in payload
        const escapedPayload = payloadStr.replace(/'/g, "''");

        await this.notifyClient!.query(
          `NOTIFY ${channel}, '${escapedPayload}'`
        );

        console.log(`📢 [PubSub] Event published successfully:`, {
          channel,
          eventType:
            payload.type ||
            (channel.includes('order_created')
              ? 'order_created'
              : 'order_status_changed'),
          eventId: (payload as { orderId?: string }).orderId || 'unknown',
          timestamp:
            (payload as { timestamp?: number }).timestamp || Date.now(),
          attempt: attempt + 1,
        });

        if (process.env.NODE_ENV === 'development') {
          console.log(`📢 [PubSub] Full payload:`, payload);
        }

        // Success - break retry loop
        return;
      } catch (error) {
        lastError = error as Error;
        attempt++;

        if (attempt < EVENT_CONFIG.MAX_RETRY_ATTEMPTS) {
          // Calculate exponential backoff delay
          const backoffDelay = Math.min(
            EVENT_CONFIG.RETRY_BACKOFF_MS * Math.pow(2, attempt - 1),
            EVENT_CONFIG.MAX_RETRY_BACKOFF_MS
          );

          console.warn(
            `⚠️  [PubSub] Publish attempt ${attempt} failed, retrying in ${backoffDelay}ms...`,
            {
              channel,
              error: (error as Error).message,
            }
          );

          // Wait before retry
          await new Promise((resolve) => setTimeout(resolve, backoffDelay));
        }
      }
    }

    // All retries failed
    console.error(
      `❌ [PubSub] Failed to publish after ${EVENT_CONFIG.MAX_RETRY_ATTEMPTS} attempts:`,
      {
        channel,
        error: lastError?.message,
        eventId: (payload as { orderId?: string }).orderId || 'unknown',
      }
    );
    console.error('⚠️  [PubSub] Event payload:', payload);
    // Event persisted in database (Phase 2), will be delivered via polling fallback
  }

  /**
   * Check if notify client is ready to send events
   */
  isNotifyReady(): boolean {
    return this.notifyClient !== null;
  }

  /**
   * Handle incoming notifications
   */
  private handleNotification(msg: { channel: string; payload?: string }): void {
    try {
      const channel = msg.channel;
      const payload = msg.payload ? JSON.parse(msg.payload) : {};

      if (process.env.NODE_ENV === 'development') {
        console.log(`📨 Received notification on ${channel}:`, payload);
      }

      // Emit to EventEmitter listeners
      this.emit('message', channel, JSON.stringify(payload));
    } catch (error) {
      console.error('Error handling notification:', error);
    }
  }

  /**
   * Handle disconnection and attempt reconnect
   */
  private handleDisconnect(): void {
    this.isListening = false;

    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error(
        `❌ Max reconnect attempts (${this.maxReconnectAttempts}) reached. Giving up.`
      );
      return;
    }

    if (this.reconnectTimeout) {
      return; // Already trying to reconnect
    }

    this.reconnectAttempts++;
    console.log(
      `🔄 Attempting to reconnect (${this.reconnectAttempts}/${this.maxReconnectAttempts})...`
    );

    this.reconnectTimeout = setTimeout(async () => {
      this.reconnectTimeout = null;
      try {
        await this.cleanup();
        await this.initialize();
        // Re-subscribe to all channels that were previously subscribed
        const channels = Object.values(PG_EVENTS);
        await this.subscribe(...channels);
      } catch (error) {
        console.error('Reconnect failed:', error);
        this.handleDisconnect(); // Try again
      }
    }, this.reconnectDelay);
  }

  /**
   * Clean up connections
   */
  async cleanup(): Promise<void> {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    if (this.listenClient) {
      try {
        await this.listenClient.end();
      } catch (error) {
        console.error('Error closing LISTEN client:', error);
      }
      this.listenClient = null;
    }

    if (this.notifyClient) {
      try {
        await this.notifyClient.end();
      } catch (error) {
        console.error('Error closing NOTIFY client:', error);
      }
      this.notifyClient = null;
    }

    this.isListening = false;
    this.removeAllListeners();
  }

  /**
   * Get connection status
   */
  isConnected(): boolean {
    return this.isListening && this.listenClient !== null;
  }
}

// Singleton instance
export const pgPubSub = new PostgresPubSubManager();

// ============================================================================
// Event Publisher (High-level API)
// ============================================================================

export class PostgresEventManager {
  /**
   * Publish order status change event with dual-write pattern
   *
   * @see claudedocs/SSE_REAL_TIME_SYSTEM_FIX.md - Phase 2: Dual-Write Pattern
   */
  static async publishOrderStatusChange(
    event: OrderStatusChangedEvent
  ): Promise<void> {
    try {
      // Dual-write: Store in database first for reliability
      await EventPersistenceService.storeEvent({
        eventType: PG_EVENTS.ORDER_STATUS_CHANGED,
        eventData: event,
        restaurantId: event.restaurantId,
      });

      // Then emit via PostgreSQL NOTIFY for real-time delivery
      await pgPubSub.notify(PG_EVENTS.ORDER_STATUS_CHANGED, event);
    } catch (error) {
      console.error('Failed to publish order status change:', error);
      // Don't throw - notification failures shouldn't break the main flow
    }
  }

  /**
   * Publish new order created event with dual-write pattern
   *
   * @see claudedocs/SSE_REAL_TIME_SYSTEM_FIX.md - Phase 2: Dual-Write Pattern
   */
  static async publishOrderCreated(event: OrderCreatedEvent): Promise<void> {
    try {
      // Dual-write: Store in database first for reliability
      await EventPersistenceService.storeEvent({
        eventType: PG_EVENTS.ORDER_CREATED,
        eventData: event,
        restaurantId: event.restaurantId,
      });

      // Then emit via PostgreSQL NOTIFY for real-time delivery
      await pgPubSub.notify(PG_EVENTS.ORDER_CREATED, event);
    } catch (error) {
      console.error('Failed to publish order created:', error);
    }
  }

  /**
   * Publish order item status change event with dual-write pattern
   *
   * @see claudedocs/SSE_REAL_TIME_SYSTEM_FIX.md - Phase 2: Dual-Write Pattern
   */
  static async publishOrderItemStatusChange(
    event: OrderItemStatusChangedEvent
  ): Promise<void> {
    try {
      // Dual-write: Store in database first for reliability
      await EventPersistenceService.storeEvent({
        eventType: PG_EVENTS.ORDER_ITEM_STATUS_CHANGED,
        eventData: event,
        restaurantId: event.restaurantId,
      });

      // Then emit via PostgreSQL NOTIFY for real-time delivery
      await pgPubSub.notify(PG_EVENTS.ORDER_ITEM_STATUS_CHANGED, event);
    } catch (error) {
      console.error('Failed to publish item status change:', error);
    }
  }

  /**
   * Publish kitchen notification with dual-write pattern
   *
   * @see claudedocs/SSE_REAL_TIME_SYSTEM_FIX.md - Phase 2: Dual-Write Pattern
   */
  static async publishKitchenNotification(
    event: KitchenNotificationEvent
  ): Promise<void> {
    try {
      // Dual-write: Store in database first for reliability
      await EventPersistenceService.storeEvent({
        eventType: PG_EVENTS.KITCHEN_NOTIFICATION,
        eventData: event,
        restaurantId: event.restaurantId,
      });

      // Then emit via PostgreSQL NOTIFY for real-time delivery
      await pgPubSub.notify(PG_EVENTS.KITCHEN_NOTIFICATION, event);
    } catch (error) {
      console.error('Failed to publish kitchen notification:', error);
    }
  }

  /**
   * Publish restaurant notification with dual-write pattern
   *
   * @see claudedocs/SSE_REAL_TIME_SYSTEM_FIX.md - Phase 2: Dual-Write Pattern
   */
  static async publishRestaurantNotification(
    event: RestaurantNotificationEvent
  ): Promise<void> {
    try {
      // Dual-write: Store in database first for reliability
      await EventPersistenceService.storeEvent({
        eventType: PG_EVENTS.RESTAURANT_NOTIFICATION,
        eventData: event,
        restaurantId: event.restaurantId,
      });

      // Then emit via PostgreSQL NOTIFY for real-time delivery
      await pgPubSub.notify(PG_EVENTS.RESTAURANT_NOTIFICATION, event);
    } catch (error) {
      console.error('Failed to publish restaurant notification:', error);
    }
  }

  /**
   * Publish payment completed event with dual-write pattern
   *
   * @see claudedocs/POS_IMPLEMENTATION_PLAN.md - Real-time Payment Updates
   */
  static async publishPaymentCompleted(
    event: PaymentCompletedEvent
  ): Promise<void> {
    try {
      // Dual-write: Store in database first for reliability
      await EventPersistenceService.storeEvent({
        eventType: PG_EVENTS.PAYMENT_COMPLETED,
        eventData: event,
        restaurantId: event.restaurantId,
      });

      // Then emit via PostgreSQL NOTIFY for real-time delivery
      await pgPubSub.notify(PG_EVENTS.PAYMENT_COMPLETED, event);
    } catch (error) {
      console.error('Failed to publish payment completed:', error);
    }
  }

  /**
   * Publish table status change event with dual-write pattern
   */
  static async publishTableStatusChange(
    event: TableStatusChangedEvent
  ): Promise<void> {
    try {
      // Dual-write: Store in database first for reliability
      await EventPersistenceService.storeEvent({
        eventType: PG_EVENTS.TABLE_STATUS_CHANGED,
        eventData: event,
        restaurantId: event.restaurantId,
      });

      // Then emit via PostgreSQL NOTIFY for real-time delivery
      await pgPubSub.notify(PG_EVENTS.TABLE_STATUS_CHANGED, event);
    } catch (error) {
      console.error('Failed to publish table status change:', error);
    }
  }
}
