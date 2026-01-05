-- CreateEnum
CREATE TYPE "CustomerSessionStatus" AS ENUM ('ACTIVE', 'ENDED', 'EXPIRED');
CREATE TYPE "OrderStatus" AS ENUM ('PENDING', 'CONFIRMED', 'PREPARING', 'READY', 'SERVED', 'CANCELLED');
CREATE TYPE "OrderPaymentStatus" AS ENUM ('PENDING', 'PAID', 'REFUNDED', 'FAILED');
CREATE TYPE "TableStatus" AS ENUM ('AVAILABLE', 'OCCUPIED', 'RESERVED');
CREATE TYPE "OrderItemStatus" AS ENUM ('PENDING', 'PREPARING', 'READY', 'SERVED', 'CANCELLED');

-- AlterTable
ALTER TABLE "customer_sessions" DROP COLUMN "status",
ADD COLUMN     "status" "CustomerSessionStatus" NOT NULL DEFAULT 'ACTIVE';

-- AlterTable
ALTER TABLE "order_items" DROP COLUMN "status",
ADD COLUMN     "status" "OrderItemStatus" NOT NULL DEFAULT 'PENDING';

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "hasModifications" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "lastModifiedAt" TIMESTAMP(3),
ADD COLUMN     "modificationCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 1,
DROP COLUMN "status",
ADD COLUMN     "status" "OrderStatus" NOT NULL DEFAULT 'PENDING',
DROP COLUMN "paymentStatus",
ADD COLUMN     "paymentStatus" "OrderPaymentStatus" NOT NULL DEFAULT 'PENDING';

-- AlterTable
ALTER TABLE "payments" ADD COLUMN     "cashReceived" DECIMAL(10,2),
ADD COLUMN     "changeGiven" DECIMAL(10,2),
ADD COLUMN     "processedBy" TEXT,
ADD COLUMN     "processedByAdminId" TEXT,
ADD COLUMN     "processedByOwnerId" TEXT,
ADD COLUMN     "processedByStaffId" TEXT,
ADD COLUMN     "processedByType" TEXT,
ADD COLUMN     "receiptNumber" TEXT,
DROP COLUMN "status",
ADD COLUMN     "status" "OrderPaymentStatus" NOT NULL DEFAULT 'PENDING';

-- AlterTable
ALTER TABLE "tables" DROP COLUMN "status",
ADD COLUMN     "status" "TableStatus" NOT NULL DEFAULT 'AVAILABLE';

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "userType" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "adminId" TEXT,
    "ownerId" TEXT,
    "staffId" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "lastUsed" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "deviceInfo" JSONB NOT NULL DEFAULT '{}',
    "isRevoked" BOOLEAN NOT NULL DEFAULT false,
    "revokedAt" TIMESTAMP(3),
    "revokedReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_modifications" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "modifiedBy" TEXT,
    "modifiedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reason" TEXT NOT NULL,
    "reasonNotes" TEXT,
    "oldTotal" DECIMAL(10,2) NOT NULL,
    "newTotal" DECIMAL(10,2) NOT NULL,
    "customerNotified" BOOLEAN NOT NULL DEFAULT false,
    "notifiedAt" TIMESTAMP(3),
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_modifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_modification_items" (
    "id" TEXT NOT NULL,
    "modificationId" TEXT NOT NULL,
    "orderItemId" TEXT,
    "menuItemId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "oldQuantity" INTEGER,
    "newQuantity" INTEGER,
    "oldPrice" DECIMAL(10,2),
    "newPrice" DECIMAL(10,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_modification_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_token_key" ON "refresh_tokens"("token");

-- CreateIndex
CREATE INDEX "refresh_tokens_token_idx" ON "refresh_tokens"("token");

-- CreateIndex
CREATE INDEX "refresh_tokens_userId_idx" ON "refresh_tokens"("userId");

-- CreateIndex
CREATE INDEX "refresh_tokens_userType_idx" ON "refresh_tokens"("userType");

-- CreateIndex
CREATE INDEX "refresh_tokens_sessionId_idx" ON "refresh_tokens"("sessionId");

-- CreateIndex
CREATE INDEX "refresh_tokens_adminId_idx" ON "refresh_tokens"("adminId");

-- CreateIndex
CREATE INDEX "refresh_tokens_ownerId_idx" ON "refresh_tokens"("ownerId");

-- CreateIndex
CREATE INDEX "refresh_tokens_staffId_idx" ON "refresh_tokens"("staffId");

-- CreateIndex
CREATE INDEX "refresh_tokens_expiresAt_idx" ON "refresh_tokens"("expiresAt");

-- CreateIndex
CREATE INDEX "refresh_tokens_isRevoked_idx" ON "refresh_tokens"("isRevoked");

-- CreateIndex
CREATE UNIQUE INDEX "order_modifications_idempotencyKey_key" ON "order_modifications"("idempotencyKey");

-- CreateIndex
CREATE INDEX "order_modifications_orderId_idx" ON "order_modifications"("orderId");

-- CreateIndex
CREATE INDEX "order_modifications_modifiedAt_idx" ON "order_modifications"("modifiedAt");

-- CreateIndex
CREATE INDEX "order_modifications_idempotencyKey_idx" ON "order_modifications"("idempotencyKey");

-- CreateIndex
CREATE INDEX "order_modification_items_modificationId_idx" ON "order_modification_items"("modificationId");

-- CreateIndex
CREATE INDEX "order_modification_items_orderItemId_idx" ON "order_modification_items"("orderItemId");

-- CreateIndex
CREATE INDEX "customer_sessions_status_idx" ON "customer_sessions"("status");

-- CreateIndex
CREATE INDEX "customer_sessions_tableId_status_idx" ON "customer_sessions"("tableId", "status");

-- CreateIndex
CREATE INDEX "order_items_status_idx" ON "order_items"("status");

-- CreateIndex
CREATE INDEX "orders_status_idx" ON "orders"("status");

-- CreateIndex
CREATE INDEX "orders_paymentStatus_idx" ON "orders"("paymentStatus");

-- CreateIndex
CREATE INDEX "orders_hasModifications_idx" ON "orders"("hasModifications");

-- CreateIndex
CREATE INDEX "orders_version_idx" ON "orders"("version");

-- CreateIndex
CREATE UNIQUE INDEX "payments_receiptNumber_key" ON "payments"("receiptNumber");

-- CreateIndex
CREATE INDEX "payments_processedBy_idx" ON "payments"("processedBy");

-- CreateIndex
CREATE INDEX "payments_processedByType_idx" ON "payments"("processedByType");

-- CreateIndex
CREATE INDEX "payments_processedByAdminId_idx" ON "payments"("processedByAdminId");

-- CreateIndex
CREATE INDEX "payments_processedByOwnerId_idx" ON "payments"("processedByOwnerId");

-- CreateIndex
CREATE INDEX "payments_processedByStaffId_idx" ON "payments"("processedByStaffId");

-- CreateIndex
CREATE INDEX "payments_receiptNumber_idx" ON "payments"("receiptNumber");

-- CreateIndex
CREATE INDEX "payments_status_idx" ON "payments"("status");

-- CreateIndex
CREATE INDEX "payments_createdAt_idx" ON "payments"("createdAt");

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_processedByAdminId_fkey" FOREIGN KEY ("processedByAdminId") REFERENCES "platform_admins"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_processedByOwnerId_fkey" FOREIGN KEY ("processedByOwnerId") REFERENCES "restaurant_owners"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_processedByStaffId_fkey" FOREIGN KEY ("processedByStaffId") REFERENCES "staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "platform_admins"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "restaurant_owners"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "staff"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_modifications" ADD CONSTRAINT "order_modifications_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_modification_items" ADD CONSTRAINT "order_modification_items_modificationId_fkey" FOREIGN KEY ("modificationId") REFERENCES "order_modifications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_modification_items" ADD CONSTRAINT "order_modification_items_orderItemId_fkey" FOREIGN KEY ("orderItemId") REFERENCES "order_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_modification_items" ADD CONSTRAINT "order_modification_items_menuItemId_fkey" FOREIGN KEY ("menuItemId") REFERENCES "menu_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
