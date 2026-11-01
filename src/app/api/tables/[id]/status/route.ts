import { NextRequest, NextResponse } from 'next/server';
import type { Table } from '@prisma/client';
import { prisma } from '@/lib/database';
import {
  getTenantContext,
  requireAuth,
  requirePermission,
} from '@/lib/tenant-context';
import { requireTableAccess } from '@/lib/rbac/resource-auth';
import { closeDiningSession } from '@/lib/dining-session';
import { PostgresEventManager } from '@/lib/postgres-pubsub';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { status } = await request.json();
    const { id: tableId } = await params;

    const context = await getTenantContext(request);
    requireAuth(context);
    requirePermission(context!, 'tables', 'write');

    // ✅ NEW: Validate resource access (IDOR protection)
    await requireTableAccess(tableId, context!);

    // Get the current table for logging/notifications
    // ✅ STRICT VALIDATION: Prevent setting an OCCUPIED table to RESERVED
    const currentTable = await prisma.table.findUnique({
      where: { id: tableId },
    });

    if (!currentTable) {
      return NextResponse.json({ error: 'Table not found' }, { status: 404 });
    }

    if (currentTable.status === 'OCCUPIED' && status === 'RESERVED') {
      return NextResponse.json(
        {
          error:
            'Cannot reserve an occupied table. Please clear the table first.',
        },
        { status: 400 }
      );
    }

    // 🐛 DEBUG: Log status update attempt
    console.log('🔧 [TABLE STATUS] Update attempt:', {
      tableId,
      tableNumber: currentTable.tableNumber,
      currentStatus: currentTable.status,
      newStatus: status,
      statusType: typeof status,
    });

    let updatedTable: Table;

    if (status === 'AVAILABLE') {
      const blockingOrders = await prisma.order.count({
        where: {
          tableId,
          restaurantId: currentTable.restaurantId,
          OR: [
            {
              status: {
                in: ['PENDING', 'CONFIRMED', 'PREPARING', 'READY'],
              },
            },
            { status: 'SERVED', paymentStatus: 'PENDING' },
          ],
        },
      });

      if (blockingOrders > 0) {
        return NextResponse.json(
          {
            error:
              'Table still has active or unpaid orders. Serve and pay them before clearing.',
            code: 'TABLE_NOT_CLEAR',
          },
          { status: 409 }
        );
      }

      updatedTable = await prisma.$transaction(async (tx) => {
        const closedSession = await closeDiningSession(tx, tableId, {
          userId: context!.userId,
        });

        const updated = await tx.table.findUnique({ where: { id: tableId } });
        if (!updated) {
          throw new Error('Table disappeared while clearing');
        }

        await tx.auditLog.create({
          data: {
            tableName: 'tables',
            recordId: tableId,
            operation: 'UPDATE',
            oldValues: {
              status: currentTable.status,
              diningSessionId: closedSession?.id ?? null,
            },
            newValues: { status },
            changedBy: context!.userId,
          },
        });

        return updated;
      });
    } else {
      updatedTable = await prisma.table.update({
        where: { id: tableId },
        data: {
          status,
          updatedAt: new Date(),
        },
      });

      await prisma.auditLog.create({
        data: {
          tableName: 'tables',
          recordId: tableId,
          operation: 'UPDATE',
          oldValues: { status: currentTable.status },
          newValues: { status },
          changedBy: context!.userId,
        },
      });
    }

    console.log('✅ [TABLE STATUS] Update successful:', {
      tableId,
      finalStatus: updatedTable.status,
    });

    // Real-time notification: Publish table status change
    await PostgresEventManager.publishTableStatusChange({
      tableId,
      restaurantId: updatedTable.restaurantId,
      previousStatus: currentTable.status,
      newStatus: status,
      updatedBy: context!.userId,
      timestamp: Date.now(),
    });

    return NextResponse.json({
      success: true,
      table: updatedTable,
      message: `Table status updated to ${status}`,
    });
  } catch (error) {
    console.error('Failed to update table status:', error);
    return NextResponse.json(
      { error: 'Failed to update table status' },
      { status: 500 }
    );
  }
}
