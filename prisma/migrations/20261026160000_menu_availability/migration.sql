-- Menu availability ("86") permission.
-- Additive only: existing roles that do not receive this permission keep their
-- current access.

INSERT INTO "permissions" (
    "id",
    "permissionKey",
    "description",
    "category",
    "isActive",
    "createdAt"
)
VALUES (
    gen_random_uuid(),
    'menu:availability',
    'Hide or restore menu items from ordering',
    'menu',
    true,
    NOW()
)
ON CONFLICT ("permissionKey") DO NOTHING;

INSERT INTO "role_permissions" (
    "id",
    "roleTemplate",
    "permissionKey",
    "grantedAt"
)
SELECT
    gen_random_uuid(),
    role_template,
    'menu:availability',
    NOW()
FROM (
    VALUES
        ('restaurant_owner'),
        ('manager'),
        ('cashier')
) AS role_templates(role_template)
ON CONFLICT ("roleTemplate", "permissionKey") DO NOTHING;
