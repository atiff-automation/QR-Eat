# Codebase Readiness Inspection Plan

**Purpose**: Verify codebase is ready for table-based session and counter payment implementation
**Date**: 2025-12-07
**Status**: Pre-Implementation
**Prerequisites**: Complete `CLEANUP_PLAN.md` first

---

## Executive Summary

This document provides a systematic inspection checklist to verify the codebase is in a clean, ready state before implementing the new architecture:
- Table-based customer sessions (one session per table, shared across devices)
- Unified QR ordering endpoint (no authentication required)
- Counter payment only (no digital payment gateway)
- Server-side cart management

---

## Inspection Strategy

### Level 1: Code Quality Baseline
Verify codebase passes all quality checks before changes

### Level 2: Architecture Compatibility
Ensure existing structure supports new implementation

### Level 3: Database State Verification
Confirm database schema is ready for modifications

### Level 4: Dependencies & Environment
Verify all required tools and configurations are present

---

## Level 1: Code Quality Baseline

### 1.1 TypeScript Compilation

**Purpose**: Ensure no type errors exist before adding new code

**Command**:
```bash
npx tsc --noEmit
```

**Expected Output**: `No errors found`

**If Errors Found**:
- [ ] Document all errors
- [ ] Fix errors before proceeding
- [ ] Re-run until clean

**Success Criteria**: ✅ Zero TypeScript errors

---

### 1.2 ESLint Validation

**Purpose**: Ensure code follows linting standards

**Command**:
```bash
npm run lint
```

**Expected Output**: `✓ No ESLint warnings or errors`

**If Warnings/Errors Found**:
- [ ] Document all issues
- [ ] Fix errors (warnings can be addressed later)
- [ ] Re-run until errors are zero

**Success Criteria**: ✅ Zero ESLint errors (warnings acceptable if documented)

---

### 1.3 Build Verification

**Purpose**: Ensure production build succeeds

**Command**:
```bash
npm run build
```

**Expected Output**:
```
✓ Compiled successfully
✓ Collecting page data
✓ Generating static pages
✓ Finalizing page optimization
```

**If Build Fails**:
- [ ] Document build errors
- [ ] Check for missing dependencies
- [ ] Fix errors before proceeding

**Success Criteria**: ✅ Build completes without errors

---

### 1.4 Test Suite Status

**Purpose**: Verify existing tests pass

**Command**:
```bash
npm test
```

**Expected Output**: All tests passing (or document failing tests)

**If Tests Fail**:
- [ ] Document which tests fail
- [ ] Determine if failures are related to payment removal
- [ ] Fix or skip tests related to removed features
- [ ] Ensure core functionality tests pass

**Success Criteria**: ✅ Core functionality tests pass

---

## Level 2: Architecture Compatibility Check

### 2.1 Current Session Management Analysis

**Purpose**: Understand existing session implementation

**Files to Inspect**:
```bash
# 1. Check CustomerSession model usage
grep -r "CustomerSession" src/ --include="*.ts" --include="*.tsx"

# 2. Check session creation logic
grep -r "customerSession.create" src/ --include="*.ts"

# 3. Check session validation
grep -r "sessionToken" src/ --include="*.ts"
```

**Analysis Checklist**:
- [ ] How many places create customer sessions?
- [ ] Is session tied to table or individual customers?
- [ ] Are sessions validated before order creation?
- [ ] How long do sessions last (expiresAt logic)?
- [ ] Are sessions reused or created per order?

**Document Findings**:
```
Current session model:
- Creation: [Describe where/how]
- Validation: [Yes/No, how]
- Lifespan: [Duration]
- Scope: [Per table / per device]
```

**Success Criteria**: ✅ Current session logic documented and understood

---

### 2.2 Order Creation Flow Analysis

**Purpose**: Map current order creation to identify what needs changing

**Files to Review**:
- `/src/app/api/orders/create/route.ts`
- `/src/components/checkout/CheckoutForm.tsx`
- `/src/lib/order-utils.ts`

**Inspection Checklist**:

**Current Flow Map**:
```
1. CheckoutForm submits → /api/orders/create
2. API validates table
3. API creates NEW session (❌ Issue: should reuse)
4. API creates order
5. API creates order items
6. Returns order + sessionToken
```

**Issues to Document**:
- [ ] ❌ Security bypass (lines 16-21 in route.ts)
- [ ] ❌ Always creates new session (should check for existing)
- [ ] ❌ Session not tied to table (tied to order)
- [ ] ❌ No cart persistence (cart only in frontend)
- [ ] ❌ Payment references in CheckoutForm

**Success Criteria**: ✅ Current flow documented with identified issues

---

### 2.3 Table & Restaurant Context

**Purpose**: Verify table-restaurant relationship is properly established

**Database Query Test**:
```typescript
// Test this query works:
const table = await prisma.table.findUnique({
  where: { id: tableId },
  include: {
    restaurant: {
      select: {
        id: true,
        taxRate: true,
        serviceChargeRate: true,
        isActive: true,
      },
    },
  },
});
```

**Verification**:
- [ ] Table has `restaurantId` foreign key
- [ ] QR code tokens are unique per table
- [ ] Table status field exists and works
- [ ] Restaurant settings (tax, service charge) are accessible

**Success Criteria**: ✅ Table-restaurant relationship verified

---

### 2.4 Middleware & Authentication Review

**Purpose**: Understand authentication flow to ensure QR endpoint bypasses it properly

**File to Inspect**: `/src/middleware.ts`

**Analysis Questions**:
- [ ] Does middleware check for authentication on `/api/orders/*`?
- [ ] Will `/api/qr/*` be automatically exempt?
- [ ] Is `getCustomerContext` required or optional?
- [ ] Are there any CORS or security headers affecting API calls?

**Middleware Routes to Check**:
```typescript
// What routes are protected?
// What routes are public?
// Does QR flow need special handling?
```

**Success Criteria**: ✅ Middleware behavior documented, QR route strategy clear

---

## Level 3: Database State Verification

### 3.1 Prisma Schema Review

**Purpose**: Ensure schema supports new implementation

**File**: `/prisma/schema.prisma`

**Inspection Checklist**:

**CustomerSession Model**:
```prisma
model CustomerSession {
  id           String    @id @default(uuid())
  tableId      String    // ✅ Exists - good
  sessionToken String    @unique // ✅ Exists - good
  customerName String?
  customerPhone String?
  customerEmail String?
  ipAddress    String?
  userAgent    String?
  startedAt    DateTime  @default(now())
  expiresAt    DateTime  // ✅ Exists - good
  endedAt      DateTime? // ✅ Exists - good for tracking
  status       String    @default("active") // ✅ Exists - good

  table  Table   @relation(fields: [tableId], references: [id], onDelete: Cascade)
  orders Order[]
}
```

**Verification**:
- [x] `tableId` field exists
- [x] `sessionToken` is unique
- [x] Relation to Table exists
- [x] Relation to Order exists (one session → many orders)
- [ ] **MISSING**: Index on `tableId` for fast lookup
- [ ] **MISSING**: Index on `status` for active session queries
- [ ] **MISSING**: Composite index on `(tableId, status)` for get-or-create logic

**Order Model**:
```prisma
model Order {
  // ... existing fields ...
  status           String   @default("pending") // ✅ Good
  paymentStatus    String   @default("pending") // ✅ Keep for counter payment

  // ❌ TO REMOVE (from cleanup):
  toyyibpayBillCode String?
  toyyibpayPaymentUrl String?
}
```

**Verification**:
- [x] `status` field exists (pending, submitted, completed)
- [x] `paymentStatus` field exists
- [x] `customerSessionId` field exists
- [x] `tableId` field exists
- [ ] Check if `status` has correct values for new flow

**Success Criteria**: ✅ Schema supports new model with documented missing indexes

---

### 3.2 Database Connection Test

**Purpose**: Verify database is accessible and healthy

**Commands**:
```bash
# Test connection
npx prisma db pull

# Check migration status
npx prisma migrate status

# View current schema
npx prisma studio &
```

**Verification**:
- [ ] Database connection succeeds
- [ ] All migrations are applied
- [ ] No pending migrations
- [ ] Prisma Studio can open database

**Success Criteria**: ✅ Database is accessible and up-to-date

---

### 3.3 Sample Data Verification

**Purpose**: Ensure test data exists for development

**Required Test Data**:
- [ ] At least 1 restaurant with `isActive: true`
- [ ] At least 3 tables with unique `qrCodeToken`
- [ ] At least 5 menu items with different categories
- [ ] Tax rate and service charge configured on restaurant

**Query to Check**:
```bash
# Using Prisma Studio or psql
npx prisma studio

# Or using psql:
psql $DATABASE_URL -c "SELECT id, name, slug, isActive FROM restaurants;"
psql $DATABASE_URL -c "SELECT id, tableNumber, qrCodeToken FROM tables LIMIT 5;"
psql $DATABASE_URL -c "SELECT COUNT(*) FROM menu_items;"
```

**If Data Missing**:
```bash
# Run seed script
npm run seed

# Or create manually via Prisma Studio
npx prisma studio
```

**Success Criteria**: ✅ Sufficient test data exists

---

## Level 4: Dependencies & Environment

### 4.1 NPM Dependencies Check

**Purpose**: Ensure all dependencies are installed and compatible

**Commands**:
```bash
# Check for missing dependencies
npm install

# Check for outdated critical deps
npm outdated

# Audit for vulnerabilities
npm audit
```

**Verification**:
- [ ] No missing dependencies
- [ ] Prisma client is generated
- [ ] Next.js version compatible
- [ ] No critical security vulnerabilities

**Success Criteria**: ✅ All dependencies installed, no critical issues

---

### 4.2 Environment Variables Validation

**Purpose**: Ensure required environment variables are set

**File**: `.env.local` or `.env`

**Required Variables**:
```bash
# Core
DATABASE_URL=postgresql://... # ✅ Required
JWT_SECRET=... # ✅ Required
NEXT_PUBLIC_APP_URL=http://localhost:3000 # ✅ Required

# Redis (if used)
REDIS_URL=... # ⚠️ Check if required

# Optional (removed in cleanup)
# TOYYIBPAY_* # ❌ Should be removed
# STRIPE_* # ❌ Should be removed
```

**Verification**:
```bash
# Check if .env exists
ls -la .env .env.local

# Validate DATABASE_URL format
echo $DATABASE_URL | grep "postgresql://"

# Test database connection
npx prisma db pull
```

**Success Criteria**: ✅ All required variables set, no payment gateway variables

---

### 4.3 Development Server Health

**Purpose**: Ensure dev server runs without errors

**Commands**:
```bash
# Start dev server
npm run dev

# Should see:
# - ✓ Ready in X ms
# - ○ Compiling / ...
# - ✓ Compiled /
```

**Verification**:
- [ ] Server starts without errors
- [ ] No unhandled promise rejections
- [ ] No database connection errors
- [ ] Hot reload works

**Browser Test**:
```
http://localhost:3000
http://localhost:3000/qr/[any-table-token]
```

**Expected**: Pages load without 500 errors

**Success Criteria**: ✅ Dev server runs cleanly

---

## Level 5: CLAUDE.md Compliance Pre-Check

### 5.1 Coding Standards Readiness

**Purpose**: Verify current code follows standards before adding more

**File**: `/CLAUDE.md` (project root)

**Standards to Verify**:

**1. Single Source of Truth**
```bash
# Check for duplicated constants
grep -r "pending\|submitted\|completed" src/types/ src/lib/
# Should be in ONE constants file
```

**Verification**:
- [ ] Order status values defined once
- [ ] Payment status values defined once
- [ ] No hardcoded status strings in components

**2. No Hardcoding**
```bash
# Check for hardcoded values
grep -r "http://\|https://\|localhost:3000" src/ --include="*.ts" --include="*.tsx" | grep -v "NEXT_PUBLIC"

# Check for hardcoded status
grep -r '"pending"\|"submitted"\|"paid"' src/ --include="*.ts" --include="*.tsx"
```

**Verification**:
- [ ] URLs use environment variables
- [ ] Status strings use constants
- [ ] No magic numbers for timeouts/durations

**3. Type Safety**
```bash
# Check for 'any' types
grep -r ": any" src/ --include="*.ts" --include="*.tsx"

# Check for missing Zod validations on API routes
find src/app/api -name "route.ts" -exec grep -L "z\." {} \;
```

**Verification**:
- [ ] No `any` types (or documented exceptions)
- [ ] All API endpoints use Zod validation
- [ ] All async operations have try-catch

**Success Criteria**: ✅ Code follows CLAUDE.md standards

---

### 5.2 Architecture Principles Check

**Purpose**: Ensure implementation follows SOLID, DRY, KISS

**SOLID Compliance**:
- [ ] Order creation has single responsibility
- [ ] Session management separated from order logic
- [ ] Utilities are composable and reusable

**DRY Compliance**:
- [ ] No duplicated session creation logic
- [ ] Order totals calculated in one place
- [ ] Validation logic not repeated

**KISS Compliance**:
- [ ] No over-engineering (e.g., complex caching when not needed)
- [ ] Simple solution chosen over complex abstraction
- [ ] Code is readable and maintainable

**Success Criteria**: ✅ Current code follows principles

---

## Level 6: Implementation Readiness Checklist

### 6.1 Prerequisites Complete

**Before Implementation Can Start**:
- [ ] ✅ CLEANUP_PLAN.md executed successfully
- [ ] ✅ All payment gateway code removed
- [ ] ✅ Database cleaned (toyyibpay fields removed)
- [ ] ✅ TypeScript compiles with zero errors
- [ ] ✅ Build succeeds
- [ ] ✅ Tests pass (or failing tests documented)
- [ ] ✅ Dev server runs without errors

---

### 6.2 Architecture Understanding

**Team Must Understand**:
- [ ] ✅ One session per table (not per device/customer)
- [ ] ✅ Sessions are reused, not recreated
- [ ] ✅ Cart stored server-side (not just frontend)
- [ ] ✅ QR endpoint has no authentication
- [ ] ✅ Payment at counter only
- [ ] ✅ Order flow: Submit → Kitchen → Counter Payment

---

### 6.3 Database Ready for Changes

**Schema Changes Needed**:
- [ ] Add indexes to CustomerSession (tableId, status)
- [ ] Add cart storage (CartItem model or JSON field)
- [ ] Remove toyyibpay fields from Order
- [ ] Update Order.status enum values

**Migration Plan**:
- [ ] Migration script drafted
- [ ] Rollback plan documented
- [ ] Test data backup created

---

### 6.4 Development Environment Ready

**Developer Setup**:
- [ ] Database running and accessible
- [ ] Redis running (if required)
- [ ] Environment variables configured
- [ ] Dependencies installed
- [ ] Prisma client generated

**Testing Tools Ready**:
- [ ] Multiple browser tabs (to test multi-device)
- [ ] Incognito mode (to test separate sessions)
- [ ] Database inspection tool (Prisma Studio)
- [ ] API testing tool (Postman/Thunder Client)

---

## Inspection Execution Plan

### Phase 1: Automated Checks (10 min)
```bash
# Run all automated checks
npm install
npx tsc --noEmit
npm run lint
npm run build
npm test
npx prisma migrate status
```

### Phase 2: Manual Code Review (20 min)
- Review session management code
- Review order creation flow
- Review middleware authentication
- Document findings

### Phase 3: Database Inspection (10 min)
```bash
npx prisma studio
# Check:
# - Restaurant data
# - Table data with QR codes
# - Menu items
# - Existing orders/sessions
```

### Phase 4: Environment Validation (5 min)
```bash
# Verify .env
cat .env.local

# Test database connection
npx prisma db pull

# Start dev server
npm run dev
```

### Phase 5: Document Findings (10 min)
- Create inspection report
- List all issues found
- Prioritize fixes
- Get approval to proceed

**Total Time**: ~55 minutes

---

## Inspection Report Template

### Inspection Results

**Date**: [Date]
**Inspector**: [Name]
**Status**: ✅ READY / ⚠️ ISSUES FOUND / ❌ BLOCKERS

---

**Level 1: Code Quality**
- TypeScript: [✅ Pass / ❌ Errors: X]
- ESLint: [✅ Pass / ⚠️ Warnings: X / ❌ Errors: X]
- Build: [✅ Success / ❌ Failed]
- Tests: [✅ All Pass / ⚠️ Some Fail / ❌ Many Fail]

**Level 2: Architecture**
- Session Management: [✅ Understood / ⚠️ Issues / ❌ Blocker]
- Order Flow: [✅ Documented / ⚠️ Unclear]
- Authentication: [✅ Clear / ⚠️ Needs Review]

**Level 3: Database**
- Schema: [✅ Ready / ⚠️ Needs Indexes / ❌ Missing Fields]
- Connection: [✅ Working / ❌ Failed]
- Test Data: [✅ Sufficient / ⚠️ Need More]

**Level 4: Environment**
- Dependencies: [✅ Installed / ❌ Missing]
- Env Variables: [✅ Set / ❌ Missing]
- Dev Server: [✅ Running / ❌ Errors]

**Level 5: Standards**
- CLAUDE.md: [✅ Compliant / ⚠️ Some Issues]
- SOLID/DRY/KISS: [✅ Follows / ⚠️ Violations]

---

**Issues Found**: [Number]

1. [Issue description]
   - Severity: [🔴 Blocker / 🟡 Important / 🟢 Minor]
   - Impact: [Description]
   - Fix: [Action needed]

**Blockers**: [Number]
- [List critical blockers that prevent implementation]

**Recommendation**: [PROCEED / FIX ISSUES FIRST / MAJOR REWORK NEEDED]

---

## Success Criteria Summary

✅ **READY TO IMPLEMENT** when:
1. All Level 1 checks pass (code quality baseline)
2. Architecture is documented and understood
3. Database is accessible with test data
4. Environment is configured correctly
5. No critical blockers identified
6. CLEANUP_PLAN.md completed successfully

⚠️ **PROCEED WITH CAUTION** when:
- Minor warnings exist but documented
- Some non-critical tests failing
- Optimization opportunities identified

❌ **DO NOT PROCEED** when:
- Build fails
- Database inaccessible
- Critical security issues found
- Major architectural incompatibilities
- Missing required dependencies

---

## Post-Inspection Actions

### If READY:
1. Get stakeholder approval
2. Create implementation branch
3. Begin implementation following plan
4. Regular checkpoints during development

### If ISSUES FOUND:
1. Prioritize issues (blocker > important > minor)
2. Create fix plan
3. Execute fixes
4. Re-run inspection
5. Get approval before implementation

### If BLOCKERS:
1. Document all blockers
2. Assess if rework needed
3. Get technical guidance
4. Create detailed fix plan
5. Schedule fix timeline

---

## References

- Cleanup Plan: `claudedocs/CLEANUP_PLAN.md`
- Coding Standards: `/CLAUDE.md`
- Database Schema: `/prisma/schema.prisma`
- Architecture Docs: `/claudedocs/`

---

**Document Status**: ✅ Ready for Use
**Next Step**: Execute inspection before implementation
