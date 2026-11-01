# Dining session Phase 2 — lifecycle and bill v2

**Date:** 2026-11-02
**Status:** complete
**Scope:** QR-Eat server lifecycle and Counter bill API v2
**Plan:** `Tabtep-App/docs/COUNTER-BILL-SESSION-PLAN.md`
**Previous:** `docs/evidence/2026-11-02-dining-session-phase1.md`
**Next phase:** not started; Phase 3 is the Counter data layer

## 1. What was implemented

### Session attachment

- Counter dine-in order creation attaches `DiningSession`.
- QR dine-in order creation attaches `DiningSession` inside the order
  transaction.
- Takeaway orders remain session-free.
- `ensureOpenDiningSession` owns the table `OCCUPIED` transition; route code
  no longer duplicates the table update.

### Session close

- Counter clear route closes the dining session and clears the table pointer.
- Table status PATCH to `AVAILABLE` closes the session.
- Table status PATCH to `AVAILABLE` is blocked when active or unpaid orders
  remain.
- Clear response now includes `closedDiningSessionId`.

### Manual clear

`autoUpdateTableStatus` no longer sets a table to `AVAILABLE`.

- `OCCUPIED -> AVAILABLE` is owned by explicit staff clear.
- The helper only repairs `AVAILABLE -> OCCUPIED` when active orders exist.
- The daily cleanup job now skips any table with an open dining session; it only
  repairs orphaned occupied tables with no session and no active orders.

This implements decision D10: manual clear.

### Bill v2

`GET /api/counter/tables/{tableId}/bill?version=2` returns the current session
bill:

- all orders in the open session, including cancelled orders
- payment and kitchen status
- latest payment method, receipt and paid timestamp
- totals excluding cancelled orders
- counts for open/served/all/unpaid/preparing/ready/pending
- `readyToClear`
- `blockingOrderCount`

The default `/bill` route is unchanged for old Counter builds and still returns
unpaid orders only.

## 2. Verification

### Full test suite

```text
npm test -- --runInBand
```

Result:

```text
50 passed, 1 skipped
481 passed, 11 skipped
```

New test files:

- `src/tests/counter-bill-route.test.ts`
- `src/tests/counter-clear-route.test.ts`
- `src/tests/qr-order-create-session.test.ts`
- `src/tests/table-status-manager.test.ts`
- `src/tests/table-status-route.test.ts`

### Type-check

```text
npx tsc --noEmit
```

Result: no errors.

### Build

```text
npm run build
```

Result: successful.

### Lint

Changed files:

```text
npx eslint <changed files>
```

Result: clean.

Repository-wide `npm run lint` still reports pre-existing errors in unrelated
admin/RBAC/UI files.

## 3. Behaviour after Phase 2

```text
First dine-in order
  -> open dining session
  -> table OCCUPIED

Payment / kitchen status changes
  -> order stays in the session
  -> bill v2 shows payment + kitchen state

All paid + all served
  -> table stays OCCUPIED
  -> bill v2 reports readyToClear

Staff clear table
  -> session CLOSED
  -> active pointer cleared
  -> table AVAILABLE
```

## 4. Not changed

- Counter Android app/UI
- payment flow
- reports/close out
- legacy web POS endpoints
- terminology sweep
- split bills/table transfer

## 5. Files changed

- `src/lib/services/counter-order-service.ts`
- `src/app/api/qr/orders/create/route.ts`
- `src/app/api/counter/tables/[tableId]/clear/route.ts`
- `src/app/api/tables/[id]/status/route.ts`
- `src/app/api/counter/tables/[tableId]/bill/route.ts`
- `src/lib/table-status-manager.ts`
- `src/lib/jobs/cleanup-table-status.ts`
- `src/tests/counter-order-service.test.ts`
- new test files listed above

## 6. Phase 3 entry conditions

Phase 3 is the Counter data layer:

1. Extend `CounterBill`/`CounterBillOrder`/`CounterBillItem`.
2. Parse bill v2 with `?version=2`.
3. Send only unpaid order IDs to payment.
4. Refresh the bill after payment, confirm, serve and clear.
5. Add JVM model/network tests.

The Counter UI is not changed until Phase 4.
