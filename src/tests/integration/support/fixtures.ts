/**
 * Two-tenant fixtures for the tenant-isolation integration suite.
 *
 * Everything here is synthetic and disposable:
 * - names are "Gate …" and every email ends in `@gate.invalid`;
 * - restaurants, staff, stations, menu and orders are created with the same
 *   Prisma models the producers use, so the routes read realistic rows;
 * - the harness owns the rows it creates and `cleanupIntegrationFixtures()`
 *   removes them (restaurant-scoped rows cascade from the two restaurants).
 *
 * Two deterministic properties matter:
 * 1. Re-running without cleanup converges (upserts keyed on slug/email/name,
 *    and the per-tenant fixture order is replaced).
 * 2. Cleanup deletes only this run's tenant rows and the RBAC logs the run
 *    wrote, then leaves the schema and the global RBAC reference data intact.
 */

import { randomUUID } from 'crypto';
import { Prisma } from '@prisma/client';
import { prisma } from './db';
import { PermissionManager } from '@/lib/rbac/permissions';
import { SessionManager } from '@/lib/rbac/session-manager';
import { EnhancedJWTService } from '@/lib/rbac/jwt';
import {
  UserType,
  type EnhancedAuthenticatedUser,
  type UserRole,
} from '@/lib/rbac/types';

export type TenantKey = 'a' | 'b';

const TAG = 'ame013';

const RESTAURANTS: Record<
  TenantKey,
  { slug: string; name: string; ownerEmail: string }
> = {
  a: {
    slug: `${TAG}-tenant-a`,
    name: 'Gate Tenant A',
    ownerEmail: `owner-a@gate.invalid`,
  },
  b: {
    slug: `${TAG}-tenant-b`,
    name: 'Gate Tenant B',
    ownerEmail: `owner-b@gate.invalid`,
  },
};

const STAFF_EMAILS = {
  a: {
    cashier: 'cashier-a@gate.invalid',
    manager: 'manager-a@gate.invalid',
    viewer: 'viewer-a@gate.invalid',
  },
  b: {
    cashier: 'cashier-b@gate.invalid',
    manager: 'manager-b@gate.invalid',
    viewer: 'viewer-b@gate.invalid',
  },
} as const;

function roleNames(key: TenantKey) {
  return {
    cashier: `${TAG}-role-${key}-cashier`,
    manager: `${TAG}-role-${key}-manager`,
    viewer: `${TAG}-role-${key}-viewer`,
  } as const;
}

/**
 * Permission definitions and role-template membership copied exactly from
 * `prisma/seed.ts` (`rbacPermissions` and `roleTemplates`), limited to the
 * members of the three templates this harness uses. The seed's other permission
 * keys and templates (owner, platform admin, waiter) are not created here.
 *
 * Descriptions and categories are the seed values. Keys and membership must
 * match the seed exactly; add a seed permission here only when a template below
 * references it.
 */
const PERMISSIONS: ReadonlyArray<readonly [string, string, string]> = [
  ['restaurant:read', 'View restaurant information', 'restaurant'],
  ['orders:read', 'View orders', 'orders'],
  ['orders:write', 'Create and edit orders', 'orders'],
  [
    'orders:counter_serve',
    'Move a no-Kitchen Counter order through preparing/ready/served',
    'orders',
  ],
  ['orders:kitchen', 'Kitchen display access', 'orders'],
  ['orders:update', 'Update order progress/status', 'orders'],
  ['orders:fulfill', 'Mark orders as ready/served', 'orders'],
  ['tables:read', 'View tables', 'tables'],
  ['tables:write', 'Manage tables', 'tables'],
  ['tables:qr', 'Generate QR codes', 'tables'],
  ['menu:read', 'View menu items', 'menu'],
  ['menu:write', 'Manage menu items', 'menu'],
  ['menu:availability', 'Hide or restore menu items from ordering', 'menu'],
  ['payments:read', 'View payment information', 'payments'],
  ['payments:write', 'Process payments', 'payments'],
  [
    'loyalty:attach',
    'Attach or change the loyalty member at the Counter',
    'loyalty',
  ],
  ['loyalty:configure', 'Configure loyalty settings and rewards', 'loyalty'],
  ['loyalty:report', 'View loyalty and promotion reports', 'loyalty'],
  ['promotions:manage', 'Create, edit and delete promotions', 'promotions'],
  ['members:read', 'View loyalty member list and profiles', 'members'],
  ['members:pii', 'Reveal full member phone numbers', 'members'],
  ['members:consent_withdraw', 'Record loyalty consent withdrawal', 'members'],
  ['settings:read', 'View settings', 'settings'],
  ['settings:write', 'Edit settings', 'settings'],
  ['staff:read', 'View staff information', 'staff'],
  ['analytics:read', 'View analytics and reports', 'analytics'],
];

/**
 * The three templates this harness needs, with the seed's exact membership.
 * `cashier`, `manager` and `kitchen_staff` are copied verbatim from
 * `roleTemplates` in `prisma/seed.ts`; no harness-only permissions are added.
 */
const TEMPLATE_PERMISSIONS: Record<string, readonly string[]> = {
  cashier: [
    'orders:read',
    'orders:write',
    'orders:counter_serve',
    'payments:read',
    'payments:write',
    'tables:read',
    'tables:write',
    'menu:read',
    'menu:availability',
    'loyalty:attach',
  ],
  manager: [
    'restaurant:read',
    'orders:read',
    'orders:write',
    'orders:fulfill',
    'tables:read',
    'tables:write',
    'tables:qr',
    'staff:read',
    'analytics:read',
    'menu:read',
    'menu:write',
    'menu:availability',
    'settings:read',
    'settings:write',
    'payments:read',
    'payments:write',
    'loyalty:attach',
    'loyalty:configure',
    'loyalty:report',
    'promotions:manage',
    'members:read',
    'members:pii',
    'members:consent_withdraw',
  ],
  kitchen_staff: ['orders:read', 'orders:kitchen', 'orders:update'],
};

export interface TenantActor {
  staffId: string;
  userRoleId: string;
  email: string;
  roleTemplate: 'cashier' | 'manager' | 'kitchen_staff';
  token: string;
  permissions: string[];
}

export interface TenantOrder {
  id: string;
  orderNumber: string;
  version: number;
  status: string;
  /** Printable `order.created` event id (string because Prisma uses BigInt). */
  eventId: string | null;
}

export interface TenantFixture {
  key: TenantKey;
  restaurantId: string;
  restaurantSlug: string;
  ownerId: string;
  cashier: TenantActor;
  manager: TenantActor;
  /** `kitchen_staff`: has `orders:read` but not `orders:write`. */
  viewer: TenantActor;
  stations: { grillId: string; drinksId: string };
  categories: { grillId: string; drinksId: string };
  menu: { burgerId: string; friesId: string; colaId: string };
  tableId: string;
  order: TenantOrder;
  tableChangeId: number;
  orderChangeId: number;
}

export interface IntegrationFixtures {
  A: TenantFixture;
  B: TenantFixture;
}

/**
 * RBAC log rows written by the suite's own anonymous request.
 *
 * `RBACLog.userId` is `'anonymous'` for authentication refusals, so there is no
 * actor id that distinguishes one run from another. The suite captures the exact
 * ids it observed being created by that request and cleanup deletes only those.
 */
const ownedAnonymousRbacLogIds = new Set<string>();

function round2(value: number): string {
  return value.toFixed(2);
}

async function ensureReferenceData(): Promise<void> {
  for (const [permissionKey, description, category] of PERMISSIONS) {
    await prisma.permission.upsert({
      where: { permissionKey },
      update: {},
      create: { permissionKey, description, category, isActive: true },
    });
  }

  for (const [roleTemplate, keys] of Object.entries(TEMPLATE_PERMISSIONS)) {
    for (const permissionKey of keys) {
      await prisma.rolePermission.upsert({
        where: {
          roleTemplate_permissionKey: { roleTemplate, permissionKey },
        },
        update: {},
        create: { roleTemplate, permissionKey },
      });
    }
  }
}

async function buildTenant(key: TenantKey): Promise<TenantFixture> {
  const config = RESTAURANTS[key];
  const roleName = roleNames(key);
  const emails = STAFF_EMAILS[key];
  const taxRate = key === 'a' ? 0.06 : 0.08;
  const serviceRate = key === 'a' ? 0.1 : 0.05;

  const owner = await prisma.restaurantOwner.upsert({
    where: { email: config.ownerEmail },
    update: {
      firstName: 'Gate',
      lastName: `Owner ${key.toUpperCase()}`,
      isActive: true,
    },
    create: {
      email: config.ownerEmail,
      passwordHash: 'not-a-login',
      firstName: 'Gate',
      lastName: `Owner ${key.toUpperCase()}`,
      isActive: true,
    },
  });

  const restaurant = await prisma.restaurant.upsert({
    where: { slug: config.slug },
    update: {
      ownerId: owner.id,
      name: config.name,
      taxRate,
      serviceChargeRate: serviceRate,
      taxLabel: 'Gate Tax',
      serviceChargeLabel: 'Gate Service',
      businessDayCloseTime: '04:00',
      isActive: true,
    },
    create: {
      ownerId: owner.id,
      name: config.name,
      slug: config.slug,
      address: `Gate lab ${key.toUpperCase()}`,
      taxRate,
      serviceChargeRate: serviceRate,
      taxLabel: 'Gate Tax',
      serviceChargeLabel: 'Gate Service',
      businessDayCloseTime: '04:00',
      isActive: true,
    },
  });

  const cashierRole = await prisma.staffRole.upsert({
    where: { name: roleName.cashier },
    update: {},
    create: { name: roleName.cashier, description: 'gate cashier', level: 2 },
  });
  const managerRole = await prisma.staffRole.upsert({
    where: { name: roleName.manager },
    update: {},
    create: { name: roleName.manager, description: 'gate manager', level: 5 },
  });
  const viewerRole = await prisma.staffRole.upsert({
    where: { name: roleName.viewer },
    update: {},
    create: { name: roleName.viewer, description: 'gate viewer', level: 1 },
  });

  async function buildActor(params: {
    email: string;
    username: string;
    roleId: string;
    roleTemplate: 'cashier' | 'manager' | 'kitchen_staff';
    lastName: string;
  }): Promise<TenantActor> {
    const staff = await prisma.staff.upsert({
      where: { email: params.email },
      update: {
        restaurantId: restaurant.id,
        roleId: params.roleId,
        username: params.username,
        isActive: true,
        mustChangePassword: false,
      },
      create: {
        restaurantId: restaurant.id,
        roleId: params.roleId,
        email: params.email,
        username: params.username,
        passwordHash: 'not-a-login',
        firstName: 'Gate',
        lastName: params.lastName,
        isActive: true,
      },
    });

    const existingRole = await prisma.userRole.findFirst({
      where: {
        userId: staff.id,
        restaurantId: restaurant.id,
        roleTemplate: params.roleTemplate,
      },
    });
    const userRole = existingRole
      ? await prisma.userRole.update({
          where: { id: existingRole.id },
          data: { customPermissions: [], isActive: true },
        })
      : await prisma.userRole.create({
          data: {
            userId: staff.id,
            userType: 'staff',
            restaurantId: restaurant.id,
            roleTemplate: params.roleTemplate,
            customPermissions: [],
            isActive: true,
          },
        });

    const permissions = await PermissionManager.computeRolePermissions({
      roleTemplate: params.roleTemplate,
      customPermissions: [],
    });

    // Same flow as a real login: session row first, then the signed token that
    // validates against it.
    const session = await SessionManager.createSession({
      userId: staff.id,
      currentRoleId: userRole.id,
      restaurantContextId: restaurant.id,
      permissions,
      deviceType: 'counter',
    });

    const currentRole: UserRole = {
      id: userRole.id,
      userType: 'staff',
      roleTemplate: params.roleTemplate,
      restaurantId: restaurant.id,
      customPermissions: [],
      isActive: true,
    };
    const user: EnhancedAuthenticatedUser = {
      id: staff.id,
      email: staff.email,
      firstName: staff.firstName,
      lastName: staff.lastName,
      userType: UserType.STAFF,
      currentRole,
      availableRoles: [currentRole],
      restaurantContext: {
        id: restaurant.id,
        name: restaurant.name,
        slug: restaurant.slug,
        isActive: restaurant.isActive,
        timezone: restaurant.timezone,
        currency: restaurant.currency,
      },
      permissions,
      isActive: true,
      mustChangePassword: false,
    };

    const token = await EnhancedJWTService.generateToken(
      user,
      session.sessionId
    );

    return {
      staffId: staff.id,
      userRoleId: userRole.id,
      email: staff.email,
      roleTemplate: params.roleTemplate,
      token,
      permissions,
    };
  }

  const cashier = await buildActor({
    email: emails.cashier,
    username: `${TAG}_${key}_cashier`,
    roleId: cashierRole.id,
    roleTemplate: 'cashier',
    lastName: 'Cashier',
  });
  const manager = await buildActor({
    email: emails.manager,
    username: `${TAG}_${key}_manager`,
    roleId: managerRole.id,
    roleTemplate: 'manager',
    lastName: 'Manager',
  });
  const viewer = await buildActor({
    email: emails.viewer,
    username: `${TAG}_${key}_viewer`,
    roleId: viewerRole.id,
    roleTemplate: 'kitchen_staff',
    lastName: 'Viewer',
  });

  async function ensureCategory(name: string, displayOrder: number) {
    const existing = await prisma.menuCategory.findFirst({
      where: { restaurantId: restaurant.id, name },
    });
    if (existing) return existing;
    return prisma.menuCategory.create({
      data: {
        restaurantId: restaurant.id,
        name,
        displayOrder,
        isActive: true,
        status: 'ACTIVE',
      },
    });
  }

  const grillCategory = await ensureCategory('Gate Grill', 1);
  const drinksCategory = await ensureCategory('Gate Drinks', 2);

  const stationSettings = {
    printMode: 'COUNTER',
    warnMinutes: 5,
    lateMinutes: 10,
    density: 'normal',
    textScale: 'normal',
  };

  const grillStation = await prisma.station.upsert({
    where: {
      restaurantId_name: {
        restaurantId: restaurant.id,
        name: 'Gate Grill Station',
      },
    },
    update: { settings: stationSettings, isActive: true, isDefault: true },
    create: {
      restaurantId: restaurant.id,
      name: 'Gate Grill Station',
      isDefault: true,
      isActive: true,
      settings: stationSettings,
    },
  });
  const drinksStation = await prisma.station.upsert({
    where: {
      restaurantId_name: {
        restaurantId: restaurant.id,
        name: 'Gate Drinks Station',
      },
    },
    update: { settings: stationSettings, isActive: true, isDefault: false },
    create: {
      restaurantId: restaurant.id,
      name: 'Gate Drinks Station',
      isDefault: false,
      isActive: true,
      settings: stationSettings,
    },
  });

  for (const [stationId, categoryId] of [
    [grillStation.id, grillCategory.id],
    [drinksStation.id, drinksCategory.id],
  ]) {
    await prisma.stationCategory.upsert({
      where: { stationId_categoryId: { stationId, categoryId } },
      update: {},
      create: { stationId, categoryId },
    });
  }

  async function ensureMenuItem(params: {
    categoryId: string;
    name: string;
    price: string;
    displayOrder: number;
  }) {
    const existing = await prisma.menuItem.findFirst({
      where: { restaurantId: restaurant.id, name: params.name },
    });
    if (existing) {
      return prisma.menuItem.update({
        where: { id: existing.id },
        data: {
          categoryId: params.categoryId,
          price: params.price,
          isAvailable: true,
          status: 'ACTIVE',
        },
      });
    }
    return prisma.menuItem.create({
      data: {
        restaurantId: restaurant.id,
        categoryId: params.categoryId,
        name: params.name,
        price: params.price,
        allergens: [],
        dietaryInfo: [],
        isAvailable: true,
        status: 'ACTIVE',
        displayOrder: params.displayOrder,
      },
    });
  }

  const burger = await ensureMenuItem({
    categoryId: grillCategory.id,
    name: 'Gate Burger',
    price: '20.00',
    displayOrder: 1,
  });
  const fries = await ensureMenuItem({
    categoryId: grillCategory.id,
    name: 'Gate Fries',
    price: '8.00',
    displayOrder: 2,
  });
  const cola = await ensureMenuItem({
    categoryId: drinksCategory.id,
    name: 'Gate Cola',
    price: '5.00',
    displayOrder: 3,
  });

  const table = await prisma.table.upsert({
    where: {
      restaurantId_tableNumber: {
        restaurantId: restaurant.id,
        tableNumber: `GATE-${key.toUpperCase()}`,
      },
    },
    update: { qrCodeToken: `${TAG}-qr-${key}`, status: 'AVAILABLE' },
    create: {
      restaurantId: restaurant.id,
      tableNumber: `GATE-${key.toUpperCase()}`,
      qrCodeToken: `${TAG}-qr-${key}`,
      capacity: 4,
      status: 'AVAILABLE',
    },
  });

  // A table change first, so the Counter change cursor has a row older than the
  // order change. The cursor endpoint treats "older than the tenant's first
  // row" as expired, so the test needs a real predecessor row.
  const tableChange = await prisma.restaurantChange.create({
    data: {
      restaurantId: restaurant.id,
      entityType: 'table',
      entityId: table.id,
      operation: 'upsert',
    },
  });

  const orderNumber = `${TAG.toUpperCase()}-${key.toUpperCase()}`;
  await removeOrderByNumber(orderNumber);

  const subtotal = 20;
  const tax = subtotal * taxRate;
  const service = subtotal * serviceRate;
  const total = subtotal + tax + service;

  const order = await prisma.order.create({
    data: {
      orderNumber,
      restaurantId: restaurant.id,
      orderType: 'TAKEAWAY',
      source: 'QR',
      status: 'CONFIRMED',
      paymentStatus: 'PENDING',
      dailySeq: 1,
      version: 1,
      subtotalAmount: round2(subtotal),
      taxAmount: round2(tax),
      serviceCharge: round2(service),
      discountAmount: '0.00',
      totalAmount: round2(total),
      taxRateSnapshot: taxRate.toFixed(4),
      serviceChargeRateSnapshot: serviceRate.toFixed(4),
      taxLabelSnapshot: 'Gate Tax',
      serviceChargeLabelSnapshot: 'Gate Service',
      items: {
        create: [
          {
            menuItemId: burger.id,
            quantity: 1,
            unitPrice: '20.00',
            totalAmount: '20.00',
            status: 'PENDING',
          },
        ],
      },
    },
  });

  const event = await prisma.orderEvent.create({
    data: {
      restaurantId: restaurant.id,
      stationId: grillStation.id,
      orderId: order.id,
      type: 'order.created',
      printStatus: 'PENDING',
      payload: {
        orderNumber,
        orderVersion: 1,
        printMode: 'COUNTER',
        stationId: grillStation.id,
        stationName: grillStation.name,
        items: [
          {
            itemId: burger.id,
            name: burger.name,
            qty: 1,
            modifiers: [],
            notes: null,
          },
        ],
        totals: {
          subtotal: round2(subtotal),
          tax: round2(tax),
          serviceCharge: round2(service),
          discount: '0.00',
          total: round2(total),
        },
      } satisfies Prisma.InputJsonObject,
    },
  });

  const orderChange = await prisma.restaurantChange.create({
    data: {
      restaurantId: restaurant.id,
      entityType: 'order',
      entityId: order.id,
      operation: 'upsert',
    },
  });

  return {
    key,
    restaurantId: restaurant.id,
    restaurantSlug: restaurant.slug,
    ownerId: owner.id,
    cashier,
    manager,
    viewer,
    stations: { grillId: grillStation.id, drinksId: drinksStation.id },
    categories: { grillId: grillCategory.id, drinksId: drinksCategory.id },
    menu: { burgerId: burger.id, friesId: fries.id, colaId: cola.id },
    tableId: table.id,
    order: {
      id: order.id,
      orderNumber,
      version: order.version,
      status: order.status,
      eventId: event.id.toString(),
    },
    tableChangeId: Number(tableChange.id),
    orderChangeId: Number(orderChange.id),
  };
}

async function removeOrderByNumber(orderNumber: string): Promise<void> {
  const existing = await prisma.order.findUnique({
    where: { orderNumber },
    select: { id: true },
  });
  if (!existing) return;
  await prisma.restaurantChange.deleteMany({
    where: { entityId: existing.id },
  });
  await prisma.orderMutationIdempotency.deleteMany({
    where: { orderId: existing.id },
  });
  await prisma.order.delete({ where: { id: existing.id } });
}

/**
 * Create (or converge) a fresh order for a tenant. Tests that mutate an order
 * use this instead of the shared fixture order so each assertion starts from a
 * known version.
 */
export async function createTenantOrder(
  tenant: TenantFixture,
  options: {
    withTicket?: boolean;
    status?: 'PENDING' | 'CONFIRMED';
    menuItemId?: string;
  } = {}
): Promise<TenantOrder> {
  const status = options.status ?? 'CONFIRMED';
  const menuItemId = options.menuItemId ?? tenant.menu.burgerId;
  const orderNumber = `${TAG.toUpperCase()}-${tenant.key.toUpperCase()}-${randomUUID().slice(0, 8)}`;

  const menuItem = await prisma.menuItem.findUniqueOrThrow({
    where: { id: menuItemId },
    select: { name: true, price: true },
  });
  const price = Number(menuItem.price);
  const restaurant = await prisma.restaurant.findUniqueOrThrow({
    where: { id: tenant.restaurantId },
    select: { taxRate: true, serviceChargeRate: true },
  });
  const taxRate = Number(restaurant.taxRate);
  const serviceRate = Number(restaurant.serviceChargeRate);
  const tax = price * taxRate;
  const service = price * serviceRate;
  const total = price + tax + service;

  const order = await prisma.order.create({
    data: {
      orderNumber,
      restaurantId: tenant.restaurantId,
      orderType: 'TAKEAWAY',
      source: 'QR',
      status,
      paymentStatus: 'PENDING',
      dailySeq: 1,
      version: 1,
      subtotalAmount: round2(price),
      taxAmount: round2(tax),
      serviceCharge: round2(service),
      discountAmount: '0.00',
      totalAmount: round2(total),
      taxRateSnapshot: taxRate.toFixed(4),
      serviceChargeRateSnapshot: serviceRate.toFixed(4),
      taxLabelSnapshot: 'Gate Tax',
      serviceChargeLabelSnapshot: 'Gate Service',
      items: {
        create: [
          {
            menuItemId,
            quantity: 1,
            unitPrice: round2(price),
            totalAmount: round2(price),
            status: 'PENDING',
          },
        ],
      },
    },
  });

  let eventId: string | null = null;
  if (options.withTicket !== false) {
    const event = await prisma.orderEvent.create({
      data: {
        restaurantId: tenant.restaurantId,
        stationId: tenant.stations.grillId,
        orderId: order.id,
        type: 'order.created',
        printStatus: 'PENDING',
        payload: {
          orderNumber,
          orderVersion: 1,
          printMode: 'COUNTER',
          stationId: tenant.stations.grillId,
          items: [
            {
              itemId: menuItemId,
              name: menuItem.name,
              qty: 1,
              modifiers: [],
              notes: null,
            },
          ],
        } satisfies Prisma.InputJsonObject,
      },
    });
    eventId = event.id.toString();
  }

  await prisma.restaurantChange.create({
    data: {
      restaurantId: tenant.restaurantId,
      entityType: 'order',
      entityId: order.id,
      operation: 'upsert',
    },
  });

  return {
    id: order.id,
    orderNumber,
    version: order.version,
    status: order.status,
    eventId,
  };
}

/** Create both tenants. Idempotent for repeated runs. */
export async function createIntegrationFixtures(): Promise<IntegrationFixtures> {
  ownedAnonymousRbacLogIds.clear();

  await ensureReferenceData();
  const A = await buildTenant('a');
  const B = await buildTenant('b');

  return { A, B };
}

/**
 * Snapshot the ids of the system-actor (`anonymous`) RBAC log rows present
 * before an unauthenticated request. Used with
 * `claimAnonymousRbacLogsCreatedSince` to attribute the exact rows the request
 * writes, because `RBACLog.userId` is `'anonymous'` rather than a run id.
 */
export async function snapshotAnonymousRbacLogIds(): Promise<string[]> {
  const rows = await prisma.rBACLog.findMany({
    where: { userId: 'anonymous' },
    select: { id: true },
  });
  return rows.map((row) => row.id);
}

/**
 * Wait for the fire-and-forget audit write from the suite's anonymous request
 * and remember the new row ids so cleanup can delete them by id.
 *
 * Returns the newly observed ids. Times out after `timeoutMs` so a route that
 * stops writing the log does not hang the suite.
 */
export async function claimAnonymousRbacLogsCreatedSince(
  previousIds: readonly string[],
  timeoutMs = 3000
): Promise<string[]> {
  const known = new Set(previousIds);
  const deadline = Date.now() + timeoutMs;

  for (;;) {
    const rows = await prisma.rBACLog.findMany({
      where: { userId: 'anonymous' },
      select: { id: true },
    });
    const fresh = rows.map((row) => row.id).filter((id) => !known.has(id));

    if (fresh.length > 0 || Date.now() >= deadline) {
      for (const id of fresh) ownedAnonymousRbacLogIds.add(id);
      return fresh;
    }

    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

/**
 * Remove only the rows this harness owns.
 *
 * Restaurant-scoped rows cascade from the two fixture restaurants. Rows with
 * soft references (idempotency receipts, notifications, pending events) are
 * deleted explicitly first, by the run's restaurant/staff/owner/order/table ids.
 * `audit_log`, `security_event` and `rbac_log` have no cascade, so they are
 * deleted by their ownership columns:
 *
 * - `AuditLog`: `restaurantId`, `changedBy`, `staffId`, `ownerId`.
 * - `SecurityEvent`: `restaurantId`, `staffId`, `orderId`, `tableId`.
 * - `RBACLog`: `userId` (staff/owner ids). The suite's anonymous refusal has
 *   `userId = 'anonymous'`, so those exact row ids are captured by the test and
 *   deleted by id; no time window is used.
 *
 * The `permissions` and `role_permissions` rows are the seed's own definitions
 * for the three templates used here, upserted idempotently and left in place.
 */
export async function cleanupIntegrationFixtures(): Promise<void> {
  const restaurants = await prisma.restaurant.findMany({
    where: { slug: { in: [RESTAURANTS.a.slug, RESTAURANTS.b.slug] } },
    select: { id: true, ownerId: true },
  });
  const restaurantIds = restaurants.map((row) => row.id);

  const owners = await prisma.restaurantOwner.findMany({
    where: {
      email: {
        in: [RESTAURANTS.a.ownerEmail, RESTAURANTS.b.ownerEmail],
      },
    },
    select: { id: true },
  });
  const ownerIds = Array.from(
    new Set([
      ...restaurants.map((row) => row.ownerId),
      ...owners.map((row) => row.id),
    ])
  );

  const allRoleNames = (['a', 'b'] as const).flatMap((key) => {
    const names = roleNames(key);
    return [names.cashier, names.manager, names.viewer];
  });

  const staff =
    restaurantIds.length > 0
      ? await prisma.staff.findMany({
          where: { restaurantId: { in: restaurantIds } },
          select: { id: true },
        })
      : [];
  const staffIds = staff.map((row) => row.id);

  const tableIds =
    restaurantIds.length > 0
      ? (
          await prisma.table.findMany({
            where: { restaurantId: { in: restaurantIds } },
            select: { id: true },
          })
        ).map((row) => row.id)
      : [];
  const orderIds =
    restaurantIds.length > 0
      ? (
          await prisma.order.findMany({
            where: { restaurantId: { in: restaurantIds } },
            select: { id: true },
          })
        ).map((row) => row.id)
      : [];

  const auditOr: Prisma.AuditLogWhereInput[] = [];
  if (restaurantIds.length > 0) {
    auditOr.push({ restaurantId: { in: restaurantIds } });
  }
  if (staffIds.length > 0) {
    auditOr.push({ changedBy: { in: staffIds } });
    auditOr.push({ staffId: { in: staffIds } });
  }
  if (ownerIds.length > 0) {
    auditOr.push({ changedBy: { in: ownerIds } });
    auditOr.push({ ownerId: { in: ownerIds } });
  }

  const securityEventOr: Prisma.SecurityEventWhereInput[] = [];
  if (restaurantIds.length > 0) {
    securityEventOr.push({ restaurantId: { in: restaurantIds } });
  }
  if (staffIds.length > 0) {
    securityEventOr.push({ staffId: { in: staffIds } });
  }
  if (orderIds.length > 0) {
    securityEventOr.push({ orderId: { in: orderIds } });
  }
  if (tableIds.length > 0) {
    securityEventOr.push({ tableId: { in: tableIds } });
  }

  const rbacLogOr: Prisma.RBACLogWhereInput[] = [];
  if (staffIds.length > 0) {
    rbacLogOr.push({ userId: { in: staffIds } });
  }
  if (ownerIds.length > 0) {
    rbacLogOr.push({ userId: { in: ownerIds } });
  }
  if (ownedAnonymousRbacLogIds.size > 0) {
    rbacLogOr.push({ id: { in: [...ownedAnonymousRbacLogIds] } });
  }

  try {
    await prisma.$transaction(
      async (tx) => {
        if (restaurantIds.length > 0) {
          await tx.orderMutationIdempotency.deleteMany({
            where: { restaurantId: { in: restaurantIds } },
          });
          await tx.orderActionReceipt.deleteMany({
            where: { restaurantId: { in: restaurantIds } },
          });
          // Restrict references that would block the restaurant cascade:
          // modification items point at menu items, order discounts point at
          // orders. Both are run-owned rows, so delete them explicitly first.
          await tx.orderModificationItem.deleteMany({
            where: {
              modification: { order: { restaurantId: { in: restaurantIds } } },
            },
          });
          await tx.orderDiscount.deleteMany({
            where: { restaurantId: { in: restaurantIds } },
          });
        }
        if (auditOr.length > 0) {
          await tx.auditLog.deleteMany({ where: { OR: auditOr } });
        }
        if (restaurantIds.length > 0) {
          await tx.notification.deleteMany({
            where: { restaurantId: { in: restaurantIds } },
          });
          await tx.pendingEvent.deleteMany({
            where: { restaurantId: { in: restaurantIds } },
          });
        }
        if (securityEventOr.length > 0) {
          await tx.securityEvent.deleteMany({
            where: { OR: securityEventOr },
          });
        }
        if (rbacLogOr.length > 0) {
          await tx.rBACLog.deleteMany({ where: { OR: rbacLogOr } });
        }

        if (restaurantIds.length > 0) {
          // Cascades: staff, orders (+items/events/modifications), payments,
          // tables, menu, stations, user roles/sessions, change rows.
          await tx.restaurant.deleteMany({
            where: { id: { in: restaurantIds } },
          });
        }
        const roleRows = await tx.staffRole.findMany({
          where: { name: { in: allRoleNames } },
          select: { id: true },
        });
        if (roleRows.length > 0) {
          await tx.staffRole.deleteMany({
            where: { id: { in: roleRows.map((row) => row.id) } },
          });
        }
        if (ownerIds.length > 0) {
          await tx.restaurantOwner.deleteMany({
            where: { id: { in: ownerIds } },
          });
        }
      },
      { timeout: 30_000 }
    );
  } finally {
    ownedAnonymousRbacLogIds.clear();
  }
}
