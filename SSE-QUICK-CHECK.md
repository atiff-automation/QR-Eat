# SSE Quick Verification - 30 Second Check

## **Visual Checks (Browser)**

### **1. Open Cashier Dashboard**
Navigate to: `http://localhost:3000/dashboard/orders/live`

**Look for:**
```
┌─────────────────────────────────────────────┐
│  Last Updated: 10:30:45                     │
│  [●] Live  ← GREEN PULSING DOT = SSE ACTIVE │
└─────────────────────────────────────────────┘
```

**❌ If you see RED dot "Offline":** SSE failed, using polling fallback

---

### **2. Open Browser DevTools (F12)**

**Network Tab:**
```
Filter: All or EventSource

Name                   Type          Status    Time
────────────────────────────────────────────────────
/api/events/orders    eventsource    200      45.3s ← STAYS OPEN
```

**✅ GOOD:** Single long-running connection
**❌ BAD:** Multiple `/api/orders/live` requests completing

---

**Console Tab:**
```javascript
[LiveOrderBoard] SSE connection established  ✅
[LiveOrderBoard] Real-time update received   ✅
```

**❌ BAD if you see:**
```javascript
[LiveOrderBoard] SSE not connected, using fallback polling  ❌
```

---

## **Server Checks**

**Terminal showing `npm run dev` output:**

**On startup (within 5 seconds):**
```bash
✅ PostgreSQL LISTEN client connected
✅ PostgreSQL NOTIFY client connected
🔔 Subscribed to channel: order_status_changed
🔔 Subscribed to channel: order_created
✅ [Server Startup] PostgreSQL pub/sub initialized successfully
```

**When order is placed/updated:**
```bash
📢 [PubSub] Event published successfully
[SSE] Event delivered to connection user123_xxx
```

---

## **Live Test (30 seconds)**

1. **Open 2 windows:**
   - Window 1: `/dashboard/orders/live` (cashier)
   - Window 2: `/kitchen` (kitchen)

2. **Place a test order** (via QR or API)

3. **Check timing:**
   - Cashier sees order: **< 1 second** ✅
   - Approve order in cashier
   - Kitchen sees update: **< 1 second** ✅

**❌ If updates take 15-30 seconds:** Polling fallback is active!

---

## **Common Issues & Fixes**

| Issue | Cause | Fix |
|-------|-------|-----|
| Red "Offline" indicator | SSE connection failed | Check browser console for errors |
| No events received | Event filtering or auth issue | Check server logs for "Event filtered out" |
| "NOTIFY client not available" | pgPubSub not initialized | Restart server, check instrumentation.ts |
| Multiple `/api/orders/live` requests | Polling fallback active | Check SSE connection, restart server |

---

## **One-Line Verification**

**Open Browser Console and run:**
```javascript
new EventSource('/api/events/orders').onmessage = e => console.log('✅ SSE WORKS:', JSON.parse(e.data))
```

**Expected within 30 seconds:**
```javascript
✅ SSE WORKS: {type: "connection", data: {...}}
: ping  ← Keep-alive
```

**If no output:** SSE is broken

---

## **Quick Troubleshooting**

**SSE not connecting:**
```bash
# 1. Restart server with clean cache
pkill -f "npm run dev"
rm -rf .next
PORT=3000 npm run dev

# 2. Check instrumentation loaded
# Should see "PostgreSQL pub/sub initialized" on startup
```

**Events not delivering:**
```bash
# Check if events are being published
tail -f <server-log> | grep "Event published"

# Check if events are being delivered
tail -f <server-log> | grep "Event delivered"
```

---

**Full testing guide:** See `TESTING-SSE.md`
