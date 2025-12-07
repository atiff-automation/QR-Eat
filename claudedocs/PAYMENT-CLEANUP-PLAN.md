# Payment System Cleanup Plan

**Project**: QR Restaurant Ordering System
**Date**: 2025-01-15
**Purpose**: Remove unused payment code to prepare for new payment implementation

---

## Executive Summary

This document outlines all code, components, and database elements that need to be removed before implementing the new payment system. The new system supports:
- **Online Payment**: ToyyibPay only (Malaysian payment gateway)
- **Counter Payment**: Cash and QR manual verification only
- **NO**: Stripe, tip functionality, or card terminal support

---

## 🔍 Inspection Findings

### Files with Stripe References
Based on codebase analysis, the following files contain Stripe-related code:

1. **`src/types/payment.ts`** - Lines with `'stripe'` payment method type
2. **`src/lib/payment-utils.ts`** - Stripe provider constant
3. **`src/app/api/payment/create-intent/route.ts`** - Mock Stripe implementation
4. **`src/app/api/payment/confirm/route.ts`** - Stripe payment confirmation logic
5. **`src/components/payment/PaymentForm.tsx`** - Stripe payment method handling

### Files with Tip Functionality
1. **`src/components/payment/TipSelector.tsx`** - **ENTIRE FILE TO DELETE**
2. **`src/components/payment/PaymentForm.tsx`** - Tip selection and calculation logic
3. **`src/app/api/payment/confirm/route.ts`** - Tip handling in payment confirmation
4. **`src/lib/payment-utils.ts`** - Tip calculation functions
5. **`src/types/payment.ts`** - Tip-related interfaces

### Database Schema Changes
**File**: `prisma/schema.prisma`

**Model: PaymentIntent** (Lines 571-592)
- ❌ Remove: `tip` field (line 582)
- ❌ Remove: `finalAmount` field (line 581) - redundant with tip removal
- ⚠️ Keep: `clientSecret` (line 579) - may be used for ToyyibPay

**Model: Order**
- ✅ Add: `toyyibpayBillCode` field (new)
- ✅ Add: `toyyibpayPaymentUrl` field (new)

---

## 📋 Detailed Cleanup Tasks

### Task 1: Remove Stripe Payment Method Type

**File**: `src/types/payment.ts`

**Current Code** (Lines 14-22):
```typescript
export type PaymentMethodType =
  | 'cash'
  | 'card'
  | 'digital_wallet'
  | 'bank_transfer'
  | 'stripe'        // ❌ REMOVE THIS
  | 'paypal'        // ❌ REMOVE THIS
  | 'apple_pay'     // ❌ REMOVE THIS
  | 'google_pay';   // ❌ REMOVE THIS
```

**New Code**:
```typescript
export type PaymentMethodType =
  | 'cash'
  | 'qr_manual'     // Manual QR verification at counter
  | 'toyyibpay';    // ToyyibPay online payment
```

**Justification**: Only three payment methods in new system.

---

### Task 2: Remove Payment Provider Constants

**File**: `src/lib/payment-utils.ts`

**Remove** (Lines 147-151):
```typescript
export const PAYMENT_PROVIDERS = {
  STRIPE: 'stripe',
  PAYPAL: 'paypal',
  CASH: 'cash',
} as const;
```

**Justification**: Not using payment provider abstraction; using specific implementations.

---

### Task 3: Remove Tip Calculation Functions

**File**: `src/lib/payment-utils.ts`

**Remove** (Lines 113-115):
```typescript
export function calculateTipAmount(subtotal: number, tipPercentage: number): number {
  return Math.round(subtotal * (tipPercentage / 100) * 100) / 100;
}
```

**Remove** (Line 145):
```typescript
export const DEFAULT_TIP_SUGGESTIONS = [10, 15, 18, 20, 25];
```

**Justification**: No tip functionality in new system.

---

### Task 4: Update Payment Method Icons

**File**: `src/lib/payment-utils.ts`

**Current Code** (Lines 10-31):
```typescript
export function getPaymentMethodIcon(type: PaymentMethodType): string {
  switch (type) {
    case 'cash':
      return '💵';
    case 'card':          // ❌ REMOVE
      return '💳';
    case 'digital_wallet': // ❌ REMOVE
      return '📱';
    case 'bank_transfer':  // ❌ REMOVE
      return '🏦';
    case 'stripe':        // ❌ REMOVE
      return '💳';
    case 'paypal':        // ❌ REMOVE
      return '🅿️';
    case 'apple_pay':     // ❌ REMOVE
      return '🍎';
    case 'google_pay':    // ❌ REMOVE
      return '🅶';
    default:
      return '💳';
  }
}
```

**New Code**:
```typescript
export function getPaymentMethodIcon(type: PaymentMethodType): string {
  switch (type) {
    case 'cash':
      return '💵';
    case 'qr_manual':
      return '📱';
    case 'toyyibpay':
      return '💳';
    default:
      return '💳';
  }
}
```

---

### Task 5: Update Payment Method Names

**File**: `src/lib/payment-utils.ts`

**Current Code** (Lines 33-54):
```typescript
export function getPaymentMethodName(type: PaymentMethodType): string {
  switch (type) {
    case 'cash':
      return 'Cash';
    case 'card':          // ❌ REMOVE
      return 'Credit/Debit Card';
    case 'digital_wallet': // ❌ REMOVE
      return 'Digital Wallet';
    case 'bank_transfer':  // ❌ REMOVE
      return 'Bank Transfer';
    case 'stripe':        // ❌ REMOVE
      return 'Card Payment';
    case 'paypal':        // ❌ REMOVE
      return 'PayPal';
    case 'apple_pay':     // ❌ REMOVE
      return 'Apple Pay';
    case 'google_pay':    // ❌ REMOVE
      return 'Google Pay';
    default:
      return 'Unknown';
  }
}
```

**New Code**:
```typescript
export function getPaymentMethodName(type: PaymentMethodType): string {
  switch (type) {
    case 'cash':
      return 'Cash';
    case 'qr_manual':
      return 'QR Payment';
    case 'toyyibpay':
      return 'Online Payment (ToyyibPay)';
    default:
      return 'Unknown';
  }
}
```

---

### Task 6: Delete TipSelector Component

**File**: `src/components/payment/TipSelector.tsx`

**Action**: **DELETE ENTIRE FILE** (138 lines)

**Justification**: No tip functionality required.

**Impact Check**:
- Used in: `src/components/payment/PaymentForm.tsx`
- Action: Remove import and usage from PaymentForm

---

### Task 7: Remove Tip Logic from PaymentForm

**File**: `src/components/payment/PaymentForm.tsx`

**Remove Import** (Line 8):
```typescript
import { TipSelector } from './TipSelector';  // ❌ REMOVE THIS LINE
```

**Remove State** (Line 23):
```typescript
const [selectedTip, setSelectedTip] = useState(0);  // ❌ REMOVE THIS LINE
```

**Remove Calculation** (Line 28):
```typescript
const totalWithTip = order.totalAmount + selectedTip;  // ❌ REMOVE THIS LINE
```

**Remove 'tip' Step** (Line 26):
Change from:
```typescript
const [paymentStep, setPaymentStep] = useState<'method' | 'tip' | 'confirm' | 'processing'>('method');
```
To:
```typescript
const [paymentStep, setPaymentStep] = useState<'method' | 'confirm' | 'processing'>('method');
```

**Remove Tip Handlers** (Lines 35-55):
```typescript
const handleContinueToTip = () => { ... }     // ❌ REMOVE
const handleContinueToConfirm = () => { ... } // ❌ REMOVE (or rename)
const handleBackToTip = () => { ... }         // ❌ REMOVE
```

**Remove Tip Step UI** (Lines 240-264):
```typescript
{paymentStep === 'tip' && (
  <div className="space-y-6">
    <TipSelector ... />  // ❌ REMOVE ENTIRE BLOCK
  </div>
)}
```

**Remove Tip from Metadata** (Lines 76-80):
```typescript
metadata: {
  tip: selectedTip,           // ❌ REMOVE
  totalWithTip               // ❌ REMOVE
}
```

**Remove Tip from Confirmation** (Lines 129):
```typescript
tip: selectedTip  // ❌ REMOVE THIS PARAMETER
```

---

### Task 8: Remove Stripe Mock from Payment Intent API

**File**: `src/app/api/payment/create-intent/route.ts`

**Remove** (Lines 69-73):
```typescript
case 'card':
  // In production, integrate with Stripe/Square/etc.
  response.clientSecret = `pi_test_${paymentIntent.id}`;
  response.message = 'Use test card: 4242 4242 4242 4242';
  break;
```

**Remove** (Lines 74-78):
```typescript
case 'digital_wallet':
  // In production, this would handle Apple Pay/Google Pay
  response.message = 'Digital wallet payment available';
  break;
```

**Keep Only**:
```typescript
case 'cash':
  response.message = 'Please prepare cash payment. Staff will confirm receipt.';
  break;

// Add new case for ToyyibPay (to be implemented)
case 'toyyibpay':
  // Will be implemented with ToyyibPay service
  break;

default:
  return NextResponse.json(
    { error: 'Unsupported payment method' },
    { status: 400 }
  );
```

---

### Task 9: Remove Stripe/Tip Logic from Payment Confirm API

**File**: `src/app/api/payment/confirm/route.ts`

**Remove Tip Parameter** (Line 7):
```typescript
const { paymentIntentId, paymentMethodData, tip } = await request.json();
```
Change to:
```typescript
const { paymentIntentId, paymentMethodData } = await request.json();
```

**Remove Tip Calculation** (Lines 43-49):
```typescript
let finalAmount = paymentIntent.amount;

// Add tip if provided
if (tip && tip > 0) {
  finalAmount += tip;  // ❌ REMOVE THIS LOGIC
}
```

**Remove Stripe Cases** (Lines 59-74):
```typescript
case 'card':
  // In production, this would call Stripe/Square API
  // For demo, simulate successful payment
  paymentStatus = 'succeeded';
  transactionId = `CARD_${Date.now()}`;
  break;

case 'digital_wallet':
  // In production, this would handle Apple Pay/Google Pay
  paymentStatus = 'succeeded';
  transactionId = `WALLET_${Date.now()}`;
  break;
```

**Remove Tip from Update** (Lines 77-89):
```typescript
data: {
  status: paymentStatus,
  transactionId,
  confirmedAt: paymentStatus === 'succeeded' ? new Date() : undefined,
  finalAmount,  // ❌ REMOVE (or set to amount)
  tip: tip || 0,  // ❌ REMOVE THIS LINE
  metadata: { ... }
}
```

**Remove Tip from Response** (Lines 117-120):
```typescript
amount: updatedPaymentIntent.finalAmount || updatedPaymentIntent.amount,  // ❌ SIMPLIFY
tip: updatedPaymentIntent.tip || 0  // ❌ REMOVE THIS LINE
```

---

### Task 10: Remove Tip Field from Database Schema

**File**: `prisma/schema.prisma`

**Current PaymentIntent Model** (Lines 571-592):
```prisma
model PaymentIntent {
  id              String   @id @default(uuid())
  orderId         String
  amount          Decimal  @db.Decimal(10, 2)
  currency        String   @default("USD")
  paymentMethodId String
  status          String   @default("pending")
  reference       String   @unique
  clientSecret    String?
  transactionId   String?
  finalAmount     Decimal? @db.Decimal(10, 2)  // ❌ REMOVE (redundant)
  tip             Decimal  @default(0.00) @db.Decimal(10, 2)  // ❌ REMOVE
  metadata        Json     @default("{}")
  expiresAt       DateTime
  createdAt       DateTime @default(now())
  confirmedAt     DateTime?
  updatedAt       DateTime @updatedAt

  order Order @relation(fields: [orderId], references: [id], onDelete: Cascade)

  @@map("payment_intents")
}
```

**New PaymentIntent Model**:
```prisma
model PaymentIntent {
  id              String   @id @default(uuid())
  orderId         String
  amount          Decimal  @db.Decimal(10, 2)
  currency        String   @default("MYR")  // Changed from USD to MYR
  paymentMethodId String
  status          String   @default("pending")
  reference       String   @unique
  transactionId   String?

  // For manual QR payments
  referenceNumber String?  // ✅ ADD: QR payment reference from customer
  verifiedBy      String?  // ✅ ADD: Staff ID who verified payment
  verifiedAt      DateTime?  // ✅ ADD: Verification timestamp

  metadata        Json     @default("{}")
  expiresAt       DateTime
  createdAt       DateTime @default(now())
  confirmedAt     DateTime?
  updatedAt       DateTime @updatedAt

  order Order @relation(fields: [orderId], references: [id], onDelete: Cascade)

  @@map("payment_intents")
}
```

**Migration Required**: Yes - Database migration to:
1. Remove `tip` column
2. Remove `finalAmount` column
3. Remove `clientSecret` column (not needed for ToyyibPay)
4. Add `referenceNumber` column
5. Add `verifiedBy` column
6. Add `verifiedAt` column
7. Change default currency from "USD" to "MYR"

---

### Task 11: Add ToyyibPay Fields to Order Model

**File**: `prisma/schema.prisma`

**Find Order Model** and add:
```prisma
model Order {
  // ... existing fields ...

  // ToyyibPay specific fields
  toyyibpayBillCode    String?  // ✅ ADD: Bill code from ToyyibPay
  toyyibpayPaymentUrl  String?  // ✅ ADD: Payment URL for customer redirect

  // ... rest of fields ...
}
```

**Migration Required**: Yes - Add new columns to Order table.

---

### Task 12: Update Payment Config Type

**File**: `src/types/payment.ts`

**Remove** (Lines 83-92):
```typescript
export interface PaymentConfig {
  currency: string;
  enabledMethods: PaymentMethodType[];
  stripePublishableKey?: string;  // ❌ REMOVE
  paypalClientId?: string;        // ❌ REMOVE
  minimumAmount: number;
  maximumAmount: number;
  allowTips: boolean;             // ❌ REMOVE
  tipSuggestions: number[];       // ❌ REMOVE
}
```

**New**:
```typescript
export interface PaymentConfig {
  currency: string;  // Always "MYR"
  enabledMethods: PaymentMethodType[];  // ['cash', 'qr_manual', 'toyyibpay']
  minimumAmount: number;
  maximumAmount: number;

  // ToyyibPay config
  toyyibpayEnabled: boolean;
  toyyibpayEnvironment: 'sandbox' | 'production';
}
```

---

### Task 13: Update Payment Methods API Response

**File**: `src/app/api/payment/methods/route.ts`

**Current Response** (Lines 19-44):
```typescript
const paymentMethods = [
  {
    id: 'cash',
    type: 'cash' as PaymentMethodType,
    name: 'Cash',
    description: 'Pay with cash at the table',
    enabled: true,
    config: {}
  },
  {
    id: 'card',  // ❌ REMOVE
    type: 'card' as PaymentMethodType,
    name: 'Credit/Debit Card',
    description: 'Pay with your card',
    enabled: true,
    config: {}
  },
  {
    id: 'digital_wallet',  // ❌ REMOVE
    type: 'digital_wallet' as PaymentMethodType,
    name: 'Digital Wallet',
    description: 'Apple Pay, Google Pay, etc.',
    enabled: true,
    config: {}
  }
];
```

**New Response**:
```typescript
const paymentMethods = [
  {
    id: 'toyyibpay',
    type: 'toyyibpay' as PaymentMethodType,
    name: 'Pay Online Now',
    description: 'Pay with FPX or Credit/Debit Card via ToyyibPay',
    enabled: true,  // Check from system config
    config: {}
  }
];
```

**Note**: Counter payment methods (cash, qr_manual) are NOT returned here as they're only available at cashier counter, not during online ordering.

---

### Task 14: Remove Stripe from PaymentForm

**File**: `src/components/payment/PaymentForm.tsx`

**Remove Stripe Case** (Lines 95-109):
```typescript
switch (selectedPaymentMethod) {
  case 'cash':
    confirmationData = { paymentMethodData: { type: 'cash' } };
    break;

  case 'card':  // ❌ REMOVE THIS ENTIRE CASE
    confirmationData = {
      paymentMethodData: {
        type: 'card',
        card: { brand: 'visa', last4: '4242' }
      }
    };
    break;

  case 'digital_wallet':  // ❌ REMOVE THIS ENTIRE CASE
    confirmationData = {
      paymentMethodData: { type: 'digital_wallet' }
    };
    break;

  default:
    throw new Error('Unsupported payment method');
}
```

**Replace with**:
```typescript
// For ToyyibPay, redirect happens before this point
// This confirm logic only for cash (counter payment)
if (selectedPaymentMethod === 'cash') {
  confirmationData = { paymentMethodData: { type: 'cash' } };
} else {
  throw new Error('Unsupported payment method');
}
```

---

## 🗑️ Files to Delete Completely

### 1. TipSelector Component
**Path**: `src/components/payment/TipSelector.tsx`
**Reason**: No tip functionality in new system
**Action**: `rm src/components/payment/TipSelector.tsx`

---

## 📝 Environment Variables to Remove

**File**: `.env`, `.env.local`, `.env.example`

**Remove**:
```bash
STRIPE_PUBLISHABLE_KEY="pk_test_your_key_here"  # ❌ REMOVE
STRIPE_SECRET_KEY="sk_test_your_key_here"       # ❌ REMOVE
```

**Add**:
```bash
# ToyyibPay Configuration
TOYYIBPAY_SANDBOX_URL="https://dev.toyyibpay.com"
TOYYIBPAY_PRODUCTION_URL="https://toyyibpay.com"
TOYYIBPAY_TIMEOUT="30000"
NEXT_PUBLIC_APP_URL="http://localhost:3000"  # For webhooks
NEXTAUTH_SECRET="your-secret-key-here"  # For credential encryption
```

---

## 🔄 Database Migration Script

**File**: Create `prisma/migrations/YYYYMMDDHHMMSS_remove_tip_add_toyyibpay/migration.sql`

```sql
-- Remove tip-related fields from PaymentIntent
ALTER TABLE "payment_intents" DROP COLUMN IF EXISTS "tip";
ALTER TABLE "payment_intents" DROP COLUMN IF EXISTS "finalAmount";
ALTER TABLE "payment_intents" DROP COLUMN IF EXISTS "clientSecret";

-- Add QR manual payment fields to PaymentIntent
ALTER TABLE "payment_intents" ADD COLUMN "referenceNumber" TEXT;
ALTER TABLE "payment_intents" ADD COLUMN "verifiedBy" TEXT;
ALTER TABLE "payment_intents" ADD COLUMN "verifiedAt" TIMESTAMP(3);

-- Change default currency from USD to MYR
ALTER TABLE "payment_intents" ALTER COLUMN "currency" SET DEFAULT 'MYR';

-- Add ToyyibPay fields to Order
ALTER TABLE "orders" ADD COLUMN "toyyibpayBillCode" TEXT;
ALTER TABLE "orders" ADD COLUMN "toyyibpayPaymentUrl" TEXT;
```

**Run Migration**:
```bash
npx prisma migrate dev --name remove_tip_add_toyyibpay
```

---

## ✅ Cleanup Checklist

### Code Files
- [ ] Update `src/types/payment.ts` - Remove Stripe/tip types
- [ ] Update `src/lib/payment-utils.ts` - Remove tip functions
- [ ] Delete `src/components/payment/TipSelector.tsx`
- [ ] Update `src/components/payment/PaymentForm.tsx` - Remove tip logic
- [ ] Update `src/app/api/payment/create-intent/route.ts` - Remove Stripe
- [ ] Update `src/app/api/payment/confirm/route.ts` - Remove tip handling
- [ ] Update `src/app/api/payment/methods/route.ts` - Remove card/wallet

### Database
- [ ] Update `prisma/schema.prisma` - Remove tip fields, add ToyyibPay
- [ ] Create migration script
- [ ] Run migration: `npx prisma migrate dev`
- [ ] Update database seed data if applicable

### Environment
- [ ] Remove Stripe keys from `.env`
- [ ] Remove Stripe keys from `.env.local`
- [ ] Remove Stripe keys from `.env.example`
- [ ] Add ToyyibPay environment variables

### Testing
- [ ] Remove any Stripe-related tests
- [ ] Remove any tip-related tests
- [ ] Verify payment type constants work
- [ ] Verify payment utils functions work
- [ ] Check database schema is valid

### Documentation
- [ ] Update API documentation (remove Stripe endpoints)
- [ ] Update component documentation (remove TipSelector)
- [ ] Update environment variable documentation

---

## 🚨 Impact Analysis

### Breaking Changes
1. **Database Schema**: Removing `tip` and `finalAmount` columns will affect existing orders
2. **API Contracts**: Payment intent response no longer includes tip
3. **Frontend**: TipSelector component removal affects PaymentForm

### Migration Strategy
1. **Before Cleanup**: Backup database
2. **During Cleanup**: Run migration to remove columns
3. **After Cleanup**: Verify all payment flows work without tip

### Rollback Plan
If cleanup causes issues:
1. Restore database from backup
2. Revert code changes via git
3. Re-apply Stripe/tip code

---

## 📊 Verification Steps

After completing cleanup:

1. **Type Check**: `npm run type-check` - Should pass with no errors
2. **Lint**: `npm run lint` - Should pass
3. **Build**: `npm run build` - Should compile successfully
4. **Database**: `npx prisma validate` - Schema should be valid
5. **Manual Test**:
   - Payment methods API returns only ToyyibPay
   - PaymentForm doesn't show tip selector
   - Payment confirmation works without tip

---

## 📅 Cleanup Timeline

**Estimated Duration**: 2-4 hours

1. **Code Updates** (1-2 hours)
   - Update type definitions
   - Remove tip logic from components
   - Update API routes

2. **Database Migration** (30 minutes)
   - Create migration
   - Test migration
   - Run migration

3. **Testing & Verification** (1 hour)
   - Type checking
   - Manual testing
   - Verify payment flows

4. **Documentation** (30 minutes)
   - Update README
   - Update API docs

---

## 🎯 Success Criteria

Cleanup is complete when:

- ✅ No Stripe references in codebase (grep for "stripe" returns 0 results)
- ✅ No tip functionality in codebase (TipSelector deleted)
- ✅ PaymentMethodType only has: `'cash' | 'qr_manual' | 'toyyibpay'`
- ✅ Database schema doesn't have `tip` or `finalAmount` fields
- ✅ `npm run type-check` passes
- ✅ `npm run build` succeeds
- ✅ Payment methods API returns correct methods

---

## 📞 Support

If you encounter issues during cleanup:
1. Check git history for original code
2. Review this document for missed steps
3. Test each change incrementally
4. Create backup before database migration

---

**Document Version**: 1.0
**Last Updated**: 2025-01-15
**Next Review**: After cleanup completion
