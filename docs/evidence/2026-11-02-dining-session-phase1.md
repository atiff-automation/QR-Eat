# Dining session Phase 1 — schema, backfill and helpers

**Date:** 2026-11-02
**Status:** complete
**Scope:** QR-Eat database foundation only
**Plan:** `Tabtep-App/docs/COUNTER-BILL-SESSION-PLAN.md`
**Next phase:** not started; Phase 2 will wire order creation, clear, status changes and bill v2

## 1. What was implemented

Phase 1 adds the database foundation for a table bill session without changing
any current bill, order-creation, payment, or table-clear behaviour.

### Schema

- Added `DiningSessionStatus` (`OPEN`, `CLOSED`).
- Added `DiningSession`:
  - `restaurantId`
  - `tableId`
  - `status`
  - `openedAt`
  - `closedAt`
  - `openedBy`
  - `closedBy`
- Added `Table.activeDiningSessionId` with a unique index.
- Added `Order.diningSessionId` with an index.
- Added the `Restaurant.diningSessions` relation.
- Added a partial unique index:

```sql
CREATE UNIQUE INDEX dining_sessions_one_open_per_table
ON dining_sessions (table_id)
WHERE status = 'OPEN';
```

This enforces one open dining session per table at the database level.

### Migration and backfill

Migration:

```text
prisma/migrations/20261102100000_add_dining_sessions/migration.sql
```

Backfill rules:

- Only `OCCUPIED` tables with at least one active or served-unpaid order are
  considered.
- The session starts at the earliest such order.
- All non-cancelled orders from that point are attached, including paid and
  served orders.
- Cancelled orders are not attached during backfill.
- Historical/available tables are left without a session.
- `Table.activeDiningSessionId` is set to the new open session.

### Helpers

New file:

```text
src/lib/dining-session.ts
```

Functions:

- `ensureOpenDiningSession(tx, tableId, actor)`
  - locks the table row with `FOR UPDATE`
  - reuses the active open session
  - repairs a missing pointer when an open session exists
  - creates a session and marks the table `OCCUPIED`
- `closeDiningSession(tx, tableId, actor)`
  - closes the active/open session
  - clears `Table.activeDiningSessionId`
  - sets the table `AVAILABLE`
- `getOpenDiningSession(tx, tableId)`
- `DiningSessionError` with `code` and `statusCode`

No helper is wired into order creation, clearing or table-status routes yet. That
is Phase 2.

## 2. Verification

### Schema

```text
npx prisma validate
npx prisma generate
npx prisma migrate diff --from-url "$DATABASE_URL" \
  --to-schema-datamodel prisma/schema.prisma --exit-code
```

Results:

- schema valid
- Prisma Client generated
- no schema/migration difference

### Migration

```text
npx prisma migrate deploy
npx prisma migrate status
```

Result:

- migration applied successfully
- database schema up to date

### Backfill proof

A synthetic occupied table was created in a transaction with four orders:

| Order | State | Expected |
|---|---|---|
| old paid | `SERVED` + `PAID` | excluded |
| active | `PREPARING` + `PENDING` | session start |
| served paid | `SERVED` + `PAID` | attached |
| cancelled | `CANCELLED` | excluded |

Observed result:

```text
sessions = 1
attached_orders = 2
old_paid_excluded = 1
cancelled_excluded = 1
pointer_set = 1
```

The transaction was rolled back; no test data remains.

### One-open-session guard

A second `OPEN` session for the same table was rejected by the partial unique
index:

```text
NOTICE: one-open-session index works
```

### Tests

```text
npx jest src/tests/dining-session.test.ts --runInBand
```

Result: 8 passed.

Full suite:

```text
npm test -- --runInBand
```

Result:

```text
45 passed, 1 skipped
468 passed, 11 skipped
```

### Type-check

```text
npx tsc --noEmit
```

Result: no errors.

### Lint

Changed files:

```text
npx eslint src/lib/dining-session.ts src/tests/dining-session.test.ts
```

Result: clean.

Repository-wide `npm run lint` still reports pre-existing errors in unrelated
admin/RBAC/UI files. Those are not part of Phase 1.

## 3. Files changed

- `prisma/schema.prisma`
- `prisma/migrations/20261102100000_add_dining_sessions/migration.sql`
- `src/lib/dining-session.ts`
- `src/tests/dining-session.test.ts`

## 4. What Phase 1 did not change

- Counter bill UI
- Counter bill API response
- payment flow
- table clear behaviour
- auto table clear
- table status PATCH
- order creation
- QR order creation
- reports
- terminology sweep

## 5. Phase 2 entry condition

Before Phase 2:

1. Confirm the Phase 1 migration is applied in the target environment.
2. Keep Phase 1 helpers unwired until Phase 2 is reviewed.
3. Phase 2 will start with:
   - attach sessions in Counter order creation
   - attach sessions in QR order creation
   - close sessions in clear and table-status paths
   - implement bill v2 behind `?version=2`
   - keep v1 bill unchanged
