-- Resumable per-station event log (D17, D18, D19).
--
-- One row per station per event. The payload is the print document, already
-- filtered and routed at write time, so a station never fetches an order to
-- decide what to print.
CREATE TABLE "order_events" (
    "id" BIGSERIAL NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "stationId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_events_pkey" PRIMARY KEY ("id")
);

-- Per-device delivery cursor. The device owns this; the server only persists
-- the last seq it handed out so a reinstall can resume.
ALTER TABLE "devices" ADD COLUMN "lastEventId" BIGINT NOT NULL DEFAULT 0;

CREATE INDEX "order_events_restaurantId_id_idx" ON "order_events"("restaurantId", "id");
CREATE INDEX "order_events_stationId_id_idx" ON "order_events"("stationId", "id");
CREATE INDEX "order_events_orderId_idx" ON "order_events"("orderId");

ALTER TABLE "order_events"
  ADD CONSTRAINT "order_events_restaurantId_fkey"
  FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "order_events"
  ADD CONSTRAINT "order_events_stationId_fkey"
  FOREIGN KEY ("stationId") REFERENCES "stations"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "order_events"
  ADD CONSTRAINT "order_events_orderId_fkey"
  FOREIGN KEY ("orderId") REFERENCES "orders"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
