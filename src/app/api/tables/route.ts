import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/database';
import { AuthServiceV2 } from '@/lib/rbac/auth-service';
import { v4 as uuidv4 } from 'uuid';

export async function GET(request: NextRequest) {
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

    // Determine restaurant ID based on user type
    let restaurantId: string;
    if (
      authResult.user.currentRole &&
      authResult.user.currentRole.userType === 'staff'
    ) {
      restaurantId = authResult.user.currentRole.restaurantId;
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
                  // Excludes 'ready' (ready to serve) and terminal states
                  in: ['pending', 'confirmed', 'preparing'],
                },
              },
            },
          },
        },
        orders: {
          where: {
            status: {
              in: ['pending', 'confirmed', 'preparing', 'ready'],
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
    return NextResponse.json(
      { error: 'Failed to fetch tables' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
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
    if (
      authResult.user.currentRole &&
      authResult.user.currentRole.userType === 'staff'
    ) {
      restaurantId = authResult.user.currentRole.restaurantId;
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
        status: 'available',
      },
    });

    return NextResponse.json({
      success: true,
      table: newTable,
      message: 'Table created successfully',
    });
  } catch (error) {
    console.error('Failed to create table:', error);
    return NextResponse.json(
      { error: 'Failed to create table' },
      { status: 500 }
    );
  }
}
