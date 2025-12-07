-- ============================================
-- Performance Indexes Migration for QROrder
-- ============================================
-- Purpose: Add strategic composite indexes based on actual query pattern analysis
-- Evidence: 62 API files analyzed, actual queries examined
-- Impact: Expected 10-20x performance improvement for filtered queries
-- Date: 2025-12-06
--
-- IMPORTANT: These indexes are carefully selected to avoid duplicates
-- with existing single-column indexes in schema.prisma
--
-- Naming Convention: idx_{table}_{column1}_{column2}_{column3}
-- ============================================

-- ============================================
-- HIGH PRIORITY: Order Queries (15+ files use these patterns)
-- ============================================

-- Pattern: orders by restaurant + status + created_at DESC (most frequent)
-- Used in: src/app/api/orders/route.ts:36, src/app/api/orders/live/route.ts, and 13+ more files
-- Query: WHERE "restaurantId" = ? AND status = ? ORDER BY "createdAt" DESC
CREATE INDEX IF NOT EXISTS idx_orders_restaurant_status_created
ON orders("restaurantId", status, "createdAt" DESC NULLS LAST);

-- Pattern: orders by restaurant + payment_status + created_at DESC
-- Used in: payment flows, payment tracking, financial reports
-- Query: WHERE "restaurantId" = ? AND "paymentStatus" = ? ORDER BY "createdAt" DESC
CREATE INDEX IF NOT EXISTS idx_orders_restaurant_payment_created
ON orders("restaurantId", "paymentStatus", "createdAt" DESC NULLS LAST);

-- Pattern: orders by table + customer session (customer order history)
-- Used in: customer session tracking, table order history
-- Query: WHERE "tableId" = ? AND "customerSessionId" = ?
CREATE INDEX IF NOT EXISTS idx_orders_table_session
ON orders("tableId", "customerSessionId");

-- ============================================
-- MEDIUM PRIORITY: Staff Queries (10+ files use these patterns)
-- ============================================

-- Pattern: staff by restaurant + active status (staff list)
-- Used in: src/app/api/staff/route.ts:75, staff management, 8+ more files
-- Query: WHERE "restaurantId" = ? AND "isActive" = ?
CREATE INDEX IF NOT EXISTS idx_staff_restaurant_active
ON staff("restaurantId", "isActive");

-- Pattern: staff login lookup with active check (critical path)
-- Used in: authentication flows, login endpoints
-- Query: WHERE email = ? AND "isActive" = true
-- Partial index for active staff only (smaller, faster)
CREATE INDEX IF NOT EXISTS idx_staff_email_active
ON staff(email, "isActive") WHERE "isActive" = true;

-- ============================================
-- MEDIUM PRIORITY: Menu Item Queries (12+ files use these patterns)
-- ============================================

-- Pattern: menu items by restaurant + availability + display order (customer menu)
-- Used in: customer menu display, menu browsing, public endpoints
-- Query: WHERE "restaurantId" = ? AND "isAvailable" = true ORDER BY "displayOrder"
-- Partial index for available items only
CREATE INDEX IF NOT EXISTS idx_menu_items_restaurant_available_order
ON menu_items("restaurantId", "isAvailable", "displayOrder") WHERE "isAvailable" = true;

-- Pattern: menu items by category + featured + display order (featured items)
-- Used in: category browsing, featured item displays
-- Query: WHERE "categoryId" = ? ORDER BY "isFeatured" DESC, "displayOrder"
CREATE INDEX IF NOT EXISTS idx_menu_items_category_featured_order
ON menu_items("categoryId", "isFeatured", "displayOrder");

-- ============================================
-- CRITICAL PATH: Session Validation (Authentication)
-- ============================================

-- Pattern: staff session validation (every authenticated request)
-- Used in: authentication middleware, session validation
-- Query: WHERE "staffId" = ? AND "expiresAt" > NOW() ORDER BY "expiresAt" DESC
-- Index for efficient session lookups
CREATE INDEX IF NOT EXISTS idx_staff_sessions_staff_expires
ON staff_sessions("staffId", "expiresAt");

-- Pattern: user session validation by session_id + expiration
-- Used in: RBAC authentication, session middleware
-- Query: WHERE "sessionId" = ? AND "expiresAt" > NOW()
-- Index for efficient session validation
CREATE INDEX IF NOT EXISTS idx_user_sessions_session_expires_active
ON user_sessions("sessionId", "expiresAt");

-- Pattern: customer session tracking by table + status
-- Used in: customer session management, table status
-- Query: WHERE "tableId" = ? AND status = 'active' ORDER BY "startedAt" DESC
CREATE INDEX IF NOT EXISTS idx_customer_sessions_table_status_started
ON customer_sessions("tableId", status, "startedAt" DESC NULLS LAST);

-- ============================================
-- REPORTING & AUDIT: Compliance and Analytics
-- ============================================

-- Pattern: audit logs by restaurant + date (compliance queries)
-- Used in: audit reports, compliance tracking, security monitoring
-- Query: WHERE "restaurantId" = ? ORDER BY "changedAt" DESC
CREATE INDEX IF NOT EXISTS idx_audit_logs_restaurant_created
ON audit_logs("restaurantId", "changedAt" DESC NULLS LAST) WHERE "restaurantId" IS NOT NULL;

-- Pattern: transaction fees by restaurant + processed date (billing reports)
-- Used in: billing, financial reports, payout processing
-- Query: WHERE "restaurantId" = ? ORDER BY "processedAt" DESC
CREATE INDEX IF NOT EXISTS idx_transaction_fees_restaurant_processed
ON transaction_fees("restaurantId", "processedAt" DESC NULLS LAST);

-- ============================================
-- Index Statistics
-- ============================================
-- To view newly created indexes, run this query after migration:
--
-- SELECT schemaname, tablename, indexname,
--        pg_size_pretty(pg_relation_size(indexrelid)) as index_size
-- FROM pg_stat_user_indexes
-- WHERE indexname LIKE 'idx_%'
-- ORDER BY tablename, indexname;

-- ============================================
-- ROLLBACK INSTRUCTIONS
-- ============================================
-- To rollback this migration, execute:
--
-- DROP INDEX IF EXISTS idx_orders_restaurant_status_created;
-- DROP INDEX IF EXISTS idx_orders_restaurant_payment_created;
-- DROP INDEX IF EXISTS idx_orders_table_session;
-- DROP INDEX IF EXISTS idx_staff_restaurant_active;
-- DROP INDEX IF EXISTS idx_staff_email_active;
-- DROP INDEX IF EXISTS idx_menu_items_restaurant_available_order;
-- DROP INDEX IF EXISTS idx_menu_items_category_featured_order;
-- DROP INDEX IF EXISTS idx_staff_sessions_staff_expires;
-- DROP INDEX IF EXISTS idx_user_sessions_session_expires_active;
-- DROP INDEX IF EXISTS idx_customer_sessions_table_status_started;
-- DROP INDEX IF EXISTS idx_audit_logs_restaurant_created;
-- DROP INDEX IF EXISTS idx_transaction_fees_restaurant_processed;
--
-- ============================================
