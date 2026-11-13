-- Loyalty, rewards and promotions v1 (§18.20).
--
-- Additive only: new tables, new enums, new nullable/defaulted columns. No
-- backfill and no rewrite of existing rows. Pre-migration rows keep working:
-- Restaurant.cashRounding is null (= NONE), PaymentBatch.businessDate/outcome
-- are null, and every new money/discount column defaults to 0.00.
--
-- Not expressible in the Prisma datamodel and therefore in the follow-up
-- migration: the partial unique indexes and the CHECK constraints.

-- CreateEnum
CREATE TYPE "RewardType" AS ENUM ('PERCENT', 'FIXED');

-- CreateEnum
CREATE TYPE "PromotionScope" AS ENUM ('ORDER', 'CATEGORY', 'ITEM');

-- CreateEnum
CREATE TYPE "CustomerStatus" AS ENUM ('ACTIVE', 'ANONYMIZED');

-- CreateEnum
CREATE TYPE "OrderDiscountSource" AS ENUM ('PROMOTION', 'LOYALTY_REWARD');

-- CreateEnum
CREATE TYPE "BillDiscountSource" AS ENUM ('PROMOTION', 'LOYALTY_REWARD', 'MULTIPLE');

-- CreateEnum
CREATE TYPE "OrderDiscountStatus" AS ENUM ('ACTIVE', 'REPLACED', 'REMOVED');

-- CreateEnum
CREATE TYPE "CashRounding" AS ENUM ('NONE', 'NEAREST_5_SEN');

-- CreateEnum
CREATE TYPE "PaymentOutcome" AS ENUM ('VISIT_COUNTED', 'REWARD_APPLIED', 'PROMOTION_APPLIED', 'BELOW_MINIMUM', 'ALREADY_COUNTED', 'GUEST', 'NO_BENEFIT');

-- CreateEnum
CREATE TYPE "LoyaltyVisitState" AS ENUM ('COUNTS', 'ALREADY_COUNTED', 'PROMOTION', 'BELOW_MINIMUM', 'GUEST');

-- CreateEnum
CREATE TYPE "IdempotencyScope" AS ENUM ('ORDER_CREATE', 'MEMBER_CHANGE', 'PAYMENT');

-- CreateEnum
CREATE TYPE "IdempotencyStatus" AS ENUM ('IN_PROGRESS', 'COMPLETED');

-- AlterTable
ALTER TABLE "restaurants" ADD COLUMN     "cashRounding" "CashRounding";

-- AlterTable
ALTER TABLE "dining_sessions" ADD COLUMN     "billRevision" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "customerId" TEXT,
ADD COLUMN     "discountAmount" DECIMAL(10,2) NOT NULL DEFAULT 0.00,
ADD COLUMN     "discountLabel" TEXT,
ADD COLUMN     "discountSource" "BillDiscountSource";

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "customerId" TEXT,
ADD COLUMN     "discountLabel" TEXT,
ADD COLUMN     "discountSource" "OrderDiscountSource",
ADD COLUMN     "discountVersion" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "payment_batches" ADD COLUMN     "businessDate" DATE,
ADD COLUMN     "cashPayable" DECIMAL(10,2),
ADD COLUMN     "outcome" "PaymentOutcome",
ADD COLUMN     "roundingAdjustment" DECIMAL(10,2);

-- CreateTable
CREATE TABLE "customers" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "phone" TEXT,
    "phoneHash" TEXT NOT NULL,
    "name" TEXT,
    "consentAt" TIMESTAMP(3),
    "consentVersion" TEXT,
    "consentTextHash" TEXT,
    "consentSource" TEXT,
    "consentWithdrawnAt" TIMESTAMP(3),
    "marketingOptIn" BOOLEAN NOT NULL DEFAULT false,
    "marketingConsentAt" TIMESTAMP(3),
    "marketingConsentVersion" TEXT,
    "marketingConsentTextHash" TEXT,
    "marketingConsentSource" TEXT,
    "marketingWithdrawnAt" TIMESTAMP(3),
    "status" "CustomerStatus" NOT NULL DEFAULT 'ACTIVE',
    "anonymizedAt" TIMESTAMP(3),
    "lastVisitAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "loyalty_settings" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "visitsRequired" INTEGER NOT NULL DEFAULT 3,
    "rewardType" "RewardType" NOT NULL DEFAULT 'PERCENT',
    "rewardValue" DECIMAL(10,2) NOT NULL,
    "maxDiscount" DECIMAL(10,2) NOT NULL,
    "minDailySpend" DECIMAL(10,2) NOT NULL DEFAULT 20.00,
    "rewardLabel" TEXT NOT NULL,
    "termsText" TEXT,
    "receiptLabel" TEXT,
    "privacyUrl" TEXT,
    "noticeVersion" TEXT,
    "noticeText" TEXT,
    "noticeTextHash" TEXT,
    "updatedBy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "loyalty_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "loyalty_cards" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "visitsInCycle" INTEGER NOT NULL DEFAULT 0,
    "cycleNumber" INTEGER NOT NULL DEFAULT 1,
    "visitsRequired" INTEGER NOT NULL,
    "rewardType" "RewardType" NOT NULL,
    "rewardValue" DECIMAL(10,2) NOT NULL,
    "maxDiscount" DECIMAL(10,2) NOT NULL,
    "rewardLabel" TEXT NOT NULL,
    "minDailySpend" DECIMAL(10,2) NOT NULL,
    "cycleStartedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastRewardAt" TIMESTAMP(3),

    CONSTRAINT "loyalty_cards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "loyalty_visits" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "phoneHash" TEXT NOT NULL,
    "businessDate" DATE NOT NULL,
    "cycleNumber" INTEGER NOT NULL,
    "visitsRequired" INTEGER NOT NULL,
    "orderId" TEXT,
    "diningSessionId" TEXT,
    "paymentBatchId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "loyalty_visits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "promotions" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "receiptLabel" TEXT NOT NULL,
    "type" "RewardType" NOT NULL,
    "value" DECIMAL(10,2) NOT NULL,
    "scope" "PromotionScope" NOT NULL,
    "categoryIds" uuid[] NOT NULL DEFAULT ARRAY[]::uuid[],
    "itemIds" uuid[] NOT NULL DEFAULT ARRAY[]::uuid[],
    "minSpend" DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    "maxDiscount" DECIMAL(10,2) NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "deletedAt" TIMESTAMP(3),
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "promotions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_discounts" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "diningSessionId" TEXT,
    "source" "OrderDiscountSource" NOT NULL,
    "sourceId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "baseAmount" DECIMAL(10,2) NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "promotionSnapshot" JSONB,
    "rewardSnapshot" JSONB,
    "status" "OrderDiscountStatus" NOT NULL DEFAULT 'ACTIVE',
    "actorType" TEXT,
    "actorId" TEXT,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_discounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "idempotency_records" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "scope" "IdempotencyScope" NOT NULL,
    "key" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "responseJson" JSONB,
    "status" "IdempotencyStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "idempotency_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quotes" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "tableId" TEXT,
    "sessionId" TEXT,
    "cartKey" TEXT,
    "cartHash" TEXT NOT NULL,
    "billRevision" INTEGER NOT NULL,
    "customerId" TEXT,
    "phoneHash" TEXT,
    "promotionIds" uuid[] NOT NULL DEFAULT ARRAY[]::uuid[],
    "promotionDiscountAmount" DECIMAL(10,2) NOT NULL,
    "visitState" "LoyaltyVisitState" NOT NULL,
    "projectedRewardAmount" DECIMAL(10,2) NOT NULL,
    "rewardLabel" TEXT,
    "subtotal" DECIMAL(10,2) NOT NULL,
    "discountAmount" DECIMAL(10,2) NOT NULL,
    "taxAmount" DECIMAL(10,2) NOT NULL,
    "serviceCharge" DECIMAL(10,2) NOT NULL,
    "totalAmount" DECIMAL(10,2) NOT NULL,
    "projectedTotal" DECIMAL(10,2) NOT NULL,
    "cashPayable" DECIMAL(10,2) NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "orderId" TEXT,

    CONSTRAINT "quotes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rate_limit_counters" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "windowStart" TIMESTAMP(3) NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "rate_limit_counters_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "customers_restaurantId_status_idx" ON "customers"("restaurantId", "status");

-- CreateIndex
CREATE INDEX "customers_status_lastVisitAt_idx" ON "customers"("status", "lastVisitAt");

-- CreateIndex
CREATE UNIQUE INDEX "customers_restaurantId_id_key" ON "customers"("restaurantId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "loyalty_settings_restaurantId_key" ON "loyalty_settings"("restaurantId");

-- CreateIndex
CREATE UNIQUE INDEX "loyalty_cards_customerId_key" ON "loyalty_cards"("customerId");

-- CreateIndex
CREATE UNIQUE INDEX "loyalty_cards_restaurantId_customerId_key" ON "loyalty_cards"("restaurantId", "customerId");

-- CreateIndex
CREATE UNIQUE INDEX "loyalty_cards_restaurantId_id_key" ON "loyalty_cards"("restaurantId", "id");

-- CreateIndex
CREATE INDEX "loyalty_visits_restaurantId_businessDate_idx" ON "loyalty_visits"("restaurantId", "businessDate");

-- CreateIndex
CREATE INDEX "loyalty_visits_customerId_cycleNumber_idx" ON "loyalty_visits"("customerId", "cycleNumber");

-- CreateIndex
CREATE UNIQUE INDEX "loyalty_visits_customerId_businessDate_key" ON "loyalty_visits"("customerId", "businessDate");

-- CreateIndex
CREATE UNIQUE INDEX "loyalty_visits_restaurantId_phoneHash_businessDate_key" ON "loyalty_visits"("restaurantId", "phoneHash", "businessDate");

-- CreateIndex
CREATE INDEX "promotions_restaurantId_isActive_startsAt_endsAt_idx" ON "promotions"("restaurantId", "isActive", "startsAt", "endsAt");

-- CreateIndex
CREATE UNIQUE INDEX "promotions_restaurantId_id_key" ON "promotions"("restaurantId", "id");

-- CreateIndex
CREATE INDEX "order_discounts_restaurantId_status_createdAt_idx" ON "order_discounts"("restaurantId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "idempotency_records_expiresAt_idx" ON "idempotency_records"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "idempotency_records_restaurantId_scope_key_key" ON "idempotency_records"("restaurantId", "scope", "key");

-- CreateIndex
CREATE INDEX "quotes_expiresAt_idx" ON "quotes"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "quotes_restaurantId_id_key" ON "quotes"("restaurantId", "id");

-- CreateIndex
CREATE INDEX "rate_limit_counters_windowStart_idx" ON "rate_limit_counters"("windowStart");

-- CreateIndex
CREATE UNIQUE INDEX "rate_limit_counters_restaurantId_scope_subject_windowStart_key" ON "rate_limit_counters"("restaurantId", "scope", "subject", "windowStart");

-- CreateIndex
CREATE UNIQUE INDEX "dining_sessions_restaurantId_id_key" ON "dining_sessions"("restaurantId", "id");

-- CreateIndex
CREATE INDEX "orders_restaurantId_customerId_createdAt_idx" ON "orders"("restaurantId", "customerId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "orders_restaurantId_id_key" ON "orders"("restaurantId", "id");

-- CreateIndex
CREATE INDEX "payment_batches_restaurantId_businessDate_idx" ON "payment_batches"("restaurantId", "businessDate");

-- CreateIndex
CREATE UNIQUE INDEX "payment_batches_restaurantId_id_key" ON "payment_batches"("restaurantId", "id");

-- AddForeignKey
ALTER TABLE "dining_sessions" ADD CONSTRAINT "dining_sessions_restaurantId_customerId_fkey" FOREIGN KEY ("restaurantId", "customerId") REFERENCES "customers"("restaurantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_restaurantId_customerId_fkey" FOREIGN KEY ("restaurantId", "customerId") REFERENCES "customers"("restaurantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loyalty_settings" ADD CONSTRAINT "loyalty_settings_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loyalty_cards" ADD CONSTRAINT "loyalty_cards_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loyalty_cards" ADD CONSTRAINT "loyalty_cards_restaurantId_customerId_fkey" FOREIGN KEY ("restaurantId", "customerId") REFERENCES "customers"("restaurantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loyalty_visits" ADD CONSTRAINT "loyalty_visits_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loyalty_visits" ADD CONSTRAINT "loyalty_visits_restaurantId_customerId_fkey" FOREIGN KEY ("restaurantId", "customerId") REFERENCES "customers"("restaurantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loyalty_visits" ADD CONSTRAINT "loyalty_visits_restaurantId_paymentBatchId_fkey" FOREIGN KEY ("restaurantId", "paymentBatchId") REFERENCES "payment_batches"("restaurantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "promotions" ADD CONSTRAINT "promotions_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_discounts" ADD CONSTRAINT "order_discounts_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_discounts" ADD CONSTRAINT "order_discounts_restaurantId_orderId_fkey" FOREIGN KEY ("restaurantId", "orderId") REFERENCES "orders"("restaurantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "idempotency_records" ADD CONSTRAINT "idempotency_records_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_restaurantId_customerId_fkey" FOREIGN KEY ("restaurantId", "customerId") REFERENCES "customers"("restaurantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rate_limit_counters" ADD CONSTRAINT "rate_limit_counters_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

