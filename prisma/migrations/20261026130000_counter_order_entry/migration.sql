-- CreateEnum
CREATE TYPE "OrderSource" AS ENUM ('QR', 'COUNTER');

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "idempotencyHash" TEXT,
ADD COLUMN     "idempotencyKey" TEXT,
ADD COLUMN     "source" "OrderSource" NOT NULL DEFAULT 'QR';

-- CreateIndex
CREATE UNIQUE INDEX "orders_idempotencyKey_key" ON "orders"("idempotencyKey");

-- CreateIndex
CREATE INDEX "orders_source_idx" ON "orders"("source");
