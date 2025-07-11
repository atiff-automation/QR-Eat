import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyAuthToken } from '@/lib/auth';

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Verify authentication
    const authResult = await verifyAuthToken(request);
    if (!authResult.isValid || !authResult.staff) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    const { status } = await request.json();
    const tableId = params.id;

    // Validate status
    const validStatuses = ['available', 'occupied', 'reserved', 'cleaning', 'maintenance'];
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
        restaurant: true
      }
    });

    if (!currentTable) {
      return NextResponse.json(
        { error: 'Table not found' },
        { status: 404 }
      );
    }

    // Check if staff has permission to update this table
    if (currentTable.restaurantId !== authResult.staff.restaurantId) {
      return NextResponse.json(
        { error: 'Access denied' },
        { status: 403 }
      );
    }

    // Update the table status
    const updatedTable = await prisma.table.update({
      where: { id: tableId },
      data: {
        status,
        updatedAt: new Date()
      }
    });

    // Log the status change
    await prisma.auditLog.create({
      data: {
        tableName: 'tables',
        recordId: tableId,
        operation: 'UPDATE',
        oldValues: { status: currentTable.status },
        newValues: { status },
        changedBy: authResult.staff.id,
        ipAddress: request.headers.get('x-forwarded-for') || 
                   request.headers.get('x-real-ip') ||
                   'unknown'
      }
    });

    return NextResponse.json({
      success: true,
      table: updatedTable,
      message: `Table status updated to ${status}`
    });

  } catch (error) {
    console.error('Failed to update table status:', error);
    return NextResponse.json(
      { error: 'Failed to update table status' },
      { status: 500 }
    );
  }
}