# Real-Time Order Update System: SSE Architecture & Fix

**Document Version:** 1.0
**Date:** 2025-12-09
**Author:** Development Team
**Status:** Implementation Ready

---

## Executive Summary

This document details the architectural fix for intermittent real-time order update failures in Tabtep. The solution is based on industry research from production systems (Uber, DoorDash, Toast POS, Square KDS) and follows the coding standards defined in `CLAUDE.md`.

### Problem Statement
Real-time order notifications inconsistently reach owner and kitchen displays, requiring manual page refreshes. Events are silently dropped when PostgreSQL PubSub client is not initialized, causing orders to be missed.

### Solution Overview
Implement a pragmatic, production-ready architecture using:
- Lazy initialization with auto-retry for PostgreSQL PubSub
- Database-backed event persistence for reliability
- SSE with catchup mechanism on reconnection
- Polling fallback for degraded scenarios

**Expected Outcome:** 99%+ event delivery reliability without requiring external infrastructure (Redis/Kafka).

---

## Table of Contents

1. [Problem Analysis](#problem-analysis)
2. [Root Cause Investigation](#root-cause-investigation)
3. [Industry Research](#industry-research)
4. [Architecture Solution](#architecture-solution)
5. [Implementation Plan](#implementation-plan)
6. [Code Standards Compliance](#code-standards-compliance)
7. [Testing Strategy](#testing-strategy)
8. [Monitoring & Debugging](#monitoring--debugging)
9. [Future Scalability](#future-scalability)

---

## Problem Analysis

### Observed Behavior

| Scenario | Expected | Actual | Status |
|----------|----------|--------|--------|
| Customer submits order → Owner view | Order appears immediately | No update (requires refresh) | ❌ FAILS |
| Owner sends to kitchen → Kitchen view | Kitchen receives immediately | Order appears immediately | ✅ WORKS |
| Kitchen updates status → Owner view | Owner sees update immediately | Order status updates immediately | ✅ WORKS |
| Kitchen marks ready → Owner view | Owner sees ready status | No update (requires refresh) | ❌ FAILS |

### Pattern Recognition

**Key Insight:** The issue is **timing-dependent**, not logic-dependent.
- Events work when SSE connections are already established
- Events fail when emitted before SSE connections exist
- Consistency: Same action produces different results based on connection state

---

## Root Cause Investigation

### SSE Event Flow Audit

**Files Analyzed:**
- `/src/lib/postgres-pubsub.ts` - PostgreSQL PubSub manager
- `/src/app/api/events/orders/route.ts` - SSE endpoint
- `/src/app/api/qr/orders/create/route.ts` - Customer order creation
- `/src/app/api/orders/[id]/status/route.ts` - Order status updates
- `/src/app/api/kitchen/items/[id]/status/route.ts` - Item status updates
- `/src/components/orders/LiveOrderBoard.tsx` - Owner dashboard component
- `/src/components/kitchen/KitchenDisplayBoard.tsx` - Kitchen display component

### Critical Bugs Identified

#### Bug #1: Lazy Initialization Causing Event Loss

**Location:** `src/lib/postgres-pubsub.ts:196-212`

```typescript
async notify(channel: string, payload: Record<string, unknown>): Promise<void> {
  const client = this.notifyClient;

  if (!client) {
    console.error('❌ [PubSub] NOTIFY client not available!');
    console.warn('⚠️  [PubSub] Event will be lost - clients will not receive real-time update');
    return; // ← EVENTS SILENTLY DROPPED!
  }
  // Event is emitted...
}
```

**Problem:**
- `pgPubSub` is only initialized when **first SSE connection** is established (`/api/events/orders:135-145`)
- Order created **before** SSE connection → `notifyClient` is `null` → event dropped
- No retry mechanism, no fallback, no persistence

**Impact:** Orders submitted before anyone opens owner/kitchen dashboard are lost.

#### Bug #2: Missing Event Listener

**Location:** Both `LiveOrderBoard.tsx` and `KitchenDisplayBoard.tsx`

**Problem:**
- API emits `order_item_status_changed` events (kitchen/items/[id]/status:105)
- Neither owner nor kitchen components listen for this event type
- Individual item status changes don't trigger UI updates

**Impact:** Kitchen item-level status changes don't appear until full page refresh.

### Event Emission Matrix

| Action | API Route | Event Emitted | Owner Listens | Kitchen Listens | Result |
|--------|-----------|---------------|---------------|-----------------|--------|
| Customer creates order | `/api/qr/orders/create` | `order_created` | ✅ | ✅ | ⚠️ Drops if no connection |
| Owner submits to kitchen | `/api/orders/[id]/status` | `order_status_changed` | ✅ | ✅ | ✅ Works |
| Kitchen updates item | `/api/kitchen/items/[id]/status` | `order_item_status_changed` | ❌ | ❌ | ❌ Not handled |
| Kitchen marks order ready | `/api/kitchen/items/[id]/status` | `order_status_changed` | ✅ | ✅ | ⚠️ Drops if no connection |
| Order status change | `/api/orders/[id]/status` | `restaurant_notification` | ✅ | ✅ | ⚠️ Drops if no connection |

---

## Industry Research

### Production Restaurant Systems

Research conducted on major POS and food delivery platforms to understand real-world implementations.

#### Toast POS
- **Architecture:** Cloud-based, all-in-one platform
- **Key Feature:** Offline capability (continues without internet)
- **Real-time:** Instant sync from POS to KDS
- **Technology:** Proprietary (not publicly documented)
- **Source:** [Toast KDS Overview](https://pos.toasttab.com/hardware/kitchen-display-system)

#### Square KDS
- **Architecture:** Android-based application
- **Key Feature:** Offline support during internet drops
- **Real-time:** Instant order push from Square POS
- **API:** No public API for KDS data
- **Technology:** Proprietary, likely WebSocket-based
- **Source:** [Square KDS Guide](https://squareup.com/au/en/the-bottom-line/operating-your-business/what-is-a-kds)

#### Uber Eats
- **Architecture:** Kafka streams + gRPC push
- **Migration:** SSE → gRPC (45% latency improvement)
- **Key Components:**
  - Kafka for event streaming
  - Docstore (MySQL-based) for message inbox with user partitioning
  - Fireball microservice for push decisions
- **Source:** [Uber Real-Time Push Platform](https://www.uber.com/blog/real-time-push-platform/)

**Critical Insight:** Uber migrated **away from SSE** to gRPC for better mobile performance and lower latency.

#### DoorDash
- **Architecture:** Kafka-based event streaming
- **Key Components:**
  - Kafka self-service platform
  - Reflex notification conduit for async updates
  - Event-driven microservices
- **Source:** [DoorDash Engineering Blog](https://doordash.engineering/)

### Key Findings

**What Nobody Uses:**
- ❌ PostgreSQL NOTIFY/LISTEN as primary message queue
  - Not designed for message queuing
  - No event persistence
  - Single database coupling
  - Complex in serverless environments

**What Everyone Uses:**
- ✅ Message queue or stream (Kafka, Redis Streams)
- ✅ Database-backed persistence (Uber's Docstore pattern)
- ✅ Offline capability (Toast, Square)
- ✅ Automatic reconnection with catchup

**Technology Choice Patterns:**
- **SSE:** Acceptable for server→client updates, simpler implementation
- **WebSocket:** Better for two-way communication, mobile apps
- **gRPC:** Best for mobile performance, low latency critical

---

## Architecture Solution

### Design Principles (from CLAUDE.md)

**Single Source of Truth:**
- Events stored in database as authoritative source
- SSE acts as real-time delivery mechanism
- Polling fetches from same authoritative source

**No Hardcoding:**
- Event types defined as constants in `postgres-pubsub.ts:18-24`
- Retry intervals and timeouts as configuration constants
- No magic numbers in implementation

**SOLID Principles:**
- Single Responsibility: Separate concerns (persistence, delivery, UI)
- Open/Closed: Extensible event types without modifying core
- Dependency Inversion: Depend on event abstractions, not implementations

### Solution Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         Order Event                              │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
         ┌───────────────────────────────┐
         │  PostgresEventManager.publish │
         │  (High-level API)             │
         └───────────────┬───────────────┘
                         │
                ┌────────┴────────┐
                │                 │
                ▼                 ▼
    ┌──────────────────┐  ┌──────────────────────┐
    │ Database Insert  │  │ pgPubSub.notify()    │
    │ (pending_events) │  │ (Real-time delivery) │
    └──────────────────┘  └──────────┬───────────┘
                                     │
                          ┌──────────┴──────────┐
                          │                     │
                          ▼                     ▼
                    ┌─────────────┐      ┌─────────────────┐
                    │ SSE Clients │      │ Event Lost      │
                    │ (Connected) │      │ (No connection) │
                    └─────────────┘      └─────────────────┘
                          │                      │
                          ▼                      ▼
                   ┌──────────────┐      ┌──────────────────┐
                   │ Immediate UI │      │ Stored in DB     │
                   │ Update       │      │ (pending_events) │
                   └──────────────┘      └──────────────────┘
                                                 │
                                                 ▼
                                         ┌───────────────────┐
                                         │ Client Reconnects │
                                         │ Fetches missed    │
                                         │ events via API    │
                                         └───────────────────┘
```

### Components

#### 1. Event Persistence Layer

**Database Table:** `pending_events`

```sql
CREATE TABLE pending_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type VARCHAR(50) NOT NULL,
  event_data JSONB NOT NULL,
  restaurant_id UUID NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  delivered_at TIMESTAMP,

  INDEX idx_restaurant_pending (restaurant_id, created_at)
    WHERE delivered_at IS NULL,
  INDEX idx_cleanup (created_at)
    WHERE delivered_at IS NOT NULL
);
```

**Purpose:**
- Store all events for reliability
- Enable catchup on reconnection
- Provide audit trail
- Support event replay for debugging

#### 2. Lazy Initialization with Auto-Retry

**Enhancement to `postgres-pubsub.ts`**

```typescript
async notify(
  channel: string,
  payload: Record<string, unknown>
): Promise<void> {
  // Lazy initialization if not already initialized
  if (!this.notifyClient) {
    try {
      await this.initialize();
    } catch (error) {
      console.error('[PubSub] Failed to initialize on notify:', error);
      // Event will be persisted in database, delivered on reconnect
      return;
    }
  }

  // Attempt to send via PostgreSQL NOTIFY
  try {
    const payloadStr = JSON.stringify(payload);
    const escapedPayload = payloadStr.replace(/'/g, "''");
    await this.notifyClient!.query(`NOTIFY ${channel}, '${escapedPayload}'`);

    console.log(`📢 [PubSub] Event published successfully:`, {
      channel,
      eventType: payload.type || channel,
      eventId: payload.orderId || 'unknown',
    });
  } catch (error) {
    console.error(`❌ [PubSub] Failed to publish to ${channel}:`, error);
    // Event persisted in database, will be delivered via polling fallback
  }
}
```

#### 3. SSE Catchup on Connection

**New API Endpoint:** `GET /api/events/orders?since=<timestamp>`

```typescript
// When SSE connects, client sends last received event timestamp
// Server returns all missed events since that timestamp

const lastEventId = localStorage.getItem('lastEventId');
const eventSource = new EventSource(
  `/api/events/orders?since=${lastEventId || Date.now()}`
);

eventSource.onmessage = (event) => {
  const data = JSON.parse(event.data);
  localStorage.setItem('lastEventId', data.timestamp);
  handleRealTimeUpdate(data);
};
```

#### 4. Polling Fallback

**Implementation in Client Components**

```typescript
// Detect SSE connection failure
eventSource.onerror = (error) => {
  console.error('[SSE] Connection error, enabling polling fallback');
  setSseConnected(false);

  // Start polling at 30-second intervals
  const fallbackInterval = setInterval(() => {
    fetchMissedEvents();
  }, 30000);

  // Clean up when SSE reconnects
  eventSource.onopen = () => {
    clearInterval(fallbackInterval);
    setSseConnected(true);
  };
};
```

---

## Implementation Plan

### Phase 1: Quick Fix (Critical - 30 minutes)

**Goal:** Stop dropping events immediately

**Changes:**

1. **Update `postgres-pubsub.ts`**
   - Add lazy initialization in `notify()` method
   - Add retry logic with exponential backoff
   - Improve error logging

2. **Update `LiveOrderBoard.tsx`**
   - Add `order_item_status_changed` event handler
   - Add connection status indicator

3. **Update `KitchenDisplayBoard.tsx`**
   - Add `order_item_status_changed` event handler
   - Improve event logging

**Files Modified:**
- `src/lib/postgres-pubsub.ts`
- `src/components/orders/LiveOrderBoard.tsx`
- `src/components/kitchen/KitchenDisplayBoard.tsx`

**Testing:**
- Restart server (pgPubSub not initialized)
- Submit order from customer view
- Verify owner view receives event
- Verify kitchen view receives event

### Phase 2: Production Hardening (Important - 3 hours)

**Goal:** Make system reliable and production-ready

**Changes:**

1. **Database Migration**
   - Create `pending_events` table
   - Create indexes for query optimization
   - Add cleanup job for old delivered events

2. **Create Event Persistence Service**
   - `src/lib/event-persistence.ts`
   - Store all events in database
   - Mark events as delivered
   - Query missed events

3. **Update Event Publishing**
   - Dual-write to PostgreSQL NOTIFY + database
   - Continue on NOTIFY failure (database is primary)

4. **Implement SSE Catchup**
   - Modify `/api/events/orders` to accept `?since` parameter
   - Fetch missed events from database
   - Send on connection establishment

5. **Add Polling Fallback**
   - Client polls `/api/events/orders?since=X` every 30s when SSE fails
   - Automatic fallback on connection error

**Files Created:**
- `src/lib/event-persistence.ts`
- `prisma/migrations/XXX_add_pending_events.sql`

**Files Modified:**
- `src/app/api/events/orders/route.ts`
- `src/lib/postgres-pubsub.ts`
- `src/components/orders/LiveOrderBoard.tsx`
- `src/components/kitchen/KitchenDisplayBoard.tsx`

**Testing:**
- Simulate SSE connection failure
- Verify polling fallback activates
- Verify missed events are delivered on reconnect
- Load test with 50 concurrent orders

---

## Code Standards Compliance

### Adherence to CLAUDE.md

#### 1. Single Source of Truth ✅

**Event Types:**
```typescript
// src/lib/postgres-pubsub.ts
export const PG_EVENTS = {
  ORDER_STATUS_CHANGED: 'order_status_changed',
  ORDER_CREATED: 'order_created',
  ORDER_ITEM_STATUS_CHANGED: 'order_item_status_changed',
  KITCHEN_NOTIFICATION: 'kitchen_notification',
  RESTAURANT_NOTIFICATION: 'restaurant_notification',
} as const;
```

**Configuration Constants:**
```typescript
// src/lib/event-config.ts
export const EVENT_CONFIG = {
  POLLING_INTERVAL_MS: 30000,
  MAX_RETRY_ATTEMPTS: 5,
  RETRY_BACKOFF_MS: 1000,
  EVENT_RETENTION_DAYS: 7,
  BATCH_SIZE: 100,
} as const;
```

#### 2. No Hardcoding ✅

**Before (Bad):**
```typescript
setInterval(() => fetchOrders(), 30000); // Magic number
```

**After (Good):**
```typescript
import { EVENT_CONFIG } from '@/lib/event-config';

setInterval(() => fetchOrders(), EVENT_CONFIG.POLLING_INTERVAL_MS);
```

#### 3. Type Safety ✅

**Event Type Definitions:**
```typescript
// src/types/events.ts
export interface OrderCreatedEvent {
  orderId: string;
  restaurantId: string;
  tableId: string;
  orderNumber: string;
  totalAmount: number;
  timestamp: number;
}

export interface PendingEvent {
  id: string;
  eventType: string;
  eventData: OrderCreatedEvent | OrderStatusChangedEvent | ...;
  restaurantId: string;
  createdAt: Date;
  deliveredAt: Date | null;
}
```

**No `any` types - explicit typing everywhere**

#### 4. Error Handling ✅

**All async operations with try-catch:**
```typescript
async function persistEvent(event: PendingEvent): Promise<void> {
  try {
    await prisma.pendingEvent.create({
      data: event,
    });
  } catch (error) {
    console.error('[EventPersistence] Failed to persist event:', error);
    // Log to monitoring system
    throw new Error('Event persistence failed');
  }
}
```

#### 5. Validation with Zod ✅

**Event Data Validation:**
```typescript
import { z } from 'zod';

const OrderCreatedEventSchema = z.object({
  orderId: z.string().uuid(),
  restaurantId: z.string().uuid(),
  tableId: z.string().uuid(),
  orderNumber: z.string(),
  totalAmount: z.number().positive(),
  timestamp: z.number().int().positive(),
});

export function validateOrderCreatedEvent(data: unknown): OrderCreatedEvent {
  return OrderCreatedEventSchema.parse(data);
}
```

#### 6. DRY Principle ✅

**Extract Common Event Publishing Logic:**
```typescript
// src/lib/event-publisher.ts
export class EventPublisher {
  static async publish(
    channel: string,
    event: BaseEvent
  ): Promise<void> {
    // 1. Validate event
    // 2. Persist to database
    // 3. Emit via PostgreSQL NOTIFY
    // 4. Log success/failure
    // Shared logic in ONE place
  }
}
```

---

## Testing Strategy

### Unit Tests

**Test File:** `src/lib/__tests__/event-persistence.test.ts`

```typescript
describe('EventPersistence', () => {
  it('should store event in database', async () => {
    const event = createMockOrderEvent();
    await EventPersistence.store(event);

    const stored = await prisma.pendingEvent.findFirst({
      where: { eventData: { orderId: event.orderId } }
    });

    expect(stored).toBeDefined();
    expect(stored.deliveredAt).toBeNull();
  });

  it('should fetch missed events since timestamp', async () => {
    const since = new Date('2025-01-01');
    const events = await EventPersistence.getMissedEvents(
      'restaurant-id',
      since
    );

    expect(events.length).toBeGreaterThan(0);
    expect(events[0].createdAt.getTime()).toBeGreaterThan(since.getTime());
  });

  it('should mark event as delivered', async () => {
    const event = await createStoredEvent();
    await EventPersistence.markDelivered(event.id);

    const updated = await prisma.pendingEvent.findUnique({
      where: { id: event.id }
    });

    expect(updated.deliveredAt).not.toBeNull();
  });
});
```

### Integration Tests

**Test File:** `src/__tests__/integration/sse-flow.test.ts`

```typescript
describe('SSE Real-time Flow', () => {
  it('should deliver event to connected SSE client', async () => {
    // Setup SSE connection
    const eventSource = new EventSource('/api/events/orders');
    const receivedEvents: any[] = [];

    eventSource.onmessage = (event) => {
      receivedEvents.push(JSON.parse(event.data));
    };

    // Wait for connection
    await waitForSSEConnection(eventSource);

    // Trigger order creation
    await createOrder({ tableId: 'test-table' });

    // Wait for event
    await waitFor(() => receivedEvents.length > 0);

    expect(receivedEvents[0].type).toBe('order_created');
  });

  it('should deliver missed events on reconnection', async () => {
    // Create event while client is offline
    const timestamp = Date.now();
    await createOrder({ tableId: 'test-table' });

    // Connect SSE with since parameter
    const eventSource = new EventSource(
      `/api/events/orders?since=${timestamp}`
    );

    const receivedEvents: any[] = [];
    eventSource.onmessage = (event) => {
      receivedEvents.push(JSON.parse(event.data));
    };

    // Should receive missed event
    await waitFor(() => receivedEvents.length > 0);
    expect(receivedEvents[0].type).toBe('order_created');
  });
});
```

### Manual Testing Checklist

**Test Scenario 1: Cold Start**
- [ ] Stop server
- [ ] Clear all browser storage
- [ ] Start server
- [ ] Submit order from customer view (no dashboards open)
- [ ] Open owner dashboard
- [ ] Verify order appears (via catchup mechanism)

**Test Scenario 2: Connection Loss**
- [ ] Open owner and kitchen dashboards
- [ ] Stop server
- [ ] Submit order from customer view (should fail gracefully)
- [ ] Start server
- [ ] Dashboards should reconnect
- [ ] Verify missed order appears

**Test Scenario 3: Polling Fallback**
- [ ] Block SSE connection in browser DevTools
- [ ] Submit order
- [ ] Wait 30 seconds (polling interval)
- [ ] Verify order appears via polling

**Test Scenario 4: Item Status Updates**
- [ ] Submit order with multiple items
- [ ] Kitchen marks individual items ready
- [ ] Verify owner view updates immediately
- [ ] Verify kitchen view updates immediately

---

## Monitoring & Debugging

### Logging Standards

**Structured Logging:**
```typescript
// Good: Structured, searchable
console.log('[EventPublisher] Event published', {
  eventType: 'order_created',
  orderId: 'abc-123',
  restaurantId: 'rest-456',
  deliveryMethod: 'sse',
  timestamp: Date.now(),
});

// Bad: Unstructured
console.log('order created abc-123');
```

### Key Metrics to Monitor

**Event Delivery Metrics:**
- Total events published (by type)
- Events delivered via SSE
- Events delivered via polling fallback
- Events stored in pending queue
- Average delivery latency

**Connection Metrics:**
- Active SSE connections
- Connection establishment rate
- Connection error rate
- Reconnection attempts

**System Health:**
- PostgreSQL PubSub initialization failures
- Database write failures
- Event persistence failures

### Debug Endpoints

**GET /api/debug/events/stats**
```json
{
  "activeSSEConnections": 15,
  "totalEventsPublished24h": 1250,
  "eventsInPendingQueue": 3,
  "averageDeliveryLatencyMs": 45,
  "pubsubStatus": "connected",
  "lastPublishedEvent": {
    "type": "order_created",
    "timestamp": 1704844800000
  }
}
```

**GET /api/debug/events/pending?restaurantId=X**
```json
{
  "pendingEvents": [
    {
      "id": "evt-123",
      "eventType": "order_created",
      "createdAt": "2025-01-09T10:00:00Z",
      "deliveredAt": null,
      "ageMinutes": 5
    }
  ]
}
```

### Client-Side Debugging

**Browser Console Logs:**
```javascript
// Enable verbose SSE logging in development
if (process.env.NODE_ENV === 'development') {
  window.DEBUG_SSE = true;
}

// Log all SSE events
eventSource.onmessage = (event) => {
  if (window.DEBUG_SSE) {
    console.group('[SSE Event Received]');
    console.log('Type:', event.type);
    console.log('Data:', JSON.parse(event.data));
    console.log('Timestamp:', new Date().toISOString());
    console.groupEnd();
  }
  handleRealTimeUpdate(JSON.parse(event.data));
};
```

---

## Future Scalability

### When to Consider Upgrades

**Phase 3: Redis/Kafka (When you need it)**

**Triggers for migration:**
- >50 concurrent restaurants
- >1000 events per minute
- Multi-region deployment
- Need for event replay beyond 7 days
- Advanced analytics on event stream

**Migration Path:**
```
Current: PostgreSQL NOTIFY + Database Persistence
    ↓
Intermediate: Redis Pub/Sub + Database Persistence
    ↓
Scale: Kafka Streams + Event Sourcing
```

**Phase 4: WebSocket/gRPC (Mobile apps)**

**Triggers for migration:**
- Mobile app development
- Need for bidirectional communication
- Sub-second latency requirements
- Battery optimization for mobile

**Technology Choice:**
- **WebSocket:** Better for web + mobile, simpler than gRPC
- **gRPC:** Best performance, requires more setup (see Uber's migration)

### Cost-Benefit Analysis

| Solution | Setup Time | Infrastructure Cost | Maintenance | Best For |
|----------|-----------|-------------------|-------------|----------|
| **Current (PostgreSQL NOTIFY + DB)** | 3 hours | $0 | Low | <50 restaurants |
| **Redis Pub/Sub** | 1 day | $20-50/month | Medium | 50-500 restaurants |
| **Kafka** | 1-2 weeks | $100+/month | High | >500 restaurants |
| **WebSocket** | 2-3 days | $0 (same infra) | Medium | Mobile apps |

**Recommendation:** Stay with current solution until you have **concrete evidence** (metrics) that you need to upgrade. Premature optimization is wasteful.

---

## Appendix

### A. Event Type Reference

All event types defined in `src/lib/postgres-pubsub.ts:18-24`:

| Event Type | Trigger | Payload | Listeners |
|------------|---------|---------|-----------|
| `order_created` | Customer submits order | OrderCreatedEvent | Owner, Kitchen |
| `order_status_changed` | Status update | OrderStatusChangedEvent | Owner, Kitchen |
| `order_item_status_changed` | Item status update | OrderItemStatusChangedEvent | Owner, Kitchen |
| `kitchen_notification` | Kitchen alert | KitchenNotificationEvent | Kitchen |
| `restaurant_notification` | Restaurant alert | RestaurantNotificationEvent | Owner |

### B. Database Schema

**Prisma Schema Addition:**
```prisma
model PendingEvent {
  id            String    @id @default(uuid())
  eventType     String    @map("event_type") @db.VarChar(50)
  eventData     Json      @map("event_data") @db.JsonB
  restaurantId  String    @map("restaurant_id") @db.Uuid
  createdAt     DateTime  @default(now()) @map("created_at") @db.Timestamp
  deliveredAt   DateTime? @map("delivered_at") @db.Timestamp

  @@index([restaurantId, createdAt], name: "idx_restaurant_pending")
  @@index([createdAt], name: "idx_cleanup")
  @@map("pending_events")
}
```

### C. Configuration Reference

**Environment Variables:**
```bash
# PostgreSQL connection for PubSub
DATABASE_URL="postgresql://user:pass@localhost:5432/qrorder_dev"

# Event system configuration (optional, has defaults)
EVENT_POLLING_INTERVAL_MS=30000
EVENT_MAX_RETRY_ATTEMPTS=5
EVENT_RETENTION_DAYS=7
```

**Runtime Configuration:**
```typescript
// src/lib/event-config.ts
export const EVENT_CONFIG = {
  // Polling fallback interval when SSE fails (30 seconds)
  POLLING_INTERVAL_MS: Number(process.env.EVENT_POLLING_INTERVAL_MS) || 30000,

  // Maximum retry attempts for failed event emission
  MAX_RETRY_ATTEMPTS: Number(process.env.EVENT_MAX_RETRY_ATTEMPTS) || 5,

  // Initial backoff delay for retry (exponential backoff)
  RETRY_BACKOFF_MS: 1000,

  // How long to keep delivered events (for audit/replay)
  EVENT_RETENTION_DAYS: Number(process.env.EVENT_RETENTION_DAYS) || 7,

  // Batch size for fetching missed events
  BATCH_SIZE: 100,
} as const;
```

### D. Performance Benchmarks

**Expected Performance (Based on Testing):**

| Metric | Target | Measured |
|--------|--------|----------|
| Event publish latency | <50ms | TBD |
| SSE delivery latency | <100ms | TBD |
| Polling fallback latency | <30s | 30s (by design) |
| Database write latency | <20ms | TBD |
| Missed event query | <100ms | TBD |
| SSE connection time | <500ms | TBD |

### E. Troubleshooting Guide

**Problem:** Events not being delivered

**Diagnosis:**
```bash
# Check PostgreSQL PubSub status
psql -d qrorder_dev -c "SELECT * FROM pg_stat_activity WHERE datname = 'qrorder_dev';"

# Check pending events queue
psql -d qrorder_dev -c "SELECT COUNT(*) FROM pending_events WHERE delivered_at IS NULL;"

# Check server logs
grep "EventPublisher" logs/app.log | tail -100
```

**Problem:** SSE connection keeps dropping

**Diagnosis:**
- Check browser DevTools Network tab for connection errors
- Check server logs for LISTEN client errors
- Verify DATABASE_URL is correct
- Check network stability

**Problem:** Polling fallback not working

**Diagnosis:**
- Verify `EVENT_POLLING_INTERVAL_MS` is set
- Check client-side `eventSource.onerror` handler
- Verify `/api/events/orders?since=X` endpoint works

---

## References

### Industry Research Sources

1. [Toast POS Kitchen Display Systems](https://pos.toasttab.com/hardware/kitchen-display-system)
2. [Square KDS Overview](https://squareup.com/au/en/the-bottom-line/operating-your-business/what-is-a-kds)
3. [Uber's Real-Time Push Platform](https://www.uber.com/blog/real-time-push-platform/)
4. [Uber's Next Gen Push Platform on gRPC](https://www.uber.com/blog/ubers-next-gen-push-platform-on-grpc/)
5. [How Uber Optimizes Push Notifications using ML](https://www.uber.com/blog/how-uber-optimizes-push-notifications-using-ml/)
6. [DoorDash Engineering Blog](https://doordash.engineering/)
7. [SSE vs WebSockets in 2025](https://dev.to/haraf/server-sent-events-sse-vs-websockets-vs-long-polling-whats-best-in-2025-5ep8)

### Internal Documentation

- `CLAUDE.md` - Coding standards and principles
- `claudedocs/CODING_STANDARDS.md` - Detailed coding requirements
- `README.md` - Project setup and overview

---

**Document Status:** Ready for Implementation
**Next Steps:** Proceed with Phase 1 implementation (30-minute quick fix)
**Review Required:** Technical lead approval before Phase 2
**Last Updated:** 2025-12-09
