-- Loyalty rate-limit rebalance (P7c, 2026-11-14).
--
-- Additive only: no backfill, no dropped column and no rewritten row. Existing
-- `security_events` rows keep `restaurantId = NULL` (platform-wide events), and
-- existing `loyalty_settings` rows take the contract default of 30.
--
-- Generated with:
--   npx prisma migrate diff \
--     --from-schema-datamodel /tmp/opencode/schema-before-p7c.prisma \
--     --to-schema-datamodel prisma/schema.prisma --script

-- AlterTable
ALTER TABLE "security_events" ADD COLUMN     "restaurantId" TEXT;

-- AlterTable
ALTER TABLE "loyalty_settings" ADD COLUMN     "lookupLimitPerHour" INTEGER NOT NULL DEFAULT 30;

-- CreateIndex
CREATE INDEX "security_events_eventType_ipAddress_createdAt_idx" ON "security_events"("eventType", "ipAddress", "createdAt");
