-- AlterTable
ALTER TABLE "restaurants" ADD COLUMN     "notificationSettings" JSONB NOT NULL DEFAULT '{"orderAlerts":true,"soundEnabled":true,"soundType":"chime","desktopNotifications":true}',
ADD COLUMN     "paymentMethods" JSONB NOT NULL DEFAULT '{"cash":true,"card":true,"ewallet":true}',
ADD COLUMN     "receiptSettings" JSONB NOT NULL DEFAULT '{"headerText":"Thank you for dining with us!","footerText":"Please come again!","paperSize":"80mm"}',
ADD COLUMN     "serviceChargeLabel" TEXT NOT NULL DEFAULT 'Service Charge (10%)',
ADD COLUMN     "systemPreferences" JSONB NOT NULL DEFAULT '{"dateFormat":"DD/MM/YYYY","timeFormat":"24h","numberFormat":"1,234.56"}',
ADD COLUMN     "taxLabel" TEXT NOT NULL DEFAULT 'SST (6%)';

-- CreateTable
CREATE TABLE "push_subscriptions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "userType" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "push_subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "push_subscriptions_endpoint_key" ON "push_subscriptions"("endpoint");

-- CreateIndex
CREATE INDEX "push_subscriptions_userId_userType_idx" ON "push_subscriptions"("userId", "userType");

-- CreateIndex
CREATE INDEX "push_subscriptions_restaurantId_idx" ON "push_subscriptions"("restaurantId");

-- CreateIndex
CREATE INDEX "push_subscriptions_endpoint_idx" ON "push_subscriptions"("endpoint");

-- AddForeignKey
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
