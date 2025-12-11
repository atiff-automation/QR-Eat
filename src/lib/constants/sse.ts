/**
 * Server-Sent Events (SSE) Constants - Single Source of Truth
 *
 * Following CLAUDE.md principles:
 * - Single Source of Truth (SSOT)
 * - No Hardcoding
 * - Type Safety
 *
 * @see claudedocs/CODING_STANDARDS.md
 * @see RFC 7540 Section 8.1.2.2 - HTTP/2 Forbidden Headers
 */

// ============================================================================
// SSE Configuration
// ============================================================================

/**
 * Keep-alive interval for SSE connections (in milliseconds)
 *
 * Industry standard: 15-20 seconds
 * - Prevents proxy/load balancer timeouts (typically 20-30s)
 * - Faster than most proxy idle timeouts
 * - Ensures HTTP/2 PING frames stay healthy
 *
 * @see Sequential Thinking Analysis - SSE Connection Issue Root Cause
 */
export const SSE_KEEP_ALIVE_INTERVAL_MS = 15_000; // 15 seconds

/**
 * SSE Response Headers (HTTP/2 Compliant)
 *
 * IMPORTANT: Connection header is FORBIDDEN in HTTP/2 (RFC 7540 Section 8.1.2.2)
 * HTTP/2 connections are always persistent by design.
 *
 * Headers explained:
 * - Content-Type: text/event-stream → Required for SSE
 * - Cache-Control: no-cache → Prevent caching of stream
 * - X-Accel-Buffering: no → Disable nginx/proxy buffering
 * - Access-Control-Allow-Origin: * → Enable CORS (adjust for production)
 * - Access-Control-Allow-Headers: Cache-Control → Allow cache control headers
 */
export const SSE_RESPONSE_HEADERS = {
  'Content-Type': 'text/event-stream',
  'Cache-Control': 'no-cache',
  'X-Accel-Buffering': 'no',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Cache-Control',
} as const;

/**
 * SSE reconnection delay for clients (in milliseconds)
 *
 * Time to wait before attempting reconnection after connection failure
 */
export const SSE_RECONNECT_DELAY_MS = 5_000; // 5 seconds

// ============================================================================
// SSE Event Types
// ============================================================================

export const SSE_EVENT_TYPES = {
  CONNECTION: 'connection',
  ORDER_CREATED: 'order_created',
  ORDER_STATUS_CHANGED: 'order_status_changed',
  ORDER_ITEM_STATUS_CHANGED: 'order_item_status_changed',
  KITCHEN_NOTIFICATION: 'kitchen_notification',
  RESTAURANT_NOTIFICATION: 'restaurant_notification',
} as const;

export type SSEEventType =
  (typeof SSE_EVENT_TYPES)[keyof typeof SSE_EVENT_TYPES];

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * SSE Connection Message - Initial connection acknowledgment
 */
export interface SSEConnectionMessage {
  type: typeof SSE_EVENT_TYPES.CONNECTION;
  data: {
    connectionId: string;
    timestamp: number;
    message: string;
  };
}

/**
 * Generic SSE Event Structure
 */
export interface SSEEvent<T = unknown> {
  type: SSEEventType;
  data: T;
  timestamp: number;
}
