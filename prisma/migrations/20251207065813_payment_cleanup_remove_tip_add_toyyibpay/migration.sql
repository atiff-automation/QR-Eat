/*
  Warnings:

  - You are about to drop the column `clientSecret` on the `payment_intents` table. All the data in the column will be lost.
  - You are about to drop the column `finalAmount` on the `payment_intents` table. All the data in the column will be lost.
  - You are about to drop the column `tip` on the `payment_intents` table. All the data in the column will be lost.

*/
-- DropIndex
DROP INDEX "idx_customer_sessions_table_status_started";

-- DropIndex
DROP INDEX "idx_menu_items_category_featured_order";

-- DropIndex
DROP INDEX "idx_orders_restaurant_payment_created";

-- DropIndex
DROP INDEX "idx_orders_restaurant_status_created";

-- DropIndex
DROP INDEX "idx_orders_table_session";

-- DropIndex
DROP INDEX "idx_staff_restaurant_active";

-- DropIndex
DROP INDEX "idx_staff_sessions_staff_expires";

-- DropIndex
DROP INDEX "idx_transaction_fees_restaurant_processed";

-- DropIndex
DROP INDEX "idx_user_sessions_session_expires_active";

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "toyyibpayBillCode" TEXT,
ADD COLUMN     "toyyibpayPaymentUrl" TEXT;

-- AlterTable
ALTER TABLE "payment_intents" DROP COLUMN "clientSecret",
DROP COLUMN "finalAmount",
DROP COLUMN "tip",
ADD COLUMN     "referenceNumber" TEXT,
ADD COLUMN     "verifiedAt" TIMESTAMP(3),
ADD COLUMN     "verifiedBy" TEXT,
ALTER COLUMN "currency" SET DEFAULT 'MYR';
