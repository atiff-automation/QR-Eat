# Payment System Implementation Plan

**Project**: QR Restaurant Ordering System
**Date**: 2025-01-15
**Purpose**: Comprehensive implementation plan for new payment system following coding standards

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Architecture Overview](#architecture-overview)
3. [Coding Standards Compliance](#coding-standards-compliance)
4. [Current State Assessment](#current-state-assessment)
5. [Implementation Phases](#implementation-phases)
6. [Detailed Task Breakdown](#detailed-task-breakdown)
7. [Testing Strategy](#testing-strategy)
8. [Deployment Plan](#deployment-plan)

---

## Executive Summary

### New Payment System Specification

**Online Payment (Customer at Table)**:
- ToyyibPay integration (FPX + Credit/Debit Cards)
- Redirect to ToyyibPay payment page
- Webhook-based order status update
- Cashier approval required even for paid orders

**Counter Payment (Customer at Cashier)**:
- Cash: Manual entry with change calculation
- QR Manual: Customer pays via DuitNow QR, cashier verifies in merchant app, enters reference number
- NO card terminal support
- NO tip functionality

**Order Flow**:
```
Cart → Checkout → Choose Payment:
├─ Pay Online (ToyyibPay) → Paid → Cashier Approves → Kitchen
└─ Pay at Counter → Unpaid → Cashier Approves → Kitchen → Customer Pays → Complete
```

---

## Architecture Overview

### System Components

```
┌─────────────────────────────────────────────────────────────┐
│                    Customer Layer                            │
│  - QR Scan at Table                                         │
│  - Menu Browsing                                            │
│  - Cart Management                                          │
│  - Payment Selection (Online/Counter)                       │
└────────────────────┬────────────────────────────────────────┘
                     │
┌────────────────────┴────────────────────────────────────────┐
│                    Order Management Layer                    │
│  - Order Creation                                           │
│  - Order State Machine                                      │
│  - Table Session Management                                 │
│  - Tab Accumulation                                         │
└────────────────────┬────────────────────────────────────────┘
                     │
         ┌───────────┴──────────┐
         │                      │
┌────────┴────────┐    ┌───────┴─────────┐
│  Online Payment │    │ Counter Payment │
│  (ToyyibPay)    │    │ (Cash/QR)       │
└────────┬────────┘    └────────┬────────┘
         │                      │
         ▼                      ▼
┌─────────────────────────────────────────┐
│     Cashier Approval Dashboard          │
│  - Pending Orders Queue                 │
│  - Payment Status Verification          │
│  - Order Approval/Rejection             │
│  - Risk Management                      │
└────────────────┬────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────┐
│     Kitchen Display System               │
│  - Confirmed Orders Only                │
│  - Preparation Workflow                 │
└─────────────────────────────────────────┘
```

### Service Layer Architecture

```
src/
├── lib/
│   ├── config/
│   │   ├── payment-config.ts          # Centralized payment configuration
│   │   └── toyyibpay-config.ts        # ToyyibPay-specific config
│   │
│   ├── services/
│   │   ├── toyyibpay-credentials.ts   # Encrypted credential management
│   │   ├── toyyibpay-category.ts      # Category service
│   │   ├── payment-router.ts          # Payment method routing
│   │   └── order-status-handler.ts    # Centralized order status logic
│   │
│   ├── payments/
│   │   ├── toyyibpay-service.ts       # ToyyibPay bill creation/status
│   │   └── counter-payment.ts         # Cash/QR counter payment logic
│   │
│   └── utils/
│       ├── payment-utils.ts           # Payment utility functions
│       ├── currency-utils.ts          # MYR formatting and conversion
│       └── validation-schemas.ts      # Zod schemas for payment data
│
├── app/
│   ├── api/
│   │   ├── payment/
│   │   │   ├── create-bill/route.ts   # ToyyibPay bill creation
│   │   │   ├── counter/route.ts       # Counter payment processing
│   │   │   └── methods/route.ts       # Available payment methods
│   │   │
│   │   ├── webhooks/
│   │   │   └── toyyibpay/route.ts     # ToyyibPay webhook handler
│   │   │
│   │   ├── cashier/
│   │   │   ├── pending-orders/route.ts     # Cashier queue
│   │   │   └── approve-order/[id]/route.ts # Order approval
│   │   │
│   │   └── orders/
│   │       └── create/route.ts        # Order creation with payment
│   │
│   └── cashier/
│       └── dashboard/page.tsx         # Cashier approval UI
│
└── components/
    ├── payment/
    │   ├── PaymentMethodSelector.tsx  # Online payment method selection
    │   ├── PaymentSuccess.tsx         # Success confirmation
    │   └── CounterPaymentForm.tsx     # Cash/QR payment at counter
    │
    ├── cashier/
    │   ├── PendingOrdersQueue.tsx     # Orders awaiting approval
    │   ├── OrderApprovalCard.tsx      # Individual order approval
    │   └── CounterPayment.tsx         # Counter payment interface
    │
    └── order/
        └── OrderCheckout.tsx          # Customer checkout flow
```

---

## Coding Standards Compliance

**Reference**: `CLAUDE.md` - Coding Standards

### 1. Single Source of Truth ✅

**Payment Configuration**:
```typescript
// src/lib/config/payment-config.ts
export const PAYMENT_CONFIG = {
  currency: 'MYR',
  minimumAmount: 0.50,
  maximumAmount: 10000.00,

  // Order states - SINGLE SOURCE
  orderStates: {
    CART: 'cart',
    PENDING_APPROVAL: 'pending_approval',
    ON_HOLD: 'on_hold',
    CONFIRMED: 'confirmed',
    PREPARING: 'preparing',
    READY: 'ready',
    SERVED: 'served',
    COMPLETED: 'completed',
    CANCELLED: 'cancelled',
  },

  // Payment statuses - SINGLE SOURCE
  paymentStatuses: {
    PENDING: 'pending',
    PAID: 'paid',
    FAILED: 'failed',
  },

  // Payment methods - SINGLE SOURCE
  paymentMethods: {
    TOYYIBPAY: 'toyyibpay',
    CASH: 'cash',
    QR_MANUAL: 'qr_manual',
  },

  // Tab limits
  tabLimits: {
    LOW_RISK: 50.00,
    MEDIUM_RISK: 100.00,
    HIGH_RISK: 200.00,
  },
} as const;
```

**Usage**: Import from config everywhere, never hardcode strings.

---

### 2. No Hardcoding ✅

**Environment Variables** (`.env.example`):
```bash
# Database
DATABASE_URL="postgresql://..."

# Application
NEXT_PUBLIC_APP_URL="http://localhost:3000"
NEXTAUTH_SECRET="your-secret-key-here"

# ToyyibPay
TOYYIBPAY_SANDBOX_URL="https://dev.toyyibpay.com"
TOYYIBPAY_PRODUCTION_URL="https://toyyibpay.com"
TOYYIBPAY_TIMEOUT="30000"
TOYYIBPAY_WEBHOOK_SECRET="your-webhook-secret"
```

**Secret Management**:
- ToyyibPay User Secret Key: Stored ENCRYPTED in database (SystemConfig table)
- Environment secrets: Only in `.env`, never in code
- Webhook URLs: Generated from `NEXT_PUBLIC_APP_URL`

---

### 3. SOLID Principles ✅

**Single Responsibility**:
```typescript
// ✅ GOOD: Each service has one responsibility

// ToyyibPay credential management ONLY
class ToyyibPayCredentialsService {
  async storeCredentials() {}
  async getCredentials() {}
  async validateCredentials() {}
}

// ToyyibPay bill operations ONLY
class ToyyibPayService {
  async createBill() {}
  async getBillStatus() {}
  async cancelBill() {}
}

// Order status transitions ONLY
class OrderStatusHandler {
  async approveOrder() {}
  async cancelOrder() {}
  async updateStatus() {}
}
```

**Dependency Inversion**:
```typescript
// ✅ GOOD: Depend on abstractions, not concretions

interface PaymentGateway {
  createPayment(data: PaymentData): Promise<PaymentResult>;
  checkStatus(id: string): Promise<PaymentStatus>;
}

// ToyyibPay implements interface
class ToyyibPayGateway implements PaymentGateway {
  async createPayment(data: PaymentData): Promise<PaymentResult> {
    // ToyyibPay-specific implementation
  }
}

// Router depends on interface, not concrete implementation
class PaymentRouter {
  constructor(private gateway: PaymentGateway) {}

  async processPayment(data: PaymentData) {
    return this.gateway.createPayment(data);
  }
}
```

---

### 4. Type Safety ✅

**Strict TypeScript - No `any` types**:

```typescript
// ✅ GOOD: Explicit types everywhere

// Payment request type
export interface CounterPaymentRequest {
  tableId: string;
  paymentMethod: 'cash' | 'qr_manual';

  // Cash specific
  amountReceived?: number;

  // QR specific
  referenceNumber?: string;
  verificationChecklist?: {
    amountVerified: boolean;
    timestampVerified: boolean;
    merchantAppChecked: boolean;
  };
}

// ❌ BAD: Using any
const processPayment = async (data: any) => { ... }

// ✅ GOOD: Explicit types
const processPayment = async (data: CounterPaymentRequest): Promise<PaymentResult> => { ... }
```

**Zod Validation**:
```typescript
import { z } from 'zod';

// Define schema ONCE, reuse everywhere
export const counterPaymentSchema = z.object({
  tableId: z.string().uuid(),
  paymentMethod: z.enum(['cash', 'qr_manual']),

  // Conditional validation
  amountReceived: z.number().positive().optional(),
  referenceNumber: z.string().min(1).optional(),

  verificationChecklist: z.object({
    amountVerified: z.boolean(),
    timestampVerified: z.boolean(),
    merchantAppChecked: z.boolean(),
  }).optional(),
}).refine(
  (data) => {
    // Cash requires amountReceived
    if (data.paymentMethod === 'cash') {
      return data.amountReceived !== undefined;
    }
    // QR requires referenceNumber
    if (data.paymentMethod === 'qr_manual') {
      return data.referenceNumber !== undefined &&
             data.verificationChecklist !== undefined;
    }
    return true;
  },
  { message: 'Invalid payment data for selected method' }
);
```

---

### 5. Error Handling ✅

**All async operations have try-catch**:

```typescript
// ✅ GOOD: Proper error handling with specific error types

export class PaymentError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode: number = 500
  ) {
    super(message);
    this.name = 'PaymentError';
  }
}

export async function createToyyibPayBill(
  orderData: OrderData
): Promise<PaymentResult> {
  try {
    // Validate input
    const validated = orderSchema.parse(orderData);

    // Create bill
    const response = await fetch(toyyibpayUrl, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      throw new PaymentError(
        'Failed to create ToyyibPay bill',
        'TOYYIBPAY_CREATE_FAILED',
        response.status
      );
    }

    const result = await response.json();
    return {
      success: true,
      billCode: result.BillCode,
      paymentUrl: `${baseUrl}/${result.BillCode}`,
    };

  } catch (error) {
    // Log error
    console.error('ToyyibPay bill creation error:', error);

    // Re-throw specific errors
    if (error instanceof PaymentError) {
      throw error;
    }

    // Wrap unknown errors
    throw new PaymentError(
      'Unexpected error creating payment',
      'PAYMENT_CREATE_UNKNOWN',
      500
    );
  }
}
```

---

### 6. Three-Layer Validation ✅

**Frontend → API → Database**:

```typescript
// LAYER 1: Frontend Validation
// File: src/components/cashier/CounterPayment.tsx
const handleSubmit = async (data: FormData) => {
  try {
    // Client-side validation
    const validated = counterPaymentSchema.parse(data);

    // Send to API
    const response = await fetch('/api/payment/counter', {
      method: 'POST',
      body: JSON.stringify(validated),
    });

  } catch (error) {
    if (error instanceof z.ZodError) {
      // Show validation errors to user
      setErrors(error.errors);
    }
  }
};

// LAYER 2: API Validation
// File: src/app/api/payment/counter/route.ts
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Validate request body
    const validated = counterPaymentSchema.parse(body);

    // Business logic validation
    const table = await prisma.tableSession.findUnique({
      where: { id: validated.tableId }
    });

    if (!table) {
      return NextResponse.json(
        { error: 'Table session not found' },
        { status: 404 }
      );
    }

    if (table.unpaidAmount === 0) {
      return NextResponse.json(
        { error: 'No unpaid orders for this table' },
        { status: 400 }
      );
    }

    // Process payment...

  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation failed', details: error.errors },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// LAYER 3: Database Constraints
// File: prisma/schema.prisma
model PaymentIntent {
  id              String   @id @default(uuid())
  orderId         String
  amount          Decimal  @db.Decimal(10, 2)  // Enforces 2 decimal places
  paymentMethodId String   // Required field
  referenceNumber String?  // Optional for non-QR

  // Constraints
  @@index([orderId])  // Performance
  @@index([referenceNumber])  // Uniqueness check for QR payments
}
```

---

## Current State Assessment

### ✅ What Exists (Keep & Enhance)

1. **Database Schema** - `prisma/schema.prisma`
   - Order model ✅
   - Table model ✅
   - CustomerSession model ✅
   - Payment/PaymentIntent models ✅ (needs modification)

2. **Basic Payment Flow** - Mock implementation
   - Payment types defined ✅
   - Payment utilities ✅ (needs cleanup)
   - Payment components ✅ (needs refactor)
   - Payment API routes ✅ (needs refactor)

3. **Order Management**
   - Order creation API ✅
   - Order state management ✅

4. **Authentication & RBAC**
   - Staff authentication ✅
   - Role-based permissions ✅
   - Cashier role exists ✅

### ❌ What's Missing (Need to Implement)

1. **ToyyibPay Integration**
   - Credentials service ❌
   - Category service ❌
   - Bill creation service ❌
   - Webhook handler ❌

2. **Cashier Approval System**
   - Pending orders queue ❌
   - Approval/rejection API ❌
   - Approval dashboard UI ❌

3. **Counter Payment**
   - Cash payment flow ❌
   - QR manual verification flow ❌
   - Counter payment UI ❌

4. **Table Session/Tab Management**
   - Session tracking ❌
   - Tab accumulation ❌
   - Unpaid amount calculation ❌

5. **Order State Machine**
   - State transition logic ❌
   - State validation ❌
   - Webhook-driven status updates ❌

---

## Implementation Phases

### **Phase 1: Foundation & Cleanup** (4-6 hours)
- Execute cleanup plan (remove Stripe, tip functionality)
- Update database schema
- Create configuration files
- Set up environment variables

### **Phase 2: ToyyibPay Integration** (8-10 hours)
- Implement ToyyibPay services (credentials, category, bill creation)
- Create webhook handler
- Integrate with order creation flow
- Test sandbox payments

### **Phase 3: Cashier Approval System** (6-8 hours)
- Create approval queue API
- Implement approval/rejection logic
- Build cashier dashboard UI
- Integrate with order state machine

### **Phase 4: Counter Payment** (6-8 hours)
- Implement cash payment flow
- Implement QR manual verification flow
- Build counter payment UI
- Integrate with table sessions

### **Phase 5: Table Session & Tab Management** (4-6 hours)
- Implement session tracking
- Build tab accumulation logic
- Add risk management rules
- Create tab settlement flow

### **Phase 6: Testing & Quality Assurance** (6-8 hours)
- Unit tests for services
- Integration tests for APIs
- End-to-end tests for payment flows
- Security testing

### **Phase 7: Production Preparation** (2-4 hours)
- Switch to production credentials
- Configure production webhooks
- Performance optimization
- Documentation

**Total Estimated Time**: 40-50 hours (1-1.5 weeks for single developer)

---

## Detailed Task Breakdown

### Phase 1: Foundation & Cleanup

#### Task 1.1: Execute Cleanup Plan
**Duration**: 2 hours
**Priority**: 🔴 Critical
**Reference**: `PAYMENT-CLEANUP-PLAN.md`

**Steps**:
1. Remove Stripe references from all files
2. Delete TipSelector component
3. Update PaymentMethodType to only include: `'cash' | 'qr_manual' | 'toyyibpay'`
4. Remove tip calculation functions
5. Remove environment variables for Stripe

**Acceptance Criteria**:
- ✅ `grep -r "stripe" src/` returns 0 results
- ✅ TipSelector.tsx deleted
- ✅ `npm run type-check` passes

---

#### Task 1.2: Update Database Schema
**Duration**: 1 hour
**Priority**: 🔴 Critical
**Dependencies**: Task 1.1

**File**: `prisma/schema.prisma`

**Changes**:
```prisma
model PaymentIntent {
  id              String   @id @default(uuid())
  orderId         String
  amount          Decimal  @db.Decimal(10, 2)
  currency        String   @default("MYR")  // Changed from USD
  paymentMethodId String
  status          String   @default("pending")
  reference       String   @unique
  transactionId   String?

  // Remove: tip, finalAmount, clientSecret

  // Add: QR manual payment fields
  referenceNumber String?
  verifiedBy      String?
  verifiedAt      DateTime?

  metadata        Json     @default("{}")
  expiresAt       DateTime
  createdAt       DateTime @default(now())
  confirmedAt     DateTime?
  updatedAt       DateTime @updatedAt

  order Order @relation(fields: [orderId], references: [id], onDelete: Cascade)

  @@map("payment_intents")
}

model Order {
  // ... existing fields ...

  // Add: ToyyibPay fields
  toyyibpayBillCode    String?
  toyyibpayPaymentUrl  String?

  // ... rest of fields ...
}

// Add: TableSession model for tab management
model TableSession {
  id            String   @id @default(uuid())
  tableId       String
  status        String   @default("active")  // "active", "closed"

  totalAmount   Decimal  @default(0.00) @db.Decimal(10, 2)
  paidAmount    Decimal  @default(0.00) @db.Decimal(10, 2)
  unpaidAmount  Decimal  @default(0.00) @db.Decimal(10, 2)

  orderCount    Int      @default(0)
  maxTabLimit   Decimal  @default(200.00) @db.Decimal(10, 2)

  startedAt     DateTime @default(now())
  closedAt      DateTime?

  table Table @relation(fields: [tableId], references: [id])
  orders Order[]

  @@index([tableId, status])
  @@map("table_sessions")
}
```

**Migration**:
```bash
npx prisma migrate dev --name update_payment_schema
npx prisma generate
```

**Acceptance Criteria**:
- ✅ Migration runs without errors
- ✅ `npx prisma validate` passes
- ✅ New fields appear in database

---

#### Task 1.3: Create Configuration Files
**Duration**: 1.5 hours
**Priority**: 🔴 Critical

**File 1**: `src/lib/config/payment-config.ts`
```typescript
/**
 * Centralized Payment Configuration
 * Single Source of Truth for all payment-related constants
 */

export const PAYMENT_CONFIG = {
  // Currency
  currency: 'MYR',

  // Amount limits (in MYR)
  minimumAmount: 0.50,
  maximumAmount: 10000.00,

  // Payment methods (SINGLE SOURCE)
  paymentMethods: {
    TOYYIBPAY: 'toyyibpay',
    CASH: 'cash',
    QR_MANUAL: 'qr_manual',
  },

  // Order states (SINGLE SOURCE)
  orderStates: {
    CART: 'cart',
    PENDING_APPROVAL: 'pending_approval',
    ON_HOLD: 'on_hold',
    CONFIRMED: 'confirmed',
    PREPARING: 'preparing',
    READY: 'ready',
    SERVED: 'served',
    COMPLETED: 'completed',
    CANCELLED: 'cancelled',
  },

  // Payment statuses (SINGLE SOURCE)
  paymentStatuses: {
    PENDING: 'pending',
    PAID: 'paid',
    FAILED: 'failed',
  },

  // Tab limits for risk management (in MYR)
  tabLimits: {
    LOW_RISK: 50.00,
    MEDIUM_RISK: 100.00,
    HIGH_RISK: 200.00,
    MAX_ORDERS: 5,  // Max unpaid orders per session
    MAX_DURATION_HOURS: 3,  // Max session duration
  },

  // Payment intent expiration
  paymentIntentExpiration: {
    minutes: 30,  // Payment intent expires after 30 minutes
  },
} as const;

// Type exports for TypeScript
export type PaymentMethod = typeof PAYMENT_CONFIG.paymentMethods[keyof typeof PAYMENT_CONFIG.paymentMethods];
export type OrderState = typeof PAYMENT_CONFIG.orderStates[keyof typeof PAYMENT_CONFIG.orderStates];
export type PaymentStatus = typeof PAYMENT_CONFIG.paymentStatuses[keyof typeof PAYMENT_CONFIG.paymentStatuses];
```

**File 2**: `src/lib/config/toyyibpay-config.ts`
```typescript
/**
 * ToyyibPay Configuration
 * Reference: TOYYIBPAY_INTEGRATION_DOCUMENTATION.md
 */

export const toyyibPayConfig = {
  urls: {
    sandbox: process.env.TOYYIBPAY_SANDBOX_URL || 'https://dev.toyyibpay.com',
    production: process.env.TOYYIBPAY_PRODUCTION_URL || 'https://toyyibpay.com',
  },

  timeouts: {
    default: parseInt(process.env.TOYYIBPAY_TIMEOUT || '30000'),
    validation: 15000,
    callback: 30000,
  },

  billSettings: {
    maxBillNameLength: 30,
    billNamePrefix: 'QR_',  // Prefix for restaurant orders
    maxBillDescriptionLength: 100,
    defaultPriceSetting: 1,  // 1 = fixed price
    defaultPayorInfo: 1,  // 1 = require payer info
    defaultPaymentChannel: '2',  // '2' = Both FPX and Credit Card
  },

  paymentChannels: {
    FPX_ONLY: '0',
    CREDIT_CARD_ONLY: '1',
    BOTH: '2',
  },

  statusCodes: {
    SUCCESS: '1',
    PENDING: '2',
    FAILED: '3',
  },
};

export function getToyyibPayUrl(isSandbox: boolean): string {
  return isSandbox ? toyyibPayConfig.urls.sandbox : toyyibPayConfig.urls.production;
}

export function sanitizeBillName(name: string): string {
  // Remove special characters, max 30 chars
  let sanitized = name.replace(/[^a-zA-Z0-9\s_]/g, '_');
  if (sanitized.length > 30) {
    sanitized = sanitized.substring(0, 30);
  }
  if (!sanitized.startsWith(toyyibPayConfig.billSettings.billNamePrefix)) {
    const prefix = toyyibPayConfig.billSettings.billNamePrefix;
    sanitized = prefix + sanitized.substring(0, 30 - prefix.length);
  }
  return sanitized;
}

export function sanitizeBillDescription(description: string): string {
  let sanitized = description.replace(/[^a-zA-Z0-9\s_]/g, '_');
  if (sanitized.length > 100) {
    sanitized = sanitized.substring(0, 100);
  }
  return sanitized;
}

export function convertRinggitToCents(ringgit: number): number {
  return Math.round(ringgit * 100);
}

export function generateExternalReference(orderNumber: string): string {
  return `QR_${orderNumber}_${Date.now()}`;
}

export function getWebhookUrls(environment: 'sandbox' | 'production') {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL;

  if (!baseUrl) {
    throw new Error('NEXT_PUBLIC_APP_URL environment variable is required');
  }

  return {
    returnUrl: `${baseUrl}/thank-you`,
    callbackUrl: `${baseUrl}/api/webhooks/toyyibpay`,
    failedUrl: `${baseUrl}/thank-you`,
  };
}
```

**Acceptance Criteria**:
- ✅ Configuration files created
- ✅ All constants defined
- ✅ Type exports working
- ✅ No hardcoded values in other files

---

#### Task 1.4: Set Up Environment Variables
**Duration**: 30 minutes
**Priority**: 🔴 Critical

**File**: `.env.example`
```bash
# ==================================================
# Database
# ==================================================
DATABASE_URL="postgresql://user:password@localhost:5432/qrorder_dev"

# ==================================================
# Application
# ==================================================
NEXT_PUBLIC_APP_URL="http://localhost:3000"
NEXTAUTH_SECRET="your-32-character-or-longer-secret-here"

# ==================================================
# ToyyibPay Payment Gateway
# ==================================================
TOYYIBPAY_SANDBOX_URL="https://dev.toyyibpay.com"
TOYYIBPAY_PRODUCTION_URL="https://toyyibpay.com"
TOYYIBPAY_TIMEOUT="30000"
TOYYIBPAY_WEBHOOK_SECRET="your-webhook-secret-here"

# ==================================================
# Redis (for sessions)
# ==================================================
REDIS_URL="redis://localhost:6379"
```

**Update**: `.env`, `.env.local` with actual values

**Acceptance Criteria**:
- ✅ `.env.example` updated
- ✅ `.env` configured with dev values
- ✅ Secrets not committed to git

---

### Phase 2: ToyyibPay Integration

#### Task 2.1: Implement ToyyibPay Credentials Service
**Duration**: 2 hours
**Priority**: 🔴 Critical
**Reference**: Lines 305-392 in TOYYIBPAY_INTEGRATION_DOCUMENTATION.md

**File**: `src/lib/services/toyyibpay-credentials.ts`

Copy implementation from ToyyibPay documentation with modifications:
- Use PAYMENT_CONFIG constants
- Add comprehensive error handling
- Add type safety (no `any` types)

**Key Features**:
- Encrypted credential storage using AES-256-GCM
- Master key derived from `NEXTAUTH_SECRET`
- 5-minute in-memory cache
- Credential validation via API test

**Acceptance Criteria**:
- ✅ Service compiles without type errors
- ✅ Can store/retrieve encrypted credentials
- ✅ Validation endpoint works
- ✅ No `any` types used

---

#### Task 2.2: Implement ToyyibPay Category Service
**Duration**: 1.5 hours
**Priority**: 🟡 High
**Reference**: Lines 397-444 in TOYYIBPAY_INTEGRATION_DOCUMENTATION.md

**File**: `src/lib/services/toyyibpay-category.ts`

**Key Methods**:
- `createCategory()` - Create payment category
- `getCategory()` - Get category details
- `getOrCreateDefaultCategory()` - Auto-create if not exists
- `validateCategory()` - Check category is active

**Default Category**: `QR_Restaurant_{timestamp}`

**Acceptance Criteria**:
- ✅ Can create category
- ✅ Auto-creates default category
- ✅ Singleton pattern implemented
- ✅ Proper error handling

---

#### Task 2.3: Implement ToyyibPay Service
**Duration**: 3 hours
**Priority**: 🔴 Critical
**Reference**: Lines 447-556 in TOYYIBPAY_INTEGRATION_DOCUMENTATION.md

**File**: `src/lib/payments/toyyibpay-service.ts`

**Key Methods**:
```typescript
class ToyyibPayService {
  async createBill(billData: {
    billName: string;
    billDescription: string;
    billAmount: number;  // In Ringgit
    billTo: string;
    billEmail: string;
    billPhone?: string;
    externalReferenceNo: string;
  }): Promise<PaymentResult>

  async getBillTransactions(billCode: string): Promise<TransactionStatus>

  async inactiveBill(billCode: string): Promise<{ success: boolean; error?: string }>
}
```

**Bill Creation Flow**:
1. Ensure credentials configured
2. Ensure category exists
3. Get webhook URLs
4. Sanitize bill name/description
5. Convert amount to cents
6. Send to ToyyibPay API
7. Return bill code and payment URL

**Acceptance Criteria**:
- ✅ Can create bill in sandbox
- ✅ Returns valid payment URL
- ✅ Handles API errors gracefully
- ✅ All async operations have try-catch

---

#### Task 2.4: Implement ToyyibPay Webhook Handler
**Duration**: 2.5 hours
**Priority**: 🔴 Critical
**Reference**: Lines 646-810 in TOYYIBPAY_INTEGRATION_DOCUMENTATION.md

**File**: `src/app/api/webhooks/toyyibpay/route.ts`

**Webhook Parameters from ToyyibPay**:
```typescript
interface ToyyibPayCallback {
  refno: string;              // Transaction reference
  status: '1' | '2' | '3';    // 1=success, 2=pending, 3=fail
  billcode: string;           // Bill code
  order_id: string;           // Your order reference
  amount: string;             // Amount in cents
  transaction_time: string;   // Transaction timestamp
}
```

**Processing Logic**:
1. Parse FormData from ToyyibPay
2. Find order by `toyyibpayBillCode`
3. Check idempotency (already processed?)
4. Validate amount matches
5. Process based on status:
   - Status = '1' (SUCCESS): Update paymentStatus to 'paid'
   - Status = '2' (PENDING): Keep as 'pending'
   - Status = '3' (FAILED): Update to 'failed', cancel order
6. Return success response

**Critical**: Order status remains `pending_approval` even after payment - cashier must still approve!

**Acceptance Criteria**:
- ✅ Handles success/pending/failed statuses
- ✅ Idempotency protection works
- ✅ Amount validation works
- ✅ Updates order correctly
- ✅ Returns 200 OK to ToyyibPay

---

#### Task 2.5: Create Bill Creation API
**Duration**: 1.5 hours
**Priority**: 🔴 Critical

**File**: `src/app/api/payment/create-bill/route.ts`

**Endpoint**: `GET /api/payment/create-bill?orderId={orderId}`

**Flow**:
1. Get order with all details
2. Verify authorization (customer owns order)
3. Check payment status is PENDING
4. Create ToyyibPay bill
5. Update order with bill code and payment URL
6. Redirect to payment URL

**Zod Validation**:
```typescript
const querySchema = z.object({
  orderId: z.string().uuid(),
});
```

**Acceptance Criteria**:
- ✅ Creates bill successfully
- ✅ Redirects to ToyyibPay
- ✅ Updates order in database
- ✅ Authorization check works

---

### Phase 3: Cashier Approval System

#### Task 3.1: Create Cashier Approval API
**Duration**: 2 hours
**Priority**: 🔴 Critical

**File 1**: `src/app/api/cashier/pending-orders/route.ts`

**Endpoint**: `GET /api/cashier/pending-orders?restaurantId={id}`

**Response**:
```typescript
{
  orders: [
    {
      id: string;
      orderNumber: string;
      tableNumber: string;
      amount: number;
      paymentStatus: 'pending' | 'paid' | 'failed';
      paymentMethod: 'toyyibpay' | null;
      tabTotal: number;  // Total unpaid amount for table
      orderCount: number;  // Number of unpaid orders
      riskLevel: 'low' | 'medium' | 'high';
      createdAt: string;
    }
  ]
}
```

**File 2**: `src/app/api/cashier/approve-order/[id]/route.ts`

**Endpoint**: `POST /api/cashier/approve-order/{orderId}`

**Body**: None (just approve)

**Logic**:
1. Find order
2. Verify order is in `pending_approval` state
3. Update to `confirmed` state
4. Return success

**Zod Validation**:
```typescript
const approveOrderSchema = z.object({
  orderId: z.string().uuid(),
});
```

**Acceptance Criteria**:
- ✅ Returns pending orders
- ✅ Approval updates order status
- ✅ RBAC check (cashier only)
- ✅ Validation with Zod

---

#### Task 3.2: Implement Order State Machine
**Duration**: 2 hours
**Priority**: 🔴 Critical

**File**: `src/lib/services/order-status-handler.ts`

**State Transitions**:
```
cart → pending_approval → confirmed → preparing → ready → served → completed
              ↓                           ↓
         on_hold                    cancelled
```

**Service**:
```typescript
class OrderStatusHandler {
  async approveOrder(orderId: string, staffId: string): Promise<Order>
  async rejectOrder(orderId: string, staffId: string, reason: string): Promise<Order>
  async holdOrder(orderId: string, staffId: string, reason: string): Promise<Order>
  async updateOrderStatus(orderId: string, newStatus: OrderState): Promise<Order>

  private validateStateTransition(currentState: OrderState, newState: OrderState): boolean
}
```

**Validation Rules**:
- Can only approve orders in `pending_approval` state
- Cannot skip states (must go cart → pending → confirmed → etc.)
- Paid orders can still be rejected (refund handled separately)

**Acceptance Criteria**:
- ✅ State transitions work correctly
- ✅ Invalid transitions throw error
- ✅ Audit logs created
- ✅ No `any` types

---

#### Task 3.3: Build Cashier Dashboard UI
**Duration**: 3 hours
**Priority**: 🟡 High

**File 1**: `src/components/cashier/PendingOrdersQueue.tsx`

**UI Elements**:
- Order cards showing: order number, table, amount, payment status
- Color coding: Green (paid), Yellow (unpaid), Red (high risk)
- Approve/Reject/Hold buttons
- Real-time updates (WebSocket or polling)

**File 2**: `src/components/cashier/OrderApprovalCard.tsx`

**Props**:
```typescript
interface OrderApprovalCardProps {
  order: {
    id: string;
    orderNumber: string;
    tableNumber: string;
    amount: number;
    paymentStatus: 'pending' | 'paid' | 'failed';
    tabTotal: number;
    riskLevel: 'low' | 'medium' | 'high';
  };
  onApprove: (orderId: string) => void;
  onReject: (orderId: string) => void;
  onHold: (orderId: string) => void;
}
```

**File 3**: `src/app/cashier/dashboard/page.tsx`

Main dashboard page with:
- Authentication check (cashier role)
- Order queue component
- Filters (paid/unpaid/all)
- Refresh button

**Acceptance Criteria**:
- ✅ Shows pending orders
- ✅ Approve/Reject/Hold work
- ✅ Real-time updates
- ✅ Mobile responsive

---

### Phase 4: Counter Payment

#### Task 4.1: Implement Cash Payment Flow
**Duration**: 2 hours
**Priority**: 🔴 Critical

**File**: `src/app/api/payment/counter/route.ts`

**Endpoint**: `POST /api/payment/counter`

**Request Body**:
```typescript
{
  tableId: string;
  paymentMethod: 'cash';
  amountReceived: number;
}
```

**Logic**:
1. Find table session
2. Get all unpaid orders
3. Calculate total
4. Validate amount received >= total
5. Create payment intent
6. Update all orders to 'paid'
7. Close table session
8. Return change amount

**Response**:
```typescript
{
  success: true;
  totalPaid: number;
  change: number;
  orderNumbers: string[];
  receiptUrl: string;
}
```

**Acceptance Criteria**:
- ✅ Calculates change correctly
- ✅ Updates all orders
- ✅ Closes session
- ✅ Returns receipt data

---

#### Task 4.2: Implement QR Manual Verification Flow
**Duration**: 2.5 hours
**Priority**: 🔴 Critical

**File**: Same `src/app/api/payment/counter/route.ts` (same endpoint, different method)

**Request Body**:
```typescript
{
  tableId: string;
  paymentMethod: 'qr_manual';
  referenceNumber: string;
  verificationChecklist: {
    amountVerified: boolean;
    timestampVerified: boolean;
    merchantAppChecked: boolean;
  };
}
```

**Validation**:
- All checklist items must be `true`
- Reference number must be provided
- Staff must be authenticated

**Logic**:
1. Validate checklist all true
2. Find table session
3. Get unpaid orders
4. Create payment intent with reference
5. Update orders to 'paid'
6. Close session
7. Log for reconciliation

**Acceptance Criteria**:
- ✅ Requires all verifications
- ✅ Stores reference number
- ✅ Records staff who verified
- ✅ Creates audit trail

---

#### Task 4.3: Build Counter Payment UI
**Duration**: 2.5 hours
**Priority**: 🟡 High

**File**: `src/components/cashier/CounterPayment.tsx`

**UI Flow**:
1. Search for table or scan QR
2. Show unpaid orders and total
3. Select payment method (Cash/QR)
4. If Cash: Enter amount received, show change
5. If QR: Show merchant QR, enter reference, verification checklist
6. Confirm payment
7. Print receipt

**Form Validation**:
```typescript
const cashPaymentSchema = z.object({
  amountReceived: z.number().positive(),
}).refine(
  (data) => data.amountReceived >= totalAmount,
  { message: 'Amount received must be >= total' }
);

const qrPaymentSchema = z.object({
  referenceNumber: z.string().min(1),
  verificationChecklist: z.object({
    amountVerified: z.literal(true),
    timestampVerified: z.literal(true),
    merchantAppChecked: z.literal(true),
  }),
});
```

**Acceptance Criteria**:
- ✅ Cash flow works with change calculation
- ✅ QR flow enforces verification
- ✅ Shows clear error messages
- ✅ Mobile friendly

---

### Phase 5: Table Session & Tab Management

#### Task 5.1: Implement Session Tracking
**Duration**: 2 hours
**Priority**: 🟡 High

**File**: `src/lib/services/table-session.ts`

**Service**:
```typescript
class TableSessionService {
  async getOrCreateSession(tableId: string): Promise<TableSession>
  async addOrderToSession(sessionId: string, orderId: string, amount: number): Promise<void>
  async calculateTabTotals(sessionId: string): Promise<TabTotals>
  async closeSession(sessionId: string): Promise<void>
  async checkRiskLevel(sessionId: string): Promise<'low' | 'medium' | 'high'>
}
```

**Tab Calculation**:
```typescript
interface TabTotals {
  totalAmount: number;    // Sum of all orders
  paidAmount: number;     // Sum of paid orders
  unpaidAmount: number;   // totalAmount - paidAmount
  orderCount: number;     // Total number of orders
  unpaidOrderCount: number;
}
```

**Acceptance Criteria**:
- ✅ Creates session on first order
- ✅ Tracks all orders
- ✅ Calculates totals correctly
- ✅ Identifies risk levels

---

#### Task 5.2: Implement Risk Management
**Duration**: 1.5 hours
**Priority**: 🟡 High

**File**: `src/lib/utils/risk-management.ts`

**Risk Assessment**:
```typescript
function assessOrderRisk(session: TableSession): {
  riskLevel: 'low' | 'medium' | 'high';
  shouldHold: boolean;
  reason?: string;
} {
  const { unpaidAmount, orderCount, startedAt } = session;
  const duration = Date.now() - new Date(startedAt).getTime();

  // High risk: Exceeds maximum limit
  if (unpaidAmount > PAYMENT_CONFIG.tabLimits.HIGH_RISK) {
    return {
      riskLevel: 'high',
      shouldHold: true,
      reason: 'Tab limit exceeded. Please settle current tab first.'
    };
  }

  // Medium risk: Too many orders
  if (orderCount > PAYMENT_CONFIG.tabLimits.MAX_ORDERS && unpaidAmount > 50) {
    return {
      riskLevel: 'medium',
      shouldHold: false,
      reason: 'Multiple unpaid orders'
    };
  }

  // High risk: Session too long with unpaid balance
  const maxDuration = PAYMENT_CONFIG.tabLimits.MAX_DURATION_HOURS * 60 * 60 * 1000;
  if (duration > maxDuration && unpaidAmount > 50) {
    return {
      riskLevel: 'high',
      shouldHold: true,
      reason: 'Please settle your tab.'
    };
  }

  // Low risk
  return {
    riskLevel: 'low',
    shouldHold: false
  };
}
```

**Acceptance Criteria**:
- ✅ Correctly identifies risk levels
- ✅ Auto-holds high-risk orders
- ✅ Uses config constants
- ✅ Returns clear reasons

---

#### Task 5.3: Create Tab Settlement Flow
**Duration**: 1.5 hours
**Priority**: 🟡 High

**Integration**:
- Combine session tracking with counter payment
- When customer pays at counter, settle entire tab
- Update all unpaid orders to paid
- Close session

**API Update**: Already handled in Task 4.1 and 4.2

**UI Update**: Show tab total in counter payment UI

**Acceptance Criteria**:
- ✅ Settles all unpaid orders
- ✅ Closes session properly
- ✅ Prevents new orders after closure
- ✅ Creates receipt for all items

---

### Phase 6: Testing & Quality Assurance

#### Task 6.1: Unit Tests
**Duration**: 3 hours
**Priority**: 🟡 High

**Test Files**:
```
tests/
├── services/
│   ├── toyyibpay-credentials.test.ts
│   ├── toyyibpay-service.test.ts
│   ├── order-status-handler.test.ts
│   └── table-session.test.ts
│
├── utils/
│   ├── payment-utils.test.ts
│   ├── risk-management.test.ts
│   └── validation-schemas.test.ts
│
└── config/
    ├── payment-config.test.ts
    └── toyyibpay-config.test.ts
```

**Coverage Target**: >80% code coverage

**Key Tests**:
- Credential encryption/decryption
- Bill creation with various inputs
- State transitions
- Risk assessment
- Amount calculations

**Acceptance Criteria**:
- ✅ All tests pass
- ✅ Coverage >80%
- ✅ Edge cases covered
- ✅ No flaky tests

---

#### Task 6.2: Integration Tests
**Duration**: 2 hours
**Priority**: 🟡 High

**Test Scenarios**:
1. Full online payment flow (ToyyibPay)
2. Full counter payment flow (Cash)
3. Full counter payment flow (QR)
4. Order approval flow
5. Tab accumulation and settlement

**Tools**: Jest + Supertest for API testing

**Acceptance Criteria**:
- ✅ End-to-end flows work
- ✅ Database updates correctly
- ✅ Error scenarios handled
- ✅ Tests run in CI/CD

---

#### Task 6.3: Security Testing
**Duration**: 2 hours
**Priority**: 🔴 Critical

**Security Checks**:
1. **Credential Security**:
   - Encrypted storage verified
   - No secrets in code/logs

2. **Webhook Security**:
   - Signature verification works
   - Replay attack prevention

3. **Authorization**:
   - RBAC enforced on all routes
   - Cashier can't approve without permission

4. **Input Validation**:
   - All user inputs validated
   - SQL injection prevention (Prisma)
   - XSS prevention

5. **Payment Security**:
   - Amount validation
   - Idempotency protection
   - Reference number uniqueness

**Acceptance Criteria**:
- ✅ No security vulnerabilities found
- ✅ OWASP Top 10 checked
- ✅ Penetration test passed
- ✅ Security audit log reviewed

---

### Phase 7: Production Preparation

#### Task 7.1: Switch to Production Credentials
**Duration**: 1 hour
**Priority**: 🔴 Critical

**Steps**:
1. Get production ToyyibPay credentials
2. Store in encrypted database
3. Update `NEXT_PUBLIC_APP_URL` to production domain
4. Configure production webhook URLs
5. Test with small real payment

**Acceptance Criteria**:
- ✅ Production credentials stored securely
- ✅ Webhooks configured correctly
- ✅ Test payment successful
- ✅ Can switch back to sandbox if needed

---

#### Task 7.2: Performance Optimization
**Duration**: 2 hours
**Priority**: 🟡 High

**Optimizations**:
1. Database query optimization (indexes)
2. Caching frequently accessed data (Redis)
3. Image optimization
4. Code splitting
5. API response time monitoring

**Targets**:
- Page load: <2 seconds
- API response: <500ms
- Webhook processing: <1 second

**Acceptance Criteria**:
- ✅ Performance targets met
- ✅ No N+1 queries
- ✅ Caching implemented
- ✅ Monitoring in place

---

#### Task 7.3: Documentation
**Duration**: 1.5 hours
**Priority**: 🟡 High

**Documents to Create/Update**:
1. **API Documentation**: All payment endpoints
2. **User Guide**: How to use payment system
3. **Admin Guide**: How to configure ToyyibPay
4. **Troubleshooting Guide**: Common issues
5. **Deployment Guide**: Production setup

**Acceptance Criteria**:
- ✅ All endpoints documented
- ✅ Setup instructions clear
- ✅ Screenshots included
- ✅ FAQ section complete

---

## Testing Strategy

### Unit Testing

**Framework**: Jest + React Testing Library

**Coverage Target**: >80%

**Critical Tests**:
```typescript
// Service tests
describe('ToyyibPayService', () => {
  it('should create bill with valid data', async () => {});
  it('should handle API errors gracefully', async () => {});
  it('should sanitize bill name correctly', () => {});
});

// Util tests
describe('Risk Management', () => {
  it('should identify high-risk tabs', () => {});
  it('should allow low-risk orders', () => {});
  it('should enforce tab limits', () => {});
});

// Component tests
describe('CounterPayment', () => {
  it('should calculate change correctly', () => {});
  it('should validate QR verification checklist', () => {});
  it('should disable submit until verified', () => {});
});
```

---

### Integration Testing

**Scenarios**:

1. **Online Payment Flow**:
   ```
   Customer orders → Creates bill → Pays via ToyyibPay
   → Webhook updates order → Cashier approves → Kitchen receives
   ```

2. **Counter Payment Flow**:
   ```
   Customer orders → Cashier approves → Kitchen prepares
   → Customer eats → Pays at counter → Session closes
   ```

3. **Tab Management**:
   ```
   Order 1 → Order 2 → Order 3 → Pay all at once
   → Verify totals correct → Session closes
   ```

---

### Manual Testing Checklist

**Before Production**:

- [ ] Order via QR at table
- [ ] Pay online with ToyyibPay (FPX)
- [ ] Pay online with ToyyibPay (Credit Card)
- [ ] Verify webhook updates order
- [ ] Cashier approves paid order
- [ ] Cashier approves unpaid order
- [ ] Pay at counter with cash
- [ ] Pay at counter with QR manual
- [ ] Create multiple orders (tab)
- [ ] Settle tab at counter
- [ ] Test high-risk tab blocking
- [ ] Test order rejection
- [ ] Test payment failure handling
- [ ] Verify audit logs created
- [ ] Check receipt generation
- [ ] Test on mobile device
- [ ] Test on different browsers

---

## Deployment Plan

### Pre-Deployment Checklist

- [ ] All tests passing
- [ ] Code review completed
- [ ] Security audit passed
- [ ] Performance benchmarks met
- [ ] Documentation complete
- [ ] Database migrations ready
- [ ] Environment variables configured
- [ ] ToyyibPay production credentials stored
- [ ] Webhook URLs configured
- [ ] Monitoring setup complete

---

### Deployment Steps

1. **Database Migration**:
   ```bash
   npx prisma migrate deploy
   ```

2. **Build Application**:
   ```bash
   npm run build
   ```

3. **Deploy to Production**:
   ```bash
   # Your deployment command (Vercel, Docker, etc.)
   ```

4. **Verify Deployment**:
   - Check application loads
   - Test payment methods API
   - Verify webhook endpoint accessible
   - Check database connection

5. **Smoke Test**:
   - Create test order
   - Approve order
   - Test counter payment
   - Verify receipt generation

6. **Monitor**:
   - Watch error logs
   - Monitor webhook processing
   - Check payment success rate
   - Review performance metrics

---

### Rollback Plan

If deployment fails:

1. **Immediate**: Rollback to previous version
2. **Database**: Restore from backup if migration fails
3. **Credentials**: Switch back to sandbox if needed
4. **Investigate**: Review error logs
5. **Fix**: Correct issues in development
6. **Re-deploy**: After fixing and testing

---

## Success Criteria

### Functional Requirements

- ✅ Customers can pay online via ToyyibPay
- ✅ Customers can pay at counter (cash/QR)
- ✅ Cashier can approve/reject orders
- ✅ Tab system tracks multiple orders
- ✅ Risk management prevents excessive tabs
- ✅ Webhooks update order status
- ✅ Receipts generated correctly
- ✅ Audit logs track all actions

### Non-Functional Requirements

- ✅ Page load time <2 seconds
- ✅ API response time <500ms
- ✅ 99.9% uptime
- ✅ Zero payment data leaks
- ✅ Code coverage >80%
- ✅ No critical security vulnerabilities
- ✅ Mobile responsive
- ✅ Supports 100 concurrent orders

### Code Quality

- ✅ No `any` types
- ✅ All async functions have try-catch
- ✅ Zod validation on all inputs
- ✅ Single source of truth for constants
- ✅ No hardcoded values
- ✅ SOLID principles followed
- ✅ Comprehensive error handling
- ✅ Clear, descriptive naming

---

## Timeline Summary

| Phase | Duration | Tasks | Priority |
|-------|----------|-------|----------|
| **1. Foundation & Cleanup** | 4-6 hours | 4 tasks | 🔴 Critical |
| **2. ToyyibPay Integration** | 8-10 hours | 5 tasks | 🔴 Critical |
| **3. Cashier Approval** | 6-8 hours | 3 tasks | 🔴 Critical |
| **4. Counter Payment** | 6-8 hours | 3 tasks | 🔴 Critical |
| **5. Tab Management** | 4-6 hours | 3 tasks | 🟡 High |
| **6. Testing & QA** | 6-8 hours | 3 tasks | 🟡 High |
| **7. Production Prep** | 2-4 hours | 3 tasks | 🔴 Critical |
| **TOTAL** | **40-50 hours** | **24 tasks** | |

**Recommended Schedule**:
- **Week 1**: Phases 1-2 (Foundation + ToyyibPay)
- **Week 2**: Phases 3-5 (Cashier + Counter + Tab)
- **Week 3**: Phases 6-7 (Testing + Production)

---

## Risk Mitigation

### Technical Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| ToyyibPay API changes | High | Use official documentation, test frequently |
| Webhook failures | High | Implement retry mechanism, monitoring |
| Database migration issues | High | Backup before migration, test in staging |
| Performance degradation | Medium | Load testing, caching, indexes |
| Security vulnerabilities | High | Security audit, penetration testing |

### Business Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| Payment fraud | High | Manual verification for QR, audit logs |
| Dine & dash (tab abuse) | Medium | Tab limits, risk management rules |
| Cashier errors | Medium | Validation, confirmation steps, audit trail |
| Customer confusion | Low | Clear UI, help text, training materials |

---

## Appendix

### A. Environment Variables Reference

See `.env.example` in Task 1.4

### B. Database Schema Reference

See `prisma/schema.prisma` in Task 1.2

### C. API Endpoints Reference

**Payment APIs**:
- `GET /api/payment/methods` - Get available payment methods
- `GET /api/payment/create-bill?orderId={id}` - Create ToyyibPay bill
- `POST /api/payment/counter` - Process counter payment

**Webhook APIs**:
- `POST /api/webhooks/toyyibpay` - ToyyibPay callback

**Cashier APIs**:
- `GET /api/cashier/pending-orders?restaurantId={id}` - Get orders awaiting approval
- `POST /api/cashier/approve-order/{id}` - Approve order
- `POST /api/cashier/reject-order/{id}` - Reject order
- `POST /api/cashier/hold-order/{id}` - Hold order (request payment first)

### D. Configuration Constants Reference

See `src/lib/config/payment-config.ts` in Task 1.3

### E. Type Definitions Reference

```typescript
// Payment method types
type PaymentMethod = 'cash' | 'qr_manual' | 'toyyibpay';

// Order states
type OrderState =
  | 'cart'
  | 'pending_approval'
  | 'on_hold'
  | 'confirmed'
  | 'preparing'
  | 'ready'
  | 'served'
  | 'completed'
  | 'cancelled';

// Payment statuses
type PaymentStatus = 'pending' | 'paid' | 'failed';

// Risk levels
type RiskLevel = 'low' | 'medium' | 'high';
```

---

**Document Version**: 1.0
**Last Updated**: 2025-01-15
**Next Review**: After Phase 1 completion
**Maintained By**: Development Team
