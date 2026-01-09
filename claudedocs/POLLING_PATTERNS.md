# Polling Patterns Guide

**How to Use Polling Correctly in Tabtep**

---

## 🎯 Two Types of Polling

We have **two distinct polling patterns** depending on whether the component has SSE (Server-Sent Events) as the primary data source:

### **1. SSE-Backed Polling (Conditional)**
- **Use When**: Component has SSE for real-time updates
- **Behavior**: Polling is **DISABLED** when SSE is connected
- **Purpose**: Fallback mechanism for when SSE disconnects
- **Examples**: Kitchen Display, Live Orders, Customer Tracking

### **2. Regular Polling (Always-On)**
- **Use When**: Component has **NO** SSE alternative
- **Behavior**: Polling runs **continuously**
- **Purpose**: Primary method for data updates
- **Examples**: Analytics Dashboard, Table Status, Reports

---

## 📋 Decision Tree: Which Pattern Should I Use?

```
Does your component have SSE (Server-Sent Events)?
├─ YES → Use SSE-Backed Polling (Conditional)
│   ├─ Primary: SSE pushes updates instantly
│   ├─ Fallback: Polling when SSE fails
│   └─ Efficiency: 95% reduction in requests
│
└─ NO → Use Regular Polling (Always-On)
    ├─ Primary: Polling fetches data periodically
    ├─ No SSE alternative
    └─ Acceptable for non-time-critical features
```

---

## 🔧 Implementation Patterns

### **Pattern 1: SSE-Backed Polling (Conditional)**

**When to Use:**
- Component needs real-time updates (Kitchen, Orders, etc.)
- SSE provides instant notifications
- Polling is fallback for reliability

**Implementation:**

```typescript
'use client';

import { useState, useEffect } from 'react';
import { useAuthAwarePolling } from '@/hooks/useAuthAwarePolling';
import { POLLING_INTERVALS } from '@/lib/constants/polling-config';

export function KitchenDisplayBoard() {
  // Track SSE connection state
  const [sseConnected, setSseConnected] = useState(false);

  /**
   * SSE-BACKED CONDITIONAL POLLING
   *
   * Third parameter (!sseConnected) controls polling:
   * - When SSE connected (sseConnected=true): !sseConnected=false → Polling DISABLED
   * - When SSE disconnected (sseConnected=false): !sseConnected=true → Polling ENABLED
   *
   * Result: Polling only runs when SSE fails (fallback mode)
   */
  const { data, error } = useAuthAwarePolling<OrderData>(
    '/kitchen/orders',
    POLLING_INTERVALS.KITCHEN,  // 10 seconds interval
    !sseConnected               // ← CONDITIONAL: Enable only when SSE is disconnected
  );

  // Set up SSE connection
  useEffect(() => {
    const eventSource = new EventSource('/api/events/orders');

    eventSource.onopen = () => {
      console.log('✅ SSE connected → Polling disabled');
      setSseConnected(true);  // Disables polling
    };

    eventSource.onerror = () => {
      console.error('❌ SSE error → Polling enabled');
      setSseConnected(false);  // Enables polling as fallback
    };

    eventSource.onmessage = (event) => {
      const data = JSON.parse(event.data);
      // Handle real-time update...
    };

    return () => eventSource.close();
  }, []);

  // Use polling data as fallback when SSE is down
  useEffect(() => {
    if (data && !sseConnected) {
      console.log('📊 Using polling data (SSE is down)');
      // Update state with polling data...
    }
  }, [data, sseConnected]);

  return <div>{/* Kitchen display UI */}</div>;
}
```

**Behavior Timeline:**

```
0:00 - Component mounts
├─ SSE: Connecting...
├─ Polling: ENABLED (sseConnected=false)
└─ Polling requests every 10s

0:03 - SSE connection established
├─ SSE: onopen → setSseConnected(true)
├─ Polling: DISABLED (!sseConnected=false)
└─ SSE handles all updates (instant)

5:00 - SSE disconnects (network issue)
├─ SSE: onerror → setSseConnected(false)
├─ Polling: AUTO-ENABLED (!sseConnected=true)
└─ Polling maintains data flow (every 10s)

5:15 - SSE reconnects
├─ SSE: onopen → setSseConnected(true)
├─ Polling: AUTO-DISABLED (!sseConnected=false)
└─ SSE takes over again
```

---

### **Pattern 2: Regular Polling (Always-On)**

**When to Use:**
- Component does NOT have SSE
- Data updates are not time-critical
- Polling is the primary data source

**Implementation:**

```typescript
'use client';

import { useState, useEffect } from 'react';
import { useAuthAwarePolling } from '@/hooks/useAuthAwarePolling';
import { POLLING_INTERVALS } from '@/lib/constants/polling-config';

export function AnalyticsDashboard() {
  /**
   * REGULAR POLLING (Always-On)
   *
   * Third parameter (true) or omitted: Polling ALWAYS runs
   * - No SSE alternative
   * - Polling is the primary data source
   * - Acceptable for non-time-critical features
   */
  const { data, error, isLoading } = useAuthAwarePolling<AnalyticsData>(
    '/api/analytics',
    POLLING_INTERVALS.ANALYTICS,  // 30 seconds interval
    true                           // ← ALWAYS-ON: Polling always enabled (or omit for default)
  );

  // Use polling data directly
  useEffect(() => {
    if (data) {
      console.log('📊 Analytics data updated');
      // Update state...
    }
  }, [data]);

  return <div>{/* Analytics dashboard UI */}</div>;
}
```

**Behavior Timeline:**

```
0:00 - Component mounts
└─ Polling: Starts immediately (enabled=true)

0:30 - First polling update
└─ Polling: GET /api/analytics → Update UI

1:00 - Second polling update
└─ Polling: GET /api/analytics → Update UI

(Continues every 30 seconds indefinitely)
```

---

## 📊 Performance Comparison

### **SSE-Backed Polling (Conditional)**

```
1 Hour Operation (SSE working 95% of time):

SSE Connected (57 minutes):
├─ SSE: ~0 HTTP requests (push-based, instant)
├─ Polling: DISABLED (0 requests)
└─ Server Load: Minimal (only SSE keepalive pings)

SSE Disconnected (3 minutes):
├─ Polling: ENABLED
├─ Requests: 18 (every 10 seconds)
└─ Server Load: 18 database queries

Total per hour:
├─ HTTP Requests: ~18
├─ Server Load: ~18 DB queries
└─ Efficiency: 95% reduction vs always-on polling
```

### **Regular Polling (Always-On)**

```
1 Hour Operation:

Continuous Polling (60 minutes):
├─ Polling: ALWAYS enabled
├─ Requests: 120 (every 30 seconds)
└─ Server Load: 120 database queries

Total per hour:
├─ HTTP Requests: 120
├─ Server Load: 120 DB queries
└─ Efficiency: Acceptable for non-critical features
```

---

## ✅ Best Practices

### **For SSE-Backed Components:**

1. ✅ **Always track SSE connection state**
   ```typescript
   const [sseConnected, setSseConnected] = useState(false);
   ```

2. ✅ **Pass !sseConnected to polling hook**
   ```typescript
   useAuthAwarePolling(endpoint, interval, !sseConnected)
   ```

3. ✅ **Update state in both handlers**
   - `eventSource.onopen` → `setSseConnected(true)`
   - `eventSource.onerror` → `setSseConnected(false)`

4. ✅ **Use polling data only when SSE is down**
   ```typescript
   useEffect(() => {
     if (data && !sseConnected) {
       // Update with polling data
     }
   }, [data, sseConnected]);
   ```

### **For Regular Polling Components:**

1. ✅ **Use explicit `true` or omit third parameter**
   ```typescript
   useAuthAwarePolling(endpoint, interval, true)
   // or
   useAuthAwarePolling(endpoint, interval)  // defaults to enabled
   ```

2. ✅ **Choose appropriate interval**
   - Non-critical: 30 seconds (ANALYTICS, TABLES)
   - Moderate: 15 seconds
   - Frequent: 10 seconds (only if no SSE alternative)

3. ✅ **Use polling data directly**
   ```typescript
   useEffect(() => {
     if (data) {
       // Update UI directly with polling data
     }
   }, [data]);
   ```

---

## 🚫 Common Mistakes

### **❌ WRONG: Both SSE and Polling Active**

```typescript
// DON'T DO THIS!
const { data } = useAuthAwarePolling('/kitchen/orders', 10_000);
// Third parameter omitted or true → Polling ALWAYS runs

useEffect(() => {
  const eventSource = new EventSource('/api/events/orders');
  // SSE also runs
}, []);

// Result: Both SSE and polling waste server resources!
```

### **✅ CORRECT: Conditional Polling**

```typescript
// DO THIS!
const [sseConnected, setSseConnected] = useState(false);

const { data } = useAuthAwarePolling(
  '/kitchen/orders',
  10_000,
  !sseConnected  // ← Only when SSE fails
);

useEffect(() => {
  const eventSource = new EventSource('/api/events/orders');
  eventSource.onopen = () => setSseConnected(true);
  eventSource.onerror = () => setSseConnected(false);
}, []);

// Result: Polling only when SSE is down!
```

---

## 🎯 Quick Reference

| Component | Has SSE? | Pattern | Third Parameter | Interval |
|-----------|----------|---------|----------------|----------|
| Kitchen Display | ✅ Yes | SSE-Backed | `!sseConnected` | 10s |
| Live Orders | ✅ Yes | SSE-Backed | `!sseConnected` | 30s |
| Customer Tracking | ✅ Yes | SSE-Backed | `!sseConnected` | 5s |
| Analytics | ❌ No | Regular | `true` or omit | 30s |
| Table Status | ❌ No | Regular | `true` or omit | 30s |
| Reports | ❌ No | On-demand | N/A | Manual |

---

## 📝 Summary

### **Decision Flowchart:**

```
Need real-time updates?
├─ YES → Implement SSE
│   ├─ Add SSE connection tracking
│   ├─ Use conditional polling (!sseConnected)
│   └─ Polling = fallback only
│
└─ NO → Use regular polling
    ├─ No SSE needed
    ├─ Use always-on polling (true)
    └─ Choose appropriate interval
```

### **Key Takeaways:**

1. **SSE-Backed Polling**: Use `!sseConnected` as third parameter
2. **Regular Polling**: Use `true` or omit third parameter
3. **Never mix**: Don't run both SSE and polling when SSE works
4. **Choose wisely**: SSE for time-critical, polling for others

---

**Last Updated**: December 2024
**Status**: ✅ Production Ready
**See Also**: `src/lib/constants/polling-config.ts` for interval definitions
