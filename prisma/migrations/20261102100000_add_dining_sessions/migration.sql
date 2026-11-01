-- Add dining sessions for table bills.
-- A dining session groups every order in one table sitting, independent of
-- payment/kitchen status. Existing occupied tables are backfilled once.

-- CreateEnum
CREATE TYPE "DiningSessionStatus" AS ENUM ('OPEN', 'CLOSED');

-- CreateTable
CREATE TABLE "dining_sessions" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "tableId" TEXT NOT NULL,
    "status" "DiningSessionStatus" NOT NULL DEFAULT 'OPEN',
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),
    "openedBy" TEXT,
    "closedBy" TEXT,

    CONSTRAINT "dining_sessions_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "tables" ADD COLUMN "activeDiningSessionId" TEXT;
ALTER TABLE "orders" ADD COLUMN "diningSessionId" TEXT;

-- CreateIndex
CREATE INDEX "dining_sessions_tableId_status_idx" ON "dining_sessions"("tableId", "status");
CREATE INDEX "dining_sessions_restaurantId_openedAt_idx" ON "dining_sessions"("restaurantId", "openedAt");
CREATE UNIQUE INDEX "dining_sessions_one_open_per_table" ON "dining_sessions"("tableId") WHERE "status" = 'OPEN';
CREATE UNIQUE INDEX "tables_activeDiningSessionId_key" ON "tables"("activeDiningSessionId");
CREATE INDEX "orders_diningSessionId_idx" ON "orders"("diningSessionId");

-- AddForeignKey
ALTER TABLE "dining_sessions" ADD CONSTRAINT "dining_sessions_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "dining_sessions" ADD CONSTRAINT "dining_sessions_tableId_fkey" FOREIGN KEY ("tableId") REFERENCES "tables"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "tables" ADD CONSTRAINT "tables_activeDiningSessionId_fkey" FOREIGN KEY ("activeDiningSessionId") REFERENCES "dining_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "orders" ADD CONSTRAINT "orders_diningSessionId_fkey" FOREIGN KEY ("diningSessionId") REFERENCES "dining_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill current occupied tables that still have active or unpaid orders.
-- The session starts at the earliest active/unpaid order. All non-cancelled
-- orders from that point are attached, including served orders, so the new
-- bill has the full sitting. Historical/available tables are left untouched.
WITH candidates AS (
    SELECT
        t."id" AS table_id,
        t."restaurantId" AS restaurant_id,
        MIN(o."createdAt") AS opened_at
    FROM "tables" t
    JOIN "orders" o ON o."tableId" = t."id"
    WHERE t."status" = 'OCCUPIED'
      AND o."status" <> 'CANCELLED'
      AND (
          o."status" IN ('PENDING', 'CONFIRMED', 'PREPARING', 'READY')
          OR (o."status" = 'SERVED' AND o."paymentStatus" = 'PENDING')
      )
    GROUP BY t."id", t."restaurantId"
), inserted AS (
    INSERT INTO "dining_sessions" ("id", "restaurantId", "tableId", "status", "openedAt")
    SELECT gen_random_uuid(), c.restaurant_id, c.table_id, 'OPEN', c.opened_at
    FROM candidates c
    RETURNING "id", "tableId"
)
UPDATE "orders" o
SET "diningSessionId" = i."id"
FROM inserted i
JOIN candidates c ON c.table_id = i."tableId"
WHERE o."tableId" = i."tableId"
  AND o."status" <> 'CANCELLED'
  AND o."createdAt" >= c.opened_at
  AND o."diningSessionId" IS NULL;

UPDATE "tables" t
SET "activeDiningSessionId" = ds."id"
FROM "dining_sessions" ds
WHERE ds."tableId" = t."id"
  AND ds."status" = 'OPEN';
