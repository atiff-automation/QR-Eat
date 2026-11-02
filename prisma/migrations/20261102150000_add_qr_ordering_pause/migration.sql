-- QR ordering pause: manual owner pause plus automatic presence gate.
-- Additive only. Existing restaurants default to not paused.

ALTER TABLE "restaurants"
  ADD COLUMN "qrOrderingPaused" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "qrOrderingPausedAt" TIMESTAMP(3),
  ADD COLUMN "qrOrderingPausedBy" TEXT,
  ADD COLUMN "qrOrderingPausedReason" TEXT;
