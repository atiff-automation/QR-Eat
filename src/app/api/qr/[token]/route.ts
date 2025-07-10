import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/database';
import { decodeQRToken, isValidTableToken } from '@/lib/qr-utils';

export async function GET(
  request: NextRequest,
  { params }: { params: { token: string } }
) {
  try {
    const { token } = params;

    // Validate QR token format and age
    if (!isValidTableToken(token)) {
      return NextResponse.json(
        { error: 'Invalid or expired QR code' },
        { status: 400 }
      );
    }

    // Decode QR token to get table information
    const qrData = decodeQRToken(token);
    if (!qrData) {
      return NextResponse.json(
        { error: 'Invalid QR code format' },
        { status: 400 }
      );
    }

    // Find table by QR token
    const table = await prisma.table.findUnique({
      where: { qrCodeToken: token },
      include: {
        restaurant: {
          select: {
            id: true,
            name: true,
            slug: true,
            address: true,
            phone: true,
            currency: true,
            taxRate: true,
            serviceChargeRate: true,
            isActive: true,
          },
        },
      },
    });

    if (!table) {
      return NextResponse.json({ error: 'Table not found' }, { status: 404 });
    }

    if (!table.restaurant.isActive) {
      return NextResponse.json(
        { error: 'Restaurant is currently closed' },
        { status: 503 }
      );
    }

    // Check table availability
    if (table.status !== 'available') {
      return NextResponse.json(
        { error: 'Table is not available for new orders' },
        { status: 409 }
      );
    }

    return NextResponse.json({
      table: {
        id: table.id,
        tableNumber: table.tableNumber,
        tableName: table.tableName,
        capacity: table.capacity,
        status: table.status,
        locationDescription: table.locationDescription,
        restaurant: table.restaurant,
      },
    });
  } catch (error) {
    console.error('QR code validation error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
