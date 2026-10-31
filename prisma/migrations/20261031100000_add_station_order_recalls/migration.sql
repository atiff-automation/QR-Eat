-- Kitchen recall is an additive, per-station side table. The order status is
-- deliberately not changed: READY stays READY and payment/reporting keep their
-- existing meaning.

CREATE TABLE "station_order_recalls" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "stationId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "recalledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "recalledBy" TEXT,
    "reason" TEXT,
    "idempotencyKey" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "station_order_recalls_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "station_order_recalls_orderId_stationId_key" ON "station_order_recalls"("orderId", "stationId");
CREATE INDEX "station_order_recalls_stationId_resolvedAt_idx" ON "station_order_recalls"("stationId", "resolvedAt");
CREATE INDEX "station_order_recalls_restaurantId_recalledAt_idx" ON "station_order_recalls"("restaurantId", "recalledAt");

ALTER TABLE "station_order_recalls" ADD CONSTRAINT "station_order_recalls_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "station_order_recalls" ADD CONSTRAINT "station_order_recalls_stationId_fkey" FOREIGN KEY ("stationId") REFERENCES "stations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "station_order_recalls" ADD CONSTRAINT "station_order_recalls_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
