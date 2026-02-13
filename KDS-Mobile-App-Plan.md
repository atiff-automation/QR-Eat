# KDS Mobile App — Detailed Implementation Plan

> Android app (Expo React Native) for kitchen display + auto-print to 58mm Bluetooth thermal printer.
> One phone = one station = one printer.

---

## Table of Contents

- [Backend Changes (QR-Eat)](#1-backend-changes-qr-eat)
- [Mobile App Project Setup](#2-mobile-app-project-setup)
- [Phase 1: Core Loop](#3-phase-1--core-loop)
- [Phase 2: Bluetooth Printing](#4-phase-2--bluetooth-printing)
- [Phase 3: Polish & Production](#5-phase-3--polish--production)
- [API Reference](#6-api-reference)
- [Receipt Format Spec](#7-receipt-format-spec)
- [Testing Checklist](#8-testing-checklist)

---

## 1. Backend Changes (QR-Eat)

Minimal changes to the existing Next.js backend. No new endpoints — just add token query param support to 3 existing routes + expose JWT in login response.

### 1.1 Expose JWT in Login Response

**File:** `src/app/api/auth/rbac-login/route.ts`

Currently the raw JWT is only set as an httpOnly cookie (line ~191). The mobile app can't read httpOnly cookies, so we need to also return the token in the response body.

**Change:** Add `token` and `refreshToken` to the response JSON:
```typescript
const responseData = {
  // ...existing fields...
  token,              // ← ADD: raw JWT access token
  refreshToken: refreshTokenResult.token,  // ← ADD: raw refresh token
};
```

**Why:** Mobile app stores tokens in AsyncStorage and passes them explicitly via query params / headers.

### 1.2 Add `?token=` Support to SSE Endpoint

**File:** `src/app/api/events/orders/route.ts`

Currently auth uses `getTenantContext(request)` which reads middleware-injected headers (from cookie validation). Mobile SSE (`EventSource`) can't send custom headers or cookies.

**Change:** Before calling `getTenantContext`, check for `?token=` query param and validate it manually:
```typescript
const url = new URL(request.url);
const tokenParam = url.searchParams.get('token');

let context;
if (tokenParam) {
  // Mobile path: validate token directly
  const authResult = await AuthServiceV2.validateToken(tokenParam);
  context = {
    userId: authResult.user.id,
    userType: authResult.user.currentRole.userType,
    restaurantId: authResult.user.currentRole.restaurantId,
    // ...map remaining fields
  };
} else {
  // Web path: existing cookie-based auth
  context = await getTenantContext(request);
}
requireAuth(context);
```

Also accept `?since=` (already supported) for catchup on reconnect.

### 1.3 Add `?token=` Support to Kitchen Orders API

**File:** `src/app/api/kitchen/orders/route.ts`

Currently extracts token from cookies only (line ~9-11).

**Change:** Add query param fallback:
```typescript
const url = new URL(request.url);
const token =
  url.searchParams.get('token') ||
  request.cookies.get('qr_rbac_token')?.value ||
  request.cookies.get('qr_auth_token')?.value;
```

### 1.4 Add `?token=` Support to Kitchen Item Status API

**File:** `src/app/api/kitchen/items/[id]/status/route.ts`

Same pattern as above — add query param fallback for token extraction.

### 1.5 Add `?token=` Support to Kitchen Categories API

**File:** `src/app/api/kitchen/categories/route.ts`

Same pattern — add query param fallback.

### 1.6 Add `?token=` Support to Staff Preferences API

**File:** `src/app/api/staff/preferences/route.ts`

Same pattern for both GET and PATCH handlers.

### 1.7 Add Token Refresh Support for Mobile

**File:** `src/app/api/auth/refresh/route.ts`

Currently reads refresh token from cookie only. Add support for request body:
```typescript
const refreshToken =
  body?.refreshToken ||  // ← Mobile path
  request.cookies.get('qr_refresh_token')?.value;  // ← Web path
```

And return new tokens in response body (same as login change).

### Backend TODO

- [ ] **B1.** Add `token` + `refreshToken` to login response body (`rbac-login/route.ts`)
- [ ] **B2.** Add `?token=` query param support to SSE endpoint (`events/orders/route.ts`)
- [ ] **B3.** Add `?token=` query param support to kitchen orders (`kitchen/orders/route.ts`)
- [ ] **B4.** Add `?token=` query param support to item status update (`kitchen/items/[id]/status/route.ts`)
- [ ] **B5.** Add `?token=` query param support to kitchen categories (`kitchen/categories/route.ts`)
- [ ] **B6.** Add `?token=` query param support to staff preferences (`staff/preferences/route.ts`)
- [ ] **B7.** Add body-based refresh token support (`auth/refresh/route.ts`) + return tokens in body
- [ ] **B8.** Test all endpoints with token query param using curl/Postman

---

## 2. Mobile App Project Setup

### 2.1 Initialize Project

```bash
# Outside the QR-Eat directory
npx create-expo-app qr-eat-kds --template blank-typescript
cd qr-eat-kds
```

### 2.2 Install Dependencies

```bash
# Core
npx expo install expo-router expo-linking expo-constants expo-status-bar

# State management + storage
npm install zustand
npx expo install @react-native-async-storage/async-storage

# SSE
npm install react-native-sse

# Bluetooth printing (requires dev build)
npm install react-native-bluetooth-escpos-printer

# Background service
npx expo install expo-task-manager expo-notifications

# UI
npm install react-native-safe-area-context react-native-screens
```

### 2.3 Dev Build Setup

```bash
npx expo prebuild --platform android
npx expo run:android  # Builds custom dev APK with native modules
```

### 2.4 Android Permissions (`app.json`)

```json
{
  "expo": {
    "android": {
      "permissions": [
        "BLUETOOTH",
        "BLUETOOTH_ADMIN",
        "BLUETOOTH_CONNECT",
        "BLUETOOTH_SCAN",
        "ACCESS_FINE_LOCATION",
        "FOREGROUND_SERVICE",
        "WAKE_LOCK",
        "RECEIVE_BOOT_COMPLETED"
      ]
    }
  }
}
```

### 2.5 Project Structure

```
qr-eat-kds/
├── app/
│   ├── _layout.tsx                 # Root layout: providers (auth, SSE, printer)
│   ├── index.tsx                   # Login screen
│   ├── settings.tsx                # Printer pairing + station filter + config
│   └── kitchen/
│       └── index.tsx               # KDS board (main screen after login)
├── src/
│   ├── services/
│   │   ├── api-client.ts           # HTTP client with token injection
│   │   ├── auth-service.ts         # Login, token storage, refresh
│   │   ├── sse-service.ts          # SSE connection, reconnection, catchup
│   │   ├── print-service.ts        # Bluetooth connection, send queue
│   │   └── escpos-formatter.ts     # Order → ESC/POS byte commands
│   ├── stores/
│   │   ├── auth-store.ts           # User, tokens, login state
│   │   ├── order-store.ts          # Orders, filtering, status updates
│   │   ├── printer-store.ts        # BT connection state, paired device
│   │   └── settings-store.ts       # Server URL, paper size, auto-print toggle
│   ├── components/
│   │   ├── OrderCard.tsx           # Single order card (items, timer, actions)
│   │   ├── OrderItemRow.tsx        # Single item row with status toggle
│   │   ├── StatusBadge.tsx         # CONFIRMED/PREPARING/READY badge
│   │   ├── PrinterStatus.tsx       # BT connection indicator
│   │   ├── ConnectionStatus.tsx    # SSE connection indicator
│   │   └── StationFilter.tsx       # Category filter chips
│   ├── hooks/
│   │   ├── useSSE.ts               # SSE hook with auto-reconnect
│   │   ├── usePollingFallback.ts   # Poll when SSE disconnected
│   │   └── useOrderAging.ts        # Timer for order age/priority
│   └── types/
│       └── index.ts                # All TypeScript interfaces
├── app.json
├── package.json
└── tsconfig.json
```

### Setup TODO

- [ ] **S1.** Create Expo project with TypeScript template
- [ ] **S2.** Install all dependencies
- [ ] **S3.** Configure `app.json` with Android permissions
- [ ] **S4.** Run `expo prebuild` and verify dev build works on device
- [ ] **S5.** Set up project folder structure
- [ ] **S6.** Configure Expo Router

---

## 3. Phase 1 — Core Loop

> Goal: Login → SSE → display orders → filter by station → sound alert. No printing yet.

### 3.1 TypeScript Types (`src/types/index.ts`)

Define types matching the existing API responses:

```typescript
interface KitchenOrder {
  id: string;
  orderNumber: string;
  dailySeq: number | null;
  status: 'CONFIRMED' | 'PREPARING' | 'READY';
  totalAmount: number;
  specialInstructions: string | null;
  createdAt: string;
  confirmedAt: string | null;
  estimatedReadyTime: string | null;
  table: {
    id: string;
    tableNumber: string;
    tableName: string | null;
    locationDescription: string | null;
  };
  customerSession: {
    customerName: string | null;
  };
  items: KitchenOrderItem[];
}

interface KitchenOrderItem {
  id: string;
  quantity: number;
  status: 'PENDING' | 'PREPARING' | 'READY' | 'SERVED' | 'CANCELLED';
  specialInstructions: string | null;
  menuItem: {
    name: string;
    price: number;
    preparationTime: number;
    categoryId: string;
  };
  selectedOptions: {
    id: string;
    name: string;
    priceModifier: number;
  }[];
}

interface Category {
  id: string;
  name: string;
}

interface AuthUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  currentRole: {
    restaurantId: string;
    roleTemplate: string;
    userType: string;
  };
  permissions: string[];
}

interface SSEEvent {
  type: string;
  data: Record<string, unknown>;
  timestamp: number;
}
```

### 3.2 Auth Service (`src/services/auth-service.ts`)

- `login(serverUrl, email, password)` → POST `/api/auth/rbac-login`
- Store `token`, `refreshToken`, `user` in AsyncStorage
- `getToken()` → return stored token
- `refreshToken()` → POST `/api/auth/refresh` with body `{ refreshToken }`
- `logout()` → clear AsyncStorage
- Auto-refresh: if API returns 401, attempt refresh, retry once

### 3.3 Auth Store (`src/stores/auth-store.ts`)

Zustand store:
```typescript
interface AuthState {
  user: AuthUser | null;
  token: string | null;
  refreshToken: string | null;
  serverUrl: string;          // e.g., "https://qr-eat.up.railway.app"
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (serverUrl: string, email: string, password: string) => Promise<void>;
  logout: () => void;
  restoreSession: () => Promise<void>;  // Check AsyncStorage on app start
}
```

### 3.4 API Client (`src/services/api-client.ts`)

Simple fetch wrapper that:
- Prepends `serverUrl` from auth store
- Appends `?token=<jwt>` to all requests
- Handles 401 → refresh → retry
- Returns typed JSON

### 3.5 Login Screen (`app/index.tsx`)

Simple form:
- Server URL input (saved to AsyncStorage, pre-filled next time)
- Email + password inputs
- Login button → calls `authStore.login()`
- On success → `router.replace('/kitchen')`
- On app start → `restoreSession()` → auto-navigate if valid token

### 3.6 SSE Service (`src/services/sse-service.ts`)

```typescript
class SSEService {
  private eventSource: EventSource | null;
  private lastEventTimestamp: number = 0;
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = 10;

  connect(serverUrl: string, token: string) {
    const url = `${serverUrl}/api/events/orders?token=${token}&since=${this.lastEventTimestamp}`;
    this.eventSource = new EventSource(url);

    this.eventSource.onmessage = (event) => {
      const data = JSON.parse(event.data);
      this.lastEventTimestamp = data.timestamp || Date.now();
      this.onEvent(data);
    };

    this.eventSource.onerror = () => {
      this.reconnectWithBackoff();
    };
  }

  reconnectWithBackoff() {
    // Exponential backoff: 1s, 2s, 4s, 8s... max 30s
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
    setTimeout(() => this.connect(...), delay);
    this.reconnectAttempts++;
  }

  disconnect() {
    this.eventSource?.close();
  }
}
```

Key behaviors:
- Reconnect with exponential backoff (1s → 2s → 4s → ... → 30s cap)
- Pass `?since=` on reconnect to catch missed events
- Reset reconnect counter on successful connection
- Track `lastEventTimestamp` for catchup

### 3.7 Polling Fallback (`src/hooks/usePollingFallback.ts`)

- Only active when SSE is disconnected (same pattern as web KDS)
- Polls `GET /api/kitchen/orders?token=<jwt>` every 10 seconds
- Replaces full order list on each poll
- Disabled when SSE reconnects

### 3.8 Order Store (`src/stores/order-store.ts`)

```typescript
interface OrderState {
  orders: KitchenOrder[];
  selectedCategories: string[];  // kdsCategories from user preferences
  availableCategories: Category[];

  // Computed
  filteredOrders: () => KitchenOrder[];  // Orders filtered by selectedCategories
  groupedOrders: () => {
    confirmed: KitchenOrder[];
    preparing: KitchenOrder[];
    ready: KitchenOrder[];
  };

  // Actions
  setOrders: (orders: KitchenOrder[]) => void;
  handleSSEEvent: (event: SSEEvent) => void;
  updateItemStatus: (itemId: string, status: string) => Promise<void>;
  fetchOrders: () => Promise<void>;
  fetchCategories: () => Promise<void>;
  loadPreferences: () => Promise<void>;
  toggleCategory: (categoryId: string) => void;
}
```

Filtering logic (matches web KDS exactly):
```typescript
filteredOrders: () => {
  const { orders, selectedCategories } = get();
  if (selectedCategories.length === 0) return orders; // Show all if none selected

  return orders
    .map(order => ({
      ...order,
      items: order.items.filter(item =>
        selectedCategories.includes(item.menuItem.categoryId)
      ),
    }))
    .filter(order => order.items.length > 0); // Remove empty orders
}
```

SSE event handling (matches web KDS):
```typescript
handleSSEEvent: (event) => {
  switch (event.type) {
    case 'order_created':
      // Fetch full order list (simplest, avoids partial data issues)
      get().fetchOrders();
      break;
    case 'order_status_changed':
      // Update order status in place
      set(state => ({
        orders: state.orders.map(o =>
          o.id === event.data.orderId ? { ...o, status: event.data.newStatus } : o
        ),
      }));
      break;
    case 'order_item_status_changed':
      // Update item status in place
      set(state => ({
        orders: state.orders.map(o =>
          o.id === event.data.orderId
            ? {
                ...o,
                items: o.items.map(i =>
                  i.id === event.data.itemId ? { ...i, status: event.data.newStatus } : i
                ),
              }
            : o
        ),
      }));
      break;
  }
}
```

### 3.9 KDS Board Screen (`app/kitchen/index.tsx`)

Main screen layout (vertical on phone):

```
┌─────────────────────────┐
│ [SSE ●] Station: Drinks │  ← Header: connection status + station name
│ [🔊]  [⚙️ Settings]     │  ← Sound toggle + settings link
├─────────────────────────┤
│ [All] [Drinks] [Food]   │  ← Category filter chips (scrollable)
├─────────────────────────┤
│ ┌─────────────────────┐ │
│ │ #001   Table: A5     │ │  ← Order card
│ │ 3 min ago  🟢       │ │  ← Age timer + priority color
│ │─────────────────────│ │
│ │ ✅ 2x Nasi Lemak    │ │  ← Tap item to toggle status
│ │    + Extra Sambal    │ │
│ │    >> Less spicy     │ │
│ │ ⏳ 1x Teh Tarik     │ │
│ │    + Kurang Manis    │ │
│ │─────────────────────│ │
│ │ [DONE] [🖨️ Print]   │ │  ← Bulk done + manual print
│ └─────────────────────┘ │
│                         │
│ ┌─────────────────────┐ │
│ │ #002   Table: B2     │ │  ← Next order card
│ │ ...                  │ │
│ └─────────────────────┘ │
└─────────────────────────┘
```

Features:
- **ScrollView** with order cards sorted oldest-first
- **Category filter chips** at top (from `availableCategories`)
- **Order card** shows: order number (dailySeq), table, age timer, items
- **Tap item** → toggle PREPARING ↔ READY (calls `PATCH /kitchen/items/{id}/status`)
- **DONE button** → mark all items READY
- **Print button** → manually trigger print for this order
- **Age timer** updates every 30s, color-coded:
  - Green: under estimated prep time
  - Orange: over estimated prep time
  - Red: over estimated + 10 min
- **Sound alert** on new `order_created` event (loud beep, configurable)

### 3.10 Order Card Component (`src/components/OrderCard.tsx`)

- Displays order header: `#{dailySeq}` + table number/name
- Age timer with priority color (green/orange/red)
- List of items with status icons (⏳ PENDING, 🔄 PREPARING, ✅ READY)
- Each item shows: quantity, name, selected options (indented), special instructions
- Order-level special instructions in highlighted box
- Footer: DONE button + Print button

### 3.11 Tap-to-Update Item Status

Matches web KDS behavior exactly:
- Tap item → if not READY, mark as READY
- Tap item → if READY, mark back as PREPARING (undo)
- Optimistic UI update (change immediately, revert on API error)
- API: `PATCH /api/kitchen/items/{itemId}/status?token=<jwt>` with body `{ status }`
- Backend auto-updates order to READY when all items are READY

### 3.12 Sound Alert

- Play a loud alert sound when `order_created` SSE event received
- Use `expo-av` for audio playback
- Include a default alert sound file in the app assets
- Toggle in header to mute/unmute
- Sound setting persisted in AsyncStorage

### 3.13 Foreground Service

Critical for kitchen use — app must stay alive when screen is off.

- Use `expo-task-manager` to register a foreground service
- Shows persistent notification: "KDS Active — Connected to [restaurant]"
- Keeps SSE connection alive in background
- Re-establishes SSE if Android kills the connection

### Phase 1 TODO

- [ ] **P1.1.** Define TypeScript types matching API responses
- [ ] **P1.2.** Build auth service (login, token storage, refresh, logout)
- [ ] **P1.3.** Build auth Zustand store
- [ ] **P1.4.** Build API client with token injection
- [ ] **P1.5.** Build login screen (server URL + email + password)
- [ ] **P1.6.** Build SSE service with reconnection + `?since=` catchup
- [ ] **P1.7.** Build polling fallback hook (active only when SSE disconnected)
- [ ] **P1.8.** Build order Zustand store (orders, filtering, SSE event handling)
- [ ] **P1.9.** Fetch categories + load user kdsCategories preferences
- [ ] **P1.10.** Build KDS board screen with order cards
- [ ] **P1.11.** Build OrderCard component (header, items, options, instructions)
- [ ] **P1.12.** Implement tap-to-update item status (optimistic UI + API call)
- [ ] **P1.13.** Implement DONE button (mark all items READY)
- [ ] **P1.14.** Implement category filter chips UI
- [ ] **P1.15.** Implement order aging timer with priority colors
- [ ] **P1.16.** Implement sound alert on new order
- [ ] **P1.17.** Implement foreground service to keep SSE alive
- [ ] **P1.18.** Test end-to-end: login → SSE → display → filter → tap status

---

## 4. Phase 2 — Bluetooth Printing

> Goal: Pair printer → auto-print filtered orders → print queue with retry.

### 4.1 Printer Store (`src/stores/printer-store.ts`)

```typescript
interface PrinterState {
  pairedDevice: BluetoothDevice | null;  // Last paired printer
  isConnected: boolean;
  isConnecting: boolean;
  availableDevices: BluetoothDevice[];

  // Actions
  scanDevices: () => Promise<void>;
  connectToDevice: (address: string) => Promise<void>;
  disconnect: () => void;
  autoReconnect: () => Promise<void>;  // Reconnect to last paired on app start
}
```

### 4.2 Settings Store (`src/stores/settings-store.ts`)

```typescript
interface SettingsState {
  autoPrint: boolean;           // Auto-print on new filtered order
  paperWidth: '58mm' | '80mm'; // Default 58mm
  soundEnabled: boolean;
  serverUrl: string;

  // Computed
  charsPerLine: () => number;   // 32 for 58mm, 48 for 80mm
}
```

All settings persisted to AsyncStorage.

### 4.3 ESC/POS Formatter (`src/services/escpos-formatter.ts`)

Converts a filtered `KitchenOrder` into ESC/POS byte commands.

```typescript
function formatKitchenReceipt(
  order: KitchenOrder,
  stationName: string,
  charsPerLine: number  // 32 or 48
): Uint8Array {
  // Uses standard ESC/POS commands only (generic, works with any printer)
  // Commands: text align, text size, bold, line feed, cut
}
```

Receipt format (32 chars for 58mm):
```
================================
     ** KITCHEN ORDER **
================================
#001              Table: A5
                  Corner Table
12/02/2026             14:30
--------------------------------

2x Nasi Lemak
   + Extra Sambal
   + Telur Mata
   >> Less spicy please

1x Teh Tarik
   + Kurang Manis

>> ORDER NOTE: Birthday party
================================
     STATION: DRINKS
================================

[auto-cut]
```

Design decisions:
- `dailySeq` for order number (not UUID-based orderNumber)
- Table number + table name (if available)
- No prices — kitchen doesn't need them
- Item options indented with `+`
- Item special instructions with `>>`
- Order-level special instructions labeled `>> ORDER NOTE:`
- Station name at bottom for routing clarity
- Standard ESC/POS commands only (no printer-specific codes)

### 4.4 Print Service (`src/services/print-service.ts`)

```typescript
interface PrintJob {
  id: string;
  orderId: string;
  orderNumber: string;
  data: Uint8Array;          // ESC/POS formatted bytes
  status: 'pending' | 'printing' | 'completed' | 'failed';
  attempts: number;
  createdAt: number;
  lastAttemptAt: number | null;
  error: string | null;
}

class PrintService {
  private queue: PrintJob[] = [];
  private isProcessing: boolean = false;

  enqueue(job: PrintJob): void;          // Add to queue
  processQueue(): Promise<void>;         // Process next pending job
  retryFailed(): Promise<void>;          // Retry all failed jobs
  sendToPrinter(data: Uint8Array): Promise<void>;  // BT send

  // Queue persisted to AsyncStorage
  persistQueue(): Promise<void>;
  restoreQueue(): Promise<void>;         // Called on app start
}
```

Queue behavior:
- New job → added to queue as `pending`
- `processQueue()` runs continuously while there are pending jobs
- On BT send success → mark `completed`
- On BT send failure → retry up to 3 times with 5s delay
- After 3 failures → mark `failed`, visible in UI for manual retry
- Printer disconnects → jobs stay `pending`, auto-process when reconnected
- Queue persisted to AsyncStorage → survives app restart

### 4.5 Auto-Print Flow

When a new `order_created` SSE event arrives:
1. `fetchOrders()` to get full order data
2. Filter items by user's `kdsCategories`
3. If matching items exist AND `autoPrint` is ON:
   - Format receipt with `escpos-formatter`
   - Enqueue print job
   - `processQueue()` sends to printer
4. If no matching items → skip (don't print)
5. If printer disconnected → job queues, prints when reconnected

### 4.6 Settings Screen (`app/settings.tsx`)

```
┌─────────────────────────┐
│ ← Back     Settings     │
├─────────────────────────┤
│                         │
│ PRINTER                 │
│ ┌─────────────────────┐ │
│ │ Status: Connected ● │ │
│ │ Device: JK-5802P    │ │
│ │ [Disconnect]        │ │
│ └─────────────────────┘ │
│ [Scan for Printers]     │
│  • JK-5802P  [Connect]  │
│  • POS-58    [Connect]  │
│                         │
│ PAPER SIZE              │
│ (●) 58mm (32 chars)     │
│ ( ) 80mm (48 chars)     │
│                         │
│ [Print Test Receipt]    │
│                         │
│ AUTO-PRINT              │
│ [Toggle: ON ●]          │
│                         │
│ STATION FILTER          │
│ ┌─────────────────────┐ │
│ │ ☑ Drinks            │ │
│ │ ☑ Desserts          │ │
│ │ ☐ Main Course       │ │
│ │ ☐ Appetizers        │ │
│ └─────────────────────┘ │
│ [Select All] [Clear]    │
│                         │
│ PRINT QUEUE             │
│ 0 pending, 2 failed     │
│ [Retry Failed]          │
│                         │
│ SERVER                  │
│ https://qr-eat.up...    │
│                         │
│ [Logout]                │
└─────────────────────────┘
```

### 4.7 Manual Print / Reprint

- Each order card has a 🖨️ Print button
- Tap → format + enqueue immediately (regardless of auto-print setting)
- Useful for reprinting or printing orders that arrived while printer was off

### Phase 2 TODO

- [ ] **P2.1.** Build printer Zustand store (scan, connect, disconnect, auto-reconnect)
- [ ] **P2.2.** Build settings Zustand store (auto-print, paper width, sound)
- [ ] **P2.3.** Build ESC/POS formatter for kitchen receipt
- [ ] **P2.4.** Build print service with queue, retry, and AsyncStorage persistence
- [ ] **P2.5.** Implement auto-print flow (SSE → filter → format → enqueue → send)
- [ ] **P2.6.** Build settings screen (printer pairing, paper size, station filter, queue status)
- [ ] **P2.7.** Add manual print/reprint button to order cards
- [ ] **P2.8.** Implement print test receipt function
- [ ] **P2.9.** Test: pair printer → place order → verify auto-print
- [ ] **P2.10.** Test: disconnect printer → place orders → reconnect → verify queued orders print
- [ ] **P2.11.** Test: 58mm and 80mm paper width formatting

---

## 5. Phase 3 — Polish & Production

> Goal: Reliability, edge cases, release build.

### 5.1 Robust Token Refresh

- Access token expires in 30 minutes
- Before each API call, check if token is near expiry (< 5 min)
- If near expiry → refresh automatically using refresh token
- If refresh fails (14-day token expired) → redirect to login screen
- SSE reconnect also refreshes token first

### 5.2 Offline Resilience

- Orders in Zustand store are also cached to AsyncStorage
- On app start → load cached orders immediately (instant display)
- Then fetch fresh orders from API (replace cache)
- If API unreachable → show cached orders with "Offline" banner
- Print queue works offline → queued jobs print when connection returns

### 5.3 Error Handling & Edge Cases

- SSE connection fails → exponential backoff reconnect + polling fallback
- BT connection drops mid-print → mark job as failed, retry when reconnected
- App killed by Android → foreground service restarts, restores SSE + print queue
- Server unreachable → show offline banner, cached data still visible
- Token expired during SSE → reconnect with fresh token

### 5.4 Notification Improvements

- Foreground notification shows: "KDS Active — 3 orders pending"
- Update notification count when orders change
- Vibration pattern on new order (configurable)

### 5.5 Release Build

```bash
# Install EAS CLI
npm install -g eas-cli

# Configure
eas build:configure

# Build release APK
eas build --platform android --profile production
```

### Phase 3 TODO

- [ ] **P3.1.** Implement proactive token refresh (before expiry)
- [ ] **P3.2.** Implement offline order caching (AsyncStorage)
- [ ] **P3.3.** Add "Offline" banner when server unreachable
- [ ] **P3.4.** Handle app restart: restore SSE + print queue + cached orders
- [ ] **P3.5.** Improve foreground notification (show pending order count)
- [ ] **P3.6.** Add vibration on new order (configurable)
- [ ] **P3.7.** End-to-end testing in real kitchen environment
- [ ] **P3.8.** Build release APK with EAS Build
- [ ] **P3.9.** Install on kitchen device and verify production behavior

---

## 6. API Reference

All endpoints used by the mobile app. Token passed via `?token=<jwt>` query param.

| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/api/auth/rbac-login` | Login → returns JWT + user + preferences |
| POST | `/api/auth/refresh` | Refresh access token (body: `{ refreshToken }`) |
| GET | `/api/events/orders?token=&since=` | SSE stream for real-time order events |
| GET | `/api/kitchen/orders?token=` | Fetch active orders (CONFIRMED, PREPARING, READY) |
| PATCH | `/api/kitchen/items/{id}/status?token=` | Update item status (body: `{ status }`) |
| GET | `/api/kitchen/categories?token=` | Fetch available menu categories |
| GET | `/api/staff/preferences?token=` | Fetch user preferences (kdsCategories) |
| PATCH | `/api/staff/preferences?token=` | Save user preferences |

### SSE Event Types

| Event | Trigger | Action |
|-------|---------|--------|
| `connection` | SSE connected | Update connection indicator |
| `order_created` | New order placed | Refresh orders + auto-print if filtered match |
| `order_status_changed` | Order status updated | Update order in list |
| `order_item_status_changed` | Item status toggled | Update item in order |
| `kitchen_notification` | Kitchen alert | Display toast |

### Key Response Shapes

**Login response** — see `AuthUser` type in Section 3.1

**Kitchen orders** — `{ success: true, orders: KitchenOrder[] }`

**Categories** — `{ success: true, categories: { id: string, name: string }[] }`

**Preferences** — `{ success: true, preferences: { kdsCategories: string[] } }`

---

## 7. Receipt Format Spec

### 58mm (32 chars per line)

```
================================
     ** KITCHEN ORDER **
================================
#001              Table: A5
                  Corner Table
12/02/2026             14:30
--------------------------------

2x Nasi Lemak
   + Extra Sambal
   + Telur Mata
   >> Less spicy please

1x Teh Tarik
   + Kurang Manis

>> ORDER NOTE: Birthday party
================================
     STATION: DRINKS
================================
```

### 80mm (48 chars per line)

```
================================================
            ** KITCHEN ORDER **
================================================
#001                              Table: A5
                                  Corner Table
12/02/2026                             14:30
------------------------------------------------

2x Nasi Lemak
   + Extra Sambal
   + Telur Mata
   >> Less spicy please

1x Teh Tarik
   + Kurang Manis

>> ORDER NOTE: Birthday party
================================================
            STATION: DRINKS
================================================
```

### ESC/POS Commands Used

| Command | Hex | Purpose |
|---------|-----|---------|
| Initialize | `1B 40` | Reset printer |
| Center align | `1B 61 01` | Center text |
| Left align | `1B 61 00` | Left align text |
| Bold on | `1B 45 01` | Bold text |
| Bold off | `1B 45 00` | Normal text |
| Double height | `1D 21 01` | Large text (order number) |
| Normal size | `1D 21 00` | Normal text |
| Line feed | `0A` | New line |
| Cut paper | `1D 56 42 00` | Full cut (with feed) |

All standard ESC/POS — works with JK-5802P and any ESC/POS compatible printer.

---

## 8. Testing Checklist

### Backend Tests
- [ ] Login returns token in response body
- [ ] SSE endpoint accepts `?token=` and streams events
- [ ] Kitchen orders API accepts `?token=`
- [ ] Item status update accepts `?token=`
- [ ] Categories and preferences APIs accept `?token=`
- [ ] Token refresh works with body `{ refreshToken }`

### Mobile App Tests
- [ ] **Login** → verify JWT received, preferences loaded, redirect to KDS
- [ ] **SSE** → place order from customer QR → verify order appears in app < 2s
- [ ] **Filter** → set filter to "Drinks" → verify only drink items shown
- [ ] **Tap status** → tap item → verify status toggles PREPARING ↔ READY
- [ ] **DONE button** → verify all items marked READY, order status auto-updates
- [ ] **Sound** → new order → verify alert sound plays
- [ ] **Mute** → toggle sound off → verify silence on new order
- [ ] **Print** → verify 58mm receipt format on JK-5802P
- [ ] **Auto-print** → new filtered order → verify auto-print
- [ ] **Print filter** → order with mixed categories → verify only filtered items printed
- [ ] **Print queue** → disconnect printer → place order → reconnect → verify queued print
- [ ] **Reprint** → tap print button on existing order → verify reprint
- [ ] **Background** → lock screen → place order → verify it appears + prints
- [ ] **Reconnect** → kill SSE → verify reconnect + catchup with `?since=`
- [ ] **Token refresh** → wait 30+ min → verify auto-refresh, no re-login
- [ ] **Offline** → disable network → verify cached orders visible + offline banner
- [ ] **Multi-station** → 2 phones, different filters → verify each shows/prints only their items
- [ ] **80mm paper** → change setting → verify wider format prints correctly

---

## Summary

| Phase | Scope | Key Deliverable |
|-------|-------|-----------------|
| Backend | 7 small changes to existing routes | Token query param support |
| Phase 1 | Login + SSE + KDS display + filter + status updates + sound + foreground service | Working KDS app (no printing) |
| Phase 2 | Bluetooth pairing + ESC/POS + print queue + auto-print | Full KDS + printing |
| Phase 3 | Token refresh + offline + error handling + release APK | Production-ready app |
