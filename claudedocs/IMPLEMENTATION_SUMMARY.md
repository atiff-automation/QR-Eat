# QR Restaurant System - Counter Payment Implementation Summary

**Date**: 2025-12-07
**Status**: Planning Complete, Ready for Approval
**Architecture Decision**: Counter Payment Model (MVP)

---

## Overview

This document summarizes the complete plan for transitioning from digital payment gateway integration to a counter-payment-only model for customer orders.

---

## Key Decisions

### 1. Payment Model
**Decision**: Counter payment only (no digital gateway)
- ✅ Customers order via QR code
- ✅ Orders sent directly to kitchen
- ✅ Payment processed at counter by staff
- ❌ No payment gateway (Stripe, ToyyibPay, etc.)

**Rationale**:
- Faster MVP delivery (no gateway integration complexity)
- Matches real-world restaurant practice (common in Asia)
- Eliminates payment edge cases (race conditions, failures)
- Reduces transaction fees
- Allows staff upselling at counter
- Supports cash payments

---

### 2. Session Architecture
**Decision**: One session per table (shared across devices)
- ✅ Table has ONE active session at a time
- ✅ All devices at same table see same cart
- ✅ Server-side cart storage (not just frontend)
- ✅ Sessions persist across page reloads
- ❌ Not one session per customer/device

**Rationale**:
- Matches how groups dine together
- Prevents confusion (whose cart is this?)
- Simplifies kitchen operations (one ticket per table)
- Standard practice in QR ordering systems

---

### 3. Order Flow
**Decision**: Unified QR code for customers AND staff
- ✅ Anyone can scan QR to add items
- ✅ No authentication required for ordering
- ✅ Staff can help customers using same interface
- ⚠️ Authentication only for management dashboard

**Rationale**:
- Simpler UX (staff don't need to "switch modes")
- Faster order taking (no login required)
- Matches real-world usage

---

## Implementation Plan

### Phase 1: Cleanup (CRITICAL)
**Document**: `claudedocs/CLEANUP_PLAN.md`
**Duration**: ~75 minutes

**What Gets Removed**:
- Payment gateway components (PaymentForm, PaymentMethodSelector, PaymentSuccess)
- Payment API endpoints (/api/payment/*)
- ToyyibPay service library
- Payment utility functions
- Gateway-specific database fields
- Environment variables for gateways

**What Gets Kept**:
- Payment model (repurposed for counter payment)
- PaymentIntent model (may repurpose)
- Order.paymentStatus field
- Analytics/reporting (staff need this)

---

### Phase 2: Codebase Inspection (REQUIRED)
**Document**: `claudedocs/CODEBASE_READINESS_INSPECTION.md`
**Duration**: ~55 minutes

**Inspection Levels**:
1. Code quality baseline (TypeScript, ESLint, build, tests)
2. Architecture compatibility (session mgmt, order flow, auth)
3. Database state (schema, connections, test data)
4. Dependencies & environment
5. CLAUDE.md compliance
6. Implementation readiness

**Output**: Inspection report with GO/NO-GO decision

---

### Phase 3: Implementation (AFTER APPROVAL)
**Prerequisites**: Phase 1 & 2 complete

**Tasks**:
1. Update Prisma schema
   - Add indexes to CustomerSession
   - Remove toyyibpay fields from Order
   - Add CartItem model or JSON field for server-side cart

2. Create table session utilities
   - `getOrCreateTableSession(tableId)`
   - `getTableCart(tableId)`
   - `addToTableCart(tableId, menuItemId, quantity)`
   - `clearTableCart(tableId)`

3. Create `/api/qr/orders/create` endpoint
   - Validate tableId
   - Get/create table session (reuse if exists)
   - Create order with status "submitted"
   - Send to kitchen
   - No payment processing

4. Update CheckoutForm
   - Remove payment step
   - Change button: "Submit Order to Kitchen"
   - Success message: "Order submitted! Pay at counter"
   - No payment method selection

5. Testing
   - Multi-device cart sync
   - Session persistence
   - Order flow end-to-end

---

## File Structure

```
claudedocs/
├── CLEANUP_PLAN.md                    # Phase 1: Remove payment gateway
├── CODEBASE_READINESS_INSPECTION.md   # Phase 2: Verify readiness
└── IMPLEMENTATION_SUMMARY.md          # This file (overview)

To be created:
├── TABLE_SESSION_IMPLEMENTATION.md    # Detailed implementation spec
└── QR_ORDER_ENDPOINT_SPEC.md          # API endpoint specification
```

---

## Compliance

### CLAUDE.md Standards
All implementation will follow:
- ✅ Single Source of Truth (constants file for statuses)
- ✅ No Hardcoding (env vars, config files)
- ✅ SOLID Principles (separation of concerns)
- ✅ DRY (no duplicate logic)
- ✅ KISS (simple solutions, no over-engineering)
- ✅ Type Safety (no `any` types)
- ✅ Validation (Zod schemas for all API inputs)
- ✅ Error Handling (try-catch on all async operations)

---

## Risk Assessment

### Low Risk ✅
- Removing unused payment code
- Adding table session logic
- Creating new QR endpoint

### Medium Risk ⚠️
- Database migration (test thoroughly)
- Session management (ensure no race conditions)
- Multi-device cart sync (test with 3+ devices)

### Mitigation
- Create git branch before any changes
- Commit after each phase
- Test with real QR codes on mobile devices
- Database backup before migration
- Rollback plan documented

---

## Success Criteria

### Phase 1 Complete When:
- [ ] All payment gateway files deleted
- [ ] No import errors
- [ ] TypeScript compiles
- [ ] Build succeeds
- [ ] Database migration applied

### Phase 2 Complete When:
- [ ] Inspection report generated
- [ ] All blockers documented
- [ ] GO/NO-GO decision made
- [ ] Stakeholder approval received

### Phase 3 Complete When:
- [ ] Table sessions working (reuse existing sessions)
- [ ] QR endpoint creates orders successfully
- [ ] Cart syncs across multiple devices
- [ ] Orders appear in kitchen
- [ ] CheckoutForm shows counter payment message
- [ ] End-to-end flow tested

---

## Timeline

| Phase | Duration | Dependencies |
|-------|----------|--------------|
| 1. Cleanup | 75 min | None |
| 2. Inspection | 55 min | Phase 1 complete |
| 3. Implementation | ~4 hours | Phase 2 GO decision |
| **Total** | **6-7 hours** | Stakeholder approval |

---

## Next Steps

1. **Review this summary** - Ensure understanding of plan
2. **Approve Phase 1** - Execute cleanup plan
3. **Execute Phase 1** - Follow CLEANUP_PLAN.md
4. **Execute Phase 2** - Follow CODEBASE_READINESS_INSPECTION.md
5. **Review inspection report** - Make GO/NO-GO decision
6. **If GO**: Begin Phase 3 implementation
7. **If NO-GO**: Fix blockers, re-inspect

---

## Questions & Clarifications

### Resolved
✅ Payment model: Counter payment only
✅ Session scope: One per table (not per device)
✅ Order flow: Unified QR for customers & staff
✅ Cart storage: Server-side (database)
✅ Payment gateway: Remove completely for MVP

### Open
- [ ] Session timeout duration? (Currently 4 hours)
- [ ] How to handle "table cleared" - manual or automatic?
- [ ] Staff dashboard for viewing all table orders?

---

## References

- Original discussion: User conversation about payment flow
- Cleanup plan: `claudedocs/CLEANUP_PLAN.md`
- Inspection plan: `claudedocs/CODEBASE_READINESS_INSPECTION.md`
- Coding standards: `/CLAUDE.md`
- Database schema: `/prisma/schema.prisma`

---

**Status**: ✅ Documentation Complete
**Approval Required**: Yes (from stakeholder)
**Ready to Execute**: After approval
