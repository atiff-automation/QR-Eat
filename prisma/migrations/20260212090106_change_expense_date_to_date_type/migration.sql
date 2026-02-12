-- AlterTable: Change expenseDate from TIMESTAMP to DATE (date-only, no time/timezone)
-- This is the correct type for calendar dates like expense dates.

-- Drop materialized view that depends on expenseDate column
-- (P&L report now queries expenses table directly — this view is no longer needed)
DROP MATERIALIZED VIEW IF EXISTS expense_daily_summary;

-- Drop composite index that references the column
DROP INDEX IF EXISTS "expenses_expenseDate_restaurantId_idx";

-- Change column type (existing timestamps are truncated to date automatically by PostgreSQL)
ALTER TABLE "expenses" ALTER COLUMN "expenseDate" SET DATA TYPE DATE;

-- Recreate the composite index
CREATE INDEX "expenses_expenseDate_restaurantId_idx" ON "expenses"("restaurantId", "expenseDate");
