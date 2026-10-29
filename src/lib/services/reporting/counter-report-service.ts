import { OrderPaymentStatus, OrderStatus, Prisma } from '@prisma/client';
import { prisma } from '@/lib/database';
import {
  addBusinessDays,
  BusinessDate,
  BusinessDayClock,
  formatBusinessDate,
  getBusinessDate,
  getBusinessDayStart,
  parseBusinessDateFromDb,
  toDbBusinessDate,
} from '@/lib/time/business-day';

export class CounterReportError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode = 400,
    public readonly details?: unknown
  ) {
    super(message);
  }
}

export interface CounterPaymentMethodTotal {
  method: string;
  amount: string;
  count: number;
}

export interface CounterSaleRow {
  id: string;
  createdAt: string;
  orderId: string;
  orderNumber: string;
  orderType: string;
  tableNumber: string | null;
  tableName: string | null;
  pickupNumber: string | null;
  paymentMethod: string;
  amount: string;
  status: string;
  receiptNumber: string | null;
}

export interface CounterTopItem {
  menuItemId: string;
  name: string;
  quantity: number;
}

export interface CounterDaySummary {
  businessDate: BusinessDate;
  status: 'OPEN' | 'CLOSING' | 'CLOSED';
  timezone: string;
  currency: string;
  asOf: string;
  openedAt: string;
  closedAt: string | null;
  netSales: string;
  grossSales: string;
  tax: string;
  serviceCharge: string;
  discounts: string;
  orderCount: number;
  averageCheck: string;
  paymentMethods: CounterPaymentMethodTotal[];
  cashExpected: string;
  cashCounted: string | null;
  cashVariance: string | null;
  openingFloat: string;
  unpaidCount: number;
  unpaidTotal: string;
  blockers: CounterBlocker[];
  topItems: CounterTopItem[];
}

export interface CounterBlocker {
  type: string;
  count: number;
  label: string;
  amount?: string;
}

export type CounterDayOrderScope =
  | 'all'
  | 'history'
  | 'completed'
  | 'open'
  | 'unpaid'
  | 'cancelled';

export interface CounterDayOrderOption {
  id: string;
  name: string;
  priceModifier: string;
}

export interface CounterDayOrderItem {
  id: string;
  name: string;
  quantity: number;
  unitPrice: string;
  totalAmount: string;
  specialInstructions: string | null;
  options: CounterDayOrderOption[];
}

export interface CounterDayOrderPayment {
  id: string;
  method: string;
  amount: string;
  status: string;
  receiptNumber: string | null;
  cashReceived: string | null;
  changeGiven: string | null;
  createdAt: string;
}

export interface CounterDayOrder {
  id: string;
  orderNumber: string;
  orderType: string;
  tableId: string | null;
  tableNumber: string | null;
  tableName: string | null;
  pickupNumber: string | null;
  status: string;
  paymentStatus: string;
  source: string;
  createdAt: string;
  servedAt: string | null;
  totalAmount: string;
  subtotalAmount: string;
  taxAmount: string;
  serviceCharge: string;
  discountAmount: string;
  itemCount: number;
  items: CounterDayOrderItem[];
  payments: CounterDayOrderPayment[];
  cancellationReason: string | null;
  cancellationNotes: string | null;
}

export interface CounterDayOrderTotals {
  orderCount: number;
  paidCount: number;
  unpaidCount: number;
  openCount: number;
  cancelledCount: number;
  gross: string;
  paid: string;
  unpaid: string;
  openTotal: string;
  subtotal: string;
  tax: string;
  serviceCharge: string;
  discounts: string;
}

export interface CounterDayOrdersPage {
  businessDate: BusinessDate;
  businessDayId: string;
  timezone: string;
  currency: string;
  asOf: string;
  orders: CounterDayOrder[];
  totals: CounterDayOrderTotals;
  total: number;
  offset: number;
  limit: number;
  hasMore: boolean;
}

export interface CounterBlockerOrdersPage {
  type: string;
  label: string;
  count: number;
  orders: CounterDayOrder[];
  total: number;
  offset: number;
  limit: number;
  hasMore: boolean;
}

export interface CounterCloseResult {
  businessDayId: string;
  businessDate: BusinessDate;
  zNumber: string;
  closedAt: string;
  closeNote: string | null;
  summary: CounterDaySummary;
  nextBusinessDate: BusinessDate;
}

function money(
  value: number | string | { toString(): string } | null | undefined
): string {
  return Number(value ?? 0).toFixed(2);
}

export function assertVarianceReason(
  variance: number,
  note?: string | null
): void {
  if (Math.abs(variance) >= 0.005 && !note?.trim()) {
    throw new CounterReportError(
      'A reason is required when counted cash does not match expected cash',
      'VARIANCE_REASON_REQUIRED',
      400
    );
  }
}

async function getRestaurantClock(restaurantId: string): Promise<{
  clock: BusinessDayClock;
  currency: string;
  openingFloat: number;
  cashDrawerEnabled: boolean;
}> {
  const restaurant = await prisma.restaurant.findUnique({
    where: { id: restaurantId },
    select: {
      timezone: true,
      businessDayCloseTime: true,
      currency: true,
      openingFloatDefault: true,
      cashDrawerEnabled: true,
    },
  });
  if (!restaurant) {
    throw new CounterReportError('Restaurant not found', 'NOT_FOUND', 404);
  }
  return {
    clock: {
      timezone: restaurant.timezone || 'Asia/Kuala_Lumpur',
      closeTime: restaurant.businessDayCloseTime || '04:00',
    },
    currency: restaurant.currency || 'MYR',
    openingFloat: Number(restaurant.openingFloatDefault || 0),
    cashDrawerEnabled: Boolean(restaurant.cashDrawerEnabled),
  };
}

export async function getOpenBusinessDay(restaurantId: string) {
  const existing = await prisma.businessDay.findFirst({
    where: { restaurantId, status: { in: ['OPEN', 'CLOSING'] } },
    orderBy: { businessDate: 'asc' },
  });
  if (existing) return existing;

  const { clock, openingFloat } = await getRestaurantClock(restaurantId);
  const now = new Date();
  const currentDate = getBusinessDate(now, clock);
  const latestClosed = await prisma.businessDay.findFirst({
    where: { restaurantId, status: 'CLOSED' },
    orderBy: { businessDate: 'desc' },
  });

  const latestClosedDate = latestClosed
    ? parseBusinessDateFromDb(latestClosed.businessDate)
    : null;
  const businessDate =
    latestClosedDate && currentDate <= latestClosedDate
      ? addBusinessDays(latestClosedDate, 1)
      : currentDate;

  const openedAt =
    latestClosedDate && currentDate <= latestClosedDate
      ? (latestClosed?.closedAt ?? now)
      : getBusinessDayStart(currentDate, clock);

  try {
    return await prisma.businessDay.create({
      data: {
        restaurantId,
        businessDate: toDbBusinessDate(businessDate),
        status: 'OPEN',
        openedAt,
        openingFloat,
      },
    });
  } catch (error) {
    // Unique race: another request created the day first.
    const raced = await prisma.businessDay.findFirst({
      where: { restaurantId, status: { in: ['OPEN', 'CLOSING'] } },
      orderBy: { businessDate: 'asc' },
    });
    if (raced) return raced;
    throw error;
  }
}

async function getDayPayments(restaurantId: string, start: Date, end: Date) {
  return prisma.payment.findMany({
    where: {
      order: { restaurantId },
      status: 'PAID' as const,
      createdAt: { gte: start, lte: end },
    },
    select: {
      id: true,
      orderId: true,
      paymentMethod: true,
      amount: true,
      status: true,
      receiptNumber: true,
      createdAt: true,
      order: {
        select: {
          orderNumber: true,
          orderType: true,
          dailySeq: true,
          table: { select: { tableNumber: true, tableName: true } },
        },
      },
    },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
  });
}

const ACTIVE_ORDER_STATUSES: OrderStatus[] = [
  'PENDING',
  'CONFIRMED',
  'PREPARING',
  'READY',
];
const HISTORY_ORDER_STATUSES: OrderStatus[] = ['SERVED', 'CANCELLED'];

const COUNTER_DAY_ORDER_SELECT = {
  id: true,
  orderNumber: true,
  orderType: true,
  tableId: true,
  dailySeq: true,
  status: true,
  paymentStatus: true,
  source: true,
  createdAt: true,
  servedAt: true,
  totalAmount: true,
  subtotalAmount: true,
  taxAmount: true,
  serviceCharge: true,
  discountAmount: true,
  table: { select: { tableNumber: true, tableName: true } },
  items: {
    select: {
      id: true,
      quantity: true,
      unitPrice: true,
      totalAmount: true,
      specialInstructions: true,
      menuItem: { select: { name: true } },
      selectedOptions: {
        select: { id: true, name: true, priceModifier: true },
      },
    },
    orderBy: { createdAt: 'asc' as const },
  },
  payments: {
    select: {
      id: true,
      paymentMethod: true,
      amount: true,
      status: true,
      receiptNumber: true,
      cashReceived: true,
      changeGiven: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'asc' as const },
  },
  modifications: {
    select: { reason: true, reasonNotes: true, modifiedAt: true },
    orderBy: { modifiedAt: 'desc' as const },
    take: 1,
  },
} satisfies Prisma.OrderSelect;

type CounterDayOrderRecord = Prisma.OrderGetPayload<{
  select: typeof COUNTER_DAY_ORDER_SELECT;
}>;

type DayWindow = {
  businessDay: Awaited<ReturnType<typeof getOpenBusinessDay>>;
  businessDate: BusinessDate;
  start: Date;
  end: Date;
  timezone: string;
  currency: string;
};

async function getBusinessDayWindow(
  restaurantId: string,
  businessDayId?: string,
  businessDate?: BusinessDate
): Promise<DayWindow> {
  const { clock, currency } = await getRestaurantClock(restaurantId);
  let businessDay;
  if (businessDayId) {
    businessDay = await prisma.businessDay.findFirst({
      where: { id: businessDayId, restaurantId },
    });
  } else if (businessDate) {
    businessDay = await prisma.businessDay.findFirst({
      where: {
        restaurantId,
        businessDate: toDbBusinessDate(businessDate),
      },
    });
  } else {
    businessDay = await getOpenBusinessDay(restaurantId);
  }
  if (!businessDay) {
    if (!businessDate) {
      throw new CounterReportError(
        'No open business day',
        'NO_BUSINESS_DAY',
        404
      );
    }
    return {
      businessDay: {
        id: '',
        restaurantId,
        businessDate: toDbBusinessDate(businessDate),
        status: 'OPEN',
        openedAt: getBusinessDayStart(businessDate, clock),
        closeStartedAt: null,
        closedAt: null,
        closedBy: null,
        closedByName: null,
        closeNote: null,
        openingFloat: new Prisma.Decimal(0),
        countedCash: null,
        expectedCash: null,
        variance: null,
        zNumber: null,
        closeIdempotencyKey: null,
        snapshot: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      businessDate,
      start: getBusinessDayStart(businessDate, clock),
      end: new Date(),
      timezone: clock.timezone,
      currency,
    };
  }
  return {
    businessDay,
    businessDate: parseBusinessDateFromDb(businessDay.businessDate),
    start: businessDay.openedAt,
    end: businessDay.closedAt ?? new Date(),
    timezone: clock.timezone,
    currency,
  };
}

function dayOrderScopeWhere(
  scope: CounterDayOrderScope,
  paymentStatus?: string
): Prisma.OrderWhereInput {
  const where: Prisma.OrderWhereInput = {};
  if (scope === 'unpaid') {
    where.status = 'SERVED';
    where.paymentStatus = 'PENDING';
    return where;
  }
  if (scope === 'completed') where.status = 'SERVED';
  if (scope === 'cancelled') where.status = 'CANCELLED';
  if (scope === 'open') where.status = { in: ACTIVE_ORDER_STATUSES };
  if (scope === 'history') where.status = { in: HISTORY_ORDER_STATUSES };
  if (
    paymentStatus === 'PAID' ||
    paymentStatus === 'PENDING' ||
    paymentStatus === 'REFUNDED' ||
    paymentStatus === 'FAILED'
  ) {
    where.paymentStatus = paymentStatus as OrderPaymentStatus;
  }
  return where;
}

function addDayOrderSearch(
  where: Prisma.OrderWhereInput,
  query?: string
): Prisma.OrderWhereInput {
  const q = query?.trim();
  if (!q) return where;
  return {
    ...where,
    OR: [
      { orderNumber: { contains: q, mode: 'insensitive' } },
      { customerName: { contains: q, mode: 'insensitive' } },
      { customerPhone: { contains: q, mode: 'insensitive' } },
      {
        table: {
          is: {
            OR: [
              { tableNumber: { contains: q, mode: 'insensitive' } },
              { tableName: { contains: q, mode: 'insensitive' } },
            ],
          },
        },
      },
    ],
  };
}

function mapCounterDayOrder(order: CounterDayOrderRecord): CounterDayOrder {
  return {
    id: order.id,
    orderNumber: order.orderNumber,
    orderType: order.orderType,
    tableId: order.tableId ?? null,
    tableNumber: order.table?.tableNumber ?? null,
    tableName: order.table?.tableName ?? null,
    pickupNumber:
      order.orderType === 'TAKEAWAY' && order.dailySeq
        ? `#${String(order.dailySeq).padStart(3, '0')}`
        : null,
    status: order.status,
    paymentStatus: order.paymentStatus,
    source: order.source,
    createdAt: order.createdAt.toISOString(),
    servedAt: order.servedAt?.toISOString() ?? null,
    totalAmount: money(order.totalAmount),
    subtotalAmount: money(order.subtotalAmount),
    taxAmount: money(order.taxAmount),
    serviceCharge: money(order.serviceCharge),
    discountAmount: money(order.discountAmount),
    itemCount: order.items.reduce((sum, item) => sum + item.quantity, 0),
    items: order.items.map((item) => ({
      id: item.id,
      name: item.menuItem.name,
      quantity: item.quantity,
      unitPrice: money(item.unitPrice),
      totalAmount: money(item.totalAmount),
      specialInstructions: item.specialInstructions,
      options: item.selectedOptions.map((option) => ({
        id: option.id,
        name: option.name,
        priceModifier: money(option.priceModifier),
      })),
    })),
    payments: order.payments.map((payment) => ({
      id: payment.id,
      method: payment.paymentMethod,
      amount: money(payment.amount),
      status: payment.status,
      receiptNumber: payment.receiptNumber,
      cashReceived: payment.cashReceived ? money(payment.cashReceived) : null,
      changeGiven: payment.changeGiven ? money(payment.changeGiven) : null,
      createdAt: payment.createdAt.toISOString(),
    })),
    cancellationReason:
      order.status === 'CANCELLED'
        ? (order.modifications[0]?.reason ?? null)
        : null,
    cancellationNotes:
      order.status === 'CANCELLED'
        ? (order.modifications[0]?.reasonNotes ?? null)
        : null,
  };
}

async function getDayOrderTotals(
  where: Prisma.OrderWhereInput
): Promise<CounterDayOrderTotals> {
  const [statusRows, paidCount, paidAgg, unpaidAgg] = await Promise.all([
    prisma.order.groupBy({
      by: ['status'],
      where,
      _count: { _all: true },
      _sum: {
        totalAmount: true,
        subtotalAmount: true,
        taxAmount: true,
        serviceCharge: true,
        discountAmount: true,
      },
    }),
    prisma.order.count({ where: { ...where, paymentStatus: 'PAID' } }),
    prisma.payment.aggregate({
      where: { order: where, status: 'PAID' },
      _sum: { amount: true },
    }),
    prisma.order.aggregate({
      where: { ...where, status: 'SERVED', paymentStatus: 'PENDING' },
      _sum: { totalAmount: true },
      _count: { _all: true },
    }),
  ]);
  const counts = new Map(
    statusRows.map((row) => [row.status, row._count._all])
  );
  const sum = (value: Prisma.Decimal | null) => Number(value ?? 0);
  const nonCancelled = statusRows.filter((row) => row.status !== 'CANCELLED');
  const sumField = (
    field:
      | 'totalAmount'
      | 'subtotalAmount'
      | 'taxAmount'
      | 'serviceCharge'
      | 'discountAmount'
  ) =>
    nonCancelled.reduce(
      (total, row) => total + sum(row._sum?.[field] ?? null),
      0
    );
  const openTotal = statusRows
    .filter((row) => ACTIVE_ORDER_STATUSES.includes(row.status))
    .reduce((total, row) => total + sum(row._sum?.totalAmount ?? null), 0);
  return {
    orderCount: statusRows.reduce((total, row) => total + row._count._all, 0),
    paidCount,
    unpaidCount: unpaidAgg._count._all,
    openCount: ACTIVE_ORDER_STATUSES.reduce(
      (total, status) => total + (counts.get(status) ?? 0),
      0
    ),
    cancelledCount: counts.get('CANCELLED') ?? 0,
    gross: money(sumField('totalAmount')),
    paid: money(sum(paidAgg._sum.amount)),
    unpaid: money(sum(unpaidAgg._sum.totalAmount)),
    openTotal: money(openTotal),
    subtotal: money(sumField('subtotalAmount')),
    tax: money(sumField('taxAmount')),
    serviceCharge: money(sumField('serviceCharge')),
    discounts: money(sumField('discountAmount')),
  };
}

export async function getCounterDayOrders(
  restaurantId: string,
  options: {
    businessDayId?: string;
    businessDate?: BusinessDate;
    scope?: CounterDayOrderScope;
    paymentStatus?: string;
    q?: string;
    offset?: number;
    limit?: number;
  } = {}
): Promise<CounterDayOrdersPage> {
  const window = await getBusinessDayWindow(
    restaurantId,
    options.businessDayId,
    options.businessDate
  );
  const scope = options.scope ?? 'all';
  const offset = Math.max(options.offset ?? 0, 0);
  const limit =
    options.limit === undefined
      ? undefined
      : Math.min(Math.max(options.limit, 1), 200);
  const where = addDayOrderSearch(
    {
      ...dayOrderScopeWhere(scope, options.paymentStatus),
      restaurantId,
      createdAt: { gte: window.start, lte: window.end },
    },
    options.q
  );
  const [orders, total, totals] = await Promise.all([
    prisma.order.findMany({
      where,
      select: COUNTER_DAY_ORDER_SELECT,
      orderBy: { createdAt: 'asc' },
      skip: offset,
      ...(limit === undefined ? {} : { take: limit }),
    }),
    prisma.order.count({ where }),
    getDayOrderTotals(where),
  ]);
  const pageLimit = limit ?? total;
  return {
    businessDate: window.businessDate,
    businessDayId: window.businessDay.id,
    timezone: window.timezone,
    currency: window.currency,
    asOf: new Date().toISOString(),
    orders: orders.map(mapCounterDayOrder),
    totals,
    total,
    offset,
    limit: pageLimit,
    hasMore: offset + orders.length < total,
  };
}

const BLOCKER_LABELS: Record<string, string> = {
  OPEN_ORDERS: 'Orders still in service',
  UNPAID_ORDERS: 'Served orders still unpaid',
  PENDING_PAYMENTS: 'Payments with uncertain status',
};

export async function getCounterBlockerOrders(
  restaurantId: string,
  type: string,
  options: { offset?: number; limit?: number } = {}
): Promise<CounterBlockerOrdersPage> {
  if (!BLOCKER_LABELS[type]) {
    throw new CounterReportError(
      'Unknown blocker type',
      'UNKNOWN_BLOCKER',
      400
    );
  }
  const offset = Math.max(options.offset ?? 0, 0);
  const limit = Math.min(Math.max(options.limit ?? 50, 1), 200);
  const where: Prisma.OrderWhereInput =
    type === 'OPEN_ORDERS'
      ? { restaurantId, status: { in: ACTIVE_ORDER_STATUSES } }
      : type === 'UNPAID_ORDERS'
        ? { restaurantId, status: 'SERVED', paymentStatus: 'PENDING' }
        : {
            restaurantId,
            status: { not: 'CANCELLED' },
            payments: { some: { status: 'PENDING' } },
          };
  const [orders, total] = await Promise.all([
    prisma.order.findMany({
      where,
      select: COUNTER_DAY_ORDER_SELECT,
      orderBy: { createdAt: 'asc' },
      skip: offset,
      take: limit,
    }),
    prisma.order.count({ where }),
  ]);
  return {
    type,
    label: BLOCKER_LABELS[type],
    count: total,
    orders: orders.map(mapCounterDayOrder),
    total,
    offset,
    limit,
    hasMore: offset + orders.length < total,
  };
}

function emptyMethodTotals(): Map<string, { amount: number; count: number }> {
  return new Map([
    ['cash', { amount: 0, count: 0 }],
    ['card', { amount: 0, count: 0 }],
    ['ewallet', { amount: 0, count: 0 }],
  ]);
}

export async function getCounterDaySummary(
  restaurantId: string,
  businessDayId?: string
): Promise<CounterDaySummary> {
  const { clock, currency } = await getRestaurantClock(restaurantId);
  const businessDay = businessDayId
    ? await prisma.businessDay.findFirst({
        where: { id: businessDayId, restaurantId },
      })
    : await getOpenBusinessDay(restaurantId);
  if (!businessDay) {
    throw new CounterReportError(
      'No open business day',
      'NO_BUSINESS_DAY',
      404
    );
  }

  const businessDate = parseBusinessDateFromDb(businessDay.businessDate);
  const start = businessDay.openedAt;
  const end = businessDay.closedAt ?? new Date();
  const payments = await getDayPayments(restaurantId, start, end);
  const orderIds = Array.from(
    new Set(payments.map((payment) => payment.orderId))
  );
  const orders = orderIds.length
    ? await prisma.order.findMany({
        where: { id: { in: orderIds }, restaurantId },
        select: {
          id: true,
          totalAmount: true,
          taxAmount: true,
          serviceCharge: true,
          discountAmount: true,
          orderType: true,
        },
      })
    : [];

  const methods = emptyMethodTotals();
  let netSales = 0;
  for (const payment of payments) {
    const amount = Number(payment.amount);
    netSales += amount;
    const current = methods.get(payment.paymentMethod) ?? {
      amount: 0,
      count: 0,
    };
    current.amount += amount;
    current.count += 1;
    methods.set(payment.paymentMethod, current);
  }

  const grossSales = orders.reduce(
    (sum, order) => sum + Number(order.totalAmount),
    0
  );
  const tax = orders.reduce((sum, order) => sum + Number(order.taxAmount), 0);
  const serviceCharge = orders.reduce(
    (sum, order) => sum + Number(order.serviceCharge),
    0
  );
  const discounts = orders.reduce(
    (sum, order) => sum + Number(order.discountAmount),
    0
  );
  const orderCount = orderIds.length;
  const averageCheck = orderCount ? netSales / orderCount : 0;

  const openOrders = await prisma.order.count({
    where: {
      restaurantId,
      status: { in: ['PENDING', 'CONFIRMED', 'PREPARING', 'READY'] },
    },
  });
  const servedUnpaid = await prisma.order.aggregate({
    where: { restaurantId, status: 'SERVED', paymentStatus: 'PENDING' },
    _count: { id: true },
    _sum: { totalAmount: true },
  });
  const pendingPayments = await prisma.payment.count({
    where: { order: { restaurantId }, status: 'PENDING' },
  });

  const blockers: CounterBlocker[] = [];
  if (openOrders > 0) {
    blockers.push({
      type: 'OPEN_ORDERS',
      count: openOrders,
      label: 'Orders still in service',
    });
  }
  if ((servedUnpaid._count.id ?? 0) > 0) {
    blockers.push({
      type: 'UNPAID_ORDERS',
      count: servedUnpaid._count.id,
      amount: money(servedUnpaid._sum.totalAmount),
      label: 'Served orders still unpaid',
    });
  }
  if (pendingPayments > 0) {
    blockers.push({
      type: 'PENDING_PAYMENTS',
      count: pendingPayments,
      label: 'Payments with uncertain status',
    });
  }

  const topItems = await getCounterTopItems(restaurantId, orderIds, 3);
  const cash = methods.get('cash')?.amount ?? 0;
  const cashExpected = Number(businessDay.openingFloat) + cash;

  return {
    businessDate,
    status: businessDay.status as 'OPEN' | 'CLOSING' | 'CLOSED',
    timezone: clock.timezone,
    currency,
    asOf: new Date().toISOString(),
    openedAt: businessDay.openedAt.toISOString(),
    closedAt: businessDay.closedAt?.toISOString() ?? null,
    netSales: money(netSales),
    grossSales: money(grossSales),
    tax: money(tax),
    serviceCharge: money(serviceCharge),
    discounts: money(discounts),
    orderCount,
    averageCheck: money(averageCheck),
    paymentMethods: Array.from(methods.entries()).map(([method, value]) => ({
      method,
      amount: money(value.amount),
      count: value.count,
    })),
    cashExpected: money(cashExpected),
    cashCounted:
      businessDay.countedCash === null ? null : money(businessDay.countedCash),
    cashVariance:
      businessDay.variance === null ? null : money(businessDay.variance),
    openingFloat: money(businessDay.openingFloat),
    unpaidCount: servedUnpaid._count.id ?? 0,
    unpaidTotal: money(servedUnpaid._sum.totalAmount),
    blockers,
    topItems,
  };
}

export async function getCounterTopItems(
  restaurantId: string,
  orderIds: string[],
  limit = 3
): Promise<CounterTopItem[]> {
  if (orderIds.length === 0) return [];
  const grouped = await prisma.orderItem.groupBy({
    by: ['menuItemId'],
    where: {
      orderId: { in: orderIds },
      order: { restaurantId, status: { not: 'CANCELLED' } },
    },
    _sum: { quantity: true },
    orderBy: { _sum: { quantity: 'desc' } },
    take: limit,
  });
  if (grouped.length === 0) return [];
  const items = await prisma.menuItem.findMany({
    where: { id: { in: grouped.map((row) => row.menuItemId) } },
    select: { id: true, name: true },
  });
  const names = new Map(items.map((item) => [item.id, item.name]));
  return grouped.map((row) => ({
    menuItemId: row.menuItemId,
    name: names.get(row.menuItemId) ?? 'Item',
    quantity: row._sum.quantity ?? 0,
  }));
}

async function getTopItemsForRange(
  restaurantId: string,
  start: Date,
  end: Date,
  limit = 3
): Promise<CounterTopItem[]> {
  const payments = await prisma.payment.findMany({
    where: {
      order: { restaurantId },
      status: 'PAID',
      createdAt: { gte: start, lte: end },
    },
    select: { orderId: true },
  });
  const orderIds = Array.from(new Set(payments.map((row) => row.orderId)));
  return getCounterTopItems(restaurantId, orderIds, limit);
}

export async function getCounterTopItemsLastDays(
  restaurantId: string,
  days = 7,
  limit = 3
): Promise<CounterTopItem[]> {
  const { clock } = await getRestaurantClock(restaurantId);
  const open = await getOpenBusinessDay(restaurantId);
  const currentDate = parseBusinessDateFromDb(open.businessDate);
  const startDate = addBusinessDays(currentDate, -(Math.max(days, 1) - 1));
  return getTopItemsForRange(
    restaurantId,
    getBusinessDayStart(startDate, clock),
    new Date(),
    limit
  );
}

export async function getDailyOrdersReport(
  restaurantId: string,
  businessDate: BusinessDate
) {
  const page = await getCounterDayOrders(restaurantId, {
    businessDate,
    scope: 'all',
  });
  return {
    businessDate: page.businessDate,
    currency: page.currency,
    orders: page.orders,
    totals: page.totals,
  };
}

export async function getCounterSalesPage(
  restaurantId: string,
  options: { businessDayId?: string; offset?: number; limit?: number } = {}
) {
  const { clock } = await getRestaurantClock(restaurantId);
  const businessDay = options.businessDayId
    ? await prisma.businessDay.findFirst({
        where: { id: options.businessDayId, restaurantId },
      })
    : await getOpenBusinessDay(restaurantId);
  if (!businessDay) {
    throw new CounterReportError(
      'No open business day',
      'NO_BUSINESS_DAY',
      404
    );
  }
  const start = businessDay.openedAt;
  const end = businessDay.closedAt ?? new Date();
  const limit = Math.min(Math.max(options.limit ?? 30, 1), 100);
  const offset = Math.max(options.offset ?? 0, 0);
  const where = {
    order: { restaurantId },
    status: 'PAID' as const,
    createdAt: { gte: start, lte: end },
  };
  const [rows, total] = await Promise.all([
    prisma.payment.findMany({
      where,
      select: {
        id: true,
        orderId: true,
        paymentMethod: true,
        amount: true,
        status: true,
        receiptNumber: true,
        createdAt: true,
        order: {
          select: {
            orderNumber: true,
            orderType: true,
            dailySeq: true,
            table: { select: { tableNumber: true, tableName: true } },
          },
        },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip: offset,
      take: limit,
    }),
    prisma.payment.count({ where }),
  ]);

  return {
    businessDate: parseBusinessDateFromDb(businessDay.businessDate),
    timezone: clock.timezone,
    asOf: new Date().toISOString(),
    rows: rows.map(
      (row): CounterSaleRow => ({
        id: row.id,
        createdAt: row.createdAt.toISOString(),
        orderId: row.orderId,
        orderNumber: row.order.orderNumber,
        orderType: row.order.orderType,
        tableNumber: row.order.table?.tableNumber ?? null,
        tableName: row.order.table?.tableName ?? null,
        pickupNumber:
          row.order.orderType === 'TAKEAWAY' && row.order.dailySeq
            ? `#${String(row.order.dailySeq).padStart(3, '0')}`
            : null,
        paymentMethod: row.paymentMethod,
        amount: money(row.amount),
        status: row.status,
        receiptNumber: row.receiptNumber,
      })
    ),
    total,
    offset,
    hasMore: offset + rows.length < total,
  };
}

export async function getCounterDailyTotals(
  restaurantId: string,
  days = 7
): Promise<
  Array<{ businessDate: BusinessDate; netSales: string; orderCount: number }>
> {
  const current = await getOpenBusinessDay(restaurantId);
  const currentDate = parseBusinessDateFromDb(current.businessDate);
  const startDate = addBusinessDays(currentDate, -(Math.max(days, 1) - 1));
  const rows = await prisma.businessDay.findMany({
    where: {
      restaurantId,
      businessDate: {
        gte: toDbBusinessDate(startDate),
        lte: toDbBusinessDate(currentDate),
      },
    },
    orderBy: { businessDate: 'asc' },
  });
  const byDate = new Map(
    rows.map((row) => [parseBusinessDateFromDb(row.businessDate), row])
  );
  const result: Array<{
    businessDate: BusinessDate;
    netSales: string;
    orderCount: number;
  }> = [];
  for (let index = 0; index < Math.max(days, 1); index += 1) {
    const date = addBusinessDays(startDate, index);
    const day = byDate.get(date);
    if (!day) {
      result.push({ businessDate: date, netSales: '0.00', orderCount: 0 });
      continue;
    }
    const payments = await getDayPayments(
      restaurantId,
      day.openedAt,
      day.closedAt ?? new Date()
    );
    const netSales = payments.reduce(
      (sum, payment) => sum + Number(payment.amount),
      0
    );
    result.push({
      businessDate: date,
      netSales: money(netSales),
      orderCount: new Set(payments.map((payment) => payment.orderId)).size,
    });
  }
  return result;
}

export async function startClosingBusinessDay(
  restaurantId: string
): Promise<CounterDaySummary> {
  const day = await getOpenBusinessDay(restaurantId);
  if (day.status === 'CLOSED') {
    throw new CounterReportError(
      'The business day is already closed',
      'DAY_ALREADY_CLOSED',
      409
    );
  }
  if (day.status !== 'CLOSING') {
    await prisma.businessDay.update({
      where: { id: day.id },
      data: { status: 'CLOSING', closeStartedAt: new Date() },
    });
  }
  return getCounterDaySummary(restaurantId, day.id);
}

export async function cancelClosingBusinessDay(
  restaurantId: string
): Promise<CounterDaySummary> {
  const day = await getOpenBusinessDay(restaurantId);
  if (day.status === 'CLOSING') {
    await prisma.businessDay.update({
      where: { id: day.id },
      data: { status: 'OPEN', closeStartedAt: null },
    });
  }
  return getCounterDaySummary(restaurantId, day.id);
}

export async function setOpeningFloat(
  restaurantId: string,
  openingFloat: number
): Promise<CounterDaySummary> {
  const businessDay = await getOpenBusinessDay(restaurantId);
  if (businessDay.status !== 'OPEN') {
    throw new CounterReportError(
      'The opening float can only be changed while the day is open',
      'DAY_NOT_OPEN',
      409
    );
  }
  const start = businessDay.openedAt;
  const end = businessDay.closedAt ?? new Date();
  const paymentCount = await prisma.payment.count({
    where: {
      order: { restaurantId },
      status: 'PAID',
      createdAt: { gte: start, lte: end },
    },
  });
  if (paymentCount > 0) {
    throw new CounterReportError(
      'The opening float cannot be changed after the first payment',
      'OPENING_FLOAT_LOCKED',
      409
    );
  }
  await prisma.businessDay.update({
    where: { id: businessDay.id },
    data: { openingFloat },
  });
  return getCounterDaySummary(restaurantId, businessDay.id);
}

export async function closeCounterBusinessDay(input: {
  restaurantId: string;
  countedCash: number;
  notes?: string;
  idempotencyKey: string;
  closedBy: string;
  closedByName?: string;
}): Promise<CounterCloseResult> {
  const existingByKey = await prisma.businessDay.findFirst({
    where: {
      restaurantId: input.restaurantId,
      closeIdempotencyKey: input.idempotencyKey,
    },
  });
  if (existingByKey?.status === 'CLOSED' && existingByKey.snapshot) {
    return existingByKey.snapshot as unknown as CounterCloseResult;
  }

  const { openingFloat } = await getRestaurantClock(input.restaurantId);
  const businessDay = await getOpenBusinessDay(input.restaurantId);
  if (businessDay.status === 'CLOSED') {
    throw new CounterReportError(
      'This business day is already closed',
      'DAY_ALREADY_CLOSED',
      409
    );
  }

  const summary = await getCounterDaySummary(
    input.restaurantId,
    businessDay.id
  );
  if (summary.blockers.length > 0) {
    throw new CounterReportError(
      'Resolve all orders and payments before closing the day',
      'BUSINESS_DAY_BLOCKED',
      409,
      { blockers: summary.blockers }
    );
  }

  const expectedCash =
    Number(summary.openingFloat) +
    Number(
      summary.paymentMethods.find((row) => row.method === 'cash')?.amount ?? 0
    );
  const variance = input.countedCash - expectedCash;
  const closeNote = input.notes?.trim() || null;
  assertVarianceReason(variance, closeNote);
  const businessDate = summary.businessDate;
  const closedCount = await prisma.businessDay.count({
    where: { restaurantId: input.restaurantId, status: 'CLOSED' },
  });
  const zNumber = `Z-${businessDate.replace(/-/g, '').slice(2)}-${String(
    closedCount + 1
  ).padStart(3, '0')}`;
  const closedAt = new Date();
  const snapshot = {
    businessDayId: businessDay.id,
    businessDate,
    zNumber,
    closedAt: closedAt.toISOString(),
    closeNote,
    summary: {
      ...summary,
      status: 'CLOSED' as const,
      cashExpected: money(expectedCash),
      cashCounted: money(input.countedCash),
      cashVariance: money(variance),
      openingFloat: money(summary.openingFloat),
    },
    nextBusinessDate: addBusinessDays(businessDate, 1),
  } satisfies CounterCloseResult;

  const updated = await prisma.$transaction(async (tx) => {
    const changed = await tx.businessDay.updateMany({
      where: { id: businessDay.id, status: { in: ['OPEN', 'CLOSING'] } },
      data: {
        status: 'CLOSED',
        closedAt,
        closedBy: input.closedBy,
        closedByName: input.closedByName,
        closeNote,
        countedCash: input.countedCash,
        expectedCash,
        variance,
        zNumber,
        closeIdempotencyKey: input.idempotencyKey,
        snapshot:
          snapshot as unknown as import('@prisma/client').Prisma.InputJsonValue,
      },
    });
    if (changed.count !== 1) {
      throw new CounterReportError(
        'This business day was already closed',
        'DAY_ALREADY_CLOSED',
        409
      );
    }
    await tx.businessDay.create({
      data: {
        restaurantId: input.restaurantId,
        businessDate: toDbBusinessDate(addBusinessDays(businessDate, 1)),
        status: 'OPEN',
        openedAt: closedAt,
        openingFloat: openingFloat,
      },
    });
    return snapshot;
  });

  return updated;
}

export async function listClosedBusinessDays(restaurantId: string, limit = 30) {
  const rows = await prisma.businessDay.findMany({
    where: { restaurantId, status: 'CLOSED' },
    orderBy: { businessDate: 'desc' },
    take: Math.min(Math.max(limit, 1), 100),
  });
  return rows.map((row) => {
    const snapshot = row.snapshot as {
      summary?: {
        netSales?: string;
        cashExpected?: string;
        cashCounted?: string | null;
        cashVariance?: string | null;
      };
    } | null;
    return {
      id: row.id,
      businessDate: parseBusinessDateFromDb(row.businessDate),
      zNumber: row.zNumber,
      closedAt: row.closedAt?.toISOString() ?? null,
      closeNote: row.closeNote,
      netSales: snapshot?.summary?.netSales ?? '0.00',
      cashExpected: snapshot?.summary?.cashExpected ?? '0.00',
      cashCounted: snapshot?.summary?.cashCounted ?? null,
      cashVariance: snapshot?.summary?.cashVariance ?? null,
    };
  });
}

export async function getClosedBusinessDay(
  restaurantId: string,
  businessDayId: string
) {
  const day = await prisma.businessDay.findFirst({
    where: {
      id: businessDayId,
      restaurantId,
      status: 'CLOSED',
    },
  });
  if (!day || !day.snapshot) {
    throw new CounterReportError('Z report not found', 'NOT_FOUND', 404);
  }
  return day.snapshot as unknown as CounterCloseResult;
}

export function businessDateLabel(businessDate: BusinessDate): string {
  return formatBusinessDate(businessDate);
}
