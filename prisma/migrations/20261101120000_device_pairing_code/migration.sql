-- Station pairing: one short, single-use code replaces the UUID plus secret the
-- installer used to type (D63). The code is not exposed until a device asks for
-- it and is nulled on pairing, so this is additive and safe for live devices.
ALTER TABLE "devices"
ADD COLUMN "pairingCode" TEXT,
ADD COLUMN "pairedAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "devices_pairingCode_key" ON "devices"("pairingCode");
