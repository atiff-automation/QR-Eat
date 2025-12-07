-- ============================================
-- Rollback Script for Performance Indexes
-- ============================================
-- Purpose: Remove all performance indexes created by migration 20251206141158
-- Use: Execute this script if indexes need to be removed
-- Safety: Non-destructive - only drops indexes, preserves all data
-- ============================================

-- Begin transaction for atomic rollback
BEGIN;

-- Drop all performance indexes
DROP INDEX IF EXISTS idx_orders_restaurant_status_created;
DROP INDEX IF EXISTS idx_orders_restaurant_payment_created;
DROP INDEX IF EXISTS idx_orders_table_session;
DROP INDEX IF EXISTS idx_staff_restaurant_active;
DROP INDEX IF EXISTS idx_staff_email_active;
DROP INDEX IF EXISTS idx_menu_items_restaurant_available_order;
DROP INDEX IF EXISTS idx_menu_items_category_featured_order;
DROP INDEX IF EXISTS idx_staff_sessions_staff_expires;
DROP INDEX IF EXISTS idx_user_sessions_session_expires_active;
DROP INDEX IF EXISTS idx_customer_sessions_table_status_started;
DROP INDEX IF EXISTS idx_audit_logs_restaurant_created;
DROP INDEX IF EXISTS idx_transaction_fees_restaurant_processed;

-- Verify all indexes removed
SELECT
    indexname,
    CASE
        WHEN indexname IS NULL THEN '✅ Removed'
        ELSE '⚠️  Still exists'
    END as status
FROM (
    VALUES
        ('idx_orders_restaurant_status_created'),
        ('idx_orders_restaurant_payment_created'),
        ('idx_orders_table_session'),
        ('idx_staff_restaurant_active'),
        ('idx_staff_email_active'),
        ('idx_menu_items_restaurant_available_order'),
        ('idx_menu_items_category_featured_order'),
        ('idx_staff_sessions_staff_expires'),
        ('idx_user_sessions_session_expires_active'),
        ('idx_customer_sessions_table_status_started'),
        ('idx_audit_logs_restaurant_created'),
        ('idx_transaction_fees_restaurant_processed')
    ) AS expected_indexes(indexname)
LEFT JOIN pg_indexes ON pg_indexes.indexname = expected_indexes.indexname
    AND schemaname = 'public';

-- Commit transaction
COMMIT;

-- ============================================
-- Post-Rollback Verification
-- ============================================
-- Run this query to confirm all indexes are removed:
--
-- SELECT indexname FROM pg_indexes
-- WHERE schemaname = 'public' AND indexname LIKE 'idx_%'
-- ORDER BY indexname;
--
-- Expected result: No rows (or only other custom indexes)
-- ============================================
