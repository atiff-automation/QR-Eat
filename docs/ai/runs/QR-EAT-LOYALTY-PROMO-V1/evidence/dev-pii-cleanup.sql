-- One-off dev cleanup (no production users exist).
-- Removes customer PII from rows written before the QR write path was normalised.
-- No backfill code is committed: the source is fixed, this clears the leftover dev data.
--
-- Run: npx prisma db execute --file <this file> --schema prisma/schema.prisma
--
-- BLAST RADIUS
--   Tables: customer_sessions, payment_batches, order_events.
--   Tenants: EVERY restaurant in the target database. This is not scoped by
--   restaurantId and cannot be. Run it against dev only, never production.
--   Rows: only rows with `startedAt`/`createdAt` strictly before the cutoff below.
--   Effect: customer name/phone/email become NULL; stored payment snapshots
--   lose the three PII keys; order-event payloads lose phone/email. Financial
--   amounts and order rows are not changed. This cannot be undone without a
--   backup.
--
-- STEP 1 - DRY RUN. Run these three SELECTs first (psql, or a client that
-- shows result rows; `prisma db execute` discards them) and compare the counts
-- with the apply block below. They have no side effects.
SELECT 'customer_sessions' AS table_name, count(*) AS rows
FROM customer_sessions
WHERE "startedAt" < '2026-11-16T00:00:00Z'
  AND ("customerName" IS NOT NULL OR "customerPhone" IS NOT NULL
       OR "customerEmail" IS NOT NULL);

SELECT 'payment_batches' AS table_name, count(*) AS rows
FROM payment_batches
WHERE "createdAt" < '2026-11-16T00:00:00Z'
  AND response::jsonb #> '{payment,order}' IS NOT NULL
  AND (response::jsonb #> '{payment,order}' ? 'customerPhone'
       OR response::jsonb #> '{payment,order}' ? 'customerName'
       OR response::jsonb #> '{payment,order}' ? 'customerEmail');

SELECT 'order_events' AS table_name, count(*) AS rows
FROM order_events
WHERE "createdAt" < '2026-11-16T00:00:00Z'
  AND (payload::jsonb ? 'customerPhone' OR payload::jsonb ? 'customerEmail');

-- STEP 2 - APPLY. Only after the dry-run counts are understood.
BEGIN;

-- Session PII, in any phone format.
UPDATE customer_sessions
SET "customerName" = NULL,
    "customerPhone" = NULL,
    "customerEmail" = NULL
WHERE "startedAt" < '2026-11-16T00:00:00Z'
  AND ("customerName" IS NOT NULL
       OR "customerPhone" IS NOT NULL
       OR "customerEmail" IS NOT NULL);

-- Persisted payment snapshots: drop the customer PII keys if present.
UPDATE payment_batches
SET response = response #- '{payment,order,customerName}'
                #- '{payment,order,customerPhone}'
                #- '{payment,order,customerEmail}'
WHERE "createdAt" < '2026-11-16T00:00:00Z'
  AND response::jsonb #> '{payment,order}' IS NOT NULL
  AND (response::jsonb #> '{payment,order}' ? 'customerPhone'
       OR response::jsonb #> '{payment,order}' ? 'customerName'
       OR response::jsonb #> '{payment,order}' ? 'customerEmail');

-- Order-event payloads: name is kept for kitchen display, phone/email are not.
UPDATE order_events
SET payload = payload #- '{customerPhone}' #- '{customerEmail}'
WHERE "createdAt" < '2026-11-16T00:00:00Z'
  AND (payload::jsonb ? 'customerPhone' OR payload::jsonb ? 'customerEmail');

COMMIT;
