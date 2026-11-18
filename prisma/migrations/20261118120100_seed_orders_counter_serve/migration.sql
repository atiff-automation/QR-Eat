-- B3-S: make the Counter no-Kitchen serve permission available in production.
--
-- The seed already contains both rows, but `npm start` runs `migrate deploy`
-- and never the seed. This migration is the production path and is safe to
-- apply more than once:
--   - the permission insert is keyed by its existing unique `permissionKey`;
--   - the role mapping is keyed by the existing `(roleTemplate, permissionKey)`
--     unique constraint.
--
-- Additive only. Rolling back drops one permission and one role mapping; no
-- order, payment or audit data is touched.
INSERT INTO "permissions" ("id", "permissionKey", "description", "category", "isActive", "createdAt")
VALUES (
    gen_random_uuid()::text,
    'orders:counter_serve',
    'Move a no-Kitchen Counter order through preparing/ready/served',
    'orders',
    true,
    CURRENT_TIMESTAMP
)
ON CONFLICT ("permissionKey") DO NOTHING;

INSERT INTO "role_permissions" ("id", "roleTemplate", "permissionKey", "grantedAt")
SELECT
    gen_random_uuid()::text,
    'cashier',
    'orders:counter_serve',
    CURRENT_TIMESTAMP
WHERE EXISTS (
    SELECT 1 FROM "permissions" WHERE "permissionKey" = 'orders:counter_serve'
)
ON CONFLICT ("roleTemplate", "permissionKey") DO NOTHING;
