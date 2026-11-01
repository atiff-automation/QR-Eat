import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/database';
import {
  getTenantContext,
  requireAuth,
  requirePermission,
} from '@/lib/tenant-context';
import { counterAccessDenied } from '@/lib/counter/access';
import { requireTableAccess } from '@/lib/rbac/resource-auth';
import { RBACError } from '@/lib/rbac/types';
import { ORDER_WITH_DETAILS_INCLUDE } from '@/lib/order-utils';

const V2_ORDER_INCLUDE = {
  ...ORDER_WITH_DETAILS_INCLUDE,
  payments: {
    orderBy: { processedAt: 'desc' as const },
    take: 1,
    select: {
      paymentMethod: true,
      receiptNumber: true,
      processedAt: true,
      completedAt: true,
      createdAt: true,
      status: true,
    },
  },
} as const;

const BLOCKING_STATUSES = ['PENDING', 'CONFIRMED', 'PREPARING', 'READY'];

function isBlockingOrder(order: {
  status: string;
  paymentStatus: string;
}): boolean {
  if (order.status === 'CANCELLED') return false;
  return (
    BLOCKING_STATUSES.includes(order.status) ||
    (order.status === 'SERVED' && order.paymentStatus === 'PENDING')
  );
}

/**
 * GET /api/counter/tables/{tableId}/bill
 *
 * v1 (default): unpaid, non-cancelled orders. Kept for old Counter builds.
 * v2 (?version=2): every order in the current dining session, with payment
 * and kitchen status. New Counter builds use v2.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tableId: string }> }
) {
  try {
    const { tableId } = await params;
    const version = new URL(request.url).searchParams.get('version');

    const context = await getTenantContext(request);
    const denied = counterAccessDenied(context);
    if (denied) return denied;
    requireAuth(context);
    requirePermission(context!, 'orders', 'read');
    await requireTableAccess(tableId, context!);

    const table = await prisma.table.findUnique({
      where: { id: tableId },
      select: {
        id: true,
        tableNumber: true,
        tableName: true,
        status: true,
        restaurantId: true,
        activeDiningSessionId: true,
        restaurant: {
          select: {
            currency: true,
            taxLabel: true,
            serviceChargeLabel: true,
          },
        },
      },
    });

    if (!table) {
      return NextResponse.json(
        { success: false, error: 'Table not found', code: 'NOT_FOUND' },
        { status: 404 }
      );
    }

    if (version === '2') {
      return getSessionBill(table);
    }

    // ---------------------------------------------------------------------
    // v1: old Counter bill contract. Do not change this branch.
    // ---------------------------------------------------------------------

    // A table is reused across sittings. Unpaid orders must match exactly what
    // the payment service will charge, including multiple active QR sessions at
    // the same table. Paid totals are scoped only to the sessions that own those
    // unpaid orders, so historical sittings never appear as "already paid".
    const orders = await prisma.order.findMany({
      where: {
        tableId,
        restaurantId: table.restaurantId,
        paymentStatus: 'PENDING',
        status: { not: 'CANCELLED' },
      },
      include: ORDER_WITH_DETAILS_INCLUDE,
      orderBy: { createdAt: 'asc' },
    });

    const billSessionIds = Array.from(
      new Set(
        orders
          .map((order) => order.customerSessionId)
          .filter((id): id is string => Boolean(id))
      )
    );
    const paid = billSessionIds.length
      ? await prisma.order.aggregate({
          where: {
            tableId,
            restaurantId: table.restaurantId,
            paymentStatus: 'PAID',
            status: { not: 'CANCELLED' },
            customerSessionId: { in: billSessionIds },
          },
          _sum: { totalAmount: true },
        })
      : { _sum: { totalAmount: null } };

    const unpaidTotal = orders.reduce(
      (sum, order) => sum + Number(order.totalAmount),
      0
    );
    const subtotalAmount = orders.reduce(
      (sum, order) => sum + Number(order.subtotalAmount),
      0
    );
    const taxAmount = orders.reduce(
      (sum, order) => sum + Number(order.taxAmount),
      0
    );
    const serviceCharge = orders.reduce(
      (sum, order) => sum + Number(order.serviceCharge),
      0
    );
    const paidTotal = Number(paid._sum.totalAmount || 0);
    const pendingCount = orders.filter(
      (order) => order.status === 'PENDING'
    ).length;

    // Exactly the orders that would block the explicit Counter table clear.
    // Paid orders that have not been served still block: payment is not the
    // same thing as service. The payment-success screen uses this to avoid
    // offering an action that must fail.
    const blockingOrderCount = await prisma.order.count({
      where: {
        tableId,
        restaurantId: table.restaurantId,
        OR: [
          { status: { in: ['PENDING', 'CONFIRMED', 'PREPARING', 'READY'] } },
          { status: 'SERVED', paymentStatus: 'PENDING' },
        ],
      },
    });

    return NextResponse.json({
      success: true,
      table: {
        id: table.id,
        tableNumber: table.tableNumber,
        tableName: table.tableName,
        status: table.status,
      },
      currency: table.restaurant.currency,
      taxLabel: table.restaurant.taxLabel || 'Tax',
      serviceChargeLabel:
        table.restaurant.serviceChargeLabel || 'Service Charge',
      orders: orders.map((order) => ({
        ...order,
        payable: order.status !== 'PENDING',
        isPending: order.status === 'PENDING',
      })),
      unpaidTotal,
      subtotalAmount,
      taxAmount,
      serviceCharge,
      paidTotal,
      pendingCount,
      blockingOrderCount,
      serverTime: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[CounterBill] Error:', error);

    if (error instanceof RBACError) {
      return NextResponse.json(
        { success: false, error: error.message, code: error.code },
        { status: error.statusCode }
      );
    }

    if (error instanceof Error) {
      if (error.message.includes('Authentication required')) {
        return NextResponse.json(
          { success: false, error: 'Authentication required' },
          { status: 401 }
        );
      }
      if (error.message.includes('Permission denied')) {
        return NextResponse.json(
          { success: false, error: error.message },
          { status: 403 }
        );
      }
    }

    return NextResponse.json(
      { success: false, error: 'Failed to load table bill' },
      { status: 500 }
    );
  }
}

type BillTable = {
  id: string;
  tableNumber: string;
  tableName: string | null;
  status: string;
  restaurantId: string;
  activeDiningSessionId: string | null;
  restaurant: {
    currency: string;
    taxLabel: string | null;
    serviceChargeLabel: string | null;
  };
};

async function getSessionBill(table: BillTable) {
  const session = await prisma.diningSession.findFirst({
    where: {
      tableId: table.id,
      restaurantId: table.restaurantId,
      status: 'OPEN',
    },
    orderBy: { openedAt: 'desc' },
    select: {
      id: true,
      status: true,
      openedAt: true,
      closedAt: true,
    },
  });

  if (!session) {
    return NextResponse.json({
      success: true,
      version: 2,
      session: null,
      table: {
        id: table.id,
        tableNumber: table.tableNumber,
        tableName: table.tableName,
        status: table.status,
      },
      currency: table.restaurant.currency,
      taxLabel: table.restaurant.taxLabel || 'Tax',
      serviceChargeLabel:
        table.restaurant.serviceChargeLabel || 'Service Charge',
      orders: [],
      totals: {
        subtotal: '0',
        tax: '0',
        serviceCharge: '0',
        paid: '0',
        unpaid: '0',
      },
      counts: {
        open: 0,
        served: 0,
        all: 0,
        unpaid: 0,
        preparing: 0,
        ready: 0,
      },
      readyToClear: false,
      blockingOrderCount: 0,
      serverTime: new Date().toISOString(),
    });
  }

  const orders = await prisma.order.findMany({
    where: { diningSessionId: session.id },
    include: V2_ORDER_INCLUDE,
    orderBy: { createdAt: 'asc' },
  });

  const billable = orders.filter((order) => order.status !== 'CANCELLED');
  const sum = (
    rows: typeof billable,
    pick: (order: (typeof billable)[number]) => unknown
  ) => rows.reduce((total, order) => total + Number(pick(order) ?? 0), 0);

  const unpaidTotal = sum(
    billable.filter((order) => order.paymentStatus === 'PENDING'),
    (order) => order.totalAmount
  );
  const paidTotal = sum(
    billable.filter((order) => order.paymentStatus === 'PAID'),
    (order) => order.totalAmount
  );
  const subtotalAmount = sum(billable, (order) => order.subtotalAmount);
  const taxAmount = sum(billable, (order) => order.taxAmount);
  const serviceCharge = sum(billable, (order) => order.serviceCharge);
  const blockingOrderCount = orders.filter(isBlockingOrder).length;
  const pendingCount = billable.filter(
    (order) => order.status === 'PENDING'
  ).length;
  const readyToClear =
    billable.length > 0 && blockingOrderCount === 0 && unpaidTotal === 0;

  return NextResponse.json({
    success: true,
    version: 2,
    session: {
      id: session.id,
      status: session.status,
      openedAt: session.openedAt.toISOString(),
      closedAt: session.closedAt?.toISOString() ?? null,
    },
    table: {
      id: table.id,
      tableNumber: table.tableNumber,
      tableName: table.tableName,
      status: table.status,
    },
    currency: table.restaurant.currency,
    taxLabel: table.restaurant.taxLabel || 'Tax',
    serviceChargeLabel: table.restaurant.serviceChargeLabel || 'Service Charge',
    orders: orders.map((order) => {
      const { payments, ...rest } = order;
      const payment = payments[0];
      return {
        ...rest,
        payable:
          order.status !== 'PENDING' &&
          order.status !== 'CANCELLED' &&
          order.paymentStatus === 'PENDING',
        isPending: order.status === 'PENDING',
        paymentMethod: payment?.paymentMethod ?? null,
        receiptNumber: payment?.receiptNumber ?? null,
        paidAt:
          (
            payment?.processedAt ??
            payment?.completedAt ??
            payment?.createdAt
          )?.toISOString() ?? null,
      };
    }),
    totals: {
      subtotal: subtotalAmount.toFixed(2),
      tax: taxAmount.toFixed(2),
      serviceCharge: serviceCharge.toFixed(2),
      paid: paidTotal.toFixed(2),
      unpaid: unpaidTotal.toFixed(2),
    },
    counts: {
      open: billable.filter(
        (order) =>
          order.paymentStatus === 'PENDING' || order.status !== 'SERVED'
      ).length,
      served: billable.filter(
        (order) => order.status === 'SERVED' && order.paymentStatus === 'PAID'
      ).length,
      all: orders.length,
      unpaid: billable.filter((order) => order.paymentStatus === 'PENDING')
        .length,
      preparing: billable.filter((order) => order.status === 'PREPARING')
        .length,
      ready: billable.filter((order) => order.status === 'READY').length,
      pending: pendingCount,
    },
    readyToClear,
    blockingOrderCount,
    serverTime: new Date().toISOString(),
  });
}
