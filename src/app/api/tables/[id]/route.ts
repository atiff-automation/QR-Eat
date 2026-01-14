import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/database';
import {
  getTenantContext,
  requireAuth,
  requirePermission,
} from '@/lib/tenant-context';

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const context = await getTenantContext(request);
    requireAuth(context);
    requirePermission(context!, 'tables', 'delete');

    const tableId = params.id;

    // Verify table exists and check order count
    const existingTable = await prisma.table.findUnique({
      where: { id: tableId },
      include: {
        _count: {
          select: { orders: true },
        },
      },
    });

    if (!existingTable) {
      return NextResponse.json({ error: 'Table not found' }, { status: 404 });
    }

    // Conditional delete: Check if table has orders
    if (existingTable._count.orders > 0) {
      return NextResponse.json(
        {
          error: `Cannot delete table "${existingTable.tableName || existingTable.tableNumber}". Has ${existingTable._count.orders} existing order(s).`,
          suggestion: 'Rename the table instead or keep it',
          orderCount: existingTable._count.orders,
        },
        { status: 400 }
      );
    }

    // Safe to delete (no orders)
    await prisma.table.delete({
      where: { id: tableId },
    });

    return NextResponse.json({
      success: true,
      message: 'Table deleted successfully',
    });
  } catch (error) {
    console.error('Failed to delete table:', error);

    if (error instanceof Error) {
      if (error.message.includes('Authentication required')) {
        return NextResponse.json(
          { error: 'Authentication required' },
          { status: 401 }
        );
      }
      if (error.message.includes('Permission denied')) {
        return NextResponse.json({ error: error.message }, { status: 403 });
      }
    }

    return NextResponse.json(
      { error: 'Failed to delete table' },
      { status: 500 }
    );
  }
}
