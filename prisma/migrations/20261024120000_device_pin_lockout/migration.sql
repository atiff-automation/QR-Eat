-- Device-level PIN backoff: a stolen phone must not allow unlimited guesses.
ALTER TABLE "devices" ADD COLUMN "failedPinAttempts" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "devices" ADD COLUMN "pinLockedUntil" TIMESTAMP(3);

-- Exactly one default station per restaurant, enforced by the database.
-- Routing falls back to this station for unmapped categories (D19).
CREATE UNIQUE INDEX "stations_one_default_per_restaurant"
  ON "stations" ("restaurantId")
  WHERE "isDefault" = true;
