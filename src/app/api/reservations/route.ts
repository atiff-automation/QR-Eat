import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/database';
import { 
  getTenantContext, 
  requireAuth, 
  requirePermission, 
  createRestaurantFilter 
} from '@/lib/tenant-context';

export async function GET(request: NextRequest) {
  try {
    const context = await getTenantContext(request);
    requireAuth(context);
    requirePermission(context!, 'reservations', 'read');

    const url = new URL(request.url);
    const status = url.searchParams.get('status');
    const date = url.searchParams.get('date');
    const limit = parseInt(url.searchParams.get('limit') || '50');
    const offset = parseInt(url.searchParams.get('offset') || '0');
    const restaurantId = url.searchParams.get('restaurantId');

    let where: any = createRestaurantFilter(context!);

    // Platform admins can filter by specific restaurant
    if (context!.isAdmin && restaurantId) {
      where = { restaurantId };
    }

    if (status && status !== 'all') {
      where.status = status;
    }

    if (date) {
      const dateStart = new Date(date);
      dateStart.setHours(0, 0, 0, 0);
      const dateEnd = new Date(date);
      dateEnd.setHours(23, 59, 59, 999);
      
      where.reservationDate = {
        gte: dateStart,
        lte: dateEnd
      };
    }

    const reservations = await prisma.reservation.findMany({
      where,
      include: {
        table: {
          select: {
            tableNumber: true,
            tableName: true,
            capacity: true
          }
        },
        restaurant: context!.isAdmin ? {
          select: {
            id: true,
            name: true,
            slug: true
          }
        } : false
      },
      orderBy: {
        reservationDate: 'asc'
      },
      take: limit,
      skip: offset
    });

    const totalCount = await prisma.reservation.count({ where });

    return NextResponse.json({
      success: true,
      reservations,
      pagination: {
        total: totalCount,
        limit,
        offset,
        hasMore: offset + limit < totalCount
      }
    });

  } catch (error) {
    console.error('Failed to fetch reservations:', error);
    
    if (error instanceof Error) {
      if (error.message.includes('Authentication required')) {
        return NextResponse.json(
          { error: 'Authentication required' },
          { status: 401 }
        );
      }
      if (error.message.includes('Permission denied')) {
        return NextResponse.json(
          { error: error.message },
          { status: 403 }
        );
      }
    }

    return NextResponse.json(
      { error: 'Failed to fetch reservations' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const context = await getTenantContext(request);
    requireAuth(context);
    requirePermission(context!, 'reservations', 'write');

    const data = await request.json();
    const {
      restaurantId,
      tableId,
      customerName,
      customerEmail,
      customerPhone,
      partySize,
      reservationDate,
      specialRequests
    } = data;

    // Validate required fields
    if (!restaurantId || !customerName || !customerEmail || !partySize || !reservationDate) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Check if restaurant accepts reservations
    const restaurant = await prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: { acceptsReservations: true, timezone: true }
    });

    if (!restaurant || !restaurant.acceptsReservations) {
      return NextResponse.json(
        { error: 'Restaurant does not accept reservations' },
        { status: 400 }
      );
    }

    // Validate table availability if tableId is provided
    if (tableId) {
      const table = await prisma.table.findUnique({
        where: { id: tableId },
        select: { capacity: true, isActive: true }
      });

      if (!table || !table.isActive) {
        return NextResponse.json(
          { error: 'Table not available' },
          { status: 400 }
        );
      }

      if (partySize > table.capacity) {
        return NextResponse.json(
          { error: 'Party size exceeds table capacity' },
          { status: 400 }
        );
      }

      // Check for conflicting reservations
      const reservationDateTime = new Date(reservationDate);
      const timeSlotStart = new Date(reservationDateTime.getTime() - 60 * 60 * 1000); // 1 hour before
      const timeSlotEnd = new Date(reservationDateTime.getTime() + 2 * 60 * 60 * 1000); // 2 hours after

      const conflictingReservation = await prisma.reservation.findFirst({
        where: {
          tableId,
          status: { in: ['CONFIRMED', 'PENDING'] },
          reservationDate: {
            gte: timeSlotStart,
            lte: timeSlotEnd
          }
        }
      });

      if (conflictingReservation) {
        return NextResponse.json(
          { error: 'Table is not available at the requested time' },
          { status: 409 }
        );
      }
    }

    // Create reservation
    const reservation = await prisma.reservation.create({
      data: {
        restaurantId,
        tableId,
        customerName,
        customerEmail,
        customerPhone,
        partySize,
        reservationDate: new Date(reservationDate),
        specialRequests,
        status: 'PENDING',
        confirmationCode: generateConfirmationCode()
      },
      include: {
        table: {
          select: {
            tableNumber: true,
            tableName: true
          }
        }
      }
    });

    return NextResponse.json({
      success: true,
      message: 'Reservation created successfully',
      reservation
    });

  } catch (error) {
    console.error('Failed to create reservation:', error);
    return NextResponse.json(
      { error: 'Failed to create reservation' },
      { status: 500 }
    );
  }
}

function generateConfirmationCode(): string {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}