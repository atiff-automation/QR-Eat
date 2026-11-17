-- Loyalty, rewards and promotions v1 — scope join tables (TASK revision 2, R-08).
--
-- Replaces the three `Unsupported("uuid[]")` id-list columns with join tables so
-- the datamodel round-trips through Prisma: `promotions.categoryIds`,
-- `promotions.itemIds` and `quotes.promotionIds` become `promotion_categories`,
-- `promotion_items` and `quote_promotions`. Each join table carries
-- `restaurantId` and composite tenant foreign keys, so a category, item or
-- promotion id belonging to another restaurant cannot be stored. The API wire
-- shape (`promotionIds`, `promotionItems[]`) is unchanged.
--
-- Adds `@@unique([restaurantId, id])` to `menu_categories` and `menu_items` as
-- the parent keys for the composite foreign keys. Additive indexes only.
--
-- Note: the dropped columns are empty by design. They were introduced by
-- migration 20261113120000_loyalty_promo_v1 in the same uncommitted change set
-- and no production or dev row has ever written an id into them, so the
-- DROP COLUMN statements below lose no data. They intentionally do not use
-- CASCADE, so any unknown dependent object would abort the migration instead of
-- being dropped silently.
--
-- Generated with:
--   npx prisma migrate diff \
--     --from-schema-datamodel /tmp/opencode/schema-before-p1b.prisma \
--     --to-schema-datamodel prisma/schema.prisma --script
-- AlterTable
ALTER TABLE "promotions" DROP COLUMN "categoryIds",
DROP COLUMN "itemIds";

-- AlterTable
ALTER TABLE "quotes" DROP COLUMN "promotionIds";

-- CreateTable
CREATE TABLE "promotion_categories" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "promotionId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "promotion_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "promotion_items" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "promotionId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "promotion_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quote_promotions" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "quoteId" TEXT NOT NULL,
    "promotionId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "quote_promotions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "promotion_categories_restaurantId_categoryId_idx" ON "promotion_categories"("restaurantId", "categoryId");

-- CreateIndex
CREATE UNIQUE INDEX "promotion_categories_promotionId_categoryId_key" ON "promotion_categories"("promotionId", "categoryId");

-- CreateIndex
CREATE UNIQUE INDEX "promotion_categories_restaurantId_id_key" ON "promotion_categories"("restaurantId", "id");

-- CreateIndex
CREATE INDEX "promotion_items_restaurantId_itemId_idx" ON "promotion_items"("restaurantId", "itemId");

-- CreateIndex
CREATE UNIQUE INDEX "promotion_items_promotionId_itemId_key" ON "promotion_items"("promotionId", "itemId");

-- CreateIndex
CREATE UNIQUE INDEX "promotion_items_restaurantId_id_key" ON "promotion_items"("restaurantId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "quote_promotions_quoteId_promotionId_key" ON "quote_promotions"("quoteId", "promotionId");

-- CreateIndex
CREATE UNIQUE INDEX "quote_promotions_restaurantId_id_key" ON "quote_promotions"("restaurantId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "menu_categories_restaurantId_id_key" ON "menu_categories"("restaurantId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "menu_items_restaurantId_id_key" ON "menu_items"("restaurantId", "id");

-- AddForeignKey
ALTER TABLE "promotion_categories" ADD CONSTRAINT "promotion_categories_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "promotion_categories" ADD CONSTRAINT "promotion_categories_restaurantId_promotionId_fkey" FOREIGN KEY ("restaurantId", "promotionId") REFERENCES "promotions"("restaurantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "promotion_categories" ADD CONSTRAINT "promotion_categories_restaurantId_categoryId_fkey" FOREIGN KEY ("restaurantId", "categoryId") REFERENCES "menu_categories"("restaurantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "promotion_items" ADD CONSTRAINT "promotion_items_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "promotion_items" ADD CONSTRAINT "promotion_items_restaurantId_promotionId_fkey" FOREIGN KEY ("restaurantId", "promotionId") REFERENCES "promotions"("restaurantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "promotion_items" ADD CONSTRAINT "promotion_items_restaurantId_itemId_fkey" FOREIGN KEY ("restaurantId", "itemId") REFERENCES "menu_items"("restaurantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quote_promotions" ADD CONSTRAINT "quote_promotions_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quote_promotions" ADD CONSTRAINT "quote_promotions_restaurantId_quoteId_fkey" FOREIGN KEY ("restaurantId", "quoteId") REFERENCES "quotes"("restaurantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quote_promotions" ADD CONSTRAINT "quote_promotions_restaurantId_promotionId_fkey" FOREIGN KEY ("restaurantId", "promotionId") REFERENCES "promotions"("restaurantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

