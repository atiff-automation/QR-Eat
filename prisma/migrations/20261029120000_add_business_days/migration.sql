-- Add Counter business-day and Z-report foundation.
-- No carryover: a new business day is created only after the previous closes.

ALTER TABLE "restaurants"
  ADD COLUMN "businessDayCloseTime" TEXT NOT NULL DEFAULT '04:00',
  ADD COLUMN "openingFloatDefault" DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  ADD COLUMN "cashDrawerEnabled" BOOLEAN NOT NULL DEFAULT true;

CREATE TABLE "business_days" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "businessDate" DATE NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),
    "closedBy" TEXT,
    "closedByName" TEXT,
    "closeNote" TEXT,
    "openingFloat" DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    "countedCash" DECIMAL(10,2),
    "expectedCash" DECIMAL(10,2),
    "variance" DECIMAL(10,2),
    "zNumber" TEXT,
    "closeIdempotencyKey" TEXT,
    "snapshot" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "business_days_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "business_days_restaurantId_businessDate_key"
  ON "business_days"("restaurantId", "businessDate");
CREATE UNIQUE INDEX "business_days_restaurantId_zNumber_key"
  ON "business_days"("restaurantId", "zNumber");
CREATE UNIQUE INDEX "business_days_closeIdempotencyKey_key"
  ON "business_days"("closeIdempotencyKey");
CREATE INDEX "business_days_restaurantId_status_idx"
  ON "business_days"("restaurantId", "status");
CREATE INDEX "business_days_restaurantId_businessDate_idx"
  ON "business_days"("restaurantId", "businessDate");

ALTER TABLE "business_days"
  ADD CONSTRAINT "business_days_restaurantId_fkey"
  FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
