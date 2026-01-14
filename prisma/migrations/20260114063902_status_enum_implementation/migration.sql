-- CreateEnum
CREATE TYPE "MenuStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "StaffStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- AlterEnum
ALTER TYPE "TableStatus" ADD VALUE 'INACTIVE';

-- AlterTable: Add status columns (nullable first for data migration)
ALTER TABLE "menu_categories" ADD COLUMN "status" "MenuStatus";
ALTER TABLE "menu_items" ADD COLUMN "status" "MenuStatus";
ALTER TABLE "staff" ADD COLUMN "preferences" JSONB NOT NULL DEFAULT '{}';
ALTER TABLE "staff" ADD COLUMN "status" "StaffStatus";

-- Data Migration: Convert existing boolean values to enum values
UPDATE "menu_categories" SET "status" = CASE 
  WHEN "isActive" = true THEN 'ACTIVE'::"MenuStatus"
  ELSE 'INACTIVE'::"MenuStatus"
END;

UPDATE "menu_items" SET "status" = CASE
  WHEN "isAvailable" = true THEN 'ACTIVE'::"MenuStatus"
  ELSE 'INACTIVE'::"MenuStatus"
END;

UPDATE "staff" SET "status" = CASE
  WHEN "isActive" = true THEN 'ACTIVE'::"StaffStatus"
  ELSE 'INACTIVE'::"StaffStatus"
END;

-- Make status columns NOT NULL with defaults
ALTER TABLE "menu_categories" ALTER COLUMN "status" SET NOT NULL;
ALTER TABLE "menu_categories" ALTER COLUMN "status" SET DEFAULT 'ACTIVE';

ALTER TABLE "menu_items" ALTER COLUMN "status" SET NOT NULL;
ALTER TABLE "menu_items" ALTER COLUMN "status" SET DEFAULT 'ACTIVE';

ALTER TABLE "staff" ALTER COLUMN "status" SET NOT NULL;
ALTER TABLE "staff" ALTER COLUMN "status" SET DEFAULT 'ACTIVE';

-- CreateIndex
CREATE INDEX "menu_categories_status_idx" ON "menu_categories"("status");
CREATE INDEX "menu_items_status_idx" ON "menu_items"("status");
CREATE INDEX "staff_status_idx" ON "staff"("status");
