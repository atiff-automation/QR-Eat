/* B3-S gate fixtures: two tenants, staff RBAC, menu, stations, tokens. */
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const REPO = '/home/atiff/.local/share/opencode/worktree/770812/neon-pixel';
const { PrismaClient } = require(path.join(REPO, 'node_modules/@prisma/client'));
const jwt = require(path.join(REPO, 'node_modules/jsonwebtoken'));

const prisma = new PrismaClient({
  datasources: { db: { url: 'postgresql://gate@127.0.0.1:55432/qreat_gate' } },
});
const JWT_KEY = '[local-gate-key-redacted]';
const ISSUER = 'qr-restaurant-system';
const sha256 = (v) => crypto.createHash('sha256').update(v).digest('hex');

const PERMISSIONS = [
  ['orders:read', 'Read orders', 'orders'],
  ['orders:write', 'Create and modify orders', 'orders'],
  ['orders:counter_serve', 'Move a no-Kitchen Counter order through preparing/ready/served', 'orders'],
  ['orders:kitchen', 'Kitchen order actions', 'orders'],
  ['orders:fulfill', 'Serve orders', 'orders'],
  ['payments:read', 'Read payments', 'payments'],
  ['payments:write', 'Take payments', 'payments'],
  ['tables:read', 'Read tables', 'tables'],
  ['tables:write', 'Update tables', 'tables'],
  ['menu:read', 'Read menu', 'menu'],
  ['menu:availability', 'Toggle availability', 'menu'],
  ['menu:write', 'Write menu', 'menu'],
  ['loyalty:attach', 'Attach loyalty', 'loyalty'],
  ['settings:read', 'Read settings', 'settings'],
  ['settings:write', 'Write settings', 'settings'],
  ['staff:read', 'Read staff', 'staff'],
  ['staff:write', 'Write staff', 'staff'],
];

const TEMPLATES = {
  cashier: ['orders:read','orders:write','orders:counter_serve','payments:read','payments:write','tables:read','tables:write','menu:read','menu:availability','loyalty:attach'],
  manager: ['orders:read','orders:write','orders:counter_serve','orders:kitchen','orders:fulfill','payments:read','payments:write','tables:read','tables:write','menu:read','menu:availability','menu:write','loyalty:attach','settings:read','settings:write','staff:read','staff:write'],
};

async function ensurePermissionTemplates() {
  for (const [key, description, category] of PERMISSIONS) {
    await prisma.permission.upsert({ where: { permissionKey: key }, update: {}, create: { permissionKey: key, description, category, isActive: true } });
  }
  for (const [template, keys] of Object.entries(TEMPLATES)) {
    for (const key of keys) {
      await prisma.rolePermission.upsert({
        where: { roleTemplate_permissionKey: { roleTemplate: template, permissionKey: key } },
        update: {}, create: { roleTemplate: template, permissionKey: key },
      });
    }
  }
}

async function templatePermissions(template) {
  const rows = await prisma.rolePermission.findMany({ where: { roleTemplate: template }, include: { permission: true } });
  return rows.filter((r) => r.permission.isActive).map((r) => r.permission.permissionKey);
}

async function createTenant(label, taxRate, serviceRate) {
  const slug = 'gate-' + label;
  const owner = await prisma.restaurantOwner.create({
    data: { email: 'owner-' + label + '@gate.invalid', passwordHash: 'gate-not-a-login', firstName: 'Gate', lastName: 'Owner ' + label },
  });
  const restaurant = await prisma.restaurant.create({
    data: {
      ownerId: owner.id, name: 'Gate Tenant ' + label, slug, address: 'Gate lab ' + label,
      taxRate, serviceChargeRate: serviceRate, taxLabel: 'SST (6%)',
      serviceChargeLabel: 'Service Charge (10%)', businessDayCloseTime: '04:00', isActive: true,
    },
  });
  const cashierRole = await prisma.staffRole.create({ data: { name: 'Gate Cashier ' + label, description: 'gate cashier', level: 2 } });
  const managerRole = await prisma.staffRole.create({ data: { name: 'Gate Manager ' + label, description: 'gate manager', level: 5 } });

  async function staffUser(roleName, roleId, roleTemplate) {
    const suffix = label + '-' + roleTemplate;
    const staff = await prisma.staff.create({
      data: {
        restaurantId: restaurant.id, roleId, email: 'staff-' + suffix + '@gate.invalid',
        username: 'staff_' + suffix.replace(/-/g, '_'), passwordHash: 'gate-not-a-login',
        firstName: 'Gate', lastName: roleName, isActive: true,
      },
    });
    const userRole = await prisma.userRole.create({
      data: { userId: staff.id, userType: 'staff', restaurantId: restaurant.id, roleTemplate, customPermissions: [], isActive: true },
    });
    const permissions = await templatePermissions(roleTemplate);
    const sessionId = 'sess_gate_' + label + '_' + roleTemplate + '_' + crypto.randomUUID();
    const now = Math.floor(Date.now() / 1000);
    const roleJson = { id: userRole.id, userType: 'staff', roleTemplate, restaurantId: restaurant.id, customPermissions: [], isActive: true };
    const payload = {
      userId: staff.id, email: staff.email, firstName: staff.firstName, lastName: staff.lastName,
      currentRole: roleJson, availableRoles: [roleJson],
      restaurantContext: { id: restaurant.id, name: restaurant.name, slug: restaurant.slug, isActive: true, timezone: restaurant.timezone, currency: restaurant.currency },
      permissions, sessionId, iat: now, exp: now + 8 * 3600, iss: ISSUER, sub: staff.id,
    };
    const token = jwt.sign(payload, JWT_KEY, { algorithm: 'HS256' });
    await prisma.userSession.create({
      data: {
        userId: staff.id, sessionId: sha256(sessionId), currentRoleId: userRole.id,
        restaurantContextId: restaurant.id, jwtTokenHash: sha256(token), permissions,
        expiresAt: new Date(Date.now() + 8 * 3600 * 1000), deviceType: 'counter',
      },
    });
    return { staffId: staff.id, userRoleId: userRole.id, token, permissions };
  }

  const cashier = await staffUser('Cashier', cashierRole.id, 'cashier');
  const manager = await staffUser('Manager', managerRole.id, 'manager');

  const grillCat = await prisma.menuCategory.create({ data: { restaurantId: restaurant.id, name: 'Grill', displayOrder: 1 } });
  const drinksCat = await prisma.menuCategory.create({ data: { restaurantId: restaurant.id, name: 'Drinks', displayOrder: 2 } });
  const settings = { printMode: 'COUNTER', warnMinutes: 5, lateMinutes: 10, density: 'normal', textScale: 'normal' };
  const grill = await prisma.station.create({ data: { restaurantId: restaurant.id, name: 'Grill', isDefault: true, isActive: true, settings } });
  const drinks = await prisma.station.create({ data: { restaurantId: restaurant.id, name: 'Drinks', isDefault: false, isActive: true, settings } });
  await prisma.stationCategory.createMany({ data: [
    { stationId: grill.id, categoryId: grillCat.id },
    { stationId: drinks.id, categoryId: drinksCat.id },
  ] });
  const burger = await prisma.menuItem.create({ data: { restaurantId: restaurant.id, categoryId: grillCat.id, name: 'Gate Burger', price: 20, allergens: [], dietaryInfo: [], isAvailable: true, displayOrder: 1 } });
  const fries = await prisma.menuItem.create({ data: { restaurantId: restaurant.id, categoryId: grillCat.id, name: 'Gate Fries', price: 8, allergens: [], dietaryInfo: [], isAvailable: true, displayOrder: 2 } });
  const cola = await prisma.menuItem.create({ data: { restaurantId: restaurant.id, categoryId: drinksCat.id, name: 'Gate Cola', price: 5, allergens: [], dietaryInfo: [], isAvailable: true, displayOrder: 3 } });

  return {
    restaurantId: restaurant.id, slug, ownerId: owner.id, cashier, manager,
    stations: { grillId: grill.id, drinksId: drinks.id },
    menu: { burgerId: burger.id, friesId: fries.id, colaId: cola.id },
  };
}

(async () => {
  await ensurePermissionTemplates();
  const A = await createTenant('a', 0.06, 0.1);
  const B = await createTenant('b', 0.06, 0.1);
  const out = { createdAt: new Date().toISOString(), A, B };
  fs.writeFileSync('/tmp/opencode/b3s-gate/fixtures.json', JSON.stringify(out, null, 2));
  console.log(JSON.stringify({ A: { restaurantId: A.restaurantId, perms: A.cashier.permissions }, B: { restaurantId: B.restaurantId } }, null, 2));
  await prisma.$disconnect();
})().catch(async (e) => { console.error('FIXTURES_FAILED', e); await prisma.$disconnect(); process.exit(1); });
