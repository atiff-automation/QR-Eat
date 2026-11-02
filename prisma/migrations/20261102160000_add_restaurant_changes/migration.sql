-- Durable Counter cache invalidation feed.
-- Additive only; existing rows are unaffected.

CREATE TABLE "restaurant_changes" (
  "id" BIGSERIAL NOT NULL,
  "restaurantId" TEXT NOT NULL,
  "entityType" TEXT NOT NULL,
  "entityId" TEXT NOT NULL,
  "operation" TEXT NOT NULL DEFAULT 'upsert',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "restaurant_changes_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "restaurant_changes"
  ADD CONSTRAINT "restaurant_changes_restaurantId_fkey"
  FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "restaurant_changes_restaurantId_id_idx"
  ON "restaurant_changes"("restaurantId", "id");
