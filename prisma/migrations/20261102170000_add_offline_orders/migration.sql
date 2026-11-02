-- Offline Counter order identity and price-variance audit.
-- Additive only.

ALTER TABLE "orders"
  ADD COLUMN "clientOrderId" TEXT,
  ADD COLUMN "offlineCreated" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "offlineDeviceId" TEXT,
  ADD COLUMN "offlineCreatedAt" TIMESTAMP(3),
  ADD COLUMN "priceVariance" JSONB;

CREATE UNIQUE INDEX "orders_clientOrderId_key" ON "orders"("clientOrderId");

ALTER TABLE "order_items"
  ADD COLUMN "clientItemId" TEXT;

CREATE INDEX "order_items_orderId_clientItemId_idx"
  ON "order_items"("orderId", "clientItemId");
