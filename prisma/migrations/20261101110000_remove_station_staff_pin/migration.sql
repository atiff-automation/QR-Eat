-- Station identity replaced staff PIN unlock. Remove the dead credential path.
DROP INDEX IF EXISTS "staff_restaurantId_pinLookup_key";
ALTER TABLE "staff" DROP COLUMN IF EXISTS "pinHash";
ALTER TABLE "staff" DROP COLUMN IF EXISTS "pinLookup";
ALTER TABLE "devices" DROP COLUMN IF EXISTS "failedPinAttempts";
ALTER TABLE "devices" DROP COLUMN IF EXISTS "pinLockedUntil";
