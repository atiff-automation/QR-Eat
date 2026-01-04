import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/database';
import { AuthServiceV2 } from '@/lib/rbac/auth-service';
import { PostgresEventManager } from '@/lib/postgres-pubsub';

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Verify authentication using RBAC system
    const token =
      request.cookies.get('qr_rbac_token')?.value ||
      request.cookies.get('qr_auth_token')?.value;

    if (!token) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    const authResult = await AuthServiceV2.validateToken(token);

    if (!authResult.isValid || !authResult.user) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    const { status } = await request.json();
    const tableId = params.id;

    // Validate status
    const validStatuses = [
      'AVAILABLE',
      'OCCUPIED',
      'RESERVED',
      'cleaning',
      'maintenance',
    ];
    if (!validStatuses.includes(status)) {
      return NextResponse.json(
        { error: 'Invalid table status' },
        { status: 400 }
      );
    }

    // Get the current table
    const currentTable = await prisma.table.findUnique({
      where: { id: tableId },
      include: {
        restaurant: true,
      },
    });

    if (!currentTable) {
      return NextResponse.json({ error: 'Table not found' }, { status: 404 });
    }

    // Check if user has permission to update this table
    if (
      currentTable.restaurantId !== authResult.user.currentRole.restaurantId
    ) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    // Update the table status
    const updatedTable = await prisma.table.update({
      where: { id: tableId },
      data: {
        status,
        updatedAt: new Date(),
      },
    });

    // Log the status change
    await prisma.auditLog.create({
      data: {
        tableName: 'tables',
        recordId: tableId,
        operation: 'UPDATE',
        oldValues: { status: currentTable.status },
        newValues: { status },
        changedBy: authResult.user.id,
      },
    });

    // Real-time notification: Publish table status change
    await PostgresEventManager.publishTableStatusChange({
      tableId,
      restaurantId: currentTable.restaurantId,
      previousStatus: currentTable.status,
      newStatus: status,
      updatedBy: authResult.user.id,
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
