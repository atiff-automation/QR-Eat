/*
  Warnings:

  - You are about to drop the column `toyyibpayBillCode` on the `orders` table. All the data in the column will be lost.
  - You are about to drop the column `toyyibpayPaymentUrl` on the `orders` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "orders" DROP COLUMN "toyyibpayBillCode",
DROP COLUMN "toyyibpayPaymentUrl";
