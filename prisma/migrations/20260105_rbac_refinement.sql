-- RBAC Role Refinement Migration
-- Date: 2026-01-05
-- Purpose: Restrict platform admin to platform management only, expand cashier role

-- ============================================================================
-- 1. Remove business data permissions from platform_admin
-- ============================================================================

DELETE FROM role_permissions
WHERE role_template = 'platform_admin'
AND permission_key IN (
  'analytics:platform',
  'analytics:export'
);

-- ============================================================================
-- 2. Add new cashier permissions (Cashier = Waiter + Payments)
-- ============================================================================

-- Add tables:write permission if it doesn't exist
INSERT INTO permissions (permission_key, category, description, is_active)
VALUES ('tables:write', 'operations', 'Update table status', true)
ON CONFLICT (permission_key) DO NOTHING;

-- Grant tables:write to cashier role
INSERT INTO role_permissions (role_template, permission_key)
VALUES ('cashier', 'tables:write')
ON CONFLICT (role_template, permission_key) DO NOTHING;

-- ============================================================================
-- 3. Invalidate all platform admin sessions (force re-login with new permissions)
-- ============================================================================

UPDATE user_sessions
SET expires_at = NOW()
WHERE user_id IN (
  SELECT id FROM platform_admins
);

-- ============================================================================
-- 4. Verification Queries
-- ============================================================================

-- Verify platform_admin permissions (should NOT have analytics permissions)
-- SELECT rp.permission_key 
-- FROM role_permissions rp 
-- WHERE rp.role_template = 'platform_admin' 
-- ORDER BY rp.permission_key;

-- Verify cashier permissions (should have tables:write)
-- SELECT rp.permission_key 
-- FROM role_permissions rp 
-- WHERE rp.role_template = 'cashier' 
-- ORDER BY rp.permission_key;

-- Verify all admin sessions are expired
-- SELECT COUNT(*) as active_admin_sessions
-- FROM user_sessions us
-- JOIN platform_admins pa ON us.user_id = pa.id
-- WHERE us.expires_at > NOW();
-- Expected: 0
