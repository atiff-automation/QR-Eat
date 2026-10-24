import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/database';
import {
  getTenantContext,
  requireAuth,
  requirePermission,
} from '@/lib/tenant-context';
import { v4 as uuidv4 } from 'uuid';

function authErrorResponse(error: unknown): NextResponse | null {
  if (!(error instanceof Error)) return null;
  if (error.message.includes('Authentication required')) {
    return NextResponse.json(
      { error: 'Authentication required' },
      { status: 401 }
    );
  }
  if (error.message.includes('Permission denied')) {
    return NextResponse.json({ error: error.message }, { status: 403 });
  }
  return null;
}

export async function GET(request: NextRequest) {
  try {
    const context = await getTenantContext(request);
    requireAuth(context);
    requirePermission(context!, 'tables', 'read');

    // Determine restaurant ID based on user type
    let restaurantId: string;
    if (context!.userType === 'staff') {
      const staffRestaurantId = context!.restaurantId;
      if (!staffRestaurantId) {
        return NextResponse.json(
          { error: 'Restaurant context missing' },
          { status: 400 }
        );
      }
      restaurantId = staffRestaurantId;
    } else {
      // For admin/owner, require restaurantId parameter
      const url = new URL(request.url);
      const reqRestaurantId = url.searchParams.get('restaurantId');
      if (!reqRestaurantId) {
        return NextResponse.json(
          { error: 'restaurantId parameter required' },
          { status: 400 }
        );
      }
      restaurantId = reqRestaurantId;
    }

    // Get tables with order counts
    const tables = await prisma.table.findMany({
      where: {
        restaurantId,
      },
      include: {
        _count: {
          select: {
            orders: {
              where: {
                status: {
                  // Only count orders actively being prepared
                  // Excludes 'READY' (ready to serve) and terminal states
                  in: ['PENDING', 'CONFIRMED', 'PREPARING'],
                },
              },
            },
          },
        },
        orders: {
          where: {
            status: {
              in: ['PENDING', 'CONFIRMED', 'PREPARING', 'READY'],
            },
          },
          orderBy: {
            createdAt: 'desc',
          },
          take: 1,
          select: {
            createdAt: true,
          },
        },
      },
      orderBy: [{ tableNumber: 'asc' }],
    });

    // Transform the data to include current orders count and last order time
    const transformedTables = tables.map((table) => ({
      id: table.id,
      tableNumber: table.tableNumber,
      tableName: table.tableName,
      capacity: table.capacity,
      status: table.status,
      qrCodeToken: table.qrCodeToken,
      locationDescription: table.locationDescription,
      currentOrders: table._count.orders,
      lastOrderAt: table.orders[0]?.createdAt || null,
    }));

    return NextResponse.json({
      success: true,
      tables: transformedTables,
    });
  } catch (error) {
    console.error('Failed to fetch tables:', error);
    const authError = authErrorResponse(error);
    if (authError) return authError;
    return NextResponse.json(
      { error: 'Failed to fetch tables' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const context = await getTenantContext(request);
    requireAuth(context);
    requirePermission(context!, 'tables', 'write');

    const {
      tableNumber,
      tableName,
      capacity,
      locationDescription,
      restaurantId: reqRestaurantId,
    } = await request.json();

    // Validate required fields
    if (!tableNumber || !capacity) {
      return NextResponse.json(
        { error: 'Table number and capacity are required' },
        { status: 400 }
      );
    }

    // Determine restaurant ID based on user type
    let restaurantId: string;
    if (context!.userType === 'staff') {
      const staffRestaurantId = context!.restaurantId;
      if (!staffRestaurantId) {
        return NextResponse.json(
          { error: 'Restaurant context missing' },
          { status: 400 }
        );
      }
      restaurantId = staffRestaurantId;
    } else {
      // For admin/owner, require restaurantId parameter
      if (!reqRestaurantId) {
        return NextResponse.json(
          { error: 'restaurantId required' },
          { status: 400 }
        );
      }
      restaurantId = reqRestaurantId;
    }

    // Check if table number already exists for this restaurant
    const existingTable = await prisma.table.findFirst({
      where: {
        restaurantId: restaurantId,
        tableNumber: tableNumber,
      },
    });

    if (existingTable) {
      return NextResponse.json(
        { error: 'Table number already exists' },
        { status: 400 }
      );
    }

    // Generate QR code token
    const qrCodeToken = uuidv4();

    // Create new table
    const newTable = await prisma.table.create({
      data: {
        restaurantId: restaurantId,
        tableNumber,
        tableName,
        capacity: parseInt(capacity),
        locationDescription,
        qrCodeToken,
        status: 'AVAILABLE',
      },
    });

    return NextResponse.json({
      success: true,
      table: newTable,
      message: 'Table created successfully',
    });
  } catch (error) {
    console.error('Failed to create table:', error);
    const authError = authErrorResponse(error);
    if (authError) return authError;
    return NextResponse.json(
      { error: 'Failed to create table' },
      { status: 500 }
    );
  }
}
