-- AlterTable
ALTER TABLE "payments" ADD COLUMN     "batchId" TEXT;

-- CreateTable
CREATE TABLE "payment_batches" (
    "id" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "tableId" TEXT NOT NULL,
    "paymentMethod" TEXT NOT NULL,
    "totalAmount" DECIMAL(10,2) NOT NULL,
    "cashReceived" DECIMAL(10,2),
    "changeGiven" DECIMAL(10,2),
    "receiptNumber" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'COMPLETED',
    "response" JSONB NOT NULL,
    "processedBy" TEXT,
    "processedByType" TEXT,
    "processedByAdminId" TEXT,
    "processedByOwnerId" TEXT,
    "processedByStaffId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payment_batches_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "payment_batches_idempotencyKey_key" ON "payment_batches"("idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "payment_batches_receiptNumber_key" ON "payment_batches"("receiptNumber");

-- CreateIndex
CREATE INDEX "payment_batches_restaurantId_createdAt_idx" ON "payment_batches"("restaurantId", "createdAt");

-- CreateIndex
CREATE INDEX "payment_batches_tableId_createdAt_idx" ON "payment_batches"("tableId", "createdAt");

-- CreateIndex
CREATE INDEX "payments_batchId_idx" ON "payments"("batchId");

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "payment_batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;
