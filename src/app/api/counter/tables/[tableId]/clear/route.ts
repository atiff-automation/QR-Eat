import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/database';
import {
  getTenantContext,
  requireAuth,
  requirePermission,
} from '@/lib/tenant-context';
import { counterAccessDenied } from '@/lib/counter/access';
import { requireTableAccess } from '@/lib/rbac/resource-auth';
import { PostgresEventManager } from '@/lib/postgres-pubsub';

/**
 * POST /api/counter/tables/{tableId}/clear
 *
 * Explicit manager/owner clear for a stale table. The server refuses if any
 * active order or served-unpaid order remains. This is deliberately stricter
 * than PATCH /api/tables/{id}/status, which is also used for reserve/unreserve.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ tableId: string }> }
) {
  try {
    const { tableId } = await params;
    const context = await getTenantContext(request);
    const denied = counterAccessDenied(context);
    if (denied) return denied;
    requireAuth(context);
    requirePermission(context!, 'tables', 'write');
    await requireTableAccess(tableId, context!);

    const isOwnerOrManager =
      context!.userType === 'restaurant_owner' ||
      (context!.userType === 'staff' && context!.roleTemplate === 'manager');
    if (!isOwnerOrManager) {
      return NextResponse.json(
        {
          success: false,
          error: 'Only a manager or owner can clear a table.',
          code: 'CLEAR_NOT_ALLOWED',
        },
        { status: 403 }
      );
    }

    const table = await prisma.table.findUnique({
      where: { id: tableId },
      select: { id: true, tableNumber: true, restaurantId: true, status: true },
    });
    if (!table) {
      return NextResponse.json(
        { success: false, error: 'Table not found' },
        { status: 404 }
      );
    }

    const blockingOrders = await prisma.order.count({
      where: {
        tableId,
        restaurantId: table.restaurantId,
        OR: [
          { status: { in: ['PENDING', 'CONFIRMED', 'PREPARING', 'READY'] } },
          { status: 'SERVED', paymentStatus: 'PENDING' },
        ],
      },
    });
    if (blockingOrders > 0) {
      return NextResponse.json(
        {
          success: false,
          error:
            'Table still has active or unpaid orders. Serve and pay them before clearing.',
          code: 'TABLE_NOT_CLEAR',
        },
        { status: 409 }
      );
    }

    const updated = await prisma.table.update({
      where: { id: tableId },
      data: { status: 'AVAILABLE', updatedAt: new Date() },
    });

    await prisma.auditLog.create({
      data: {
        tableName: 'tables',
        recordId: tableId,
        operation: 'UPDATE',
        oldValues: { status: table.status, action: 'counter_clear' },
        newValues: { status: 'AVAILABLE' },
        changedBy: context!.userId,
      },
    });

    await PostgresEventManager.publishTableStatusChange({
      tableId,
      restaurantId: table.restaurantId,
      previousStatus: table.status,
      newStatus: 'AVAILABLE',
      updatedBy: context!.userId,
      timestamp: Date.now(),
    });

    return NextResponse.json({
      success: true,
      table: {
        id: updated.id,
        tableNumber: updated.tableNumber,
        status: updated.status,
      },
    });
  } catch (error) {
    console.error('[CounterClearTable] Error:', error);
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
      { success: false, error: 'Failed to clear table' },
      { status: 500 }
    );
  }
}
