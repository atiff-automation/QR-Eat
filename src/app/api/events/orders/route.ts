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
import { pgPubSub, PG_EVENTS } from '@/lib/postgres-pubsub';

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

    // Get tenant context from middleware headers
    const context = getTenantContext(request);
    requireAuth(context);

    // Get user info from context
    const userType = context!.userType;
    const userId = context!.userId;
    const restaurantId = context!.restaurantId;

    if (!userId) {
      return NextResponse.json({ error: 'Invalid user data' }, { status: 400 });
    }

    // Create connection ID
    const connectionId = `${userId}_${Date.now()}`;

    // Create readable stream for SSE
    const stream = new ReadableStream({
      start(controller) {
        // Store connection
        activeConnections.set(connectionId, {
          controller,
          restaurantId: restaurantId || '',
          userType,
          userId,
        });

        // Send initial connection message
        const initialMessage = {
          type: 'connection',
          data: {
            connectionId,
            timestamp: Date.now(),
            message: 'Connected to real-time updates',
          },
        };

        controller.enqueue(`data: ${JSON.stringify(initialMessage)}\n\n`);

        // Set up PostgreSQL LISTEN subscription for this connection
        setupPostgresSubscription(connectionId);

        // Send keep-alive ping every 30 seconds
        const keepAliveInterval = setInterval(() => {
          try {
            controller.enqueue(`: ping\n\n`);
          } catch {
            clearInterval(keepAliveInterval);
            cleanup(connectionId);
          }
        }, 30000);

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

    // Return SSE response
    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Cache-Control',
      },
    });
  } catch (error) {
    console.error('SSE setup error:', error);
    return NextResponse.json(
      { error: 'Failed to setup real-time connection' },
      { status: 500 }
    );
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
        PG_EVENTS.RESTAURANT_NOTIFICATION
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
  if (!connection) return;

  try {
    const eventData = JSON.parse(message);

    // Filter events based on user's restaurant access
    const shouldReceiveEvent = checkEventPermission(connection, eventData);
    if (!shouldReceiveEvent) return;

    // Format event for SSE
    const sseEvent = {
      type: getEventType(channel),
      data: eventData,
      timestamp: Date.now(),
    };

    // Send to client
    connection.controller.enqueue(`data: ${JSON.stringify(sseEvent)}\n\n`);
  } catch (error) {
    console.error('Error handling PostgreSQL message:', error);
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
      return 'order_status_changed';
    case PG_EVENTS.ORDER_CREATED:
      return 'order_created';
    case PG_EVENTS.ORDER_ITEM_STATUS_CHANGED:
      return 'order_item_status_changed';
    case PG_EVENTS.KITCHEN_NOTIFICATION:
      return 'kitchen_notification';
    case PG_EVENTS.RESTAURANT_NOTIFICATION:
      return 'restaurant_notification';
    default:
      return 'unknown';
  }
}

function cleanup(connectionId: string) {
  const connection = activeConnections.get(connectionId);
  if (connection) {
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

    console.log(`SSE connection ${connectionId} cleaned up`);
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
