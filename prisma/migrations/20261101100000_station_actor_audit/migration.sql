-- Station actors are auditable without pretending a device is a staff member.
ALTER TABLE "station_order_recalls"
ADD COLUMN "recalledByDeviceId" TEXT;
