/**
 * Bulk Table Operations API
 * Handles creating multiple tables at once and bulk status updates
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/database';
import { requireAuth } from '@/lib/rbac/middleware';
import { TABLE_PERMISSIONS } from '@/lib/rbac/permission-constants';
import { v4 as uuidv4 } from 'uuid';

// POST - Bulk create tables
export async function POST(request: NextRequest) {
  try {
    const { tables, prefix = 'Table', restaurantId } = await request.json();

    if (!restaurantId) {
      return NextResponse.json(
        { error: 'restaurantId is required' },
        { status: 400 }
      );
    }

    // Authenticate and authorize using RBAC middleware
    const auth = await requireAuth(request, [TABLE_PERMISSIONS.WRITE]);

    if (!auth.success) {
      return NextResponse.json(
        { error: auth.error || 'Authentication required' },
        { status: auth.statusCode || 401 }
      );
    }

    if (!tables || !Array.isArray(tables)) {
      return NextResponse.json(
        { error: 'Tables array is required' },
        { status: 400 }
      );
    }

    // Validate all tables before creating any
    const tableNumbers = new Set();
    for (const table of tables) {
      if (!table.tableNumber || !table.capacity) {
        return NextResponse.json(
          {
            error: 'Each table must have tableNumber and capacity',
          },
          { status: 400 }
        );
      }

      if (tableNumbers.has(table.tableNumber)) {
        return NextResponse.json(
          {
            error: `Duplicate table number in request: ${table.tableNumber}`,
          },
          { status: 400 }
        );
      }
      tableNumbers.add(table.tableNumber);
    }

    // Check for existing table numbers
    const existingTables = await prisma.table.findMany({
      where: {
        restaurantId,
        tableNumber: {
          in: Array.from(tableNumbers) as string[],
        },
      },
      select: { tableNumber: true },
    });

    if (existingTables.length > 0) {
      const conflictingNumbers = existingTables.map((t) => t.tableNumber);
      return NextResponse.json(
        {
          error: `Table numbers already exist: ${conflictingNumbers.join(', ')}`,
        },
        { status: 409 }
      );
    }

    // Create all tables in a transaction
    const createdTables = await prisma.$transaction(
      tables.map((table) =>
        prisma.table.create({
          data: {
            restaurantId,
            tableNumber: table.tableNumber,
            tableName: table.tableName || `${prefix} ${table.tableNumber}`,
            capacity: parseInt(table.capacity),
            locationDescription: table.locationDescription || '',
            qrCodeToken: uuidv4(),
            status: 'available',
          },
        })
      )
    );

    return NextResponse.json(
      {
        success: true,
        tables: createdTables,
        count: createdTables.length,
        message: `${createdTables.length} tables created successfully`,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Error in bulk table creation:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// PATCH - Bulk update table statuses
export async function PATCH(request: NextRequest) {
  try {
    const { tableIds, status, restaurantId } = await request.json();

    if (!restaurantId) {
      return NextResponse.json(
        { error: 'restaurantId is required' },
        { status: 400 }
      );
    }

    // Authenticate and authorize using RBAC middleware
    const auth = await requireAuth(request, [TABLE_PERMISSIONS.WRITE]);

    if (!auth.success) {
      return NextResponse.json(
        { error: auth.error || 'Authentication required' },
        { status: auth.statusCode || 401 }
      );
    }

    if (!tableIds || !Array.isArray(tableIds) || !status) {
      return NextResponse.json(
        {
          error: 'tableIds array and status are required',
        },
        { status: 400 }
      );
    }

    const validStatuses = [
      'available',
      'occupied',
      'reserved',
      'cleaning',
      'out_of_service',
    ];
    if (!validStatuses.includes(status)) {
      return NextResponse.json(
        {
          error: `Invalid status. Must be one of: ${validStatuses.join(', ')}`,
        },
        { status: 400 }
      );
    }

    // Verify all tables belong to the restaurant
    const tablesToUpdate = await prisma.table.findMany({
      where: {
        id: { in: tableIds },
        restaurantId,
      },
    });

    if (tablesToUpdate.length !== tableIds.length) {
      return NextResponse.json(
        {
          error: 'Some tables not found or access denied',
        },
        { status: 404 }
      );
    }

    // Update all tables
    const updatedTables = await prisma.table.updateMany({
      where: {
        id: { in: tableIds },
        restaurantId,
      },
      data: { status },
    });

    return NextResponse.json({
      success: true,
      updatedCount: updatedTables.count,
      message: `${updatedTables.count} tables updated to ${status}`,
    });
  } catch (error) {
    console.error('Error in bulk table update:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
