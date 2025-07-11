import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyAuthToken } from '@/lib/auth';
import { v4 as uuidv4 } from 'uuid';

export async function GET(request: NextRequest) {
  try {
    // Verify authentication
    const authResult = await verifyAuthToken(request);
    if (!authResult.isValid || !authResult.staff) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    // Get tables with order counts
    const tables = await prisma.table.findMany({
      where: {
        restaurantId: authResult.staff.restaurantId
      },
      include: {
        _count: {
          select: {
            orders: {
              where: {
                status: {
                  in: ['pending', 'confirmed', 'preparing', 'ready']
                }
              }
            }
          }
        },
        orders: {
          where: {
            status: {
              in: ['pending', 'confirmed', 'preparing', 'ready']
            }
          },
          orderBy: {
            createdAt: 'desc'
          },
          take: 1,
          select: {
            createdAt: true
          }
        }
      },
      orderBy: [
        { tableNumber: 'asc' }
      ]
    });

    // Transform the data to include current orders count and last order time
    const transformedTables = tables.map(table => ({
      id: table.id,
      tableNumber: table.tableNumber,
      tableName: table.tableName,
      capacity: table.capacity,
      status: table.status,
      qrCodeToken: table.qrCodeToken,
      locationDescription: table.locationDescription,
      currentOrders: table._count.orders,
      lastOrderAt: table.orders[0]?.createdAt || null
    }));

    return NextResponse.json({
      success: true,
      tables: transformedTables
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
    // Verify authentication
    const authResult = await verifyAuthToken(request);
    if (!authResult.isValid || !authResult.staff) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    const { tableNumber, tableName, capacity, locationDescription } = await request.json();

    // Validate required fields
    if (!tableNumber || !capacity) {
      return NextResponse.json(
        { error: 'Table number and capacity are required' },
        { status: 400 }
      );
    }

    // Check if table number already exists for this restaurant
    const existingTable = await prisma.table.findFirst({
      where: {
        restaurantId: authResult.staff.restaurantId,
        tableNumber: tableNumber
      }
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
        restaurantId: authResult.staff.restaurantId,
        tableNumber,
        tableName,
        capacity: parseInt(capacity),
        locationDescription,
        qrCodeToken,
        status: 'available'
      }
    });

    return NextResponse.json({
      success: true,
      table: newTable,
      message: 'Table created successfully'
    });

  } catch (error) {
    console.error('Failed to create table:', error);
    return NextResponse.json(
      { error: 'Failed to create table' },
      { status: 500 }
    );
  }
}