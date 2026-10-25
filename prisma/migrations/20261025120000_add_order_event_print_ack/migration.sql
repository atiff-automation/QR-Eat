-- Kitchen ticket delivery/print state.
-- Existing rows stay NULL (legacy/unknown); new print events start PENDING.

CREATE TYPE "OrderEventPrintStatus" AS ENUM ('PENDING', 'PRINTED', 'FAILED');

ALTER TABLE "order_events"
  ADD COLUMN "printStatus" "OrderEventPrintStatus",
  ADD COLUMN "printAttemptedAt" TIMESTAMP(3),
  ADD COLUMN "printedAt" TIMESTAMP(3),
  ADD COLUMN "printError" TEXT,
  ADD COLUMN "printDeviceId" TEXT;

CREATE INDEX "order_events_orderId_type_idx"
  ON "order_events"("orderId", "type");

CREATE INDEX "order_events_printStatus_idx"
  ON "order_events"("printStatus");
