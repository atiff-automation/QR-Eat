/**
 * PostgreSQL NOTIFY/LISTEN Pub/Sub System
 *
 * Provides real-time event notifications using PostgreSQL's built-in pub/sub.
 * Replaces Redis for event-driven communication with zero infrastructure cost.
 *
 * @see CLAUDE.md - Type Safety, Error Handling, Single Source of Truth
 */

import { Client } from 'pg';
import { EventEmitter } from 'events';

// ============================================================================
// Event Channel Names (Single Source of Truth)
// ============================================================================

export const PG_EVENTS = {
  ORDER_STATUS_CHANGED: 'order_status_changed',
  ORDER_CREATED: 'order_created',
  ORDER_ITEM_STATUS_CHANGED: 'order_item_status_changed',
  KITCHEN_NOTIFICATION: 'kitchen_notification',
  RESTAURANT_NOTIFICATION: 'restaurant_notification',
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

  constructor() {
    super();
    this.setMaxListeners(20); // Allow multiple SSE connections
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
   * Publish event to channel
   */
  async notify(
    channel: string,
    payload: Record<string, unknown>
  ): Promise<void> {
    // Use notifyClient if available, otherwise use Prisma (fallback)
    const client = this.notifyClient;

    if (!client) {
      console.warn('⚠️ NOTIFY client not available, skipping notification');
      return;
    }

    try {
      const payloadStr = JSON.stringify(payload);
      // Escape single quotes in payload
      const escapedPayload = payloadStr.replace(/'/g, "''");

      await client.query(`NOTIFY ${channel}, '${escapedPayload}'`);

      if (process.env.NODE_ENV === 'development') {
        console.log(`📢 Published to ${channel}:`, payload);
      }
    } catch (error) {
      console.error(`Failed to publish to ${channel}:`, error);
      // Don't throw - notification failures shouldn't break the main flow
    }
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
   * Publish order status change event
   */
  static async publishOrderStatusChange(
    event: OrderStatusChangedEvent
  ): Promise<void> {
    try {
      await pgPubSub.notify(PG_EVENTS.ORDER_STATUS_CHANGED, event);
    } catch (error) {
      console.error('Failed to publish order status change:', error);
      // Don't throw - notification failures shouldn't break the main flow
    }
  }

  /**
   * Publish new order created event
   */
  static async publishOrderCreated(event: OrderCreatedEvent): Promise<void> {
    try {
      await pgPubSub.notify(PG_EVENTS.ORDER_CREATED, event);
    } catch (error) {
      console.error('Failed to publish order created:', error);
    }
  }

  /**
   * Publish order item status change event
   */
  static async publishOrderItemStatusChange(
    event: OrderItemStatusChangedEvent
  ): Promise<void> {
    try {
      await pgPubSub.notify(PG_EVENTS.ORDER_ITEM_STATUS_CHANGED, event);
    } catch (error) {
      console.error('Failed to publish item status change:', error);
    }
  }

  /**
   * Publish kitchen notification
   */
  static async publishKitchenNotification(
    event: KitchenNotificationEvent
  ): Promise<void> {
    try {
      await pgPubSub.notify(PG_EVENTS.KITCHEN_NOTIFICATION, event);
    } catch (error) {
      console.error('Failed to publish kitchen notification:', error);
    }
  }

  /**
   * Publish restaurant notification
   */
  static async publishRestaurantNotification(
    event: RestaurantNotificationEvent
  ): Promise<void> {
    try {
      await pgPubSub.notify(PG_EVENTS.RESTAURANT_NOTIFICATION, event);
    } catch (error) {
      console.error('Failed to publish restaurant notification:', error);
    }
  }
}

// ============================================================================
// Graceful Shutdown
// ============================================================================

process.on('SIGINT', async () => {
  console.log('\n⚠️ SIGINT received, cleaning up PostgreSQL pub/sub...');
  await pgPubSub.cleanup();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n⚠️ SIGTERM received, cleaning up PostgreSQL pub/sub...');
  await pgPubSub.cleanup();
  process.exit(0);
});
