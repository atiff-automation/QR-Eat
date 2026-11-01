# Legacy cleanup and terminology sweep — Phase 6

**Date:** 2026-11-02
**Status:** complete
**Scope:** QR-Eat web/server + Tabtep Counter
**Plan:** `Tabtep-App/docs/COUNTER-BILL-SESSION-PLAN.md`
**Previous:** `Tabtep-App/docs/evidence/2026-11-02-counter-bill-phase5-rollout.md`
**Next phase:** Phase 7 is optional and not started

## 1. Legacy session module rename

Renamed:

```text
src/lib/table-session.ts
→ src/lib/customer-session.ts
```

Also:

- `TableSession` interface → `CustomerSessionRecord`
- `getTableSession` → `getCustomerSession`
- removed unused `getOrCreateTableSession`
- removed unused `endTableSession`
- updated QR cart/order routes and tests

This removes the naming collision with `DiningSession`.

## 2. Dead route removal

Removed:

```text
src/app/api/orders/table/[tableId]/route.ts
src/app/api/orders/table/[tableId]/pay-all/route.ts
```

No application code referenced them.

Kept:

```text
/api/tables/[id]/orders          (web table modal)
/api/pos/payment/table/[tableId] (web POS)
/api/pos/payment/[orderId]       (web POS)
/api/counter/tables/[id]/bill    (v1 + v2)
```

The v1 bill remains because old Counter builds may still use it.

Production checks:

```text
GET /api/orders/table/...          → 404
GET /api/orders/table/.../pay-all  → 404
GET /api/tables/.../orders         → 401 (route still exists)
GET /api/health                    → 200
```

## 3. Terminology sweep

### Counter

- `Ongoing` → `Active`
- `Done` tab → `History`
- `Done orders` section → `History`
- raw order status pills → shared `orderStatusLabel`
- table state label helper added
- `E-wallet` → `E-Wallet`
- `Record E-Wallet payment` action label
- receipt `Payment:` uses shared payment-method label
- reports use shared payment-method label
- `Total unpaid` → `Unpaid`
- `Already paid` → `Paid`
- dialog dismiss `Cancel` → `Not now`
- takeaway bill totals use `Unpaid` / `Paid`
- removed private reports payment label

### Web

- `Pending Confirmation` → `Pending`
- `Ready for Pickup` → `Ready`
- `Process Payment` → `Record payment`
- table modal action aligned

### Intentionally kept

- v1 bill default route
- web POS payment endpoints
- `Order.status` and `Payment.status` backend enums
- `Done` as a dialog action button, not a list name

## 4. Verification

### QR-Eat

```text
npx tsc --noEmit
npm test -- --runInBand
npm run build
```

Result:

```text
TypeScript: no errors
50 passed, 1 skipped
481 passed, 11 skipped
build successful
```

### Counter

```text
./gradlew :core:model:test :core:network:test :counter:assembleRelease
```

Result: successful.

### Phone check

- APK version `1.5.4` (`24`)
- last update `2026-11-02 04:56:05`
- Orders tab shows `Active` / `History`
- payment sheet shows `E-Wallet`
- E-Wallet action label shows `Record E-Wallet payment`
- takeaway bill shows `Unpaid`
- no-bill table state remains correct

## 5. Deployment

- Railway project: `grand-tranquility`
- Service: `QR-Eat`
- Deployment: `0e4b16c4-d6b1-47ff-94f0-fc2797d36af7`
- Status: SUCCESS
- Startup: `No pending migrations to apply`
- Health: `https://tabtep.app/api/health` → 200

## 6. Files changed

### QR-Eat

- `src/lib/customer-session.ts`
- QR cart/order routes
- removed `/api/orders/table` routes
- `src/lib/order-utils.ts`
- `src/components/pos/PaymentInterface.tsx`
- `src/components/tables/TableDetailModal.tsx`
- `src/tests/qr-cart-option-validation.test.ts`
- `src/tests/qr-order-create-session.test.ts`
- `docs/TERMINOLOGY.md`

### Tabtep-App

- `core/model/.../CounterModels.kt`
- `CounterFormatTest.kt`
- `MainActivity.kt`
- `ReceiptPrinter.kt`
- `BillComponents.kt`
- `PaymentTenderSheet.kt`
- `ReportsPane.kt`
- `TakeawayBillPane.kt`
- `docs/COUNTER-APP-DISCOVERY.md`

## 7. Remaining optional work

Phase 7 is optional:

- table transfer
- merge tables
- split bills
- guest count
- closed-check browser
- item-level status customization
- receipt history per session

No Phase 7 work has started.
