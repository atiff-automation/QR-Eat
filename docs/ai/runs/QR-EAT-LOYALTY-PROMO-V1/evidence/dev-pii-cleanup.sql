-- One-off dev cleanup (no production users exist).
-- Removes customer PII from rows written before the QR write path was normalised.
-- No backfill code is committed: the source is fixed, this clears the leftover dev data.
--
-- Run: npx prisma db execute --file <this file> --schema prisma/schema.prisma

BEGIN;

-- Session PII, in any phone format.
UPDATE customer_sessions
SET "customerName" = NULL,
    "customerPhone" = NULL,
    "customerEmail" = NULL
WHERE "customerName" IS NOT NULL
   OR "customerPhone" IS NOT NULL
   OR "customerEmail" IS NOT NULL;

-- Persisted payment snapshots: drop the customer PII keys if present.
UPDATE payment_batches
SET response = response #- '{payment,order,customerName}'
                #- '{payment,order,customerPhone}'
                #- '{payment,order,customerEmail}'
WHERE response::jsonb #> '{payment,order}' IS NOT NULL
  AND (response::jsonb #> '{payment,order}' ? 'customerPhone'
       OR response::jsonb #> '{payment,order}' ? 'customerName'
       OR response::jsonb #> '{payment,order}' ? 'customerEmail');

-- Order-event payloads: name is kept for kitchen display, phone/email are not.
UPDATE order_events
SET payload = payload #- '{customerPhone}' #- '{customerEmail}'
WHERE payload::jsonb ? 'customerPhone' OR payload::jsonb ? 'customerEmail';

COMMIT;
