-- Row-Level Security Policies for Multi-Tenant SaaS
-- This file implements complete tenant isolation at the database level

-- ==============================================
-- ENABLE ROW LEVEL SECURITY
-- ==============================================

-- Enable RLS on all tenant-scoped tables
ALTER TABLE restaurants ENABLE ROW LEVEL SECURITY;
ALTER TABLE tables ENABLE ROW LEVEL SECURITY;
ALTER TABLE menu_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE menu_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE menu_item_variations ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_item_variations ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff_role_hierarchy ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_intents ENABLE ROW LEVEL SECURITY;
ALTER TABLE transaction_fees ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoice_items ENABLE ROW LEVEL SECURITY;

-- ==============================================
-- HELPER FUNCTIONS FOR TENANT CONTEXT
-- ==============================================

-- Get current restaurant ID from session variable
CREATE OR REPLACE FUNCTION current_restaurant_id() RETURNS UUID AS $$
BEGIN
  RETURN COALESCE(
    current_setting('app.current_restaurant_id', true)::uuid,
    '00000000-0000-0000-0000-000000000000'::uuid
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Get current user type from session variable
CREATE OR REPLACE FUNCTION current_user_type() RETURNS TEXT AS $$
BEGIN
  RETURN COALESCE(
    current_setting('app.current_user_type', true),
    'anonymous'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Get current user ID from session variable
CREATE OR REPLACE FUNCTION current_user_id() RETURNS UUID AS $$
BEGIN
  RETURN COALESCE(
    current_setting('app.current_user_id', true)::uuid,
    '00000000-0000-0000-0000-000000000000'::uuid
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Check if current user is platform admin
CREATE OR REPLACE FUNCTION is_platform_admin() RETURNS BOOLEAN AS $$
BEGIN
  RETURN current_user_type() = 'platform_admin';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Check if current user is restaurant owner
CREATE OR REPLACE FUNCTION is_restaurant_owner() RETURNS BOOLEAN AS $$
BEGIN
  RETURN current_user_type() = 'restaurant_owner';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Check if current user owns the restaurant
CREATE OR REPLACE FUNCTION owns_restaurant(restaurant_id UUID) RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM restaurants 
    WHERE id = restaurant_id 
    AND owner_id = current_user_id()
    AND current_user_type() = 'restaurant_owner'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ==============================================
-- RESTAURANT POLICIES
-- ==============================================

-- Platform admins see all restaurants
CREATE POLICY platform_admin_restaurants ON restaurants
    FOR ALL 
    TO authenticated
    USING (is_platform_admin());

-- Restaurant owners see only their restaurants
CREATE POLICY owner_restaurants ON restaurants
    FOR ALL
    TO authenticated
    USING (
        owner_id = current_user_id() 
        AND is_restaurant_owner()
    );

-- Staff see only their restaurant (read-only)
CREATE POLICY staff_restaurant_read ON restaurants
    FOR SELECT
    TO authenticated
    USING (
        id = current_restaurant_id()
        AND current_user_type() = 'staff'
    );

-- ==============================================
-- TABLE POLICIES (Restaurant Tables)
-- ==============================================

-- Platform admins see all tables
CREATE POLICY platform_admin_tables ON tables
    FOR ALL
    TO authenticated
    USING (is_platform_admin());

-- Restaurant owners see tables from their restaurants
CREATE POLICY owner_tables ON tables
    FOR ALL
    TO authenticated
    USING (owns_restaurant(restaurant_id));

-- Staff see only tables from their restaurant
CREATE POLICY staff_tables ON tables
    FOR ALL
    TO authenticated
    USING (
        restaurant_id = current_restaurant_id()
        AND current_user_type() = 'staff'
    );

-- ==============================================
-- MENU CATEGORY POLICIES
-- ==============================================

-- Platform admins see all categories
CREATE POLICY platform_admin_categories ON menu_categories
    FOR ALL
    TO authenticated
    USING (is_platform_admin());

-- Restaurant owners see categories from their restaurants
CREATE POLICY owner_categories ON menu_categories
    FOR ALL
    TO authenticated
    USING (owns_restaurant(restaurant_id));

-- Staff see categories from their restaurant
CREATE POLICY staff_categories ON menu_categories
    FOR ALL
    TO authenticated
    USING (
        restaurant_id = current_restaurant_id()
        AND current_user_type() = 'staff'
    );

-- Public access for customers (read-only)
CREATE POLICY public_categories ON menu_categories
    FOR SELECT
    TO authenticated
    USING (
        restaurant_id = current_restaurant_id()
        AND current_user_type() = 'customer'
        AND is_active = true
    );

-- ==============================================
-- MENU ITEM POLICIES
-- ==============================================

-- Platform admins see all menu items
CREATE POLICY platform_admin_menu_items ON menu_items
    FOR ALL
    TO authenticated
    USING (is_platform_admin());

-- Restaurant owners see menu items from their restaurants
CREATE POLICY owner_menu_items ON menu_items
    FOR ALL
    TO authenticated
    USING (owns_restaurant(restaurant_id));

-- Staff see menu items from their restaurant
CREATE POLICY staff_menu_items ON menu_items
    FOR ALL
    TO authenticated
    USING (
        restaurant_id = current_restaurant_id()
        AND current_user_type() = 'staff'
    );

-- Public access for customers (read-only, available items only)
CREATE POLICY public_menu_items ON menu_items
    FOR SELECT
    TO authenticated
    USING (
        restaurant_id = current_restaurant_id()
        AND current_user_type() = 'customer'
        AND is_available = true
    );

-- ==============================================
-- MENU ITEM VARIATION POLICIES
-- ==============================================

-- Platform admins see all variations
CREATE POLICY platform_admin_variations ON menu_item_variations
    FOR ALL
    TO authenticated
    USING (is_platform_admin());

-- Restaurant owners see variations from their restaurants
CREATE POLICY owner_variations ON menu_item_variations
    FOR ALL
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM menu_items mi 
            WHERE mi.id = menu_item_variations.menu_item_id 
            AND owns_restaurant(mi.restaurant_id)
        )
    );

-- Staff see variations from their restaurant
CREATE POLICY staff_variations ON menu_item_variations
    FOR ALL
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM menu_items mi 
            WHERE mi.id = menu_item_variations.menu_item_id 
            AND mi.restaurant_id = current_restaurant_id()
            AND current_user_type() = 'staff'
        )
    );

-- Public access for customers (read-only)
CREATE POLICY public_variations ON menu_item_variations
    FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM menu_items mi 
            WHERE mi.id = menu_item_variations.menu_item_id 
            AND mi.restaurant_id = current_restaurant_id()
            AND current_user_type() = 'customer'
            AND mi.is_available = true
        )
    );

-- ==============================================
-- ORDER POLICIES
-- ==============================================

-- Platform admins see all orders
CREATE POLICY platform_admin_orders ON orders
    FOR ALL
    TO authenticated
    USING (is_platform_admin());

-- Restaurant owners see orders from their restaurants
CREATE POLICY owner_orders ON orders
    FOR ALL
    TO authenticated
    USING (owns_restaurant(restaurant_id));

-- Staff see orders from their restaurant
CREATE POLICY staff_orders ON orders
    FOR ALL
    TO authenticated
    USING (
        restaurant_id = current_restaurant_id()
        AND current_user_type() = 'staff'
    );

-- Customers see only their own orders
CREATE POLICY customer_orders ON orders
    FOR SELECT
    TO authenticated
    USING (
        restaurant_id = current_restaurant_id()
        AND current_user_type() = 'customer'
        AND customer_session_id IN (
            SELECT id FROM customer_sessions 
            WHERE session_token = current_setting('app.customer_session_token', true)
        )
    );

-- ==============================================
-- ORDER ITEM POLICIES
-- ==============================================

-- Platform admins see all order items
CREATE POLICY platform_admin_order_items ON order_items
    FOR ALL
    TO authenticated
    USING (is_platform_admin());

-- Restaurant owners see order items from their restaurants
CREATE POLICY owner_order_items ON order_items
    FOR ALL
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM orders o 
            WHERE o.id = order_items.order_id 
            AND owns_restaurant(o.restaurant_id)
        )
    );

-- Staff see order items from their restaurant
CREATE POLICY staff_order_items ON order_items
    FOR ALL
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM orders o 
            WHERE o.id = order_items.order_id 
            AND o.restaurant_id = current_restaurant_id()
            AND current_user_type() = 'staff'
        )
    );

-- ==============================================
-- STAFF POLICIES
-- ==============================================

-- Platform admins see all staff
CREATE POLICY platform_admin_staff ON staff
    FOR ALL
    TO authenticated
    USING (is_platform_admin());

-- Restaurant owners see staff from their restaurants
CREATE POLICY owner_staff ON staff
    FOR ALL
    TO authenticated
    USING (owns_restaurant(restaurant_id));

-- Staff see only colleagues from their restaurant
CREATE POLICY staff_colleagues ON staff
    FOR SELECT
    TO authenticated
    USING (
        restaurant_id = current_restaurant_id()
        AND current_user_type() = 'staff'
    );

-- Staff can update their own profile
CREATE POLICY staff_self_update ON staff
    FOR UPDATE
    TO authenticated
    USING (
        id = current_user_id()
        AND current_user_type() = 'staff'
    )
    WITH CHECK (
        id = current_user_id()
        AND current_user_type() = 'staff'
    );

-- ==============================================
-- STAFF SESSION POLICIES
-- ==============================================

-- Platform admins see all staff sessions
CREATE POLICY platform_admin_staff_sessions ON staff_sessions
    FOR ALL
    TO authenticated
    USING (is_platform_admin());

-- Staff see only their own sessions
CREATE POLICY staff_own_sessions ON staff_sessions
    FOR ALL
    TO authenticated
    USING (
        staff_id = current_user_id()
        AND current_user_type() = 'staff'
    );

-- Restaurant owners see sessions from staff in their restaurants
CREATE POLICY owner_staff_sessions ON staff_sessions
    FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM staff s 
            WHERE s.id = staff_sessions.staff_id 
            AND owns_restaurant(s.restaurant_id)
        )
    );

-- ==============================================
-- CUSTOMER SESSION POLICIES
-- ==============================================

-- Platform admins see all customer sessions
CREATE POLICY platform_admin_customer_sessions ON customer_sessions
    FOR ALL
    TO authenticated
    USING (is_platform_admin());

-- Restaurant owners see customer sessions from their restaurants
CREATE POLICY owner_customer_sessions ON customer_sessions
    FOR ALL
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM tables t 
            WHERE t.id = customer_sessions.table_id 
            AND owns_restaurant(t.restaurant_id)
        )
    );

-- Staff see customer sessions from their restaurant
CREATE POLICY staff_customer_sessions ON customer_sessions
    FOR ALL
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM tables t 
            WHERE t.id = customer_sessions.table_id 
            AND t.restaurant_id = current_restaurant_id()
            AND current_user_type() = 'staff'
        )
    );

-- ==============================================
-- PAYMENT POLICIES
-- ==============================================

-- Platform admins see all payments
CREATE POLICY platform_admin_payments ON payments
    FOR ALL
    TO authenticated
    USING (is_platform_admin());

-- Restaurant owners see payments from their restaurants
CREATE POLICY owner_payments ON payments
    FOR ALL
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM orders o 
            WHERE o.id = payments.order_id 
            AND owns_restaurant(o.restaurant_id)
        )
    );

-- Staff see payments from their restaurant
CREATE POLICY staff_payments ON payments
    FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM orders o 
            WHERE o.id = payments.order_id 
            AND o.restaurant_id = current_restaurant_id()
            AND current_user_type() = 'staff'
        )
    );

-- ==============================================
-- TRANSACTION FEE POLICIES
-- ==============================================

-- Platform admins see all transaction fees
CREATE POLICY platform_admin_transaction_fees ON transaction_fees
    FOR ALL
    TO authenticated
    USING (is_platform_admin());

-- Restaurant owners see transaction fees from their restaurants
CREATE POLICY owner_transaction_fees ON transaction_fees
    FOR SELECT
    TO authenticated
    USING (owns_restaurant(restaurant_id));

-- ==============================================
-- SUBSCRIPTION POLICIES
-- ==============================================

-- Platform admins see all subscriptions
CREATE POLICY platform_admin_subscriptions ON subscriptions
    FOR ALL
    TO authenticated
    USING (is_platform_admin());

-- Restaurant owners see their own subscriptions
CREATE POLICY owner_subscriptions ON subscriptions
    FOR SELECT
    TO authenticated
    USING (owns_restaurant(restaurant_id));

-- ==============================================
-- STAFF ROLE HIERARCHY POLICIES
-- ==============================================

-- Platform admins see all role hierarchies
CREATE POLICY platform_admin_role_hierarchy ON staff_role_hierarchy
    FOR ALL
    TO authenticated
    USING (is_platform_admin());

-- Restaurant owners see role hierarchies from their restaurants
CREATE POLICY owner_role_hierarchy ON staff_role_hierarchy
    FOR ALL
    TO authenticated
    USING (owns_restaurant(restaurant_id));

-- Staff see role hierarchies from their restaurant (read-only)
CREATE POLICY staff_role_hierarchy ON staff_role_hierarchy
    FOR SELECT
    TO authenticated
    USING (
        restaurant_id = current_restaurant_id()
        AND current_user_type() = 'staff'
    );

-- ==============================================
-- AUDIT LOG TENANT ISOLATION
-- ==============================================

-- Platform admins see all audit logs
CREATE POLICY platform_admin_audit_logs ON audit_logs
    FOR ALL
    TO authenticated
    USING (is_platform_admin());

-- Restaurant owners see audit logs from their restaurants
CREATE POLICY owner_audit_logs ON audit_logs
    FOR SELECT
    TO authenticated
    USING (
        restaurant_id IS NOT NULL 
        AND owns_restaurant(restaurant_id)
    );

-- Staff see audit logs from their restaurant (limited)
CREATE POLICY staff_audit_logs ON audit_logs
    FOR SELECT
    TO authenticated
    USING (
        restaurant_id = current_restaurant_id()
        AND current_user_type() = 'staff'
        AND severity IN ('info', 'warning') -- Only non-sensitive logs
    );

-- ==============================================
-- GRANT PERMISSIONS
-- ==============================================

-- Grant access to authenticated users (application role)
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;

-- Create authenticated role if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
        CREATE ROLE authenticated;
    END IF;
END
$$;

-- ==============================================
-- SECURITY VIEWS FOR SAFE ACCESS
-- ==============================================

-- View for restaurant owners to see their restaurants safely
CREATE OR REPLACE VIEW owner_restaurants_view AS
SELECT r.* FROM restaurants r
WHERE r.owner_id = current_user_id() 
AND current_user_type() = 'restaurant_owner';

-- View for staff to see their restaurant safely
CREATE OR REPLACE VIEW staff_restaurant_view AS
SELECT r.* FROM restaurants r
WHERE r.id = current_restaurant_id()
AND current_user_type() = 'staff';

-- Grant access to views
GRANT SELECT ON owner_restaurants_view TO authenticated;
GRANT SELECT ON staff_restaurant_view TO authenticated;

COMMENT ON TABLE restaurants IS 'Multi-tenant restaurant data with RLS enabled for complete tenant isolation';
COMMENT ON FUNCTION current_restaurant_id() IS 'Returns the current restaurant ID from session context';
COMMENT ON FUNCTION is_platform_admin() IS 'Checks if current user is a platform administrator';
COMMENT ON FUNCTION owns_restaurant(UUID) IS 'Checks if current user owns the specified restaurant';