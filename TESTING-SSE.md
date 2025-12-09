# SSE Real-Time Update Testing Guide

This guide will help you verify that Server-Sent Events (SSE) is working correctly and NOT using fallback polling.

---

## **Test 1: Verify SSE Connection in Browser DevTools**

### **Steps:**

1. **Open Cashier Dashboard:**
   - Navigate to `http://localhost:3000/dashboard/orders/live`
   - Login with cashier/manager credentials

2. **Open Browser DevTools:**
   - Press `F12` or `Cmd+Option+I` (Mac) / `Ctrl+Shift+I` (Windows)
   - Go to **Network** tab
   - Filter by "All" or "EventSource"

3. **Look for SSE Connection:**
   - You should see a request to `/api/events/orders`
   - **Type:** Should be `eventsource` or `text/event-stream`
   - **Status:** Should be `200` (pending/active)
   - **Size:** Should show data transferring
   - The connection should stay OPEN (not complete)

### **What to Look For:**

```
✅ GOOD (SSE Working):
   Name: /api/events/orders
   Type: eventsource
   Status: 200 (pending)
   Size: 1.2 KB (and growing)
   Time: 30s, 60s, 90s... (stays connected)

❌ BAD (Polling Fallback):
   Multiple requests to /api/orders/live
   Requests complete and close
   New request every 30 seconds
```

### **Screenshot Guide:**

**SSE Active (Correct):**
```
Network Tab:
Name                    Type           Status    Size      Time
─────────────────────────────────────────────────────────────
/api/events/orders      eventsource    200       1.2 KB    45.3s ← STAYS OPEN
```

**Polling Active (Wrong):**
```
Network Tab:
Name                    Type           Status    Size      Time
─────────────────────────────────────────────────────────────
/api/orders/live        fetch          200       2.1 KB    234ms ✅
/api/orders/live        fetch          200       2.1 KB    234ms ✅
/api/orders/live        fetch          200       2.1 KB    234ms ✅
                        ↑ Multiple completed requests = polling
```

---

## **Test 2: Inspect SSE Messages**

### **Steps:**

1. **With Network tab open:**
   - Click on `/api/events/orders` request
   - Go to **Messages** or **EventStream** tab (Chrome/Edge)
   - Or **Response** tab (Firefox)

2. **You should see:**
   ```json
   data: {"type":"connection","data":{"connectionId":"...","timestamp":...,"message":"Connected to real-time updates"}}

   : ping
   : ping
   : ping
   ```

### **What Each Message Means:**

```javascript
// Initial connection
data: {"type":"connection",...}  ← SSE connected successfully

// Keep-alive (every 30 seconds)
: ping  ← Server keeping connection alive

// Real event (when order is created/updated)
data: {"type":"order_created","data":{...}}
data: {"type":"order_status_changed","data":{...}}
```

---

## **Test 3: Verify Real-Time Updates (Live Test)**

### **Setup:**

1. **Open 3 Browser Windows:**
   - **Window 1:** Cashier Dashboard → `/dashboard/orders/live`
   - **Window 2:** Kitchen Display → `/kitchen`
   - **Window 3:** Customer Interface → QR code order page

2. **Open Browser Console in Each Window:**
   - Press `F12` → **Console** tab
   - Clear console: `Ctrl+L` or `Cmd+K`

### **Test Flow:**

#### **Step 1: Place Customer Order**

**Action:** In Window 3 (Customer), place an order

**Expected Results:**

**Window 1 (Cashier) - Console Output:**
```javascript
[LiveOrderBoard] SSE connection established
[LiveOrderBoard] Real-time update received: {type: "order_created", ...}
[LiveOrderBoard] New order created, refreshing...
```

**Window 1 (Cashier) - UI:**
- ✅ Green dot shows "Live" (top right corner)
- ✅ New order appears within 1 second
- ✅ No page refresh needed

**Server Console:**
```bash
📢 [PubSub] Event published successfully: {
  channel: 'order_created',
  eventType: 'order_created',
  eventId: 'order-id',
  timestamp: 1234567890
}
[SSE] Processing event for connection user123_1234567890: {
  channel: 'order_created',
  eventType: 'order_created',
  ...
}
[SSE] Event delivered to connection user123_1234567890: {
  type: 'order_created',
  eventId: 'order-id'
}
```

**❌ If You See (Polling Fallback):**
```javascript
[LiveOrderBoard] SSE not connected, using fallback polling
// Fetch requests every 30 seconds
```

---

#### **Step 2: Cashier Approves Order**

**Action:** In Window 1 (Cashier), click "Approve" or change status to "Confirmed"

**Expected Results:**

**Window 2 (Kitchen) - Console Output:**
```javascript
Kitchen real-time update received: {type: "order_status_changed", ...}
Kitchen real-time update received: {type: "kitchen_notification", ...}
```

**Window 2 (Kitchen) - UI:**
- ✅ Order moves from "New Orders" to "In Progress" column
- ✅ Update happens within 1 second
- ✅ No manual refresh

**Server Console:**
```bash
📢 [PubSub] Event published successfully: {
  channel: 'order_status_changed',
  eventType: 'order_status_changed',
  eventId: 'order-id'
}
```

---

## **Test 4: Verify NO Polling is Active**

### **Method 1: Network Tab Monitoring**

1. **Keep Network tab open**
2. **Wait 60 seconds** without interacting
3. **Check for requests to:**
   - `/api/orders/live` ← Should NOT appear every 30s
   - `/api/kitchen/orders` ← Should NOT appear every 15s

**✅ Good:** Only `/api/events/orders` (SSE) stays open, no repeated fetch requests

**❌ Bad:** You see repeated requests completing every X seconds

---

### **Method 2: Console Log Inspection**

**In Browser Console, search for:**
```javascript
"SSE not connected, using fallback polling"
"fallback polling"
```

**✅ Good:** No results found

**❌ Bad:** You see these messages every 30 seconds

---

### **Method 3: Visual Indicator Check**

**On Cashier Dashboard (`/dashboard/orders/live`):**

Look at the top-right corner metrics card:

**✅ Good (SSE Active):**
```
Last Updated: 10:23:45
[●] Live  ← Green pulsing dot
```

**❌ Bad (Polling):**
```
Last Updated: 10:23:45
[●] Offline  ← Red dot
```

---

## **Test 5: Verify Event Filtering**

This ensures users only see events for their restaurant.

### **Setup:**

1. **Create two restaurant staff accounts** (if not exists)
2. **Open two browsers/incognito windows**
3. **Login each to different restaurant**

### **Test:**

1. Place order in Restaurant A
2. Check if Restaurant B staff sees it (they shouldn't)

**Expected:**
- Restaurant A staff: ✅ Sees order
- Restaurant B staff: ❌ Does NOT see order

**Server Console Should Show:**
```bash
[SSE] Event filtered out for connection user456: {
  reason: 'Permission check failed',
  eventRestaurantId: 'restaurant-a-id',
  userRestaurantId: 'restaurant-b-id'
}
```

---

## **Test 6: Verify pgPubSub Initialization**

Check that PostgreSQL pub/sub initializes on server startup (NOT on first SSE connection).

### **Steps:**

1. **Restart server:**
   ```bash
   # Stop server
   pkill -f "npm run dev"

   # Clear cache
   rm -rf .next

   # Start fresh
   PORT=3000 npm run dev
   ```

2. **Watch server console IMMEDIATELY after start:**

### **Expected Output (within 5 seconds of startup):**

```bash
🚀 [Server Startup] Initializing PostgreSQL pub/sub...
✅ PostgreSQL LISTEN client connected
✅ PostgreSQL NOTIFY client connected
🔔 Subscribed to channel: order_status_changed
🔔 Subscribed to channel: order_created
🔔 Subscribed to channel: order_item_status_changed
🔔 Subscribed to channel: kitchen_notification
🔔 Subscribed to channel: restaurant_notification
✅ [Server Startup] PostgreSQL pub/sub initialized successfully
📡 [Server Startup] Listening for real-time events: {
  channels: [...],
  connected: true
}
```

**✅ Good:** You see these messages BEFORE any page loads

**❌ Bad:** These messages only appear when someone first opens `/dashboard/orders/live`

---

## **Test 7: Load Test - Multiple Connections**

Test that SSE handles multiple simultaneous connections.

### **Steps:**

1. **Open 5+ browser tabs:**
   - 2x Cashier Dashboard
   - 2x Kitchen Display
   - 1x Admin Dashboard

2. **Check server console:**

### **Expected:**

```bash
[SSE] New connection established: {
  connectionId: 'user123_1234567890',
  userId: 'user123',
  userType: 'staff',
  restaurantId: 'rest-id',
  totalConnections: 1
}
[SSE] New connection established: {
  connectionId: 'user123_1234567891',
  ...
  totalConnections: 2
}
...
[SSE] New connection established: {
  totalConnections: 5  ← Should reach 5
}
```

3. **Place one order:**
   - All 5 tabs should update simultaneously
   - Server should log 5 event deliveries:

```bash
[SSE] Event delivered to connection user123_1234567890
[SSE] Event delivered to connection user123_1234567891
[SSE] Event delivered to connection user456_1234567890
... (5 times)
```

---

## **Test 8: Reconnection Test**

Test that SSE automatically reconnects if disconnected.

### **Steps:**

1. **Open Cashier Dashboard with DevTools**
2. **Simulate network interruption:**
   - Chrome: DevTools → Network → Throttling → Offline
   - Wait 3 seconds
   - Throttling → Online

### **Expected:**

**Browser Console:**
```javascript
[LiveOrderBoard] SSE connection error: ...
[LiveOrderBoard] SSE connection established  ← Auto-reconnects
```

**Network Tab:**
- New `/api/events/orders` request appears automatically
- Connection re-established

**✅ Good:** Auto-reconnects within 3-5 seconds

**❌ Bad:** Falls back to polling permanently

---

## **Troubleshooting Guide**

### **Problem: SSE connection not appearing in Network tab**

**Check:**
1. Filter is not hiding it (set to "All")
2. Page is fully loaded
3. User is authenticated (SSE requires auth)

**Solution:**
```bash
# Check server logs for auth errors
tail -f <server-output> | grep SSE
```

---

### **Problem: "NOTIFY client not available" in server logs**

**Cause:** pgPubSub not initialized

**Solution:**
1. Ensure `instrumentation.ts` exists
2. Ensure `next.config.ts` has `instrumentationHook: true`
3. Clear `.next` cache and restart

---

### **Problem: Events not reaching clients**

**Check:**
1. PostgreSQL NOTIFY is being sent (server logs should show "Event published")
2. SSE connection is active (Network tab)
3. Event filtering isn't blocking it (server logs show "Event delivered")

**Debug:**
```javascript
// In browser console, manually test SSE:
const es = new EventSource('/api/events/orders');
es.onmessage = (e) => console.log('Received:', JSON.parse(e.data));
es.onerror = (e) => console.error('Error:', e);
```

---

## **Quick Verification Checklist**

Run through this checklist in 2 minutes:

- [ ] Server startup shows pgPubSub initialization (✅ PostgreSQL LISTEN client connected)
- [ ] Network tab shows `/api/events/orders` with type `eventsource`
- [ ] Connection stays open (doesn't complete)
- [ ] Green "Live" indicator visible in UI
- [ ] Browser console shows "SSE connection established"
- [ ] No "fallback polling" messages in console
- [ ] When order is placed, update appears within 1 second
- [ ] Server logs show "Event published successfully"
- [ ] Server logs show "Event delivered to connection"
- [ ] Multiple tabs all receive same event

**All checked?** ✅ SSE is working perfectly!

**Any unchecked?** ❌ Check troubleshooting section above.

---

## **Performance Comparison**

### **Before (Polling):**
- Network requests: 120 requests/hour (1 every 30s)
- Update latency: 0-30 seconds
- Server load: High (constant queries)
- Battery impact: High (constant fetch)

### **After (SSE):**
- Network requests: 1 connection (stays open)
- Update latency: <1 second
- Server load: Low (push only on events)
- Battery impact: Low (passive listening)

---

**Need help?** Check server console and browser console for detailed logs with `[PubSub]`, `[SSE]`, `[LiveOrderBoard]`, and `[KitchenDisplay]` prefixes.
