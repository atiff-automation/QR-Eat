/*
  Warnings:

  - You are about to drop the column `variationId` on the `cart_items` table. All the data in the column will be lost.
  - You are about to drop the `menu_item_variations` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `order_item_variations` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "cart_items" DROP CONSTRAINT "cart_items_variationId_fkey";

-- DropForeignKey
ALTER TABLE "menu_item_variations" DROP CONSTRAINT "menu_item_variations_menuItemId_fkey";

-- DropForeignKey
ALTER TABLE "order_item_variations" DROP CONSTRAINT "order_item_variations_orderItemId_fkey";

-- DropForeignKey
ALTER TABLE "order_item_variations" DROP CONSTRAINT "order_item_variations_variationId_fkey";

-- AlterTable
ALTER TABLE "cart_items" DROP COLUMN "variationId";

-- DropTable
DROP TABLE "menu_item_variations";

-- DropTable
DROP TABLE "order_item_variations";

-- CreateTable
CREATE TABLE "variation_groups" (
    "id" TEXT NOT NULL,
    "menuItemId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "minSelections" INTEGER NOT NULL DEFAULT 0,
    "maxSelections" INTEGER NOT NULL DEFAULT 1,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "variation_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "variation_options" (
    "id" TEXT NOT NULL,
    "variationGroupId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "priceModifier" DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    "isAvailable" BOOLEAN NOT NULL DEFAULT true,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "variation_options_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cart_item_options" (
    "id" TEXT NOT NULL,
    "cartItemId" TEXT NOT NULL,
    "variationOptionId" TEXT NOT NULL,

    CONSTRAINT "cart_item_options_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_item_options" (
    "id" TEXT NOT NULL,
    "orderItemId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "priceModifier" DECIMAL(10,2) NOT NULL,

    CONSTRAINT "order_item_options_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "variation_groups_menuItemId_idx" ON "variation_groups"("menuItemId");

-- CreateIndex
CREATE INDEX "variation_options_variationGroupId_idx" ON "variation_options"("variationGroupId");

-- CreateIndex
CREATE INDEX "cart_item_options_cartItemId_idx" ON "cart_item_options"("cartItemId");

-- CreateIndex
CREATE INDEX "cart_item_options_variationOptionId_idx" ON "cart_item_options"("variationOptionId");

-- CreateIndex
CREATE INDEX "order_item_options_orderItemId_idx" ON "order_item_options"("orderItemId");

-- AddForeignKey
ALTER TABLE "variation_groups" ADD CONSTRAINT "variation_groups_menuItemId_fkey" FOREIGN KEY ("menuItemId") REFERENCES "menu_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "variation_options" ADD CONSTRAINT "variation_options_variationGroupId_fkey" FOREIGN KEY ("variationGroupId") REFERENCES "variation_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cart_item_options" ADD CONSTRAINT "cart_item_options_cartItemId_fkey" FOREIGN KEY ("cartItemId") REFERENCES "cart_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cart_item_options" ADD CONSTRAINT "cart_item_options_variationOptionId_fkey" FOREIGN KEY ("variationOptionId") REFERENCES "variation_options"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_item_options" ADD CONSTRAINT "order_item_options_orderItemId_fkey" FOREIGN KEY ("orderItemId") REFERENCES "order_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
