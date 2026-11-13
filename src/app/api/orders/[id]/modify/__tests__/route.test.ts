import { NextRequest } from 'next/server';
import Decimal from 'decimal.js';
import { prisma } from '@/lib/database';
import {
  getTenantContext,
  requireAuth,
  requirePermission,
} from '@/lib/tenant-context';
import { requireOrderAccess } from '@/lib/rbac/resource-auth';
import {
  computeBillPricing,
  type BillActiveDiscount,
  type BillOrderRow,
} from '@/lib/services/loyalty-bill-service';
import { buildLoyaltyPaymentPlan } from '@/lib/services/loyalty-payment-service';
import { PATCH as modifyOrder } from '@/app/api/orders/[id]/modify/route';

jest.mock('@/lib/tenant-context', () => ({
  getTenantContext: jest.fn(),
  requireAuth: jest.fn(),
  requirePermission: jest.fn(),
}));

jest.mock('@/lib/rbac/resource-auth', () => ({
  requireOrderAccess: jest.fn(),
}));

jest.mock('@/lib/modification-utils', () => ({
  canModifyOrder: jest.fn(() => ({ allowed: true })),
}));

jest.mock('@/lib/database', () => ({
  prisma: { $transaction: jest.fn() },
}));

const restaurantId = '550e8400-e29b-41d4-a716-446655440001';
const sessionId = '550e8400-e29b-41d4-a716-446655440003';
const customerId = '550e8400-e29b-41d4-a716-446655440004';
const orderId = '550e8400-e29b-41d4-a716-446655440005';
const itemId = '550e8400-e29b-41d4-a716-446655440010';
const drinkItemId = '550e8400-e29b-41d4-a716-446655440011';
const idempotencyKey = '550e8400-e29b-41d4-a716-446655440099';

const context = {
  userId: 'user-1',
  userType: 'staff',
  roleTemplate: 'manager',
  email: 'manager@example.test',
  restaurantId,
  permissions: {},
  isAdmin: false,
  mustChangePassword: false,
};

const settingsRow = {
  enabled: true,
  visitsRequired: 3,
  rewardType: 'PERCENT' as const,
  rewardValue: '10.00',
  maxDiscount: '15.00',
  minDailySpend: '20.00',
  rewardLabel: '10% off, max RM15',
};

type TestItem = {
  id: string;
  menuItemId: string;
  quantity: number;
  unitPrice: number;
  totalAmount: number;
  menuItem: {
    id: string;
    name: string;
    categoryId: string;
    price: number;
  };
  selectedOptions: unknown[];
};

type TestOrder = {
  id: string;
  orderNumber: string;
  restaurantId: string;
  diningSessionId: string | null;
  customerId: string | null;
  status: string;
  paymentStatus: string;
  version: number;
  orderNumberPrefix?: string;
  taxRateSnapshot: number;
  serviceChargeRateSnapshot: number;
  totalAmount: number;
  items: TestItem[];
};

type TestDiscount = {
  id: string;
  orderId: string;
  restaurantId: string;
  diningSessionId: string | null;
  source: 'PROMOTION' | 'LOYALTY_REWARD';
  sourceId: string;
  label: string;
  baseAmount: string;
  amount: string;
  promotionSnapshot: Record<string, unknown> | null;
  rewardSnapshot: Record<string, unknown> | null;
  status: 'ACTIVE' | 'REPLACED' | 'REMOVED';
  reason?: string;
  /** Order state used by the session aggregate's payable relation filter. */
  orderPaymentStatus?: 'PENDING' | 'PAID';
  orderStatus?: string;
};

type HarnessTx = {
  $queryRaw: jest.Mock;
  order: { findUnique: jest.Mock; update: jest.Mock };
  orderDiscount: {
    findMany: jest.Mock;
    update: jest.Mock;
    updateMany: jest.Mock;
    create: jest.Mock;
  };
  orderModification: { findUnique: jest.Mock; create: jest.Mock };
  [key: string]: unknown;
};

type Harness = {
  tx: HarnessTx;
  state: {
    order: TestOrder;
    discounts: TestDiscount[];
    billRevision: number;
    sessionCustomerId: string | null;
    lockKeys: string[];
    audits: Array<Record<string, unknown>>;
    orderUpdates: Array<Record<string, unknown>>;
    sessionUpdates: Array<Record<string, unknown>>;
  };
};

function baseOrder(overrides: Partial<TestOrder> = {}): TestOrder {
  return {
    id: orderId,
    orderNumber: 'ORD-1',
    restaurantId,
    diningSessionId: sessionId,
    customerId,
    status: 'PENDING',
    paymentStatus: 'PENDING',
    version: 3,
    taxRateSnapshot: 0.06,
    serviceChargeRateSnapshot: 0.1,
    totalAmount: 116,
    items: [
      {
        id: itemId,
        menuItemId: 'item-1',
        quantity: 2,
        unitPrice: 30,
        totalAmount: 60,
        menuItem: {
          id: 'item-1',
          name: 'Pasta',
          categoryId: 'cat-1',
          price: 30,
        },
        selectedOptions: [],
      },
      {
        id: drinkItemId,
        menuItemId: 'item-2',
        quantity: 1,
        unitPrice: 40,
        totalAmount: 40,
        menuItem: {
          id: 'item-2',
          name: 'Drink',
          categoryId: 'cat-2',
          price: 40,
        },
        selectedOptions: [],
      },
    ],
    ...overrides,
  };
}

function promotionRow(
  overrides: Record<string, unknown> = {}
): Record<string, unknown> {
  return {
    id: 'promo-1',
    name: 'Lunch 20%',
    receiptLabel: 'Lunch 20%',
    type: 'PERCENT',
    value: '20.00',
    scope: 'ITEM',
    minSpend: '0.00',
    maxDiscount: '100.00',
    startsAt: new Date('2026-11-01T00:00:00.000Z'),
    endsAt: new Date('2026-12-01T00:00:00.000Z'),
    isActive: true,
    promotionCategories: [],
    promotionItems: [{ itemId: 'item-1' }],
    ...overrides,
  };
}

function activeDiscount(overrides: Partial<TestDiscount> = {}): TestDiscount {
  return {
    id: 'discount-1',
    orderId,
    restaurantId,
    diningSessionId: sessionId,
    source: 'PROMOTION',
    sourceId: 'promo-1',
    label: 'Lunch 20%',
    baseAmount: '60.00',
    amount: '12.00',
    promotionSnapshot: {
      name: 'Lunch 20%',
      scope: 'ITEM',
      receiptLabel: 'Lunch 20%',
      itemIds: ['item-1'],
      categoryIds: [],
    },
    rewardSnapshot: null,
    status: 'ACTIVE',
    orderPaymentStatus: 'PENDING',
    orderStatus: 'PENDING',
    ...overrides,
  };
}

function createHarness(
  options: {
    order?: TestOrder;
    discounts?: TestDiscount[];
    promotions?: Array<Record<string, unknown>>;
    sessionCustomerId?: string | null;
    billRevision?: number;
  } = {}
): Harness {
  const state: Harness['state'] = {
    order: options.order ?? baseOrder(),
    discounts: options.discounts ?? [activeDiscount()],
    billRevision: options.billRevision ?? 3,
    sessionCustomerId:
      options.sessionCustomerId === undefined
        ? customerId
        : options.sessionCustomerId,
    lockKeys: [],
    audits: [],
    orderUpdates: [],
    sessionUpdates: [],
  };

  const tx: HarnessTx = {
    $queryRaw: jest.fn(
      async (_strings: TemplateStringsArray, ...values: unknown[]) => {
        state.lockKeys.push(String(values[0]));
        return [{ lock: '1' }];
      }
    ),
    order: {
      findUnique: jest.fn(async () => state.order),
      update: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        state.orderUpdates.push(data);
        const applied: Record<string, unknown> = { ...data };
        if (
          data.version &&
          typeof data.version === 'object' &&
          'increment' in data.version
        ) {
          applied.version = state.order.version + 1;
          state.order.version += 1;
        }
        if (
          data.modificationCount &&
          typeof data.modificationCount === 'object' &&
          'increment' in data.modificationCount
        ) {
          delete applied.modificationCount;
        }
        if (
          data.discountVersion &&
          typeof data.discountVersion === 'object' &&
          'increment' in data.discountVersion
        ) {
          delete applied.discountVersion;
        }
        Object.assign(state.order, applied);
        return state.order;
      }),
    },
    orderItem: {
      delete: jest.fn(async ({ where }: { where: { id: string } }) => {
        state.order.items = state.order.items.filter(
          (item) => item.id !== where.id
        );
        return {};
      }),
      update: jest.fn(
        async ({
          where,
          data,
        }: {
          where: { id: string };
          data: Record<string, unknown>;
        }) => {
          const item = state.order.items.find((row) => row.id === where.id);
          if (item) Object.assign(item, data);
          return item;
        }
      ),
      findMany: jest.fn(async () => state.order.items),
    },
    orderModification: {
      findUnique: jest.fn(async () => null),
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => ({
        id: 'mod-1',
        ...data,
      })),
    },
    diningSession: {
      findFirst: jest.fn(async () => ({
        id: sessionId,
        customerId: state.sessionCustomerId,
      })),
      update: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        state.sessionUpdates.push(data);
        const increment =
          data.billRevision &&
          typeof data.billRevision === 'object' &&
          'increment' in data.billRevision
            ? Number(data.billRevision.increment)
            : 0;
        state.billRevision += increment;
        return { billRevision: state.billRevision };
      }),
    },
    restaurant: {
      findUnique: jest.fn(async () => ({
        timezone: 'Asia/Kuala_Lumpur',
        businessDayCloseTime: '04:00',
      })),
    },
    loyaltySettings: {
      findUnique: jest.fn(async () => settingsRow),
    },
    promotion: {
      findMany: jest.fn(async () => options.promotions ?? [promotionRow()]),
    },
    orderDiscount: {
      findMany: jest.fn(
        async ({
          where,
        }: {
          where: {
            orderId?: string | { in: string[] };
            diningSessionId?: string;
            status?: string;
            order?: {
              paymentStatus?: string;
              status?: { not?: string };
            };
          };
        }) => {
          const orderFilter = where.orderId;
          return state.discounts.filter((discount) => {
            if (where.status && discount.status !== where.status) return false;
            if (
              where.diningSessionId &&
              discount.diningSessionId !== where.diningSessionId
            ) {
              return false;
            }
            if (
              where.order?.paymentStatus &&
              discount.orderPaymentStatus !== where.order.paymentStatus
            ) {
              return false;
            }
            const excludedStatus = where.order?.status?.not;
            if (excludedStatus && discount.orderStatus === excludedStatus) {
              return false;
            }
            if (typeof orderFilter === 'string') {
              return discount.orderId === orderFilter;
            }
            if (orderFilter && 'in' in orderFilter) {
              return orderFilter.in.includes(discount.orderId);
            }
            return true;
          });
        }
      ),
      update: jest.fn(
        async ({
          where,
          data,
        }: {
          where: { id: string };
          data: Record<string, unknown>;
        }) => {
          const row = state.discounts.find(
            (discount) => discount.id === where.id
          );
          if (row) Object.assign(row, data);
          return row;
        }
      ),
      updateMany: jest.fn(
        async ({
          where,
          data,
        }: {
          where: { id: { in: string[] } };
          data: Record<string, unknown>;
        }) => {
          let count = 0;
          for (const row of state.discounts) {
            if (where.id.in.includes(row.id)) {
              Object.assign(row, data);
              count += 1;
            }
          }
          return { count };
        }
      ),
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const row = {
          id: `discount-${state.discounts.length + 1}`,
          ...data,
        } as TestDiscount;
        state.discounts.push(row);
        return row;
      }),
    },
    auditLog: {
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        state.audits.push(data);
        return {};
      }),
    },
  };

  (prisma.$transaction as jest.Mock).mockImplementation(
    async (callback: (client: typeof tx) => unknown) => callback(tx)
  );

  return { tx, state };
}

function request(body: Record<string, unknown>) {
  return new NextRequest(`http://localhost/api/orders/${orderId}/modify`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function body(
  itemChanges: Array<Record<string, unknown>>,
  overrides: Record<string, unknown> = {}
) {
  return {
    reason: 'customer_request',
    customerNotified: true,
    version: 3,
    idempotencyKey,
    itemChanges,
    ...overrides,
  };
}

function activeDiscountsForBill(
  discounts: TestDiscount[]
): BillActiveDiscount[] {
  return discounts
    .filter((discount) => discount.status === 'ACTIVE')
    .map((discount) => ({
      orderId: discount.orderId,
      source: discount.source,
      sourceId: discount.sourceId,
      label: discount.label,
      baseAmount: discount.baseAmount,
      amount: discount.amount,
      promotionSnapshot:
        discount.promotionSnapshot as BillActiveDiscount['promotionSnapshot'],
    }));
}

function billOrderFromState(order: TestOrder): BillOrderRow {
  return {
    id: order.id,
    subtotalAmount: order.items.reduce(
      (sum, item) => sum.plus(item.totalAmount),
      new Decimal(0)
    ),
    taxRateSnapshot: order.taxRateSnapshot,
    serviceChargeRateSnapshot: order.serviceChargeRateSnapshot,
    paymentStatus: order.paymentStatus,
    status: order.status,
    items: order.items.map((item) => ({
      menuItemId: item.menuItemId,
      totalAmount: item.totalAmount,
      menuItem: {
        name: item.menuItem.name,
        categoryId: item.menuItem.categoryId,
      },
    })),
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  process.env.LOYALTY_ENABLED = 'true';
  (getTenantContext as jest.Mock).mockResolvedValue(context);
  (requireAuth as jest.Mock).mockReturnValue(context);
  (requirePermission as jest.Mock).mockReturnValue(undefined);
  (requireOrderAccess as jest.Mock).mockResolvedValue(undefined);
});

afterAll(() => {
  delete process.env.LOYALTY_ENABLED;
});

describe('PATCH /api/orders/[id]/modify — promotion re-evaluation (P5C)', () => {
  it('removes the ACTIVE promotion when the promoted item is removed, recomputes totals, bumps the revision and unblocks the visit', async () => {
    const harness = createHarness();
    const response = await modifyOrder(
      request(body([{ itemId, action: 'remove' }])),
      { params: Promise.resolve({ id: orderId }) }
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.success).toBe(true);

    // The ledger row is history, not ACTIVE: the bill read no longer prices it.
    expect(harness.state.discounts).toHaveLength(1);
    expect(harness.state.discounts[0].status).toBe('REMOVED');

    // Totals are recomputed from the remaining line with no discount.
    const update = harness.state.orderUpdates[0];
    expect(new Decimal(update.subtotalAmount as string).toFixed(2)).toBe(
      '40.00'
    );
    expect(new Decimal(update.taxAmount as string).toFixed(2)).toBe('2.40');
    expect(new Decimal(update.serviceCharge as string).toFixed(2)).toBe('4.00');
    expect(new Decimal(update.totalAmount as string).toFixed(2)).toBe('46.40');
    expect(new Decimal(update.discountAmount as string).toFixed(2)).toBe(
      '0.00'
    );
    expect(update.discountSource).toBeNull();
    expect(update.discountVersion).toEqual({ increment: 1 });

    // The bill revision moved, so a stale expectedBillRevision is detectable.
    expect(harness.state.billRevision).toBe(4);
    expect(harness.state.audits).toHaveLength(1);
    expect(harness.state.audits[0]).toMatchObject({
      tableName: 'orders',
      recordId: orderId,
      category: 'orders',
    });

    // The visit is no longer blocked by a promotion.
    const projection = computeBillPricing({
      billRevision: harness.state.billRevision,
      orders: [billOrderFromState(harness.state.order)],
      promotions: [],
      activeDiscounts: activeDiscountsForBill(harness.state.discounts),
      settings: settingsRow,
      card: null,
      customer: {
        id: customerId,
        name: 'Aina',
        phone: '+60123456789',
      },
      alreadyCounted: false,
      daySubtotal: '100.00',
      cashRounding: 'NONE',
      now: new Date('2026-11-13T10:00:00.000Z'),
    });
    expect(projection.projection.promotionApplied).toBe(false);
    expect(projection.projection.visitState).toBe('COUNTS');
  });

  it('updates the ACTIVE row when the order still qualifies after a quantity change', async () => {
    const harness = createHarness();

    const response = await modifyOrder(
      request(body([{ itemId, action: 'update_quantity', newQuantity: 1 }])),
      { params: Promise.resolve({ id: orderId }) }
    );

    expect(response.status).toBe(200);
    expect(harness.state.discounts).toHaveLength(1);
    expect(harness.state.discounts[0]).toMatchObject({
      status: 'ACTIVE',
      source: 'PROMOTION',
      sourceId: 'promo-1',
    });
    expect(new Decimal(harness.state.discounts[0].baseAmount).toFixed(2)).toBe(
      '30.00'
    );
    expect(new Decimal(harness.state.discounts[0].amount).toFixed(2)).toBe(
      '6.00'
    );

    const update = harness.state.orderUpdates[0];
    expect(new Decimal(update.subtotalAmount as string).toFixed(2)).toBe(
      '70.00'
    );
    expect(new Decimal(update.discountAmount as string).toFixed(2)).toBe(
      '6.00'
    );
    expect(new Decimal(update.taxAmount as string).toFixed(2)).toBe('3.84');
    expect(new Decimal(update.serviceCharge as string).toFixed(2)).toBe('6.40');
    expect(new Decimal(update.totalAmount as string).toFixed(2)).toBe('74.24');
    expect(update.discountSource).toBe('PROMOTION');
    expect(harness.state.billRevision).toBe(4);
  });

  it('removes the discount when the order drops below minSpend', async () => {
    const singleItemOrder = baseOrder();
    singleItemOrder.items = [singleItemOrder.items[0]];
    const harness = createHarness({
      order: singleItemOrder,
      promotions: [
        promotionRow({
          scope: 'ORDER',
          minSpend: '50.00',
          promotionItems: [],
        }),
      ],
    });

    const response = await modifyOrder(
      request(body([{ itemId, action: 'update_quantity', newQuantity: 1 }])),
      { params: Promise.resolve({ id: orderId }) }
    );

    expect(response.status).toBe(200);
    expect(harness.state.discounts[0].status).toBe('REMOVED');
    const update = harness.state.orderUpdates[0];
    expect(new Decimal(update.subtotalAmount as string).toFixed(2)).toBe(
      '30.00'
    );
    expect(new Decimal(update.discountAmount as string).toFixed(2)).toBe(
      '0.00'
    );
  });

  it('keeps the visit blocked when another order in the bill still carries a promotion', async () => {
    const otherOrderId = '550e8400-e29b-41d4-a716-446655440006';
    const harness = createHarness({
      discounts: [
        activeDiscount(),
        activeDiscount({
          id: 'discount-2',
          orderId: otherOrderId,
          label: 'Drink 20%',
          sourceId: 'promo-2',
          promotionSnapshot: {
            name: 'Drink 20%',
            scope: 'ITEM',
            receiptLabel: 'Drink 20%',
            itemIds: ['item-2'],
            categoryIds: [],
          },
        }),
      ],
    });

    const response = await modifyOrder(
      request(body([{ itemId, action: 'remove' }])),
      { params: Promise.resolve({ id: orderId }) }
    );

    expect(response.status).toBe(200);
    const modified = harness.state.discounts.find(
      (discount) => discount.orderId === orderId
    );
    const other = harness.state.discounts.find(
      (discount) => discount.orderId === otherOrderId
    );
    expect(modified?.status).toBe('REMOVED');
    expect(other?.status).toBe('ACTIVE');

    const otherOrder = baseOrder({
      id: otherOrderId,
      items: [
        {
          id: 'other-item',
          menuItemId: 'item-2',
          quantity: 1,
          unitPrice: 40,
          totalAmount: 40,
          menuItem: {
            id: 'item-2',
            name: 'Drink',
            categoryId: 'cat-2',
            price: 40,
          },
          selectedOptions: [],
        },
      ],
    });
    const projection = computeBillPricing({
      billRevision: harness.state.billRevision,
      orders: [
        billOrderFromState(harness.state.order),
        billOrderFromState(otherOrder),
      ],
      promotions: [],
      activeDiscounts: activeDiscountsForBill(harness.state.discounts),
      settings: settingsRow,
      card: null,
      customer: {
        id: customerId,
        name: 'Aina',
        phone: '+60123456789',
      },
      alreadyCounted: false,
      daySubtotal: '100.00',
      cashRounding: 'NONE',
      now: new Date('2026-11-13T10:00:00.000Z'),
    });
    expect(projection.projection.promotionApplied).toBe(true);
    expect(projection.projection.visitState).toBe('PROMOTION');
  });

  it('does not re-evaluate a paid order', async () => {
    const harness = createHarness({
      order: baseOrder({ paymentStatus: 'PAID' }),
    });

    const response = await modifyOrder(
      request(body([{ itemId, action: 'remove' }])),
      { params: Promise.resolve({ id: orderId }) }
    );

    expect(response.status).toBe(500);
    expect(harness.tx.$queryRaw).not.toHaveBeenCalled();
    expect(harness.tx.orderDiscount.findMany).not.toHaveBeenCalled();
    expect(harness.tx.orderDiscount.updateMany).not.toHaveBeenCalled();
    expect(harness.tx.order.update).not.toHaveBeenCalled();
    expect(harness.state.billRevision).toBe(3);
  });

  it('serialises modify with payment: modify bumps the revision, so the stale payment gets BILL_CHANGED', async () => {
    const harness = createHarness();
    const response = await modifyOrder(
      request(body([{ itemId, action: 'remove' }])),
      { params: Promise.resolve({ id: orderId }) }
    );

    expect(response.status).toBe(200);
    expect(harness.state.billRevision).toBe(4);

    // The same lock key as the bill read and payment, taken after the
    // customer/day lock.
    expect(harness.state.lockKeys).toHaveLength(2);
    expect(harness.state.lockKeys[0]).toContain(
      `loyalty-day:${restaurantId}:${customerId}:`
    );
    expect(harness.state.lockKeys[1]).toBe(
      `loyalty-bill:${restaurantId}:${sessionId}`
    );

    // A payment that read revision 3 must not settle against revision 4.
    const pricing = computeBillPricing({
      billRevision: harness.state.billRevision,
      orders: [billOrderFromState(harness.state.order)],
      promotions: [],
      activeDiscounts: activeDiscountsForBill(harness.state.discounts),
      settings: settingsRow,
      card: null,
      customer: { id: customerId, name: 'Aina', phone: '+60123456789' },
      alreadyCounted: false,
      daySubtotal: '100.00',
      cashRounding: 'NONE',
      now: new Date('2026-11-13T10:00:00.000Z'),
    });

    let error: unknown = null;
    try {
      buildLoyaltyPaymentPlan({
        pricing,
        context: {
          settings: settingsRow,
          restaurant: {
            cashRounding: 'NONE',
            timezone: 'Asia/Kuala_Lumpur',
            businessDayCloseTime: '04:00',
          },
          customer: {
            id: customerId,
            name: 'Aina',
            phone: '+60123456789',
            phoneHash: 'hash-1',
          },
          card: null,
          businessDate: new Date('2026-11-13T00:00:00.000Z'),
          alreadyCounted: false,
        },
        method: 'card',
        expectedTotal: pricing.projection.projectedTotal,
        expectedBillRevision: 3,
        billRevision: harness.state.billRevision,
        now: new Date('2026-11-13T10:00:00.000Z'),
      });
    } catch (caught) {
      error = caught;
    }

    expect(error).toMatchObject({ code: 'BILL_CHANGED' });
  });

  it('removes a stale ACTIVE LOYALTY_REWARD row when no promotion applies (F-2)', async () => {
    const harness = createHarness({
      discounts: [
        activeDiscount({
          id: 'reward-1',
          source: 'LOYALTY_REWARD',
          sourceId: 'visit-1',
          label: '10% off, max RM15',
          promotionSnapshot: null,
          rewardSnapshot: { rewardLabel: '10% off, max RM15' },
          amount: '6.00',
        }),
      ],
    });

    const response = await modifyOrder(
      request(body([{ itemId, action: 'remove' }])),
      { params: Promise.resolve({ id: orderId }) }
    );

    expect(response.status).toBe(200);
    expect(harness.state.discounts).toHaveLength(1);
    expect(harness.state.discounts[0].status).toBe('REMOVED');

    const update = harness.state.orderUpdates[0];
    expect(new Decimal(update.discountAmount as string).toFixed(2)).toBe(
      '0.00'
    );
    expect(update.discountSource).toBeNull();
    expect(update.discountLabel).toBeNull();
  });

  it('refreshes the cached DiningSession discount summary in the same transaction (F-3)', async () => {
    const otherOrderId = '550e8400-e29b-41d4-a716-446655440006';
    const harness = createHarness({
      discounts: [
        activeDiscount(),
        activeDiscount({
          id: 'discount-2',
          orderId: otherOrderId,
          sourceId: 'promo-2',
          label: 'Drink 20%',
          promotionSnapshot: {
            name: 'Drink 20%',
            scope: 'ITEM',
            receiptLabel: 'Drink 20%',
            itemIds: ['item-2'],
            categoryIds: [],
          },
        }),
      ],
    });

    const response = await modifyOrder(
      request(body([{ itemId, action: 'update_quantity', newQuantity: 1 }])),
      { params: Promise.resolve({ id: orderId }) }
    );

    expect(response.status).toBe(200);
    expect(harness.state.sessionUpdates).toHaveLength(1);
    const sessionUpdate = harness.state.sessionUpdates[0];
    expect(sessionUpdate.billRevision).toEqual({ increment: 1 });
    // This order's row moved to 6.00; the other order keeps 12.00.
    expect(new Decimal(sessionUpdate.discountAmount as string).toFixed(2)).toBe(
      '18.00'
    );
    expect(sessionUpdate.discountSource).toBe('PROMOTION');
    expect(sessionUpdate.discountLabel).toBe('Promotions');
  });

  it('sums only payable orders in the session summary (R-01)', async () => {
    const paidOrderId = '550e8400-e29b-41d4-a716-446655440006';
    const harness = createHarness({
      discounts: [
        activeDiscount(),
        activeDiscount({
          id: 'reward-1',
          orderId: paidOrderId,
          source: 'LOYALTY_REWARD',
          sourceId: 'visit-1',
          label: '10% off, max RM15',
          baseAmount: '80.00',
          amount: '8.00',
          promotionSnapshot: null,
          rewardSnapshot: { rewardLabel: '10% off, max RM15' },
          orderPaymentStatus: 'PAID',
          orderStatus: 'CONFIRMED',
        }),
      ],
    });

    const response = await modifyOrder(
      request(body([{ itemId, action: 'update_quantity', newQuantity: 1 }])),
      { params: Promise.resolve({ id: orderId }) }
    );

    expect(response.status).toBe(200);
    expect(harness.state.sessionUpdates).toHaveLength(1);
    const sessionUpdate = harness.state.sessionUpdates[0];

    // Only the pending order's 6.00. The paid order's 8.00 reward is outside
    // the payable set, matching the payment writer.
    expect(new Decimal(sessionUpdate.discountAmount as string).toFixed(2)).toBe(
      '6.00'
    );
    expect(sessionUpdate.discountSource).toBe('PROMOTION');
    expect(sessionUpdate.discountLabel).toBe('Lunch 20%');
  });

  it('replays a concurrent duplicate under the lock instead of failing the version guard (F-5)', async () => {
    const harness = createHarness();
    const existingModification = {
      id: 'mod-1',
      orderId,
      idempotencyKey,
      items: [],
    };
    (harness.tx.orderModification.findUnique as jest.Mock)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(existingModification);

    const response = await modifyOrder(
      request(body([{ itemId, action: 'remove' }])),
      { params: Promise.resolve({ id: orderId }) }
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.isDuplicate).toBe(true);
    expect(json.modification).toMatchObject({ id: 'mod-1' });

    // The second idempotency check happens after both locks are held, and the
    // duplicate never writes or fails the stale-version guard.
    expect(harness.tx.$queryRaw).toHaveBeenCalledTimes(2);
    const secondCheck = (harness.tx.orderModification.findUnique as jest.Mock)
      .mock.invocationCallOrder[1];
    expect(secondCheck).toBeGreaterThan(
      (harness.tx.$queryRaw as jest.Mock).mock.invocationCallOrder[1]
    );
    expect(harness.tx.order.update).not.toHaveBeenCalled();
    expect(harness.tx.orderDiscount.updateMany).not.toHaveBeenCalled();
    expect(harness.state.sessionUpdates).toHaveLength(0);
  });
});
