# Phase 1 POS Interface - Technical Implementation Plan

**Version:** 1.0
**Last Updated:** 2025-12-10
**Status:** Planning Phase
**Target:** MVP Counter Payment System

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Current State Analysis](#current-state-analysis)
3. [System Architecture](#system-architecture)
4. [UI/UX Design Specifications](#uiux-design-specifications)
5. [Technical Specifications](#technical-specifications)
6. [Implementation Roadmap](#implementation-roadmap)
7. [Database Schema](#database-schema)
8. [API Endpoints](#api-endpoints)
9. [Frontend Components](#frontend-components)
10. [Business Logic](#business-logic)
11. [Security & Permissions](#security--permissions)
12. [Testing Strategy](#testing-strategy)
13. [Deployment & Rollout](#deployment--rollout)

---

## Executive Summary

### Problem Statement
Tabtep currently lacks a Point-of-Sale (POS) interface for staff to process counter payments. While customers can order via QR code and orders flow to the kitchen, there is no way for cashiers/staff to:
- View pending payments by table
- Select payment method (cash/card/ewallet)
- Mark orders as paid
- Generate receipts

### Solution Overview
Implement a modern, touchscreen-optimized POS interface that enables staff to:
1. View all pending payment orders in real-time
2. Process payments with multiple payment methods
3. Generate digital and printable receipts
4. Track payment history and reconciliation

### Success Criteria
- ✅ Staff can view all unpaid orders in <2 seconds
- ✅ Payment processing takes <3 taps from order selection to completion
- ✅ Real-time order updates via PostgreSQL NOTIFY/LISTEN
- ✅ Full audit trail of all payment transactions
- ✅ Mobile-responsive interface (tablet & smartphone)

---

## Current State Analysis

### ✅ What Exists (Foundation)

#### 1. Database Schema
**Location:** `prisma/schema.prisma:622-645`

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
}
```

#### 2. Order Calculation Utilities
**Location:** `src/lib/order-utils.ts:11-27`

```typescript
export function calculateOrderTotals(
  items: CartItem[],
  taxRate: number,
  serviceChargeRate: number
) {
  const subtotal = items.reduce((sum, item) => sum + item.totalPrice, 0);
  const taxAmount = subtotal * taxRate;
  const serviceCharge = subtotal * serviceChargeRate;
  const totalAmount = subtotal + taxAmount + serviceCharge;

  return {
    subtotal: Math.round(subtotal * 100) / 100,
    taxAmount: Math.round(taxAmount * 100) / 100,
    serviceCharge: Math.round(serviceCharge * 100) / 100,
    totalAmount: Math.round(totalAmount * 100) / 100,
  };
}
```

#### 3. Existing Constants
**Location:** `src/lib/order-utils.ts:54-60`

```typescript
export const PAYMENT_STATUS = {
  PENDING: 'pending',
  PROCESSING: 'processing',
  COMPLETED: 'completed',
  FAILED: 'failed',
  REFUNDED: 'refunded',
} as const;
```

#### 4. RBAC Authentication System
**Pattern:** All API routes use `AuthServiceV2.validateToken()` with permission checks

#### 5. Real-time Event System
**Location:** `src/lib/postgres-pubsub.ts`
- PostgreSQL NOTIFY/LISTEN for real-time updates
- Event types: order status changes, kitchen notifications

### ❌ Missing Components (To Build)

1. **POS Dashboard UI** - No `/dashboard/cashier` or `/dashboard/pos` route
2. **Payment Processing API** - No endpoint to update payment status
3. **Payment Interface Component** - No UI for payment method selection
4. **Receipt Generation** - No receipt component or printing logic
5. **Till Management** - No opening/closing till functionality

---

## System Architecture

### Architecture Principles (Following CLAUDE.md)

#### 1. Single Source of Truth (SSOT)
- Payment method constants in ONE place: `src/lib/constants/payment.ts`
- Payment status constants from existing `order-utils.ts`
- No duplicate payment logic across files

#### 2. No Hardcoding
- All payment methods defined as constants
- Environment variables for payment processor configs
- No hardcoded URLs or status strings

#### 3. SOLID Principles
- **Single Responsibility**: Separate concerns (UI, API, Business Logic, Database)
- **Open/Closed**: Extensible for future payment methods without modifying core logic
- **Dependency Inversion**: Depend on interfaces, not concrete implementations

#### 4. Three-Layer Validation
```
Frontend (Zod) → API (Zod + Business Rules) → Database (Prisma + Constraints)
```

### System Flow Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                    Customer Experience                       │
│  QR Order → Kitchen → Ready → "Please pay at counter"       │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│                    POS System (NEW)                          │
│                                                               │
│  ┌──────────────┐      ┌──────────────┐                     │
│  │   Cashier    │      │   Payment    │                     │
│  │  Dashboard   │─────▶│  Processing  │                     │
│  │              │      │   Interface  │                     │
│  └──────────────┘      └──────┬───────┘                     │
│                               │                              │
│                               ▼                              │
│                    ┌──────────────────┐                     │
│                    │  Payment API     │                     │
│                    │  POST /payment   │                     │
│                    └────────┬─────────┘                     │
└─────────────────────────────┼──────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                   Backend Services                           │
│                                                               │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │   Payment    │  │  PostgreSQL  │  │   Audit      │      │
│  │   Service    │→ │  NOTIFY/     │→ │   Logger     │      │
│  │              │  │  LISTEN      │  │              │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
│                                                               │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
                    ┌──────────────────┐
                    │   Receipt        │
                    │   Generation     │
                    └──────────────────┘
```

### Technology Stack

| Layer | Technology | Rationale |
|-------|-----------|-----------|
| **Frontend** | Next.js 14 (App Router) + TypeScript | Existing stack, server components |
| **UI Components** | React Server/Client Components | Existing pattern |
| **State Management** | React Hooks + Server Actions | Modern Next.js approach |
| **Styling** | Tailwind CSS | Existing in project |
| **Real-time** | PostgreSQL NOTIFY/LISTEN | Existing event system |
| **API Layer** | Next.js API Routes | Existing pattern |
| **Database** | Prisma + PostgreSQL | Existing ORM |
| **Authentication** | AuthServiceV2 (RBAC) | Existing auth system |
| **Validation** | Zod | Type-safe validation |

---

## UI/UX Design Specifications

### Design Philosophy

Following modern POS best practices for 2025, our interface prioritizes:
1. **Speed**: Payment completion in <3 taps
2. **Clarity**: Large typography and clear visual hierarchy
3. **Touch-First**: Minimum 44x44px touch targets
4. **Responsive**: Optimized for tablets (primary) and smartphones (secondary)
5. **Minimal Training**: Self-explanatory interface with visual cues

### Visual Design Mockups

#### 1. Cashier Dashboard (Main View)

**Screen:** `/dashboard/cashier`
**Purpose:** Real-time display of all pending payment orders

```
┌─────────────────────────────────────────────────────────────────┐
│  🏪 Restaurant Name      👤 Staff: John       🕐 2:45 PM         │
├─────────────────────────────────────────────────────────────────┤
│  📋 PENDING ORDERS (5)          🔍 Search Order    🔄 Refresh    │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ╔════════════════╗  ╔════════════════╗  ╔════════════════╗    │
│  ║ Table 3        ║  ║ Table 7        ║  ║ Table 12       ║    │
│  ║ Order #0045    ║  ║ Order #0046    ║  ║ Order #0047    ║    │
│  ║                ║  ║                ║  ║                ║    │
│  ║ RM 68.50       ║  ║ RM 125.00      ║  ║ RM 42.00       ║    │
│  ║ ⏰ 12 mins ago ║  ║ ⏰ 5 mins ago   ║  ║ ⏰ 8 mins ago   ║    │
│  ║                ║  ║                ║  ║                ║    │
│  ║ [VIEW & PAY] ▶ ║  ║ [VIEW & PAY] ▶ ║  ║ [VIEW & PAY] ▶ ║    │
│  ╚════════════════╝  ╚════════════════╝  ╚════════════════╝    │
│                                                                  │
│  ╔════════════════╗  ╔════════════════╗                         │
│  ║ Takeout #48    ║  ║ Table 15       ║                         │
│  ║ Order #0048    ║  ║ Order #0049    ║                         │
│  ║                ║  ║                ║                         │
│  ║ RM 38.50       ║  ║ RM 95.00       ║                         │
│  ║ ⏰ 2 mins ago   ║  ║ ⏰ 15 mins ago  ║                         │
│  ║                ║  ║                ║                         │
│  ║ [VIEW & PAY] ▶ ║  ║ [VIEW & PAY] ▶ ║                         │
│  ╚════════════════╝  ╚════════════════╝                         │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

**Key Features:**
- **Grid Layout**: 3-4 cards per row on tablet, 1-2 on mobile
- **Color Coding**: Yellow border for pending payments
- **Time Display**: Relative time (e.g., "12 mins ago") for urgency awareness
- **Large Touch Targets**: Entire card is clickable (min 120x150px)
- **Real-time Updates**: Auto-refresh every 5 seconds or via WebSocket

---

#### 2. Payment Processing Modal

**Trigger:** Click "VIEW & PAY" button
**Purpose:** Process payment for selected order

```
┌─────────────────────────────────────────────────────────────────┐
│  ← Back to Orders       ORDER #0045 - Table 3               ✕   │
├─────────────────────────────────────────────────────────────────┤
│  📝 ORDER DETAILS                                                │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │ • Nasi Lemak Special x2              RM 32.00            │  │
│  │ • Teh Tarik x2                       RM 8.00             │  │
│  │ • Roti Canai x3                      RM 9.00             │  │
│  │ • Milo Ais x1                        RM 4.50             │  │
│  │                                                           │  │
│  │ Subtotal:                            RM 53.50            │  │
│  │ Tax (6%):                            RM 3.21             │  │
│  │ Service Charge (10%):                RM 5.35             │  │
│  │ ─────────────────────────────────────────────────────    │  │
│  │ TOTAL:                               RM 62.06            │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                  │
│  💰 TOTAL AMOUNT                                                 │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │                                                           │  │
│  │                      RM 62.06                            │  │
│  │                                                           │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                  │
│  💳 SELECT PAYMENT METHOD:                                       │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐         │
│  │              │  │              │  │              │         │
│  │     💵       │  │     💳       │  │     📱       │         │
│  │              │  │              │  │              │         │
│  │    CASH      │  │    CARD      │  │  E-WALLET    │         │
│  │              │  │              │  │              │         │
│  └──────────────┘  └──────────────┘  └──────────────┘         │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

**Key Features:**
- **Clear Hierarchy**: Order details → Total → Payment method
- **Large Amount Display**: 3xl font size for total amount
- **Icon-First Design**: Large icons (48x48px) for payment methods
- **Color Differentiation**: Green (cash), Blue (card), Purple (e-wallet)
- **Equal Spacing**: Payment method buttons equally sized

---

#### 3. Cash Payment Form

**Trigger:** Click "CASH" payment method
**Purpose:** Calculate change for cash payments

```
┌─────────────────────────────────────────────────────────────────┐
│  ← Back                ORDER #0045 - Cash Payment           ✕   │
├─────────────────────────────────────────────────────────────────┤
│  💰 CASH RECEIVED                                                │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │                                                           │  │
│  │  RM     [    100.00    ]                                 │  │
│  │         ▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔                                 │  │
│  │                                                           │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                  │
│  🎯 QUICK SELECT                                                 │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐                        │
│  │ RM 62.06 │ │ RM 65.00 │ │ RM 70.00 │                        │
│  └──────────┘ └──────────┘ └──────────┘                        │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐                        │
│  │ RM 80.00 │ │ RM 100.00│ │ RM 150.00│                        │
│  └──────────┘ └──────────┘ └──────────┘                        │
│                                                                  │
│  💵 CHANGE TO GIVE                                               │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │                                                           │  │
│  │                      RM 37.94                            │  │
│  │                                                           │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                  │
│  ┌─────────────────────┐  ┌─────────────────────────────────┐  │
│  │      BACK           │  │   ✓ COMPLETE PAYMENT            │  │
│  │   (Gray button)     │  │   (Green button)                │  │
│  └─────────────────────┘  └─────────────────────────────────┘  │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

**Key Features:**
- **Large Input Field**: Easy to tap, auto-focused on load
- **Quick Select Buttons**: Common denominations (exact + rounded amounts)
- **Real-time Change Calculation**: Updates as user types
- **Visual Feedback**: Change displayed prominently in green
- **Smart Validation**: Disable "Complete" if cash < total

---

#### 4. Receipt Display

**Trigger:** After successful payment
**Purpose:** Show payment confirmation and print/send receipt

```
┌─────────────────────────────────────────────────────────────────┐
│                    ✓ PAYMENT SUCCESSFUL                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│                     🧾 RECEIPT                                   │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │                                                           │  │
│  │               RESTAURANT NAME                            │  │
│  │         123 Main Street, City                            │  │
│  │         Tel: +60 12-345 6789                             │  │
│  │                                                           │  │
│  │  ─────────────────────────────────────────────────────   │  │
│  │                                                           │  │
│  │  Receipt #: RCP-20251210-0045                            │  │
│  │  Order #: 0045                                           │  │
│  │  Date: 10 Dec 2025, 2:45 PM                              │  │
│  │  Table: 3                                                │  │
│  │  Cashier: John Doe                                       │  │
│  │                                                           │  │
│  │  ─────────────────────────────────────────────────────   │  │
│  │                                                           │  │
│  │  Nasi Lemak Special x2       RM 32.00                    │  │
│  │  Teh Tarik x2                RM 8.00                     │  │
│  │  Roti Canai x3               RM 9.00                     │  │
│  │  Milo Ais x1                 RM 4.50                     │  │
│  │                                                           │  │
│  │  ─────────────────────────────────────────────────────   │  │
│  │                                                           │  │
│  │  Subtotal:                   RM 53.50                    │  │
│  │  Tax (6%):                   RM 3.21                     │  │
│  │  Service Charge (10%):       RM 5.35                     │  │
│  │                                                           │  │
│  │  TOTAL:                      RM 62.06                    │  │
│  │                                                           │  │
│  │  Payment Method: CASH                                    │  │
│  │  Cash Received:              RM 100.00                   │  │
│  │  Change Given:               RM 37.94                    │  │
│  │                                                           │  │
│  │  ─────────────────────────────────────────────────────   │  │
│  │                                                           │  │
│  │         Thank you for dining with us!                    │  │
│  │                                                           │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐         │
│  │ 🖨️ PRINT     │  │ 📧 EMAIL     │  │ ✕ CLOSE      │         │
│  └──────────────┘  └──────────────┘  └──────────────┘         │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

**Key Features:**
- **Success Feedback**: Green checkmark + "Payment Successful" message
- **Complete Information**: All transaction details displayed
- **Print Ready**: Formatted for 80mm thermal printer
- **Multiple Options**: Print, email, or just close
- **Auto-dismiss**: Modal closes automatically after 5 seconds if no action

---

### Design System Specifications

#### Color Palette

| Element | Color | Usage |
|---------|-------|-------|
| **Primary** | Green (#10B981) | Confirm buttons, success states |
| **Secondary** | Blue (#3B82F6) | Card payments, info states |
| **Warning** | Yellow (#F59E0B) | Pending orders, attention needed |
| **Danger** | Red (#EF4444) | Cancel, failed payments |
| **Neutral** | Gray (#6B7280) | Back buttons, secondary actions |
| **Background** | Light Gray (#F9FAFB) | Page background |
| **Card** | White (#FFFFFF) | Order cards, modals |

#### Typography

| Element | Font Size | Font Weight | Usage |
|---------|-----------|-------------|-------|
| **Display Amount** | 3xl (30px) | Bold (700) | Total amounts, change display |
| **Card Title** | xl (20px) | Semibold (600) | Table names, order numbers |
| **Body Text** | base (16px) | Regular (400) | Item names, descriptions |
| **Small Text** | sm (14px) | Regular (400) | Time stamps, metadata |
| **Tiny Text** | xs (12px) | Medium (500) | Labels, helper text |

#### Spacing & Layout

| Element | Size | Rationale |
|---------|------|-----------|
| **Minimum Touch Target** | 44x44px | Apple/Android guidelines |
| **Order Card** | 280x240px | Optimal for 3-column tablet layout |
| **Card Padding** | 16px | Comfortable spacing |
| **Card Gap** | 16px | Visual separation |
| **Button Height** | 48px | Easy to tap |
| **Modal Width** | 600px max | Readable on tablets |

#### Responsive Breakpoints

| Device | Width | Layout |
|--------|-------|--------|
| **Desktop** | ≥1280px | 4 columns |
| **Tablet** | 768-1279px | 3 columns |
| **Large Phone** | 640-767px | 2 columns |
| **Small Phone** | <640px | 1 column |

---

### Interaction Patterns

#### 1. Order Selection Flow
```
Dashboard → Click order card → Modal opens → Order details displayed
```

#### 2. Cash Payment Flow
```
Select "Cash" → Enter/select amount → Verify change → Complete payment → Receipt
```

#### 3. Card/E-wallet Flow
```
Select "Card/E-wallet" → Confirm received → Complete payment → Receipt
```

#### 4. Real-time Updates
```
New order placed → Appears in dashboard → Auto-refresh every 5s
Payment completed → Order removed → Toast notification
```

---

### Accessibility Features

1. **Keyboard Navigation**: Full keyboard support for all interactions
2. **Screen Reader**: ARIA labels on all interactive elements
3. **Color Contrast**: WCAG AA compliant (4.5:1 minimum)
4. **Focus Indicators**: Clear focus states on all focusable elements
5. **Touch Targets**: Minimum 44x44px for all buttons
6. **Error Messages**: Clear, actionable error messages

---

### Performance Targets

| Metric | Target | Critical |
|--------|--------|----------|
| **First Contentful Paint** | <1.5s | >3s |
| **Time to Interactive** | <2.5s | >5s |
| **Order List Load** | <500ms | >2s |
| **Payment Processing** | <1s | >3s |
| **Modal Open Animation** | <200ms | >500ms |

---

## Technical Specifications

### File Structure

```
qr-restaurant-system/
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   └── pos/
│   │   │       ├── orders/
│   │   │       │   └── route.ts              # GET pending orders
│   │   │       └── payment/
│   │   │           └── [orderId]/
│   │   │               └── route.ts          # POST process payment
│   │   └── dashboard/
│   │       └── cashier/
│   │           ├── page.tsx                  # Main POS dashboard
│   │           └── layout.tsx                # Cashier layout
│   │
│   ├── components/
│   │   └── pos/
│   │       ├── CashierDashboard.tsx          # Order grid view
│   │       ├── PaymentInterface.tsx          # Payment processing UI
│   │       ├── PaymentMethodSelector.tsx     # Cash/Card/E-wallet selector
│   │       ├── OrderDetails.tsx              # Order items + totals
│   │       ├── Receipt.tsx                   # Receipt display/print
│   │       └── PendingOrderCard.tsx          # Individual order card
│   │
│   ├── lib/
│   │   ├── constants/
│   │   │   └── payment.ts                    # Payment constants (NEW)
│   │   ├── services/
│   │   │   └── payment-service.ts            # Payment business logic (NEW)
│   │   ├── hooks/
│   │   │   └── use-pending-orders.ts         # Real-time orders hook (NEW)
│   │   └── utils/
│   │       ├── receipt-formatter.ts          # Receipt generation (NEW)
│   │       └── payment-utils.ts              # Payment calculations (NEW)
│   │
│   └── types/
│       └── pos.ts                            # POS-specific types (NEW)
│
└── prisma/
    └── schema.prisma                         # (Update Payment model)
```

---

## Database Schema

### Updates Required

#### 1. Add Missing Fields to Payment Model

```prisma
model Payment {
  id                    String    @id @default(uuid())
  orderId               String
  paymentMethod         String    // 'cash' | 'card' | 'ewallet'
  paymentProcessor      String?   // For future: 'stripe' | 'square' | null for cash
  amount                Decimal   @db.Decimal(10, 2)
  processingFee         Decimal   @default(0.00) @db.Decimal(10, 2)
  netAmount             Decimal   @db.Decimal(10, 2)
  status                String    @default("pending")

  // NEW FIELDS
  processedBy           String?   // Staff ID who processed payment
  cashReceived          Decimal?  @db.Decimal(10, 2)  // For cash payments
  changeGiven           Decimal?  @db.Decimal(10, 2)  // For cash payments
  receiptNumber         String?   @unique  // Unique receipt identifier

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

  order         Order  @relation(fields: [orderId], references: [id], onDelete: Cascade)
  processedByStaff Staff? @relation(fields: [processedBy], references: [id])

  @@index([orderId])
  @@index([status])
  @@index([processedBy])
  @@index([createdAt])
  @@map("payments")
}
```

#### 2. Update Order Model (if needed)

```prisma
model Order {
  // ... existing fields ...

  payments              Payment[]  // One order can have multiple payments (splits, refunds)
}
```

#### 3. Add Till Session Model (Future Phase 2)

```prisma
model TillSession {
  id                String    @id @default(uuid())
  staffId           String
  restaurantId      String
  openedAt          DateTime  @default(now())
  closedAt          DateTime?

  openingCash       Decimal   @db.Decimal(10, 2)
  closingCash       Decimal?  @db.Decimal(10, 2)
  expectedCash      Decimal?  @db.Decimal(10, 2)
  cashDifference    Decimal?  @db.Decimal(10, 2)

  totalCashSales    Decimal   @default(0.00) @db.Decimal(10, 2)
  totalCardSales    Decimal   @default(0.00) @db.Decimal(10, 2)
  totalEwalletSales Decimal   @default(0.00) @db.Decimal(10, 2)

  notes             String?

  staff       Staff      @relation(fields: [staffId], references: [id])
  restaurant  Restaurant @relation(fields: [restaurantId], references: [id])

  @@index([staffId])
  @@index([restaurantId])
  @@index([openedAt])
  @@map("till_sessions")
}
```

---

## API Endpoints

### 1. GET /api/pos/orders/pending

**Purpose:** Fetch all orders with pending payment status for a restaurant

**Authentication:** Required (RBAC - `payments:process` or `orders:read`)

**Request:**
```typescript
// Query Parameters
{
  restaurantId: string;  // Required
  status?: 'pending' | 'all';  // Default: 'pending'
  tableId?: string;  // Optional filter
  limit?: number;  // Default: 50
  offset?: number;  // Default: 0
}
```

**Response:**
```typescript
{
  success: true,
  orders: [
    {
      id: string;
      orderNumber: string;
      tableId: string;
      table: {
        tableNumber: string;
        tableName: string;
      };
      customerSession: {
        customerName: string | null;
        customerPhone: string | null;
      };
      items: {
        id: string;
        quantity: number;
        menuItem: {
          name: string;
          price: Decimal;
        };
        totalPrice: Decimal;
      }[];
      subtotalAmount: Decimal;
      taxAmount: Decimal;
      serviceCharge: Decimal;
      totalAmount: Decimal;
      paymentStatus: string;
      status: string;
      createdAt: Date;
      estimatedReadyTime: Date | null;
    }
  ],
  total: number;
  hasMore: boolean;
}
```

**Implementation Pattern:**
```typescript
// src/app/api/pos/orders/pending/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/database';
import { AuthServiceV2 } from '@/lib/rbac/auth-service';
import { z } from 'zod';

const querySchema = z.object({
  restaurantId: z.string().uuid(),
  status: z.enum(['pending', 'all']).default('pending'),
  tableId: z.string().uuid().optional(),
  limit: z.coerce.number().min(1).max(100).default(50),
  offset: z.coerce.number().min(0).default(0),
});

export async function GET(request: NextRequest) {
  try {
    // 1. Authenticate
    const token = request.cookies.get('qr_rbac_token')?.value;
    if (!token) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    const authResult = await AuthServiceV2.validateToken(token);
    if (!authResult.isValid || !authResult.user) {
      return NextResponse.json(
        { error: 'Invalid authentication' },
        { status: 401 }
      );
    }

    // 2. Validate Query Parameters
    const searchParams = request.nextUrl.searchParams;
    const queryParams = querySchema.safeParse({
      restaurantId: searchParams.get('restaurantId'),
      status: searchParams.get('status'),
      tableId: searchParams.get('tableId'),
      limit: searchParams.get('limit'),
      offset: searchParams.get('offset'),
    });

    if (!queryParams.success) {
      return NextResponse.json(
        { error: 'Invalid query parameters', details: queryParams.error },
        { status: 400 }
      );
    }

    const { restaurantId, status, tableId, limit, offset } = queryParams.data;

    // 3. Check Permissions
    const user = authResult.user;
    const hasPermission =
      user.userType === 'platform_admin' ||
      (user.currentRole?.restaurantId === restaurantId &&
        (user.permissions.includes('payments:process') ||
          user.permissions.includes('orders:read')));

    if (!hasPermission) {
      return NextResponse.json(
        { error: 'Insufficient permissions' },
        { status: 403 }
      );
    }

    // 4. Build Query
    const where: any = {
      restaurantId,
      ...(status === 'pending' && { paymentStatus: 'pending' }),
      ...(tableId && { tableId }),
    };

    // 5. Fetch Orders
    const [orders, total] = await Promise.all([
      prisma.order.findMany({
        where,
        include: {
          table: {
            select: {
              tableNumber: true,
              tableName: true,
            },
          },
          customerSession: {
            select: {
              customerName: true,
              customerPhone: true,
            },
          },
          items: {
            include: {
              menuItem: {
                select: {
                  name: true,
                  price: true,
                },
              },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      prisma.order.count({ where }),
    ]);

    // 6. Return Response
    return NextResponse.json({
      success: true,
      orders,
      total,
      hasMore: offset + orders.length < total,
    });
  } catch (error) {
    console.error('Failed to fetch pending orders:', error);
    return NextResponse.json(
      { error: 'Failed to fetch pending orders' },
      { status: 500 }
    );
  }
}
```

---

### 2. POST /api/pos/payment/[orderId]

**Purpose:** Process payment for an order

**Authentication:** Required (RBAC - `payments:process`)

**Request:**
```typescript
{
  paymentMethod: 'cash' | 'card' | 'ewallet';

  // For cash payments
  cashReceived?: number;  // Required if paymentMethod === 'cash'

  // For card/ewallet payments
  externalTransactionId?: string;  // Optional

  // Metadata
  notes?: string;
}
```

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
    (data) => {
      // Cash payments must include cashReceived
      if (data.paymentMethod === 'cash') {
        return data.cashReceived !== undefined;
      }
      return true;
    },
    {
      message: 'Cash payments must include cashReceived amount',
      path: ['cashReceived'],
    }
  );
```

**Response:**
```typescript
{
  success: true,
  payment: {
    id: string;
    orderId: string;
    paymentMethod: string;
    amount: number;
    status: string;
    receiptNumber: string;
    cashReceived?: number;
    changeGiven?: number;
    processedAt: Date;
    processedBy: string;
  };
  order: {
    id: string;
    paymentStatus: string;
    updatedAt: Date;
  };
  message: string;
}
```

**Implementation Pattern:**
```typescript
// src/app/api/pos/payment/[orderId]/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/database';
import { AuthServiceV2 } from '@/lib/rbac/auth-service';
import { PostgresEventManager } from '@/lib/postgres-pubsub';
import { generateReceiptNumber } from '@/lib/utils/receipt-formatter';
import { z } from 'zod';

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

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ orderId: string }> }
) {
  try {
    // 1. Authenticate
    const token = request.cookies.get('qr_rbac_token')?.value;
    if (!token) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    const authResult = await AuthServiceV2.validateToken(token);
    if (!authResult.isValid || !authResult.user) {
      return NextResponse.json(
        { error: 'Invalid authentication' },
        { status: 401 }
      );
    }

    // 2. Validate Request Body
    const body = await request.json();
    const validation = paymentSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { error: 'Invalid payment data', details: validation.error },
        { status: 400 }
      );
    }

    const { paymentMethod, cashReceived, externalTransactionId, notes } =
      validation.data;
    const { orderId } = await params;

    // 3. Fetch Order
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: {
        restaurant: true,
        payments: true,
      },
    });

    if (!order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    // 4. Check Permissions
    const user = authResult.user;
    const hasPermission =
      user.userType === 'platform_admin' ||
      (user.currentRole?.restaurantId === order.restaurantId &&
        user.permissions.includes('payments:process'));

    if (!hasPermission) {
      return NextResponse.json(
        { error: 'Insufficient permissions' },
        { status: 403 }
      );
    }

    // 5. Check if already paid
    if (order.paymentStatus === 'completed') {
      return NextResponse.json(
        { error: 'Order already paid' },
        { status: 400 }
      );
    }

    // 6. Calculate amounts
    const amount = Number(order.totalAmount);
    const changeGiven =
      paymentMethod === 'cash' && cashReceived
        ? cashReceived - amount
        : undefined;

    if (changeGiven !== undefined && changeGiven < 0) {
      return NextResponse.json(
        { error: 'Insufficient cash received' },
        { status: 400 }
      );
    }

    // 7. Generate receipt number
    const receiptNumber = generateReceiptNumber();

    // 8. Create Payment & Update Order (Transaction)
    const result = await prisma.$transaction(async (tx) => {
      // Create payment record
      const payment = await tx.payment.create({
        data: {
          orderId,
          paymentMethod,
          amount,
          netAmount: amount, // For counter payments, no processing fees
          status: 'completed',
          processedBy: user.id,
          cashReceived: cashReceived ? cashReceived : undefined,
          changeGiven,
          receiptNumber,
          externalTransactionId,
          paymentMetadata: {
            notes,
            processedByName: `${user.firstName} ${user.lastName}`,
          },
          processedAt: new Date(),
          completedAt: new Date(),
        },
      });

      // Update order payment status
      const updatedOrder = await tx.order.update({
        where: { id: orderId },
        data: {
          paymentStatus: 'completed',
          updatedAt: new Date(),
        },
      });

      return { payment, order: updatedOrder };
    });

    // 9. Create Audit Log
    await prisma.auditLog.create({
      data: {
        tableName: 'payments',
        recordId: result.payment.id,
        operation: 'CREATE',
        newValues: {
          orderId,
          paymentMethod,
          amount,
          status: 'completed',
        },
        changedBy: user.id,
        ipAddress:
          request.headers.get('x-forwarded-for') ||
          request.headers.get('x-real-ip') ||
          'unknown',
      },
    });

    // 10. Publish real-time event
    await PostgresEventManager.publishPaymentCompleted({
      paymentId: result.payment.id,
      orderId,
      restaurantId: order.restaurantId,
      amount,
      paymentMethod,
      timestamp: Date.now(),
      processedBy: user.id,
    });

    // 11. Return Response
    return NextResponse.json({
      success: true,
      payment: result.payment,
      order: result.order,
      message: 'Payment processed successfully',
    });
  } catch (error) {
    console.error('Failed to process payment:', error);
    return NextResponse.json(
      { error: 'Failed to process payment' },
      { status: 500 }
    );
  }
}
```

---

## Frontend Components

### 1. Cashier Dashboard Page

**Location:** `src/app/dashboard/cashier/page.tsx`

**Purpose:** Main POS interface showing all pending payment orders

**Features:**
- Real-time order updates via Server-Sent Events (SSE) or polling
- Filter by table, status, time range
- Search by order number or customer name
- Click order card to open payment interface

**Component Structure:**
```typescript
// Server Component (for initial data fetch)
import { Suspense } from 'react';
import { PendingOrdersGrid } from '@/components/pos/PendingOrdersGrid';
import { CashierHeader } from '@/components/pos/CashierHeader';

export default async function CashierDashboardPage() {
  // Fetch initial orders server-side
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

---

### 2. Pending Orders Grid Component

**Location:** `src/components/pos/PendingOrdersGrid.tsx`

**Purpose:** Display pending orders in a grid layout with real-time updates

```typescript
'use client';

import { useState, useEffect } from 'react';
import { PendingOrderCard } from './PendingOrderCard';
import { PaymentInterface } from './PaymentInterface';
import { usePendingOrders } from '@/lib/hooks/use-pending-orders';
import type { OrderWithDetails } from '@/types/pos';

interface Props {
  initialOrders: OrderWithDetails[];
}

export function PendingOrdersGrid({ initialOrders }: Props) {
  const [selectedOrder, setSelectedOrder] = useState<OrderWithDetails | null>(null);

  // Real-time updates hook
  const { orders, isLoading, error, refetch } = usePendingOrders(initialOrders);

  if (error) {
    return <ErrorState message={error.message} />;
  }

  if (orders.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <CheckCircleIcon className="h-16 w-16 text-green-500 mb-4" />
        <h3 className="text-xl font-semibold text-gray-900">All Caught Up!</h3>
        <p className="text-gray-600 mt-2">No pending payments at the moment.</p>
      </div>
    );
  }

  return (
    <>
      {/* Order Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {orders.map((order) => (
          <PendingOrderCard
            key={order.id}
            order={order}
            onClick={() => setSelectedOrder(order)}
          />
        ))}
      </div>

      {/* Payment Modal */}
      {selectedOrder && (
        <PaymentInterface
          order={selectedOrder}
          onClose={() => setSelectedOrder(null)}
          onPaymentComplete={() => {
            setSelectedOrder(null);
            refetch();
          }}
        />
      )}
    </>
  );
}
```

---

### 3. Pending Order Card Component

**Location:** `src/components/pos/PendingOrderCard.tsx`

**Purpose:** Individual order card showing key info

```typescript
'use client';

import { formatCurrency } from '@/lib/utils/format';
import { formatDistanceToNow } from 'date-fns';
import { Clock, User, MapPin } from 'lucide-react';
import type { OrderWithDetails } from '@/types/pos';

interface Props {
  order: OrderWithDetails;
  onClick: () => void;
}

export function PendingOrderCard({ order, onClick }: Props) {
  const waitingTime = formatDistanceToNow(new Date(order.createdAt), {
    addSuffix: true,
  });

  return (
    <button
      onClick={onClick}
      className="w-full text-left bg-white rounded-lg shadow-sm hover:shadow-md
                 transition-shadow border-2 border-yellow-400 p-4 space-y-3"
    >
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium text-gray-500">Order #{order.orderNumber}</p>
          <h3 className="text-lg font-bold text-gray-900 mt-1">
            {order.table.tableName || `Table ${order.table.tableNumber}`}
          </h3>
        </div>
        <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs
                        font-medium bg-yellow-100 text-yellow-800">
          Pending
        </span>
      </div>

      {/* Customer Info */}
      {order.customerSession?.customerName && (
        <div className="flex items-center text-sm text-gray-600">
          <User className="h-4 w-4 mr-1.5" />
          {order.customerSession.customerName}
        </div>
      )}

      {/* Waiting Time */}
      <div className="flex items-center text-sm text-gray-600">
        <Clock className="h-4 w-4 mr-1.5" />
        {waitingTime}
      </div>

      {/* Amount */}
      <div className="pt-2 border-t border-gray-200">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-gray-700">Total Amount</span>
          <span className="text-2xl font-bold text-gray-900">
            {formatCurrency(order.totalAmount)}
          </span>
        </div>
      </div>

      {/* Items Count */}
      <p className="text-xs text-gray-500">
        {order.items.length} item{order.items.length !== 1 ? 's' : ''}
      </p>
    </button>
  );
}
```

---

### 4. Payment Interface Component

**Location:** `src/components/pos/PaymentInterface.tsx`

**Purpose:** Modal for processing payments

```typescript
'use client';

import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { PaymentMethodSelector } from './PaymentMethodSelector';
import { OrderDetails } from './OrderDetails';
import { CashPaymentForm } from './CashPaymentForm';
import { Receipt } from './Receipt';
import { formatCurrency } from '@/lib/utils/format';
import { processPayment } from '@/lib/services/payment-service';
import type { OrderWithDetails, PaymentMethod } from '@/types/pos';

interface Props {
  order: OrderWithDetails;
  onClose: () => void;
  onPaymentComplete: () => void;
}

export function PaymentInterface({ order, onClose, onPaymentComplete }: Props) {
  const [step, setStep] = useState<'select-method' | 'process' | 'receipt'>('select-method');
  const [selectedMethod, setSelectedMethod] = useState<PaymentMethod | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [paymentResult, setPaymentResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const handleMethodSelect = (method: PaymentMethod) => {
    setSelectedMethod(method);
    setStep('process');
  };

  const handleProcessPayment = async (data: any) => {
    setIsProcessing(true);
    setError(null);

    try {
      const result = await processPayment({
        orderId: order.id,
        paymentMethod: selectedMethod!,
        ...data,
      });

      setPaymentResult(result);
      setStep('receipt');

      // Notify parent
      setTimeout(() => {
        onPaymentComplete();
      }, 3000);
    } catch (err: any) {
      setError(err.message || 'Payment processing failed');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            Process Payment - Order #{order.orderNumber}
          </DialogTitle>
        </DialogHeader>

        {/* Order Details (Always visible) */}
        <OrderDetails order={order} />

        {/* Total Amount Display */}
        <div className="bg-gray-50 p-4 rounded-lg">
          <div className="flex items-center justify-between">
            <span className="text-lg font-medium text-gray-700">Total Amount</span>
            <span className="text-3xl font-bold text-gray-900">
              {formatCurrency(order.totalAmount)}
            </span>
          </div>
        </div>

        {/* Step-based Content */}
        {step === 'select-method' && (
          <PaymentMethodSelector onSelect={handleMethodSelect} />
        )}

        {step === 'process' && selectedMethod && (
          <>
            {selectedMethod === 'cash' ? (
              <CashPaymentForm
                totalAmount={Number(order.totalAmount)}
                onSubmit={handleProcessPayment}
                onCancel={() => setStep('select-method')}
                isProcessing={isProcessing}
              />
            ) : (
              <div className="space-y-4">
                <p className="text-gray-600">
                  {selectedMethod === 'card'
                    ? 'Please process the card payment using your card terminal.'
                    : 'Please process the e-wallet payment.'}
                </p>
                <button
                  onClick={() => handleProcessPayment({})}
                  disabled={isProcessing}
                  className="w-full bg-green-600 text-white py-3 rounded-lg
                           font-semibold hover:bg-green-700 disabled:opacity-50"
                >
                  {isProcessing ? 'Processing...' : 'Confirm Payment Received'}
                </button>
                <button
                  onClick={() => setStep('select-method')}
                  disabled={isProcessing}
                  className="w-full bg-gray-200 text-gray-700 py-3 rounded-lg
                           font-semibold hover:bg-gray-300"
                >
                  Back
                </button>
              </div>
            )}
          </>
        )}

        {step === 'receipt' && paymentResult && (
          <Receipt
            order={order}
            payment={paymentResult.payment}
            onClose={onClose}
          />
        )}

        {/* Error Display */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <p className="text-red-800 font-medium">Error: {error}</p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
```

---

### 5. Payment Method Selector Component

**Location:** `src/components/pos/PaymentMethodSelector.tsx`

```typescript
'use client';

import { Banknote, CreditCard, Smartphone } from 'lucide-react';
import type { PaymentMethod } from '@/types/pos';

interface Props {
  onSelect: (method: PaymentMethod) => void;
}

export function PaymentMethodSelector({ onSelect }: Props) {
  const methods = [
    {
      id: 'cash' as PaymentMethod,
      label: 'Cash',
      icon: Banknote,
      color: 'bg-green-50 hover:bg-green-100 border-green-300',
      iconColor: 'text-green-600',
    },
    {
      id: 'card' as PaymentMethod,
      label: 'Card',
      icon: CreditCard,
      color: 'bg-blue-50 hover:bg-blue-100 border-blue-300',
      iconColor: 'text-blue-600',
    },
    {
      id: 'ewallet' as PaymentMethod,
      label: 'E-Wallet',
      icon: Smartphone,
      color: 'bg-purple-50 hover:bg-purple-100 border-purple-300',
      iconColor: 'text-purple-600',
    },
  ];

  return (
    <div className="space-y-3">
      <h3 className="text-lg font-semibold text-gray-900">Select Payment Method</h3>

      <div className="grid grid-cols-3 gap-4">
        {methods.map((method) => {
          const Icon = method.icon;
          return (
            <button
              key={method.id}
              onClick={() => onSelect(method.id)}
              className={`${method.color} border-2 rounded-xl p-6
                         transition-all hover:scale-105 active:scale-95
                         flex flex-col items-center justify-center space-y-3`}
            >
              <Icon className={`h-12 w-12 ${method.iconColor}`} />
              <span className="text-lg font-semibold text-gray-900">
                {method.label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
```

---

### 6. Cash Payment Form Component

**Location:** `src/components/pos/CashPaymentForm.tsx`

```typescript
'use client';

import { useState, useEffect } from 'react';
import { formatCurrency } from '@/lib/utils/format';

interface Props {
  totalAmount: number;
  onSubmit: (data: { cashReceived: number }) => void;
  onCancel: () => void;
  isProcessing: boolean;
}

export function CashPaymentForm({ totalAmount, onSubmit, onCancel, isProcessing }: Props) {
  const [cashReceived, setCashReceived] = useState<string>('');
  const [changeGiven, setChangeGiven] = useState<number>(0);

  useEffect(() => {
    const received = parseFloat(cashReceived) || 0;
    setChangeGiven(Math.max(0, received - totalAmount));
  }, [cashReceived, totalAmount]);

  const quickAmounts = [
    totalAmount,
    Math.ceil(totalAmount / 5) * 5,
    Math.ceil(totalAmount / 10) * 10,
    Math.ceil(totalAmount / 20) * 20,
    Math.ceil(totalAmount / 50) * 50,
    Math.ceil(totalAmount / 100) * 100,
  ].filter((amount, index, self) => self.indexOf(amount) === index);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const received = parseFloat(cashReceived);

    if (isNaN(received) || received < totalAmount) {
      alert('Cash received must be at least the total amount');
      return;
    }

    onSubmit({ cashReceived: received });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Cash Received Input */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Cash Received
        </label>
        <div className="relative">
          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-2xl
                         font-semibold text-gray-500">
            RM
          </span>
          <input
            type="number"
            value={cashReceived}
            onChange={(e) => setCashReceived(e.target.value)}
            step="0.01"
            min={totalAmount}
            placeholder="0.00"
            className="w-full pl-16 pr-4 py-4 text-3xl font-bold text-gray-900
                     border-2 border-gray-300 rounded-lg focus:border-green-500
                     focus:ring focus:ring-green-200"
            autoFocus
          />
        </div>
      </div>

      {/* Quick Amount Buttons */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Quick Select
        </label>
        <div className="grid grid-cols-3 gap-2">
          {quickAmounts.map((amount) => (
            <button
              key={amount}
              type="button"
              onClick={() => setCashReceived(amount.toString())}
              className="px-4 py-3 bg-gray-100 hover:bg-gray-200 rounded-lg
                       font-semibold text-gray-900 transition-colors"
            >
              {formatCurrency(amount)}
            </button>
          ))}
        </div>
      </div>

      {/* Change Display */}
      <div className="bg-green-50 border-2 border-green-300 rounded-lg p-4">
        <div className="flex items-center justify-between">
          <span className="text-lg font-medium text-green-800">Change</span>
          <span className="text-3xl font-bold text-green-900">
            {formatCurrency(changeGiven)}
          </span>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex gap-3">
        <button
          type="button"
          onClick={onCancel}
          disabled={isProcessing}
          className="flex-1 px-6 py-3 bg-gray-200 text-gray-700 rounded-lg
                   font-semibold hover:bg-gray-300 disabled:opacity-50"
        >
          Back
        </button>
        <button
          type="submit"
          disabled={isProcessing || !cashReceived || parseFloat(cashReceived) < totalAmount}
          className="flex-1 px-6 py-3 bg-green-600 text-white rounded-lg
                   font-semibold hover:bg-green-700 disabled:opacity-50"
        >
          {isProcessing ? 'Processing...' : 'Complete Payment'}
        </button>
      </div>
    </form>
  );
}
```

---

## Business Logic

### Payment Service

**Location:** `src/lib/services/payment-service.ts`

```typescript
import { PAYMENT_METHODS, PAYMENT_STATUS } from '@/lib/constants/payment';
import type { PaymentProcessRequest, PaymentProcessResult } from '@/types/pos';

export async function processPayment(
  data: PaymentProcessRequest
): Promise<PaymentProcessResult> {
  const response = await fetch(`/api/pos/payment/${data.orderId}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
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
    {
      headers: {
        'Cache-Control': 'no-cache',
      },
    }
  );

  if (!response.ok) {
    throw new Error('Failed to fetch pending orders');
  }

  return response.json();
}
```

---

### Payment Constants

**Location:** `src/lib/constants/payment.ts`

```typescript
// SINGLE SOURCE OF TRUTH for payment-related constants

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

---

## Security & Permissions

### RBAC Permissions

Add new permission to existing RBAC system:

```typescript
// Add to existing permission definitions
{
  'payments:process': 'Process counter payments',
  'payments:view': 'View payment history',
  'payments:refund': 'Process refunds',
}
```

### Permission Matrix

| Role | payments:process | payments:view | payments:refund |
|------|------------------|---------------|-----------------|
| **Owner** | ✅ | ✅ | ✅ |
| **Manager** | ✅ | ✅ | ✅ |
| **Cashier** | ✅ | ✅ | ❌ |
| **Server** | ❌ | ✅ | ❌ |
| **Kitchen** | ❌ | ❌ | ❌ |

### Security Measures

1. **Authentication**: All endpoints require valid RBAC token
2. **Authorization**: Permission checks on every request
3. **Audit Logging**: All payment transactions logged
4. **Input Validation**: Zod schemas for all inputs
5. **SQL Injection Protection**: Prisma ORM (no raw SQL)
6. **XSS Protection**: React auto-escaping
7. **CSRF Protection**: Next.js built-in protection

---

## Testing Strategy

### 1. Unit Tests

```typescript
// src/lib/services/__tests__/payment-service.test.ts

describe('Payment Service', () => {
  describe('processPayment', () => {
    it('should process cash payment correctly', async () => {
      const result = await processPayment({
        orderId: 'test-order-id',
        paymentMethod: 'cash',
        cashReceived: 100,
      });

      expect(result.success).toBe(true);
      expect(result.payment.status).toBe('completed');
    });

    it('should reject insufficient cash', async () => {
      await expect(
        processPayment({
          orderId: 'test-order-id',
          paymentMethod: 'cash',
          cashReceived: 50, // Less than order total
        })
      ).rejects.toThrow('Insufficient cash received');
    });
  });
});
```

### 2. Integration Tests

```typescript
// src/app/api/pos/payment/__tests__/route.test.ts

describe('POST /api/pos/payment/[orderId]', () => {
  it('should create payment and update order status', async () => {
    const order = await createTestOrder();

    const response = await POST(
      new Request('http://localhost:3000/api/pos/payment/' + order.id, {
        method: 'POST',
        body: JSON.stringify({
          paymentMethod: 'cash',
          cashReceived: 100,
        }),
      })
    );

    expect(response.status).toBe(200);

    const updatedOrder = await prisma.order.findUnique({
      where: { id: order.id },
    });

    expect(updatedOrder?.paymentStatus).toBe('completed');
  });
});
```

### 3. E2E Tests (Playwright)

```typescript
// e2e/pos/payment-processing.spec.ts

import { test, expect } from '@playwright/test';

test('Cashier can process cash payment', async ({ page }) => {
  // 1. Login as cashier
  await page.goto('/auth/login');
  await page.fill('[name="username"]', 'cashier@test.com');
  await page.fill('[name="password"]', 'password');
  await page.click('button[type="submit"]');

  // 2. Navigate to POS
  await page.goto('/dashboard/cashier');

  // 3. Wait for orders to load
  await expect(page.locator('[data-testid="order-card"]').first()).toBeVisible();

  // 4. Click first pending order
  await page.locator('[data-testid="order-card"]').first().click();

  // 5. Select cash payment
  await page.click('[data-testid="payment-method-cash"]');

  // 6. Enter cash received
  await page.fill('[data-testid="cash-received-input"]', '100');

  // 7. Submit payment
  await page.click('[data-testid="complete-payment-btn"]');

  // 8. Verify receipt displayed
  await expect(page.locator('[data-testid="receipt"]')).toBeVisible();

  // 9. Verify order removed from pending list
  await page.click('[data-testid="close-receipt"]');
  await expect(page.locator('text="All Caught Up!"')).toBeVisible();
});
```

---

## Implementation Roadmap

### Phase 1: Foundation (Week 1)

#### Day 1-2: Database & Constants
- [ ] Update Prisma schema with new Payment fields
- [ ] Run migration: `npx prisma migrate dev --name add_pos_payment_fields`
- [ ] Create `src/lib/constants/payment.ts`
- [ ] Create `src/types/pos.ts`

#### Day 3-4: API Endpoints
- [ ] Implement `GET /api/pos/orders/pending`
- [ ] Implement `POST /api/pos/payment/[orderId]`
- [ ] Add RBAC permissions: `payments:process`, `payments:view`
- [ ] Write API unit tests

#### Day 5-7: Core UI Components
- [ ] Create `CashierDashboard` page
- [ ] Create `PendingOrderCard` component
- [ ] Create `PaymentMethodSelector` component
- [ ] Create `CashPaymentForm` component
- [ ] Add Tailwind utility classes

---

### Phase 2: Real-time & Polish (Week 2)

#### Day 1-2: Real-time Updates
- [ ] Implement `usePendingOrders` hook with polling/SSE
- [ ] Add PostgreSQL NOTIFY event: `publishPaymentCompleted`
- [ ] Test real-time order removal after payment

#### Day 3-4: Receipt Generation
- [ ] Create `Receipt` component
- [ ] Implement `generateReceiptNumber` utility
- [ ] Add print receipt functionality (browser print API)
- [ ] Digital receipt (email/SMS - optional)

#### Day 5-7: Testing & Refinement
- [ ] Write E2E tests (Playwright)
- [ ] UAT with actual staff members
- [ ] Performance testing (100+ pending orders)
- [ ] Mobile responsiveness testing

---

### Phase 3: Enhancement (Week 3 - Optional)

#### Advanced Features
- [ ] Till management (opening/closing till)
- [ ] Cash drawer reconciliation
- [ ] Shift reports
- [ ] Split payment support
- [ ] Payment refund functionality
- [ ] Digital wallet QR code integration (DuitNow, Touch 'n Go)

---

## Deployment & Rollout

### Pre-deployment Checklist

- [ ] All tests passing (unit, integration, E2E)
- [ ] Database migrations tested on staging
- [ ] RBAC permissions configured
- [ ] Performance benchmarks met (<2s load time)
- [ ] Mobile responsive testing completed
- [ ] User acceptance testing (UAT) signed off
- [ ] Documentation updated (API docs, user guide)
- [ ] Rollback plan documented

### Deployment Steps

1. **Database Migration**
   ```bash
   npx prisma migrate deploy
   ```

2. **Update RBAC Permissions**
   ```sql
   -- Add to permissions table
   INSERT INTO permissions (name, description) VALUES
   ('payments:process', 'Process counter payments'),
   ('payments:view', 'View payment history');

   -- Assign to roles
   INSERT INTO role_permissions (role_id, permission_id)
   SELECT id, (SELECT id FROM permissions WHERE name = 'payments:process')
   FROM roles WHERE name IN ('owner', 'manager', 'cashier');
   ```

3. **Deploy Application**
   ```bash
   npm run build
   npm run start
   ```

4. **Verify Deployment**
   - Check `/dashboard/cashier` accessible
   - Test payment processing with test order
   - Verify audit logs created
   - Check real-time updates working

---

## Monitoring & Metrics

### Key Metrics

| Metric | Target | Critical Threshold |
|--------|--------|-------------------|
| **Page Load Time** | <2s | >5s |
| **Payment Processing Time** | <3s | >10s |
| **API Response Time (GET orders)** | <500ms | >2s |
| **API Response Time (POST payment)** | <1s | >5s |
| **Error Rate** | <0.1% | >1% |
| **Concurrent Users** | 20+ | N/A |

### Logging

```typescript
// Payment processing events to log:
- Payment initiated (orderId, paymentMethod, amount)
- Payment completed (paymentId, duration, staffId)
- Payment failed (orderId, reason, stackTrace)
- Cash reconciliation mismatch (expected vs actual)
```

---

## Appendix

### A. Type Definitions

```typescript
// src/types/pos.ts

import type { Order, Payment, Table, MenuItem } from '@prisma/client';

export type PaymentMethod = 'cash' | 'card' | 'ewallet';

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

export interface PaymentProcessRequest {
  orderId: string;
  paymentMethod: PaymentMethod;
  cashReceived?: number;
  externalTransactionId?: string;
  notes?: string;
}

export interface PaymentProcessResult {
  success: boolean;
  payment: Payment;
  order: Pick<Order, 'id' | 'paymentStatus' | 'updatedAt'>;
  message: string;
}
```

### B. Migration Script

```prisma
-- Migration: 20251210_add_pos_payment_fields

BEGIN;

-- Add new fields to payments table
ALTER TABLE "payments"
ADD COLUMN "processedBy" TEXT,
ADD COLUMN "cashReceived" DECIMAL(10,2),
ADD COLUMN "changeGiven" DECIMAL(10,2),
ADD COLUMN "receiptNumber" TEXT UNIQUE;

-- Add foreign key for processedBy
ALTER TABLE "payments"
ADD CONSTRAINT "payments_processedBy_fkey"
FOREIGN KEY ("processedBy") REFERENCES "staff"("id") ON DELETE SET NULL;

-- Add indexes for performance
CREATE INDEX "payments_processedBy_idx" ON "payments"("processedBy");
CREATE INDEX "payments_receiptNumber_idx" ON "payments"("receiptNumber");

COMMIT;
```

---

## References

- [Modern POS System Design Principles](https://agentestudio.com/blog/design-principles-pos-interface)
- [Restaurant Payment Processing 2025](https://getquantic.com/payment-processing-for-restaurants/)
- [QR Code Ordering Integration](https://sundayapp.com/qr-code-ordering-how-to-integrate-this-solution-with-your-existing-pos/)
- [Efficient UX Design for POS Systems](https://snabble.io/en/latest/efficient-ux-design-for-modern-pos-systems)
- Project Coding Standards: `claudedocs/CODING_STANDARDS.md` (to be created)
- Next.js 14 Documentation: https://nextjs.org/docs
- Prisma Best Practices: https://www.prisma.io/docs/guides

---

**Document Status:** ✅ Ready for Implementation
**Approved By:** [To be filled]
**Implementation Start Date:** [To be scheduled]

---

*This document follows the coding standards defined in CLAUDE.md and represents the Single Source of Truth for Phase 1 POS implementation.*
