# POS System Implementation TODO List

**Project:** QR Restaurant System - Point of Sale Interface
**Date:** 2025-12-11
**Status:** Ready for Implementation
**Based On:** POS_IMPLEMENTATION_PLAN.md

---

## Executive Summary

### Codebase Readiness Assessment: ✅ EXCELLENT FOUNDATION

The codebase has a **strong foundation** for POS implementation:

✅ **Existing Infrastructure:**
- Complete RBAC authentication system (AuthServiceV2)
- PostgreSQL NOTIFY/LISTEN for real-time events
- Comprehensive order management system
- Payment model exists (needs POS-specific fields)
- Type-safe architecture with Zod validation
- All required dependencies installed

❌ **Missing Components (To Build):**
- POS-specific database fields
- POS API endpoints
- POS frontend components
- Payment processing service
- Receipt generation system

**Estimated Implementation Time:** 2-3 weeks for Phase 1 MVP

---

## Phase 1: Foundation (Week 1) - DATABASE & API

### 1.1 Database Schema Updates ⚡ CRITICAL

**File:** `prisma/schema.prisma` (lines 622-645)

**Current State:**
```prisma
model Payment {
  id                    String    @id @default(uuid())
  orderId               String
  paymentMethod         String
  paymentProcessor      String?
  amount                Decimal   @db.Decimal(10, 2)
  processingFee         Decimal   @default(0.00) @db.Decimal(10, 2)
  netAmount             Decimal   @db.Decimal(10, 2)
  status                String    @default("pending")
  externalPaymentId     String?
  externalTransactionId String?
  paymentMetadata       Json      @default("{}")
  failureReason         String?
  refundReason          String?
  createdAt             DateTime  @default(now())
  processedAt           DateTime?
  completedAt           DateTime?
  failedAt              DateTime?
  updatedAt             DateTime  @updatedAt

  order Order @relation(fields: [orderId], references: [id], onDelete: Cascade)

  @@map("payments")
}
```

**Required Changes:**
```prisma
model Payment {
  // ... existing fields ...

  // NEW FIELDS FOR POS
  processedBy           String?   // Staff ID who processed payment
  cashReceived          Decimal?  @db.Decimal(10, 2)  // For cash payments
  changeGiven           Decimal?  @db.Decimal(10, 2)  // For cash payments
  receiptNumber         String?   @unique             // Unique receipt identifier

  // ... rest of existing fields ...

  // NEW RELATION
  processedByStaff Staff? @relation(fields: [processedBy], references: [id])

  // NEW INDEXES
  @@index([processedBy])
  @@index([receiptNumber])
}
```

**Tasks:**
- [ ] Update Payment model in schema.prisma
- [ ] Create migration: `npx prisma migrate dev --name add_pos_payment_fields`
- [ ] Run migration on development database
- [ ] Verify migration with `npx prisma studio`
- [ ] Update Prisma client: `npx prisma generate`

**Files to Create/Update:**
- `prisma/schema.prisma` (update)
- `prisma/migrations/YYYYMMDD_add_pos_payment_fields/migration.sql` (auto-generated)

---

### 1.2 Constants & Types 🔧 REQUIRED

**Task:** Create Single Source of Truth for payment constants

#### 1.2.1 Payment Constants

**File to Create:** `src/lib/constants/payment.ts`

```typescript
// SINGLE SOURCE OF TRUTH for payment-related constants
// Follows CLAUDE.md - No Hardcoding, SSOT principles

export const PAYMENT_METHODS = {
  CASH: 'cash',
  CARD: 'card',
  EWALLET: 'ewallet',
} as const;

export const PAYMENT_METHOD_LABELS: Record<string, string> = {
  [PAYMENT_METHODS.CASH]: 'Cash',
  [PAYMENT_METHODS.CARD]: 'Card',
  [PAYMENT_METHODS.EWALLET]: 'E-Wallet',
};

// Re-export from order-utils for consistency
export { PAYMENT_STATUS } from '@/lib/order-utils';

export type PaymentMethod = (typeof PAYMENT_METHODS)[keyof typeof PAYMENT_METHODS];
export type PaymentStatus = keyof typeof PAYMENT_STATUS;
```

**Tasks:**
- [ ] Create `src/lib/constants/payment.ts`
- [ ] Verify no hardcoded payment method strings in codebase

---

#### 1.2.2 POS Type Definitions

**File to Create:** `src/types/pos.ts`

```typescript
import type { Order, Payment, Table, MenuItem } from '@prisma/client';

export type PaymentMethod = 'cash' | 'card' | 'ewallet';

// Order with all required relations for POS display
export interface OrderWithDetails extends Order {
  table: Pick<Table, 'tableNumber' | 'tableName'>;
  customerSession: {
    customerName: string | null;
    customerPhone: string | null;
  } | null;
  items: {
    id: string;
    quantity: number;
    totalPrice: number;
    menuItem: Pick<MenuItem, 'name' | 'price'>;
  }[];
}

// Payment processing request
export interface PaymentProcessRequest {
  orderId: string;
  paymentMethod: PaymentMethod;
  cashReceived?: number;
  externalTransactionId?: string;
  notes?: string;
}

// Payment processing result
export interface PaymentProcessResult {
  success: boolean;
  payment: Payment;
  order: Pick<Order, 'id' | 'paymentStatus' | 'updatedAt'>;
  message: string;
}

// Receipt data
export interface ReceiptData {
  receiptNumber: string;
  order: OrderWithDetails;
  payment: Payment;
  restaurant: {
    name: string;
    address: string;
    phone: string;
    email: string;
  };
  cashier: {
    firstName: string;
    lastName: string;
  };
}
```

**Tasks:**
- [ ] Create `src/types/pos.ts`
- [ ] Verify type alignment with database schema

---

### 1.3 API Endpoints 🚀 CORE FUNCTIONALITY

#### 1.3.1 GET Pending Orders API

**File to Create:** `src/app/api/pos/orders/pending/route.ts`

**Purpose:** Fetch all orders with pending payment status for a restaurant

**Key Features:**
- AuthServiceV2 authentication
- Permission check: `payments:process` or `orders:read`
- Restaurant filtering
- Pagination support
- Status filtering

**Implementation Pattern (from existing `/api/orders/route.ts`):**
- Use `AuthServiceV2.validateToken()` for authentication
- Use Prisma with proper includes
- Return orders with table, customerSession, items relations

**Validation Schema:**
```typescript
const querySchema = z.object({
  restaurantId: z.string().uuid(),
  status: z.enum(['pending', 'all']).default('pending'),
  tableId: z.string().uuid().optional(),
  limit: z.coerce.number().min(1).max(100).default(50),
  offset: z.coerce.number().min(0).default(0),
});
```

**Tasks:**
- [ ] Create `src/app/api/pos/orders/pending/route.ts`
- [ ] Implement GET handler with AuthServiceV2
- [ ] Add RBAC permission check
- [ ] Add Zod validation for query parameters
- [ ] Test with Postman/curl
- [ ] Verify proper error handling

**Reference:** POS_IMPLEMENTATION_PLAN.md lines 680-866

---

#### 1.3.2 POST Process Payment API

**File to Create:** `src/app/api/pos/payment/[orderId]/route.ts`

**Purpose:** Process payment for an order (cash/card/e-wallet)

**Key Features:**
- AuthServiceV2 authentication
- Permission check: `payments:process`
- Transaction safety (Prisma transaction)
- Audit logging
- Real-time event publishing (PostgreSQL NOTIFY)

**Validation Schema:**
```typescript
const paymentSchema = z
  .object({
    paymentMethod: z.enum(['cash', 'card', 'ewallet']),
    cashReceived: z.number().positive().optional(),
    externalTransactionId: z.string().optional(),
    notes: z.string().max(500).optional(),
  })
  .refine(
    (data) => data.paymentMethod !== 'cash' || data.cashReceived !== undefined,
    {
      message: 'Cash payments must include cashReceived amount',
      path: ['cashReceived'],
    }
  );
```

**Key Steps:**
1. Authenticate & authorize
2. Validate request body with Zod
3. Fetch order & verify not already paid
4. Calculate amounts & validate cash received
5. Generate receipt number
6. Create payment & update order in transaction
7. Create audit log
8. Publish real-time event
9. Return response

**Tasks:**
- [ ] Create `src/app/api/pos/payment/[orderId]/route.ts`
- [ ] Implement POST handler with AuthServiceV2
- [ ] Add transaction-safe payment processing
- [ ] Implement receipt number generation
- [ ] Add audit logging
- [ ] Add PostgreSQL NOTIFY event
- [ ] Test all payment methods (cash, card, e-wallet)
- [ ] Test error cases (insufficient cash, already paid, etc.)

**Reference:** POS_IMPLEMENTATION_PLAN.md lines 870-1139

---

### 1.4 Business Logic & Services 🔧 CORE SERVICES

#### 1.4.1 Payment Service

**File to Create:** `src/lib/services/payment-service.ts`

**Purpose:** Business logic for payment processing

```typescript
import { PAYMENT_METHODS, PAYMENT_STATUS } from '@/lib/constants/payment';
import type { PaymentProcessRequest, PaymentProcessResult } from '@/types/pos';

export async function processPayment(
  data: PaymentProcessRequest
): Promise<PaymentProcessResult> {
  const response = await fetch(`/api/pos/payment/${data.orderId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      paymentMethod: data.paymentMethod,
      cashReceived: data.cashReceived,
      externalTransactionId: data.externalTransactionId,
      notes: data.notes,
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Payment processing failed');
  }

  return response.json();
}

export async function fetchPendingOrders(restaurantId: string) {
  const response = await fetch(
    `/api/pos/orders/pending?restaurantId=${restaurantId}&status=pending`,
    { headers: { 'Cache-Control': 'no-cache' } }
  );

  if (!response.ok) {
    throw new Error('Failed to fetch pending orders');
  }

  return response.json();
}
```

**Tasks:**
- [ ] Create `src/lib/services/payment-service.ts`
- [ ] Implement `processPayment()` function
- [ ] Implement `fetchPendingOrders()` function
- [ ] Add proper error handling
- [ ] Add TypeScript types

---

#### 1.4.2 Receipt Generation Utility

**File to Create:** `src/lib/utils/receipt-formatter.ts`

**Purpose:** Generate unique receipt numbers and format receipt data

```typescript
export function generateReceiptNumber(): string {
  const date = new Date();
  const dateStr = date.toISOString().split('T')[0].replace(/-/g, '');
  const timeStr = date.getTime().toString().slice(-6);
  const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
  return `RCP-${dateStr}-${timeStr}-${random}`;
}

export function formatReceiptData(receiptData: ReceiptData): string {
  // Format receipt for display/printing
  // Returns formatted text for receipt
}
```

**Tasks:**
- [ ] Create `src/lib/utils/receipt-formatter.ts`
- [ ] Implement `generateReceiptNumber()`
- [ ] Implement `formatReceiptData()`
- [ ] Test uniqueness of receipt numbers

---

#### 1.4.3 Real-time Event for Payment Completed

**File to Update:** `src/lib/postgres-pubsub.ts`

**Purpose:** Add payment_completed event to real-time system

```typescript
// Add to PG_EVENTS
export const PG_EVENTS = {
  // ... existing events ...
  PAYMENT_COMPLETED: 'payment_completed',
} as const;

// Add event interface
export interface PaymentCompletedEvent {
  paymentId: string;
  orderId: string;
  restaurantId: string;
  amount: number;
  paymentMethod: string;
  timestamp: number;
  processedBy: string;
}

// Add publisher method to PostgresEventManager
export class PostgresEventManager {
  // ... existing methods ...

  static async publishPaymentCompleted(
    event: PaymentCompletedEvent
  ): Promise<void> {
    try {
      await EventPersistenceService.storeEvent({
        eventType: PG_EVENTS.PAYMENT_COMPLETED,
        eventData: event,
        restaurantId: event.restaurantId,
      });
      await pgPubSub.notify(PG_EVENTS.PAYMENT_COMPLETED, event);
    } catch (error) {
      console.error('Failed to publish payment completed:', error);
    }
  }
}
```

**Tasks:**
- [ ] Update `src/lib/postgres-pubsub.ts`
- [ ] Add `PAYMENT_COMPLETED` event
- [ ] Add `PaymentCompletedEvent` interface
- [ ] Implement `publishPaymentCompleted()` method
- [ ] Test event publishing

---

### 1.5 RBAC Permissions 🔐 SECURITY

**File to Update:** Permission definitions in RBAC system

**New Permissions:**
```typescript
{
  'payments:process': 'Process counter payments',
  'payments:view': 'View payment history',
  'payments:refund': 'Process refunds', // Future use
}
```

**Permission Matrix:**

| Role | payments:process | payments:view | payments:refund |
|------|------------------|---------------|-----------------|
| Owner | ✅ | ✅ | ✅ |
| Manager | ✅ | ✅ | ✅ |
| Cashier | ✅ | ✅ | ❌ |
| Server | ❌ | ✅ | ❌ |
| Kitchen | ❌ | ❌ | ❌ |

**Tasks:**
- [ ] Add new permissions to permission definitions
- [ ] Update role templates with permissions
- [ ] Run database migration for permissions
- [ ] Verify permissions in admin panel
- [ ] Test permission enforcement in API

---

## Phase 2: Frontend (Week 2) - UI COMPONENTS

### 2.1 Dashboard Pages 📄 ROUTING

#### 2.1.1 Cashier Dashboard Page

**File to Create:** `src/app/dashboard/cashier/page.tsx`

**Purpose:** Main POS interface showing pending payment orders

**Features:**
- Server-side initial data fetch
- Grid layout for order cards
- Real-time updates via custom hook
- Search and filter capabilities

```typescript
import { Suspense } from 'react';
import { PendingOrdersGrid } from '@/components/pos/PendingOrdersGrid';
import { CashierHeader } from '@/components/pos/CashierHeader';

export default async function CashierDashboardPage() {
  // Server-side data fetch
  const initialOrders = await fetchPendingOrders();

  return (
    <div className="min-h-screen bg-gray-50">
      <CashierHeader />
      <main className="container mx-auto px-4 py-6">
        <Suspense fallback={<OrdersGridSkeleton />}>
          <PendingOrdersGrid initialOrders={initialOrders} />
        </Suspense>
      </main>
    </div>
  );
}
```

**Tasks:**
- [ ] Create `src/app/dashboard/cashier/page.tsx`
- [ ] Implement server component structure
- [ ] Add authentication check
- [ ] Add permission check (payments:process)
- [ ] Test routing `/dashboard/cashier`

---

#### 2.1.2 Cashier Layout

**File to Create:** `src/app/dashboard/cashier/layout.tsx`

**Purpose:** Layout wrapper for cashier dashboard

**Tasks:**
- [ ] Create `src/app/dashboard/cashier/layout.tsx`
- [ ] Add authentication requirement
- [ ] Add role-based access control

---

### 2.2 Core Components 🎨 UI BUILDING BLOCKS

#### 2.2.1 Pending Orders Grid Component

**File to Create:** `src/components/pos/PendingOrdersGrid.tsx`

**Purpose:** Display pending orders in grid layout with real-time updates

**Features:**
- Grid layout (responsive)
- Real-time updates via `usePendingOrders` hook
- Order selection for payment processing
- Empty state handling

**Tasks:**
- [ ] Create `src/components/pos/PendingOrdersGrid.tsx`
- [ ] Implement grid layout (1-4 columns responsive)
- [ ] Add order selection logic
- [ ] Integrate `usePendingOrders` hook
- [ ] Add loading & error states
- [ ] Add empty state UI

**Reference:** POS_IMPLEMENTATION_PLAN.md lines 1183-1249

---

#### 2.2.2 Pending Order Card Component

**File to Create:** `src/components/pos/PendingOrderCard.tsx`

**Purpose:** Individual order card showing key info

**Features:**
- Table number & order number
- Total amount (large, prominent)
- Waiting time (relative)
- Customer name (if available)
- Item count
- Status badge

**Design Specs:**
- Card size: 280x240px minimum
- Border: 2px yellow (pending indicator)
- Large typography for amount
- Touch-friendly (entire card clickable)

**Tasks:**
- [ ] Create `src/components/pos/PendingOrderCard.tsx`
- [ ] Implement card UI with Tailwind
- [ ] Add relative time display (date-fns)
- [ ] Add currency formatting
- [ ] Add hover & active states
- [ ] Test responsiveness

**Reference:** POS_IMPLEMENTATION_PLAN.md lines 1253-1328

---

#### 2.2.3 Payment Interface Modal

**File to Create:** `src/components/pos/PaymentInterface.tsx`

**Purpose:** Modal for processing payments

**Features:**
- Multi-step flow (method selection → processing → receipt)
- Order details display
- Payment method selector
- Cash/Card/E-wallet forms
- Receipt display
- Error handling

**State Management:**
```typescript
const [step, setStep] = useState<'select-method' | 'process' | 'receipt'>('select-method');
const [selectedMethod, setSelectedMethod] = useState<PaymentMethod | null>(null);
const [isProcessing, setIsProcessing] = useState(false);
const [paymentResult, setPaymentResult] = useState<any>(null);
```

**Tasks:**
- [ ] Create `src/components/pos/PaymentInterface.tsx`
- [ ] Implement modal UI (Dialog component)
- [ ] Add step-based navigation
- [ ] Integrate payment processing
- [ ] Add success/error handling
- [ ] Test all payment flows

**Reference:** POS_IMPLEMENTATION_PLAN.md lines 1332-1476

---

#### 2.2.4 Payment Method Selector

**File to Create:** `src/components/pos/PaymentMethodSelector.tsx`

**Purpose:** Select payment method (cash/card/e-wallet)

**Design:**
- 3 large buttons (icon + label)
- Color-coded (green=cash, blue=card, purple=e-wallet)
- Icon size: 48x48px minimum
- Touch-friendly spacing

**Tasks:**
- [ ] Create `src/components/pos/PaymentMethodSelector.tsx`
- [ ] Implement button grid (3 columns)
- [ ] Add lucide-react icons (Banknote, CreditCard, Smartphone)
- [ ] Add color differentiation
- [ ] Add hover/active animations

**Reference:** POS_IMPLEMENTATION_PLAN.md lines 1480-1545

---

#### 2.2.5 Cash Payment Form

**File to Create:** `src/components/pos/CashPaymentForm.tsx`

**Purpose:** Cash payment input with change calculation

**Features:**
- Large amount input field
- Quick select buttons (common denominations)
- Real-time change calculation
- Validation (cash >= total)

**Change Calculation:**
```typescript
useEffect(() => {
  const received = parseFloat(cashReceived) || 0;
  setChangeGiven(Math.max(0, received - totalAmount));
}, [cashReceived, totalAmount]);
```

**Tasks:**
- [ ] Create `src/components/pos/CashPaymentForm.tsx`
- [ ] Implement amount input with auto-focus
- [ ] Add quick select buttons
- [ ] Add real-time change calculation display
- [ ] Add validation logic
- [ ] Test with various amounts

**Reference:** POS_IMPLEMENTATION_PLAN.md lines 1549-1676

---

#### 2.2.6 Order Details Component

**File to Create:** `src/components/pos/OrderDetails.tsx`

**Purpose:** Display order items and totals breakdown

**Features:**
- Item list with quantities
- Subtotal, tax, service charge display
- Total amount (prominent)

**Tasks:**
- [ ] Create `src/components/pos/OrderDetails.tsx`
- [ ] Implement item list display
- [ ] Add totals calculation display
- [ ] Add currency formatting

---

#### 2.2.7 Receipt Component

**File to Create:** `src/components/pos/Receipt.tsx`

**Purpose:** Display and print receipt after payment

**Features:**
- Complete transaction details
- Print button (browser print API)
- Email button (future)
- Auto-dismiss after 5 seconds

**Tasks:**
- [ ] Create `src/components/pos/Receipt.tsx`
- [ ] Implement receipt layout (80mm thermal printer format)
- [ ] Add print functionality (window.print())
- [ ] Add action buttons (print, email, close)
- [ ] Add auto-dismiss timer
- [ ] Test print formatting

---

#### 2.2.8 Cashier Header Component

**File to Create:** `src/components/pos/CashierHeader.tsx`

**Purpose:** Header for cashier dashboard

**Features:**
- Restaurant name
- Current staff name
- Current time
- Refresh button
- Logout button

**Tasks:**
- [ ] Create `src/components/pos/CashierHeader.tsx`
- [ ] Display restaurant & staff info
- [ ] Add clock display
- [ ] Add action buttons

---

### 2.3 Custom Hooks 🎣 STATE MANAGEMENT

#### 2.3.1 usePendingOrders Hook

**File to Create:** `src/lib/hooks/use-pending-orders.ts`

**Purpose:** Real-time pending orders with polling/SSE

**Features:**
- Initial data from props
- Polling every 5 seconds
- Real-time updates via PostgreSQL NOTIFY
- Automatic refetch on payment completion

```typescript
export function usePendingOrders(initialOrders: OrderWithDetails[]) {
  const [orders, setOrders] = useState(initialOrders);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // Polling logic
  useEffect(() => {
    const interval = setInterval(async () => {
      await refetch();
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  const refetch = async () => {
    // Fetch updated orders
  };

  return { orders, isLoading, error, refetch };
}
```

**Tasks:**
- [ ] Create `src/lib/hooks/use-pending-orders.ts`
- [ ] Implement polling mechanism
- [ ] Add SSE integration (optional)
- [ ] Add error handling
- [ ] Test real-time updates

---

### 2.4 Utilities 🔧 HELPER FUNCTIONS

#### 2.4.1 Currency Formatting

**File to Update:** `src/lib/utils/format.ts` (or create if doesn't exist)

```typescript
export function formatCurrency(amount: number, currency = 'MYR'): string {
  return new Intl.NumberFormat('en-MY', {
    style: 'currency',
    currency: currency,
  }).format(amount);
}
```

**Tasks:**
- [ ] Create/Update `src/lib/utils/format.ts`
- [ ] Implement `formatCurrency()` function
- [ ] Add locale support
- [ ] Test with various amounts

---

## Phase 3: Testing & Polish (Week 3)

### 3.1 Integration Testing 🧪

**Tasks:**
- [ ] Write API integration tests
  - [ ] Test GET /api/pos/orders/pending
  - [ ] Test POST /api/pos/payment/[orderId]
  - [ ] Test authentication/authorization
  - [ ] Test validation errors
  - [ ] Test transaction safety

- [ ] Write component tests
  - [ ] Test PendingOrderCard rendering
  - [ ] Test PaymentMethodSelector interactions
  - [ ] Test CashPaymentForm calculations
  - [ ] Test Receipt display

- [ ] Write E2E tests (Playwright)
  - [ ] Test complete payment flow (cash)
  - [ ] Test complete payment flow (card)
  - [ ] Test complete payment flow (e-wallet)
  - [ ] Test error scenarios
  - [ ] Test real-time updates

**Reference:** POS_IMPLEMENTATION_PLAN.md lines 1799-1902

---

### 3.2 Performance Optimization ⚡

**Tasks:**
- [ ] Optimize database queries
  - [ ] Add indexes for payment queries
  - [ ] Verify query performance (<500ms)

- [ ] Optimize frontend
  - [ ] Code splitting for POS routes
  - [ ] Lazy load Receipt component
  - [ ] Optimize re-renders with React.memo

- [ ] Test with load
  - [ ] Test with 100+ pending orders
  - [ ] Test with 20+ concurrent users
  - [ ] Verify real-time updates performance

---

### 3.3 User Acceptance Testing 👥

**Tasks:**
- [ ] UAT with actual staff
  - [ ] Cashier workflow testing
  - [ ] Manager review testing
  - [ ] Kitchen staff feedback

- [ ] Mobile testing
  - [ ] Test on iPad
  - [ ] Test on Android tablet
  - [ ] Test on iPhone (backup device)

- [ ] Accessibility testing
  - [ ] Keyboard navigation
  - [ ] Screen reader compatibility
  - [ ] Color contrast (WCAG AA)
  - [ ] Touch target sizes (44x44px minimum)

---

## Phase 4: Deployment (Week 3)

### 4.1 Pre-deployment Checklist ✅

- [ ] All tests passing (unit, integration, E2E)
- [ ] Database migrations tested on staging
- [ ] RBAC permissions configured
- [ ] Performance benchmarks met
- [ ] Mobile responsive testing completed
- [ ] Documentation updated
- [ ] Rollback plan documented

---

### 4.2 Deployment Steps 🚀

1. **Database Migration**
   ```bash
   npx prisma migrate deploy
   ```

2. **Update RBAC Permissions**
   - Run SQL scripts to add `payments:process` and `payments:view`
   - Assign permissions to appropriate roles

3. **Deploy Application**
   ```bash
   npm run build
   npm run start
   ```

4. **Verify Deployment**
   - [ ] Check `/dashboard/cashier` accessible
   - [ ] Test payment processing with test order
   - [ ] Verify audit logs created
   - [ ] Check real-time updates working

---

## Monitoring & Metrics 📊

**Key Metrics to Track:**

| Metric | Target | Critical |
|--------|--------|----------|
| Page Load Time | <2s | >5s |
| Payment Processing Time | <3s | >10s |
| API Response (GET orders) | <500ms | >2s |
| API Response (POST payment) | <1s | >5s |
| Error Rate | <0.1% | >1% |

**Logging Events:**
- Payment initiated (orderId, method, amount)
- Payment completed (paymentId, duration, staffId)
- Payment failed (orderId, reason, stackTrace)

---

## Summary Statistics

**Total Tasks:** ~80+ tasks across 4 phases

**File Structure:**
```
qr-restaurant-system/
├── prisma/
│   ├── schema.prisma (UPDATE)
│   └── migrations/ (NEW migration)
├── src/
│   ├── app/
│   │   ├── api/pos/
│   │   │   ├── orders/pending/route.ts (NEW)
│   │   │   └── payment/[orderId]/route.ts (NEW)
│   │   └── dashboard/cashier/
│   │       ├── page.tsx (NEW)
│   │       └── layout.tsx (NEW)
│   ├── components/pos/
│   │   ├── CashierDashboard.tsx (NEW)
│   │   ├── CashierHeader.tsx (NEW)
│   │   ├── CashPaymentForm.tsx (NEW)
│   │   ├── OrderDetails.tsx (NEW)
│   │   ├── PaymentInterface.tsx (NEW)
│   │   ├── PaymentMethodSelector.tsx (NEW)
│   │   ├── PendingOrderCard.tsx (NEW)
│   │   ├── PendingOrdersGrid.tsx (NEW)
│   │   └── Receipt.tsx (NEW)
│   ├── lib/
│   │   ├── constants/
│   │   │   └── payment.ts (NEW)
│   │   ├── hooks/
│   │   │   └── use-pending-orders.ts (NEW)
│   │   ├── services/
│   │   │   └── payment-service.ts (NEW)
│   │   ├── utils/
│   │   │   ├── format.ts (NEW/UPDATE)
│   │   │   └── receipt-formatter.ts (NEW)
│   │   └── postgres-pubsub.ts (UPDATE)
│   └── types/
│       └── pos.ts (NEW)
└── claudedocs/
    ├── POS_IMPLEMENTATION_PLAN.md (EXISTING)
    └── POS_IMPLEMENTATION_TODO.md (THIS FILE)
```

**New Files:** 18 files
**Updated Files:** 2 files
**Total Changes:** 20 files

---

## Adherence to CLAUDE.md Standards ✅

This implementation plan strictly follows all coding standards:

✅ **Single Source of Truth**
- Payment constants in ONE file: `src/lib/constants/payment.ts`
- Payment status from existing `order-utils.ts`
- No duplicate definitions

✅ **No Hardcoding**
- All payment methods as constants
- Receipt number generation function
- No hardcoded URLs or status strings

✅ **SOLID Principles**
- Single Responsibility: Separate API, UI, Business Logic
- Open/Closed: Extensible for new payment methods
- Dependency Inversion: Use interfaces and types

✅ **Three-Layer Validation**
```
Frontend (Zod) → API (Zod + Business Rules) → Database (Prisma + Constraints)
```

✅ **Type Safety**
- No `any` types
- Explicit TypeScript types everywhere
- Zod schemas for all inputs
- Prisma for database operations

✅ **Error Handling**
- All async operations have try-catch
- Proper error messages
- Audit logging for failures

---

## Ready to Start? 🚀

**Recommended Implementation Order:**

1. **Start with Database** (Day 1)
   - Update Prisma schema
   - Run migrations
   - Verify in Prisma Studio

2. **Build API Foundation** (Days 2-4)
   - Create constants & types
   - Implement GET pending orders
   - Implement POST process payment
   - Test with Postman/curl

3. **Build Core Components** (Days 5-10)
   - Create dashboard page
   - Build order cards & grid
   - Build payment interface
   - Build cash payment form
   - Build receipt component

4. **Add Real-time Updates** (Days 11-12)
   - Create usePendingOrders hook
   - Add PostgreSQL NOTIFY event
   - Test real-time functionality

5. **Test & Polish** (Days 13-15)
   - Write integration tests
   - Conduct UAT
   - Performance optimization
   - Bug fixes

**Total Estimated Time:** 15-20 working days (3-4 weeks)

---

**Status:** ✅ Ready for Implementation
**Next Step:** Await your command to start coding

---

**Note:** This TODO list is living documentation. Update status as tasks are completed.
