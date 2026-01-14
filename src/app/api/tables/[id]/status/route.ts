import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/database';
import {
  getTenantContext,
  requireAuth,
  requirePermission,
} from '@/lib/tenant-context';
import { requireTableAccess } from '@/lib/rbac/resource-auth';
import { PostgresEventManager } from '@/lib/postgres-pubsub';

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
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

    // Update the table status
    const updatedTable = await prisma.table.update({
      where: { id: tableId },
      data: {
        status,
        updatedAt: new Date(),
      },
    });

    console.log('✅ [TABLE STATUS] Update successful:', {
      tableId,
      finalStatus: updatedTable.status,
    });

    // Log the status change
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
