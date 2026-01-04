-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('PENDING', 'CONFIRMED', 'PREPARING', 'READY', 'SERVED', 'CANCELLED');
CREATE TYPE "OrderPaymentStatus" AS ENUM ('PENDING', 'PAID', 'REFUNDED', 'FAILED');
CREATE TYPE "TableStatus" AS ENUM ('AVAILABLE', 'OCCUPIED', 'RESERVED');
CREATE TYPE "CustomerSessionStatus" AS ENUM ('ACTIVE', 'ENDED', 'EXPIRED');
CREATE TYPE "OrderItemStatus" AS ENUM ('PENDING', 'PREPARING', 'READY', 'SERVED', 'CANCELLED');
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'COMPLETED', 'FAILED', 'REFUNDED');

-- AlterTable orders - change status columns to use enums
ALTER TABLE "orders" ALTER COLUMN "status" TYPE "OrderStatus" USING ("status"::"OrderStatus");
ALTER TABLE "orders" ALTER COLUMN "status" SET DEFAULT 'PENDING';
ALTER TABLE "orders" ALTER COLUMN "paymentStatus" TYPE "OrderPaymentStatus" USING ("paymentStatus"::"OrderPaymentStatus");
ALTER TABLE "orders" ALTER COLUMN "paymentStatus" SET DEFAULT 'PENDING';

-- AlterTable tables
ALTER TABLE "tables" ALTER COLUMN "status" TYPE "TableStatus" USING ("status"::"TableStatus");
ALTER TABLE "tables" ALTER COLUMN "status" SET DEFAULT 'AVAILABLE';

-- AlterTable customer_sessions
ALTER TABLE "customer_sessions" ALTER COLUMN "status" TYPE "CustomerSessionStatus" USING ("status"::"CustomerSessionStatus");
ALTER TABLE "customer_sessions" ALTER COLUMN "status" SET DEFAULT 'ACTIVE';

-- AlterTable order_items
ALTER TABLE "order_items" ALTER COLUMN "status" TYPE "OrderItemStatus" USING ("status"::"OrderItemStatus");
ALTER TABLE "order_items" ALTER COLUMN "status" SET DEFAULT 'PENDING';

-- AlterTable payments
ALTER TABLE "payments" ALTER COLUMN "status" TYPE "PaymentStatus" USING ("status"::"PaymentStatus");
ALTER TABLE "payments" ALTER COLUMN "status" SET DEFAULT 'PENDING';
