-- Add missing composite index for P&L queries (expenseDate, restaurantId)
CREATE INDEX "expenses_expenseDate_restaurantId_idx" ON "expenses"("expenseDate", "restaurantId");

-- Create materialized view for fast P&L calculations
CREATE MATERIALIZED VIEW expense_daily_summary AS
SELECT 
  e."restaurantId",
  DATE(e."expenseDate") as expense_date,
  ec."categoryType",
  ec.name as category_name,
  SUM(e.amount) as total_amount,
  COUNT(*) as expense_count
FROM expenses e
JOIN expense_categories ec ON e."categoryId" = ec.id
WHERE e."expenseDate" IS NOT NULL
GROUP BY e."restaurantId", DATE(e."expenseDate"), ec."categoryType", ec.name;

-- Create indexes on materialized view for fast lookups
CREATE INDEX idx_expense_daily_summary_restaurant_date 
ON expense_daily_summary("restaurantId", expense_date DESC);

CREATE INDEX idx_expense_daily_summary_category_type 
ON expense_daily_summary("restaurantId", "categoryType", expense_date DESC);

-- Add comment explaining the view
COMMENT ON MATERIALIZED VIEW expense_daily_summary IS 
'Pre-aggregated daily expense summaries for fast P&L report generation. Refresh every 15 minutes or after bulk expense operations.';
