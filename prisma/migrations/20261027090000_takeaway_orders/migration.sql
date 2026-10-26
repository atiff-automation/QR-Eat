-- Takeaway orders: order type, nullable table, customer snapshot, order payment target.
-- Existing orders remain dine-in. No data is rewritten.

-- CreateEnum
CREATE TYPE "OrderType" AS ENUM ('DINE_IN', 'TAKEAWAY');

-- AlterTable
ALTER TABLE "orders"
  ADD COLUMN     "orderType" "OrderType" NOT NULL DEFAULT 'DINE_IN',
  ADD COLUMN     "customerName" TEXT,
  ADD COLUMN     "customerPhone" TEXT,
  ALTER COLUMN   "tableId" DROP NOT NULL,
  ALTER COLUMN   "customerSessionId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "payment_batches"
  ADD COLUMN     "orderId" TEXT,
  ALTER COLUMN   "tableId" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "orders_restaurantId_orderType_status_idx"
  ON "orders"("restaurantId", "orderType", "status");

-- CreateIndex
CREATE INDEX "payment_batches_orderId_idx"
  ON "payment_batches"("orderId");

-- AddForeignKey
ALTER TABLE "payment_batches"
  ADD CONSTRAINT "payment_batches_orderId_fkey"
  FOREIGN KEY ("orderId") REFERENCES "orders"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- A dine-in order must have a table. A takeaway order must not have one.
ALTER TABLE "orders"
  ADD CONSTRAINT "orders_orderType_tableId_check"
  CHECK (
    ("orderType" = 'DINE_IN' AND "tableId" IS NOT NULL)
    OR
    ("orderType" = 'TAKEAWAY' AND "tableId" IS NULL)
  );

-- A payment batch must target exactly one table or one order.
ALTER TABLE "payment_batches"
  ADD CONSTRAINT "payment_batches_target_check"
  CHECK (
    ("tableId" IS NOT NULL AND "orderId" IS NULL)
    OR
    ("tableId" IS NULL AND "orderId" IS NOT NULL)
  );
