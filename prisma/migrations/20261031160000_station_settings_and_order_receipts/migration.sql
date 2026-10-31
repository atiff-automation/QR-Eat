-- S4 server-backed settings and durable idempotency receipts.

ALTER TABLE "stations"
ADD COLUMN "settings" JSONB NOT NULL DEFAULT '{"warnMinutes":5,"lateMinutes":10,"density":"normal","textScale":"normal"}';

CREATE TABLE "order_action_receipts" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "orderId" TEXT,
    "statusCode" INTEGER NOT NULL DEFAULT 200,
    "response" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_action_receipts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "order_action_receipts_restaurantId_action_idempotencyKey_key"
ON "order_action_receipts"("restaurantId", "action", "idempotencyKey");

CREATE INDEX "order_action_receipts_orderId_idx" ON "order_action_receipts"("orderId");
CREATE INDEX "order_action_receipts_createdAt_idx" ON "order_action_receipts"("createdAt");
