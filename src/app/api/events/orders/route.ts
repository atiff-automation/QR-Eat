/**
 * Server-Sent Events (SSE) API for Real-time Order Updates
 *
 * Streams order status changes and notifications to connected clients
 * using PostgreSQL NOTIFY/LISTEN for real-time pub/sub.
 *
 * @see CLAUDE.md - Type Safety, Error Handling, Production Ready
 */

import { NextRequest, NextResponse } from 'next/server';
import { getTenantContext, requireAuth } from '@/lib/tenant-context';
import { extractTokenFromRequest } from '@/lib/auth-utils';
import { pgPubSub, PG_EVENTS } from '@/lib/postgres-pubsub';
import { EventPersistenceService } from '@/lib/event-persistence';
import {
  SSE_KEEP_ALIVE_INTERVAL_MS,
  SSE_RESPONSE_HEADERS,
  SSE_EVENT_TYPES,
} from '@/lib/constants/sse';
import { pushNotificationService } from '@/lib/push-notification-service';

// Connection tracking types
interface ActiveConnection {
  controller: ReadableStreamDefaultController;
  restaurantId: string;
  userType: string;
  userId: string;
  keepAliveInterval?: NodeJS.Timeout;
  messageHandler?: (channel: string, message: string) => void;
}

// Track active connections
const activeConnections = new Map<string, ActiveConnection>();

export async function GET(request: NextRequest) {
  try {
    // Debug: Log headers received
    if (process.env.NODE_ENV === 'development') {
      console.log('🔍 /api/events/orders: Headers received:', {
        'x-user-id': request.headers.get('x-user-id'),
        'x-user-type': request.headers.get('x-user-type'),
        'x-user-permissions': request.headers.get('x-user-permissions'),
        allHeaders: Object.fromEntries(request.headers.entries()),
      });
    }

    // Get tenant context from middleware headers or ?token= query param (mobile clients)
    const context =
      (await extractTokenFromRequest(request)) ||
      (await getTenantContext(request));
    requireAuth(context);

    // Get user info from context
    const userType = context!.userType;
    const userId = context!.userId;
    const restaurantId = context!.restaurantId;

    if (!userId) {
      return NextResponse.json({ error: 'Invalid user data' }, { status: 400 });
    }

    // Parse query parameters for SSE catchup
    const url = new URL(request.url);
    const sinceParam = url.searchParams.get('since');
    const sinceTimestamp = sinceParam ? new Date(sinceParam) : null;

    // Create connection ID
    const connectionId = `${userId}_${Date.now()}`;

    // Create readable stream for SSE
    const stream = new ReadableStream({
      async start(controller) {
        // Store connection
        activeConnections.set(connectionId, {
          controller,
          restaurantId: restaurantId || '',
          userType,
          userId,
        });

        console.log(`[SSE] New connection established:`, {
          connectionId,
          userId,
          userType,
          restaurantId: restaurantId || 'none',
          totalConnections: activeConnections.size,
          catchupRequested: !!sinceTimestamp,
          since: sinceTimestamp?.toISOString(),
        });

        // Send initial connection message
        const initialMessage = {
          type: SSE_EVENT_TYPES.CONNECTION,
          data: {
            connectionId,
            timestamp: Date.now(),
            message: 'Connected to real-time updates',
          },
        };

        controller.enqueue(`data: ${JSON.stringify(initialMessage)}\n\n`);

        // Send catchup events if client requested them
        if (sinceTimestamp && restaurantId) {
          await sendCatchupEvents(controller, restaurantId, sinceTimestamp);
        }

        // Set up PostgreSQL LISTEN subscription for this connection
        setupPostgresSubscription(connectionId);

        // Send keep-alive ping to prevent proxy/load balancer timeout
        // Uses industry standard interval (15s) to stay within typical proxy timeouts (20-30s)
        const keepAliveInterval = setInterval(() => {
          try {
            controller.enqueue(`: ping\n\n`);
          } catch {
            clearInterval(keepAliveInterval);
            cleanup(connectionId);
          }
        }, SSE_KEEP_ALIVE_INTERVAL_MS);

        // Store interval for cleanup
        const conn = activeConnections.get(connectionId);
        if (conn) {
          conn.keepAliveInterval = keepAliveInterval;
        }
      },
      cancel() {
        cleanup(connectionId);
      },
    });

    // Return SSE response with HTTP/2-compliant headers
    // Note: Connection header is FORBIDDEN in HTTP/2 (RFC 7540 Section 8.1.2.2)
    return new Response(stream, {
      headers: SSE_RESPONSE_HEADERS,
    });
  } catch (error) {
    console.error('SSE setup error:', error);
    return NextResponse.json(
      { error: 'Failed to setup real-time connection' },
      { status: 500 }
    );
  }
}

/**
 * Send catchup events for missed updates
 *
 * Retrieves undelivered events from database and sends them to client.
 * Used when client reconnects after being offline.
 *
 * @see claudedocs/SSE_REAL_TIME_SYSTEM_FIX.md - Phase 2: SSE Catchup
 */
async function sendCatchupEvents(
  controller: ReadableStreamDefaultController,
  restaurantId: string,
  since: Date
): Promise<void> {
  try {
    console.log(`[SSE Catchup] Retrieving pending events:`, {
      restaurantId,
      since: since.toISOString(),
    });

    const pendingEvents = await EventPersistenceService.getPendingEvents({
      restaurantId,
      since,
    });

    console.log(`[SSE Catchup] Found ${pendingEvents.length} pending events`);

    for (const event of pendingEvents) {
      const sseEvent = {
        type: event.eventType,
        data: event.eventData,
        timestamp: event.createdAt.getTime(),
      };

      controller.enqueue(`data: ${JSON.stringify(sseEvent)}\n\n`);

      // Mark event as delivered
      await EventPersistenceService.markDelivered(event.id);
    }

    if (pendingEvents.length > 0) {
      console.log(
        `[SSE Catchup] Delivered ${pendingEvents.length} missed events to client`
      );
    }
  } catch (error) {
    console.error(`[SSE Catchup] Error sending catchup events:`, error);
    // Don't throw - catchup failure shouldn't prevent SSE connection
  }
}

async function setupPostgresSubscription(connectionId: string) {
  const connection = activeConnections.get(connectionId);
  if (!connection) return;

  try {
    // Initialize PostgreSQL pub/sub if not already done
    if (!pgPubSub.isConnected()) {
      await pgPubSub.initialize();
      // Subscribe to all event channels
      await pgPubSub.subscribe(
        PG_EVENTS.ORDER_STATUS_CHANGED,
        PG_EVENTS.ORDER_CREATED,
        PG_EVENTS.ORDER_ITEM_STATUS_CHANGED,
        PG_EVENTS.KITCHEN_NOTIFICATION,
        PG_EVENTS.RESTAURANT_NOTIFICATION,
        PG_EVENTS.TABLE_STATUS_CHANGED
      );
    }

    // Handle incoming PostgreSQL notifications
    // Note: We use a single global listener and filter by connection
    const messageHandler = (channel: string, message: string) => {
      handlePostgresMessage(connectionId, channel, message);
    };

    pgPubSub.on('message', messageHandler);

    // Store handler for cleanup
    const conn = activeConnections.get(connectionId);
    if (conn) {
      conn.messageHandler = messageHandler;
    }
  } catch (error) {
    console.error('PostgreSQL subscription error:', error);
  }
}

function handlePostgresMessage(
  connectionId: string,
  channel: string,
  message: string
) {
  const connection = activeConnections.get(connectionId);
  if (!connection) {
    console.warn(
      `[SSE] Connection ${connectionId} not found in active connections`
    );
    return;
  }

  try {
    const eventData = JSON.parse(message);

    console.log(`[SSE] Processing event for connection ${connectionId}:`, {
      channel,
      eventType: getEventType(channel),
      eventId: (eventData as { orderId?: string }).orderId || 'unknown',
      eventRestaurantId: (eventData as { restaurantId?: string }).restaurantId,
      userRestaurantId: connection.restaurantId,
      userType: connection.userType,
    });

    // Filter events based on user's restaurant access
    const shouldReceiveEvent = checkEventPermission(connection, eventData);

    if (!shouldReceiveEvent) {
      console.log(`[SSE] Event filtered out for connection ${connectionId}:`, {
        reason: 'Permission check failed',
        eventRestaurantId: (eventData as { restaurantId?: string })
          .restaurantId,
        userRestaurantId: connection.restaurantId,
        userType: connection.userType,
      });
      return;
    }

    // Format event for SSE
    const sseEvent = {
      type: getEventType(channel),
      data: eventData,
      timestamp: Date.now(),
    };

    // Send to client
    connection.controller.enqueue(`data: ${JSON.stringify(sseEvent)}\n\n`);

    console.log(`[SSE] Event delivered to connection ${connectionId}:`, {
      type: sseEvent.type,
      eventId: (eventData as { orderId?: string }).orderId || 'unknown',
    });

    // Send push notification for new orders
    if (
      sseEvent.type === SSE_EVENT_TYPES.ORDER_CREATED &&
      connection.restaurantId
    ) {
      // Send push notification in background (don't await)
      sendPushNotification(connection.restaurantId, eventData).catch((error) =>
        console.error('[Push] Error sending notification:', error)
      );
    }
  } catch (error) {
    console.error(
      `[SSE] Error handling PostgreSQL message for ${connectionId}:`,
      error
    );
  }
}

function checkEventPermission(
  connection: ActiveConnection,
  eventData: { restaurantId?: string }
): boolean {
  // Platform admins can see all events
  if (connection.userType === 'platform_admin') {
    return true;
  }

  // Restaurant-specific users can only see their restaurant's events
  if (connection.restaurantId && eventData.restaurantId) {
    return connection.restaurantId === eventData.restaurantId;
  }

  // Restaurant owners can see events for all their restaurants
  if (connection.userType === 'restaurant_owner') {
    // This would require additional logic to check restaurant ownership
    return true;
  }

  return false;
}

function getEventType(channel: string): string {
  switch (channel) {
    case PG_EVENTS.ORDER_STATUS_CHANGED:
      return SSE_EVENT_TYPES.ORDER_STATUS_CHANGED;
    case PG_EVENTS.ORDER_CREATED:
      return SSE_EVENT_TYPES.ORDER_CREATED;
    case PG_EVENTS.ORDER_ITEM_STATUS_CHANGED:
      return SSE_EVENT_TYPES.ORDER_ITEM_STATUS_CHANGED;
    case PG_EVENTS.KITCHEN_NOTIFICATION:
      return SSE_EVENT_TYPES.KITCHEN_NOTIFICATION;
    case PG_EVENTS.RESTAURANT_NOTIFICATION:
      return SSE_EVENT_TYPES.RESTAURANT_NOTIFICATION;
    case PG_EVENTS.TABLE_STATUS_CHANGED:
      return SSE_EVENT_TYPES.TABLE_STATUS_CHANGED;
    default:
      return 'unknown';
  }
}

function cleanup(connectionId: string) {
  const connection = activeConnections.get(connectionId);
  if (connection) {
    console.log(`[SSE] Cleaning up connection:`, {
      connectionId,
      userId: connection.userId,
      userType: connection.userType,
      restaurantId: connection.restaurantId,
      remainingConnections: activeConnections.size - 1,
    });

    // Clear keep-alive interval
    if (connection.keepAliveInterval) {
      clearInterval(connection.keepAliveInterval);
    }

    // Remove PostgreSQL message handler
    if (connection.messageHandler) {
      pgPubSub.off('message', connection.messageHandler);
    }

    // Remove connection
    activeConnections.delete(connectionId);

    console.log(`[SSE] Connection ${connectionId} cleaned up successfully`);
  }
}

/**
 * Send push notification for new order
 */
async function sendPushNotification(
  restaurantId: string,
  eventData: unknown
): Promise<void> {
  try {
    const orderData = eventData as {
      orderId?: string;
      orderNumber?: string;
      totalAmount?: number;
    };

    const payload = {
      title: 'New Order',
      body: `Order #${orderData.orderNumber || orderData.orderId || 'Unknown'} received`,
      icon: '/icons/icon-192x192.png',
      badge: '/icons/badge-72x72.png',
      data: {
        orderId: orderData.orderId,
        url: `/dashboard/orders?id=${orderData.orderId}`,
      },
    };

    const result = await pushNotificationService.sendToRestaurant(
      restaurantId,
      payload
    );

    console.log(
      `[Push] Notification sent for order ${orderData.orderId}: ${result.sent} sent, ${result.failed} failed`
    );
  } catch (error) {
    console.error('[Push] Error sending push notification:', error);
    // Don't throw - push notification failure shouldn't affect SSE
  }
}

// Cleanup on process exit
process.on('SIGINT', () => {
  activeConnections.forEach((_, connectionId) => {
    cleanup(connectionId);
  });
  process.exit(0);
});

process.on('SIGTERM', () => {
  activeConnections.forEach((_, connectionId) => {
    cleanup(connectionId);
  });
  process.exit(0);
});

export const dynamic = 'force-dynamic';
