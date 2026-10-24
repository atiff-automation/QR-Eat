-- Add a deterministic PIN lookup fingerprint for uniqueness and fast station
-- unlock. The actual PIN remains bcrypt-hashed in "pinHash".
ALTER TABLE "staff" ADD COLUMN "pinLookup" TEXT;

CREATE UNIQUE INDEX "staff_restaurantId_pinLookup_key"
  ON "staff"("restaurantId", "pinLookup");
