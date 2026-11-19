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
import { SSE_EVENT_TYPES } from './constants/sse';

// ============================================================================
// Event Channel Names (Single Source of Truth)
// ============================================================================

export const PG_EVENTS = {
  ORDER_STATUS_CHANGED: 'order_status_changed',
  ORDER_CREATED: 'order_created',
  ORDER_ITEMS_ADDED: 'order_items_added',
  ORDER_CANCELLED: 'order_cancelled',
  ORDER_ITEM_STATUS_CHANGED: 'order_item_status_changed',
  ORDER_RECALLED: 'order_recalled',
  ORDER_RECALL_CLEARED: 'order_recall_cleared',
  KITCHEN_NOTIFICATION: 'kitchen_notification',
  RESTAURANT_NOTIFICATION: 'restaurant_notification',
  PAYMENT_COMPLETED: 'payment_completed',
  TABLE_STATUS_CHANGED: 'table_status_changed',
} as const;

/**
 * Map a PostgreSQL channel to the staff SSE `type`.
 *
 * Kept here (next to the channel names) so the events route and tests share one
 * mapping. Unknown channels return null; the route keeps its `unknown` label.
 */
export function staffSseEventTypeForChannel(channel: string): string | null {
  switch (channel) {
    case PG_EVENTS.ORDER_STATUS_CHANGED:
      return SSE_EVENT_TYPES.ORDER_STATUS_CHANGED;
    case PG_EVENTS.ORDER_CREATED:
      return SSE_EVENT_TYPES.ORDER_CREATED;
    case PG_EVENTS.ORDER_ITEMS_ADDED:
      return SSE_EVENT_TYPES.ORDER_ITEMS_ADDED;
    case PG_EVENTS.ORDER_CANCELLED:
      return SSE_EVENT_TYPES.ORDER_CANCELLED;
    case PG_EVENTS.ORDER_ITEM_STATUS_CHANGED:
      return SSE_EVENT_TYPES.ORDER_ITEM_STATUS_CHANGED;
    case PG_EVENTS.ORDER_RECALLED:
      return SSE_EVENT_TYPES.ORDER_RECALLED;
    case PG_EVENTS.ORDER_RECALL_CLEARED:
      return SSE_EVENT_TYPES.ORDER_RECALL_CLEARED;
    case PG_EVENTS.KITCHEN_NOTIFICATION:
      return SSE_EVENT_TYPES.KITCHEN_NOTIFICATION;
    case PG_EVENTS.RESTAURANT_NOTIFICATION:
      return SSE_EVENT_TYPES.RESTAURANT_NOTIFICATION;
    case PG_EVENTS.TABLE_STATUS_CHANGED:
      return SSE_EVENT_TYPES.TABLE_STATUS_CHANGED;
    default:
      return null;
  }
}

// ============================================================================
// Event Type Definitions
// ============================================================================

export interface OrderStatusChangedEvent {
  orderId: string;
  oldStatus: string;
  newStatus: string;
  restaurantId: string;
  tableId: string | null;
  orderNumber: string;
  timestamp: number;
  changedBy?: string;
}

export interface OrderCreatedEvent {
  orderId: string;
  restaurantId: string;
  tableId: string | null;
  orderNumber: string;
  totalAmount: number;
  timestamp: number;
}

/**
 * Staff add-on/cancellation signal (`phase-b-counter-feed-v1` §SSE).
 *
 * Signal only: no reason, item text, customer data or order snapshot. The
 * Counter refreshes from `/api/counter/changes` and then fetches the order or
 * its tickets.
 */
export interface OrderFeedSignalEvent {
  orderId: string;
  restaurantId: string;
  orderNumber: string;
  orderVersion: number;
  ticketCount: number;
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

export interface OrderRecallEvent {
  orderId: string;
  orderNumber: string;
  restaurantId: string;
  stationId: string;
  recalledAt: string;
  clearedAt?: string;
  reason: string | null;
  version: number;
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
  private notifyConnect: Promise<Client> | null = null;
  /**
   * Incremented by session teardown. An in-flight NOTIFY connect captures it
   * before its await and refuses to publish if it changed, so a connect that
   * was abandoned (teardown or replacement) can never overwrite the live
   * `notifyClient`.
   */
  private notifyGeneration = 0;
  /** Shared in-flight `initialize()` pass so concurrent callers create one client. */
  private initializePromise: Promise<void> | null = null;
  /**
   * Incremented by `cleanup()`. An initialize pass captures it before its
   * awaits and refuses to publish if it changed, so an abandoned pass can never
   * become a second live session.
   */
  private initializeGeneration = 0;
  /** Serialized tail of the `subscribe()` passes (additive, one at a time). */
  private subscriptionPromise: Promise<void> | null = null;
  /** Channels `LISTEN`ed on the current LISTEN session. */
  private readonly subscribedChannels = new Set<string>();
  /** Identity of the published LISTEN session; null when there is none. */
  private listenSessionToken: object | null = null;
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
   * Initialize PostgreSQL clients for pub/sub.
   *
   * Single-flight: every concurrent caller shares one pass, so the process
   * keeps at most one LISTEN client. `instrumentation.ts` and the SSE route can
   * both call this on a cold server; the second call must not open a second
   * listener (that produced duplicate frames).
   */
  async initialize(): Promise<void> {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL environment variable is required');
    }

    if (this.initializePromise) {
      return this.initializePromise;
    }

    // A LISTEN client already exists: never create a second one. Just make
    // sure the NOTIFY side is up (it has its own independent gate).
    if (this.listenClient) {
      await this.connectNotifyClient();
      this.reconnectAttempts = 0;
      this.registerSignalHandlers();
      return;
    }

    const generation = this.initializeGeneration;
    const pass = this.openListenSession(generation);
    this.initializePromise = pass;

    try {
      await pass;
    } finally {
      if (this.initializePromise === pass) {
        this.initializePromise = null;
      }
    }
  }

  /**
   * Open the single LISTEN session.
   *
   * The client and its session token are published only after the LISTEN
   * `connect()` and the NOTIFY connect both succeed: a concurrent `subscribe()`
   * either joins this pass or sees no session, never a half-initialized one.
   * A failed or abandoned pass closes the client it created instead of leaving
   * an orphan listener that would emit duplicate `message` events.
   */
  private async openListenSession(generation: number): Promise<void> {
    const client = new Client({
      connectionString: process.env.DATABASE_URL,
    });
    // Identity of this session. Subscribe passes record channels only while
    // their captured token is still the current one.
    const sessionToken = {};

    try {
      await client.connect();
      console.log('✅ PostgreSQL LISTEN client connected');

      // Set up notification handler
      client.on(
        'notification',
        (msg: { channel: string; payload?: string }) => {
          this.handleNotification(msg);
        }
      );

      // Handle connection errors. Only the current session may react, so a
      // released/replaced client cannot mute or re-enter the live one.
      client.on('error', (err: Error) => {
        console.error('❌ PostgreSQL LISTEN client error:', err);
        if (this.listenClient === client) {
          this.handleDisconnect();
        }
      });

      client.on('end', () => {
        console.log('⚠️ PostgreSQL LISTEN client disconnected');
        if (this.listenClient === client) {
          this.handleDisconnect();
        }
      });

      // Create dedicated client for NOTIFY operations (non-blocking)
      await this.connectNotifyClient();

      // A `cleanup()` may have run while this pass was connecting. Publishing
      // now would leave a second live listener behind a newer session, so the
      // pass abandons itself instead: the caller retries on a clean state.
      if (generation !== this.initializeGeneration) {
        throw new Error(
          'PostgreSQL LISTEN session was abandoned before it was established'
        );
      }

      // Both connects succeeded: publish the session and start from empty
      // bookkeeping, so nothing from an earlier session can survive into this
      // one.
      this.subscribedChannels.clear();
      this.isListening = false;
      this.listenClient = client;
      this.listenSessionToken = sessionToken;

      this.reconnectAttempts = 0;

      // Register signal handlers for graceful shutdown (runtime only)
      this.registerSignalHandlers();
    } catch (error) {
      console.error('Failed to initialize PostgreSQL pub/sub:', error);

      // Atomic failure: close and clear the client created by this pass so a
      // later retry starts clean.
      if (this.listenClient === client) {
        this.listenClient = null;
        this.listenSessionToken = null;
      }

      // Only reset session-wide state when no session is published. An
      // abandoned pass must never clear the bookkeeping of the session that
      // replaced it.
      if (this.listenClient === null && this.listenSessionToken === null) {
        this.isListening = false;
        this.subscribedChannels.clear();
      }

      try {
        await client.end();
      } catch (closeError) {
        console.error('Error closing failed LISTEN client:', closeError);
      }

      throw error;
    }
  }

  /**
   * Release the current LISTEN client without scheduling a reconnect.
   *
   * Used when the client can no longer be trusted (failed setup, exhausted
   * reconnect budget) so the next `subscribe()` rebuilds instead of talking to
   * a dead socket forever.
   */
  private releaseListenClient(): void {
    const client = this.listenClient;
    this.listenClient = null;
    this.listenSessionToken = null;
    this.isListening = false;
    this.subscribedChannels.clear();

    if (!client) return;

    client.end().catch((error: Error) => {
      console.error('Error closing dead LISTEN client:', error);
    });
  }

  /**
   * Create/replace the dedicated NOTIFY client.
   *
   * A lost NOTIFY connection must not poison every later publish: the old
   * client becomes permanently "not queryable" and each publish burns through
   * the full retry/backoff budget. Drop the reference on error and reconnect
   * on the next notify().
   */
  private connectNotifyClient(): Promise<Client> {
    if (this.notifyClient) return Promise.resolve(this.notifyClient);
    if (this.notifyConnect) return this.notifyConnect;

    const pending = this.openNotifyClient();
    this.notifyConnect = pending;
    void pending.then(
      () => {
        if (this.notifyConnect === pending) this.notifyConnect = null;
      },
      () => {
        if (this.notifyConnect === pending) this.notifyConnect = null;
      }
    );
    return pending;
  }

  private async openNotifyClient(): Promise<Client> {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL environment variable is required');
    }

    // Ownership token for this connect attempt. A teardown (or a replacement
    // connect) bumps the generation while we are awaiting `connect()`.
    const generation = this.notifyGeneration;

    const client = new Client({
      connectionString: process.env.DATABASE_URL,
    });

    await client.connect();
    console.log('✅ PostgreSQL NOTIFY client connected');

    // Publish only if this attempt still owns the connection. A superseded
    // client must be closed, never adopted: adopting it would overwrite a live
    // replacement and leak the replacement as an unreferenced connection.
    if (
      generation !== this.notifyGeneration ||
      (this.notifyClient !== null && this.notifyClient !== client)
    ) {
      try {
        await client.end();
      } catch (closeError) {
        console.error('Error closing abandoned NOTIFY client:', closeError);
      }

      // If a replacement is already live, hand it to the caller so a publish
      // waiting on this abandoned attempt still proceeds instead of hanging.
      if (this.notifyClient) {
        return this.notifyClient;
      }

      throw new Error(
        'PostgreSQL NOTIFY session was abandoned before it was established'
      );
    }

    client.on('error', (err: Error) => {
      console.error('❌ PostgreSQL NOTIFY client error:', err);
      if (this.notifyClient === client) {
        this.notifyClient = null;
      }
    });

    this.notifyClient = client;
    return client;
  }

  /**
   * Subscribe to event channels.
   *
   * Additive and serialized: concurrent callers queue behind one pass, only
   * channels not yet `LISTEN`ed on this session are issued, and a channel is
   * recorded only after its `LISTEN` succeeds. This keeps the union correct
   * when `instrumentation.ts` (5 channels) and the SSE route (10 channels) both
   * subscribe on the same process.
   */
  async subscribe(...channels: string[]): Promise<void> {
    const previous = this.subscriptionPromise;
    const pass = (
      previous
        ? previous.then(
            () => undefined,
            () => undefined
          )
        : Promise.resolve()
    ).then(() => this.applySubscriptionPass(channels));

    this.subscriptionPromise = pass;

    try {
      await pass;
    } finally {
      if (this.subscriptionPromise === pass) {
        this.subscriptionPromise = null;
      }
    }
  }

  private async applySubscriptionPass(channels: string[]): Promise<void> {
    if (!this.listenClient) {
      await this.initialize();
    }

    const client = this.listenClient;
    const sessionToken = this.listenSessionToken;
    if (!client || !sessionToken) {
      throw new Error('PostgreSQL LISTEN client not initialized');
    }

    const pending = Array.from(new Set(channels)).filter(
      (channel) => !this.subscribedChannels.has(channel)
    );

    const sessionIsCurrent = (): boolean =>
      this.listenClient === client && this.listenSessionToken === sessionToken;

    try {
      for (const channel of pending) {
        await client.query(`LISTEN ${channel}`);

        if (!sessionIsCurrent()) {
          // The session was closed or replaced while this LISTEN was in
          // flight. Never write its bookkeeping into the next session.
          throw new Error('PostgreSQL LISTEN session changed during subscribe');
        }

        this.subscribedChannels.add(channel);
        console.log(`🔔 Subscribed to channel: ${channel}`);
      }

      if (this.subscribedChannels.size > 0) {
        this.isListening = true;
      }
    } catch (error) {
      console.error('Failed to subscribe to channels:', error);

      if (sessionIsCurrent()) {
        this.isListening = this.subscribedChannels.size > 0;

        if (this.subscribedChannels.size === 0) {
          // Nothing is listening on this session. A failed first `LISTEN`
          // means the socket is unusable, so release it and let the next call
          // rebuild instead of retrying on a dead connection.
          this.releaseListenClient();
        }
      }

      // Channels that already succeeded stay in the set, so a later call
      // retries only the remainder.
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
        this.subscribedChannels.delete(channel);
        console.log(`🔕 Unsubscribed from channel: ${channel}`);
      }
      this.isListening = this.subscribedChannels.size > 0;
    } catch (error) {
      console.error('Failed to unsubscribe from channels:', error);
    }
  }

  /**
   * Publish event to channel with lazy initialization and retry
   *
   * @see cloudedocs/SSE_REAL_TIME_SYSTEM_FIX.md - Phase 1: Lazy Initialization
   */
  async notify<T extends object>(channel: string, payload: T): Promise<void> {
    const payloadRecord = payload as Record<string, unknown>;
    // Lazy initialization: create only the NOTIFY client. Re-initializing the
    // LISTEN client here would leak/duplicate subscriptions.
    if (!this.notifyClient) {
      console.log('⚡ [PubSub] Lazy initialization triggered by notify()');

      try {
        await this.connectNotifyClient();
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
      let client = this.notifyClient;
      if (!client) {
        // The previous attempt dropped the connection. Reconnect before the
        // next attempt instead of burning the retry budget on a dead client.
        try {
          client = await this.connectNotifyClient();
        } catch (connectError) {
          lastError = connectError as Error;
          attempt++;
          if (attempt < EVENT_CONFIG.MAX_RETRY_ATTEMPTS) {
            await new Promise((resolve) =>
              setTimeout(resolve, EVENT_CONFIG.RETRY_BACKOFF_MS)
            );
          }
          continue;
        }
      }

      try {
        const payloadStr = JSON.stringify(payload);
        // Escape single quotes in payload
        const escapedPayload = payloadStr.replace(/'/g, "''");

        await client.query(`NOTIFY ${channel}, '${escapedPayload}'`);

        console.log(`📢 [PubSub] Event published successfully:`, {
          channel,
          eventType:
            payloadRecord.type ||
            (channel.includes('order_created')
              ? 'order_created'
              : 'order_status_changed'),
          eventId: payloadRecord.orderId || 'unknown',
          timestamp: payloadRecord.timestamp || Date.now(),
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

        // A failed NOTIFY means this dedicated connection may never be
        // queryable again. Drop it so the next attempt starts a fresh client.
        if (this.notifyClient === client) {
          this.notifyClient = null;
        }
        client.end().catch((closeError: Error) => {
          console.error('Error closing failed NOTIFY client:', closeError);
        });

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
        eventId: payloadRecord.orderId || 'unknown',
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
    // The current LISTEN session is gone; a later subscribe() must re-issue
    // LISTEN instead of assuming the channels are still active.
    this.subscribedChannels.clear();

    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error(
        `❌ Max reconnect attempts (${this.maxReconnectAttempts}) reached. Giving up.`
      );
      // Release the dead client so a later subscribe() can rebuild one. Without
      // this the single-flight initialize() would early-return on the dead
      // reference and the process would stay muted forever.
      this.releaseListenClient();
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
        // Session teardown, not full disposal: the per-connection `message`
        // handlers registered by the SSE route must survive the reconnect.
        await this.teardownSession();
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
   * Tear down the current session without touching subscriber listeners.
   *
   * Subscribers own their `message` listeners: the SSE route registers one per
   * connection and removes it on connection close (`route.ts:364`). A reconnect
   * must not delete registrations it does not own, so this path ends the
   * connections and resets session/gate state only. Use `cleanup()` for full
   * disposal (tests, SIGINT/SIGTERM, a caller that expects a clean slate).
   */
  private async teardownSession(): Promise<void> {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    // Detach and reset state before awaiting `end()`. A deliberate close must
    // not let the client's own `end` handler see itself as current and schedule
    // a second reconnect (D3), and a concurrent replacement must start from a
    // clean session rather than be clobbered by this teardown.
    const listenClient = this.listenClient;
    const notifyClient = this.notifyClient;

    this.listenClient = null;
    this.notifyClient = null;
    this.listenSessionToken = null;
    this.subscribedChannels.clear();
    this.isListening = false;

    this.initializeGeneration += 1;
    this.notifyGeneration += 1;
    this.initializePromise = null;
    this.subscriptionPromise = null;
    this.notifyConnect = null;

    if (listenClient) {
      try {
        await listenClient.end();
      } catch (error) {
        console.error('Error closing LISTEN client:', error);
      }
    }

    if (notifyClient) {
      try {
        await notifyClient.end();
      } catch (error) {
        console.error('Error closing NOTIFY client:', error);
      }
    }
  }

  /**
   * Full disposal: session teardown plus removal of every subscriber listener.
   *
   * Kept for tests, SIGINT/SIGTERM and callers that want a clean slate.
   */
  async cleanup(): Promise<void> {
    await this.teardownSession();
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

  /** Publish an add-on signal after the add-items mutation commits. */
  static async publishOrderItemsAdded(
    event: OrderFeedSignalEvent
  ): Promise<void> {
    try {
      await EventPersistenceService.storeEvent({
        eventType: PG_EVENTS.ORDER_ITEMS_ADDED,
        eventData: event,
        restaurantId: event.restaurantId,
      });
      await pgPubSub.notify(PG_EVENTS.ORDER_ITEMS_ADDED, event);
    } catch (error) {
      console.error('Failed to publish order items added:', error);
    }
  }

  /** Publish a whole-order cancellation signal after the mutation commits. */
  static async publishOrderCancelled(
    event: OrderFeedSignalEvent
  ): Promise<void> {
    try {
      await EventPersistenceService.storeEvent({
        eventType: PG_EVENTS.ORDER_CANCELLED,
        eventData: event,
        restaurantId: event.restaurantId,
      });
      await pgPubSub.notify(PG_EVENTS.ORDER_CANCELLED, event);
    } catch (error) {
      console.error('Failed to publish order cancelled:', error);
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

  /** Publish a kitchen recall to the generic web stream. */
  static async publishOrderRecalled(event: OrderRecallEvent): Promise<void> {
    try {
      await EventPersistenceService.storeEvent({
        eventType: PG_EVENTS.ORDER_RECALLED,
        eventData: event,
        restaurantId: event.restaurantId,
      });
      await pgPubSub.notify(PG_EVENTS.ORDER_RECALLED, event);
    } catch (error) {
      console.error('Failed to publish order recall:', error);
    }
  }

  /** Publish a recall clear to the generic web stream. */
  static async publishOrderRecallCleared(
    event: OrderRecallEvent
  ): Promise<void> {
    try {
      await EventPersistenceService.storeEvent({
        eventType: PG_EVENTS.ORDER_RECALL_CLEARED,
        eventData: event,
        restaurantId: event.restaurantId,
      });
      await pgPubSub.notify(PG_EVENTS.ORDER_RECALL_CLEARED, event);
    } catch (error) {
      console.error('Failed to publish recall clear:', error);
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
