# Legacy Code Cleanup Plan

**Purpose**: Systematic removal of payment gateway integration for MVP counter-payment model
**Date**: 2025-12-07
**Status**: Pre-Implementation

---

## Executive Summary

This document outlines the complete removal of digital payment gateway functionality from the customer ordering flow. The system will transition to a counter-payment-only model where:
- Customers place orders via QR code
- Orders are sent to kitchen
- Payment is processed at the counter by staff
- No payment gateway integration required for MVP

---

## Cleanup Strategy

### Phase 1: Code Removal (Safe Deletion)
Remove files and code that are ONLY used for customer payment flow

### Phase 2: Database Cleanup
Remove database fields specific to ToyyibPay integration

### Phase 3: Type Definitions Update
Update TypeScript types to reflect new payment model

### Phase 4: Verification
Ensure no broken imports or references

---

## Detailed Cleanup Checklist

### 🔴 PHASE 1: Remove Payment Components

**Location**: `/src/components/payment/`

| File | Action | Reason |
|------|--------|--------|
| `PaymentForm.tsx` | ❌ DELETE | Customer payment UI (not needed) |
| `PaymentMethodSelector.tsx` | ❌ DELETE | Payment method selection UI (not needed) |
| `PaymentSuccess.tsx` | ❌ DELETE | Payment confirmation page (not needed) |

**Commands**:
```bash
rm -rf src/components/payment/
```

**Verification**:
```bash
# Should return no results
grep -r "PaymentForm\|PaymentMethodSelector\|PaymentSuccess" src/
```

---

### 🔴 PHASE 2: Remove Payment API Endpoints

**Location**: `/src/app/api/payment/`

| Directory | Action | Reason |
|-----------|--------|--------|
| `create-intent/` | ❌ DELETE | Creates payment intents (not needed) |
| `confirm/` | ❌ DELETE | Confirms payments (not needed) |
| `create-bill/` | ❌ DELETE | ToyyibPay bill creation (not needed) |
| `methods/` | ❌ DELETE | Payment method listing (not needed) |

**Commands**:
```bash
rm -rf src/app/api/payment/
```

**Verification**:
```bash
# Should return no results
grep -r "/api/payment/" src/
```

---

### 🔴 PHASE 3: Remove Payment Service Libraries

**Location**: `/src/lib/payments/`

| File | Action | Reason |
|------|--------|--------|
| `toyyibpay-service.ts` | ❌ DELETE | ToyyibPay integration (not needed) |

**Commands**:
```bash
rm -rf src/lib/payments/
```

---

### 🔴 PHASE 4: Remove Payment Utility Functions

**Location**: `/src/lib/`

| File | Action | Reason | Notes |
|------|--------|--------|-------|
| `payment-utils.ts` | ❌ DELETE | Payment formatting/helpers | May extract `formatCurrency` if needed elsewhere |

**Before Deletion - Check Usage**:
```bash
# Find all usages
grep -r "payment-utils" src/
```

**Action**:
- If `formatCurrency` is used elsewhere, move it to `qr-utils.ts` or create `currency-utils.ts`
- Then delete `payment-utils.ts`

---

### 🔴 PHASE 5: Remove ToyyibPay Webhook

**Location**: `/src/app/api/webhooks/`

| Directory | Action | Reason |
|-----------|--------|--------|
| `toyyibpay/` | ❌ DELETE | Webhook for payment notifications (not needed) |

**Commands**:
```bash
rm -rf src/app/api/webhooks/toyyibpay/
```

---

### 🟡 PHASE 6: Update Type Definitions

**Location**: `/src/types/payment.ts`

**Current File Contains**:
- Payment gateway types (ToyyibPay, payment intents)
- Counter payment types (cash, manual verification)

**Action**: **PARTIAL CLEANUP**

**Keep These Types** (for future counter payment):
```typescript
export type PaymentMethodType = 'cash' | 'manual_verification';

export type PaymentStatus = 'pending' | 'paid' | 'failed';

export interface Payment {
  id: string;
  orderId: string;
  paymentMethod: PaymentMethodType;
  amount: number;
  status: PaymentStatus;
  processedAt?: string;
  processedBy?: string; // Staff ID
}
```

**Remove These Types**:
```typescript
// Remove ToyyibPay-specific types
- PaymentIntent (gateway-specific)
- PaymentRequest (gateway-specific)
- PaymentResponse (gateway-specific)
- RefundRequest (not needed for counter payment)
- RefundResponse (not needed)
- PaymentConfig (gateway configuration)
- All references to 'toyyibpay' | 'qr_manual'
```

**Updated File**:
```typescript
// /src/types/payment.ts
// Simplified for counter payment only

export type PaymentMethodType =
  | 'cash'
  | 'card'
  | 'ewallet';

export type PaymentStatus =
  | 'pending'
  | 'paid'
  | 'failed';

export interface Payment {
  id: string;
  orderId: string;
  paymentMethod: PaymentMethodType;
  amount: number;
  status: PaymentStatus;
  processedAt?: Date;
  processedBy?: string; // Staff ID who processed payment
  notes?: string;
}
```

---

### 🟡 PHASE 7: Update Database Schema

**Location**: `/prisma/schema.prisma`

**Remove Fields from Order Model**:

```prisma
model Order {
  // ... existing fields ...

  // ❌ REMOVE THESE:
  toyyibpayBillCode String?
  toyyibpayPaymentUrl String?

  // ✅ KEEP THESE:
  paymentStatus String @default("pending")
  totalAmount Decimal @db.Decimal(10, 2)
}
```

**Keep PaymentIntent Model** (may repurpose for counter payment tracking):
```prisma
// Keep this model but may rename or repurpose later
model PaymentIntent {
  id              String   @id @default(uuid())
  orderId         String
  amount          Decimal  @db.Decimal(10, 2)
  currency        String   @default("MYR")
  paymentMethodId String   // Will reference counter payment method
  status          String   @default("pending")
  reference       String   @unique
  transactionId   String?
  referenceNumber String?
  verifiedBy      String?  // Staff who verified payment
  verifiedAt      DateTime?
  metadata        Json     @default("{}")
  expiresAt       DateTime
  createdAt       DateTime @default(now())
  confirmedAt     DateTime?
  updatedAt       DateTime @updatedAt

  order Order @relation(fields: [orderId], references: [id], onDelete: Cascade)

  @@map("payment_intents")
}
```

**Keep Payment Model** (for counter payment tracking):
```prisma
model Payment {
  id                String   @id @default(uuid())
  orderId           String
  paymentMethod     String   // 'cash', 'card', 'ewallet'
  paymentProcessor  String?  // NULL for counter payment
  amount            Decimal  @db.Decimal(10, 2)
  processingFee     Decimal  @default(0.00) @db.Decimal(10, 2)
  netAmount         Decimal  @db.Decimal(10, 2)
  status            String   @default("pending")

  // ❌ REMOVE gateway-specific fields:
  externalPaymentId String?
  externalTransactionId String?

  // ✅ ADD counter payment fields:
  processedBy       String?  // Staff ID who processed payment at counter

  paymentMetadata   Json     @default("{}")
  failureReason     String?
  refundReason      String?
  createdAt         DateTime @default(now())
  processedAt       DateTime?
  completedAt       DateTime?
  failedAt          DateTime?
  updatedAt         DateTime @updatedAt

  order Order @relation(fields: [orderId], references: [id], onDelete: Cascade)

  @@map("payments")
}
```

**Migration Command**:
```bash
# After schema changes
npx prisma migrate dev --name remove_toyyibpay_integration
```

---

### 🟡 PHASE 8: Update CheckoutForm Component

**Location**: `/src/components/checkout/CheckoutForm.tsx`

**Changes Required**:

1. **Remove Payment Message** (Lines 208-211):
```tsx
// ❌ REMOVE:
<div className="text-xs text-gray-500 text-center">
  <p>By placing this order, you agree to our terms of service.</p>
  <p>You'll be able to choose your payment method in the next step.</p>
</div>
```

```tsx
// ✅ REPLACE WITH:
<div className="text-xs text-gray-500 text-center">
  <p>By placing this order, you agree to our terms of service.</p>
  <p className="font-medium text-gray-700 mt-1">
    Please pay at the counter when ready.
  </p>
</div>
```

2. **Update Button Text** (Line 204):
```tsx
// ❌ CURRENT:
Place Order - {formatPrice(cart.totalAmount)}

// ✅ UPDATE TO:
Submit Order to Kitchen
```

3. **Update Success Callback**:
```tsx
// After successful order creation, show message:
"Order submitted successfully! Please proceed to counter for payment."
```

---

### 🔴 PHASE 9: Fix Security Issue in Order Creation

**Location**: `/src/app/api/orders/create/route.ts`

**Current Code (Lines 14-21)** - SECURITY ISSUE:
```typescript
try {
  getCustomerContext(request);
} catch (contextError) {
  // ❌ BAD: Silently ignoring security validation
}
```

**This entire try-catch block must be REMOVED** because:
1. Silently catching security errors is dangerous
2. This endpoint will be replaced with `/api/qr/orders/create`
3. New endpoint won't use `getCustomerContext` at all

**Note**: This file will likely be replaced entirely with new QR endpoint, but if keeping it for staff use, proper authentication must be enforced.

---

### 🟢 PHASE 10: Remove Payment Configuration

**Location**: `/src/config/payment.config.ts`

**Action**: ❌ DELETE entire file

**Verification**:
```bash
grep -r "payment.config" src/
```

---

### 🟢 PHASE 11: Environment Variables Cleanup

**Location**: `.env`, `.env.local`

**Remove These Variables**:
```bash
# ToyyibPay Configuration
TOYYIBPAY_SECRET_KEY=
TOYYIBPAY_CATEGORY_CODE=
TOYYIBPAY_ENVIRONMENT=
TOYYIBPAY_WEBHOOK_URL=

# Stripe (if any)
STRIPE_SECRET_KEY=
STRIPE_PUBLISHABLE_KEY=
STRIPE_WEBHOOK_SECRET=
```

**Keep These Variables**:
```bash
# Database
DATABASE_URL=

# Redis
REDIS_URL=

# JWT
JWT_SECRET=

# App Config
NEXT_PUBLIC_APP_URL=
```

---

## Code Dependency Analysis

### Files That Import Payment Components

**Before deletion, find all imports**:
```bash
# Find PaymentForm imports
grep -r "from.*PaymentForm" src/

# Find payment API calls
grep -r "/api/payment/" src/

# Find payment utility imports
grep -r "from.*payment-utils" src/
```

**Likely Imports to Update**:
1. Order confirmation pages
2. Customer order flow pages
3. Dashboard payment reports (keep for counter payment tracking)

---

## Database Migration Strategy

### Step 1: Create Migration
```bash
npx prisma migrate dev --name remove_payment_gateway_integration --create-only
```

### Step 2: Review Generated Migration
Check the migration file for:
- Field removals (toyyibpayBillCode, toyyibpayPaymentUrl)
- No accidental deletions of Payment/PaymentIntent tables
- Proper handling of foreign keys

### Step 3: Apply Migration
```bash
npx prisma migrate dev
```

### Step 4: Update Prisma Client
```bash
npx prisma generate
```

---

## Testing Checklist

### Before Cleanup
- [ ] Create git branch: `git checkout -b cleanup/remove-payment-gateway`
- [ ] Commit current state: `git commit -m "Pre-cleanup snapshot"`
- [ ] Run tests: `npm test`
- [ ] Run build: `npm run build`
- [ ] Note any existing errors/warnings

### During Cleanup
- [ ] Remove files in order (components → APIs → libs → config)
- [ ] Run TypeScript check after each phase: `npx tsc --noEmit`
- [ ] Fix import errors immediately
- [ ] Commit after each phase

### After Cleanup
- [ ] No TypeScript errors: `npx tsc --noEmit`
- [ ] No ESLint errors: `npm run lint`
- [ ] Build succeeds: `npm run build`
- [ ] Dev server starts: `npm run dev`
- [ ] Database migration applied: `npx prisma migrate status`
- [ ] No broken imports: Search for "payment" references

---

## Rollback Plan

**If cleanup causes issues**:

### Quick Rollback
```bash
git checkout main
git branch -D cleanup/remove-payment-gateway
```

### Partial Rollback (keep some changes)
```bash
git log --oneline
git revert <commit-hash>
```

### Database Rollback
```bash
# Reset database to previous migration
npx prisma migrate reset
```

---

## Success Criteria

✅ **Code Cleanup Complete When**:
- [ ] All payment gateway files deleted
- [ ] No import errors for payment components
- [ ] TypeScript compilation succeeds
- [ ] ESLint passes with no errors
- [ ] Build succeeds
- [ ] Dev server starts without errors

✅ **Database Cleanup Complete When**:
- [ ] ToyyibPay fields removed from schema
- [ ] Migration applied successfully
- [ ] Prisma client regenerated
- [ ] No references to removed fields in code

✅ **UI Cleanup Complete When**:
- [ ] CheckoutForm shows "Submit Order" (not "Proceed to Payment")
- [ ] Success message mentions counter payment
- [ ] No payment selection UI visible
- [ ] Order flow ends at order submission

---

## Post-Cleanup Verification Commands

```bash
# 1. Check for remaining payment references
grep -ri "toyyibpay\|stripe\|payment gateway" src/

# 2. Check for broken imports
npm run type-check

# 3. Check for ESLint issues
npm run lint

# 4. Verify build
npm run build

# 5. Check database schema
npx prisma migrate status

# 6. Verify no payment components exist
ls src/components/payment/  # Should error: No such file

# 7. Verify no payment APIs exist
ls src/app/api/payment/  # Should error: No such file
```

---

## Notes & Warnings

### ⚠️ DO NOT DELETE
- `Payment` model in Prisma (needed for counter payment tracking)
- `paymentStatus` field in Order model
- Payment-related analytics/reports (staff use these)

### ⚠️ CAREFUL DELETION
- `payment-utils.ts` - Check if `formatCurrency` is used elsewhere
- Order creation endpoint - Will be replaced, but verify no staff tools depend on it

### ⚠️ VERIFY BEFORE DELETION
- Search each file for imports before deleting
- Check if any dashboard/admin pages reference payment gateway

---

## Timeline Estimate

| Phase | Duration | Complexity |
|-------|----------|------------|
| Component deletion | 5 min | Low |
| API deletion | 5 min | Low |
| Library deletion | 5 min | Low |
| Type updates | 15 min | Medium |
| Database migration | 10 min | Medium |
| CheckoutForm update | 10 min | Low |
| Environment cleanup | 5 min | Low |
| Testing & verification | 20 min | Medium |
| **Total** | **75 min** | **Medium** |

---

## References

- Original discussion: Counter payment decision
- Database schema: `/prisma/schema.prisma`
- CLAUDE.md coding standards: `/CLAUDE.md`
- Architecture docs: `/claudedocs/`

---

**Document Status**: ✅ Ready for Execution
**Next Step**: Execute Phase 1 after approval
