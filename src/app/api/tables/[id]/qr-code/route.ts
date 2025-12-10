import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/database';
import { AuthServiceV2 } from '@/lib/rbac/auth-service';
import { generateQRCodeImage, generateQRCodeSVG } from '@/lib/qr-utils';
import { buildQrCodeUrl } from '@/lib/url-config';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
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

    if (!authResult.isValid || !authResult.payload) {
      return NextResponse.json(
        { error: 'Invalid or expired token' },
        { status: 401 }
      );
    }

    const { id: tableId } = await params;
    const searchParams = request.nextUrl.searchParams;
    const format = searchParams.get('format') || 'image'; // 'image' or 'svg'
    const download = searchParams.get('download') === 'true';

    // Get the table
    const table = await prisma.table.findUnique({
      where: { id: tableId },
      include: {
        restaurant: true,
      },
    });

    if (!table) {
      return NextResponse.json({ error: 'Table not found' }, { status: 404 });
    }

    // Check if user has permission to access this table
    const userType = authResult.payload.currentRole.userType;
    const userId = authResult.payload.userId;
    const userRestaurantId = authResult.payload.currentRole.restaurantId;
    let hasPermission = false;

    console.log('QR Code Permission Debug:', {
      userType,
      userId,
      userRestaurantId,
      tableId: table.id,
      tableRestaurantId: table.restaurantId,
      restaurantOwnerId: table.restaurant.ownerId,
    });

    if (userType === 'platform_admin') {
      hasPermission = true;
    } else if (userType === 'staff') {
      hasPermission = userRestaurantId === table.restaurantId;
    } else if (userType === 'restaurant_owner') {
      // Check if the restaurant belongs to this owner
      hasPermission = table.restaurant.ownerId === userId;
    }

    console.log('QR Code Permission Result:', { hasPermission });

    if (!hasPermission) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    // Generate QR code URL using centralized configuration
    const qrUrl = buildQrCodeUrl(table.qrCodeToken, request);

    if (format === 'svg') {
      // Generate SVG QR code
      const qrCodeSVG = await generateQRCodeSVG(qrUrl);

      const headers = new Headers({
        'Content-Type': 'image/svg+xml',
      });

      if (download) {
        headers.set(
          'Content-Disposition',
          `attachment; filename="table-${table.tableNumber}-qr.svg"`
        );
      }

      return new Response(qrCodeSVG, { headers });
    } else {
      // Generate PNG QR code (base64 data URL)
      const qrCodeDataURL = await generateQRCodeImage(qrUrl);

      if (download) {
        // Convert data URL to blob for download
        const base64Data = qrCodeDataURL.split(',')[1];
        const buffer = Buffer.from(base64Data, 'base64');

        return new Response(buffer, {
          headers: {
            'Content-Type': 'image/png',
            'Content-Disposition': `attachment; filename="table-${table.tableNumber}-qr.png"`,
          },
        });
      } else {
        // Return JSON with data URL for display
        return NextResponse.json({
          success: true,
          qrCode: qrCodeDataURL,
          qrUrl,
          table: {
            id: table.id,
            tableNumber: table.tableNumber,
            tableName: table.tableName,
            restaurant: table.restaurant.name,
          },
        });
      }
    }
  } catch (error) {
    console.error('Failed to generate QR code:', error);
    return NextResponse.json(
      { error: 'Failed to generate QR code' },
      { status: 500 }
    );
  }
}
