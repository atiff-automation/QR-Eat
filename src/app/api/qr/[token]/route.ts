import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/database';
import { decodeQRToken, isValidTableToken } from '@/lib/qr-utils';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;

    // Try to find table directly by token (for new UUID-based tokens)
    let table = await prisma.table.findUnique({
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

    // If not found by direct token, try legacy encoded format
    if (!table) {
      if (isValidTableToken(token)) {
        const qrData = decodeQRToken(token);
        if (qrData) {
          table = await prisma.table.findFirst({
            where: { 
              id: qrData.tableId,
              restaurant: { slug: qrData.restaurant }
            },
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
        }
      }
    }

    if (!table) {
      return NextResponse.json({ error: 'Invalid or expired QR code' }, { status: 404 });
    }

    if (!table.restaurant.isActive) {
      return NextResponse.json(
        { error: 'Restaurant is currently closed' },
        { status: 503 }
      );
    }

    // Return table info (allow menu viewing regardless of status)
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
      // Include status info for frontend to handle ordering restrictions
      canOrder: table.status === 'available',
      statusMessage: table.status === 'available' 
        ? null 
        : `Table is currently ${table.status}. You can view the menu but cannot place orders at this time.`
    });
  } catch (error) {
    console.error('QR code validation error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
