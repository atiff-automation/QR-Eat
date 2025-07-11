import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyAuthToken } from '@/lib/auth';
import { generateQRCodeImage, generateQRCodeSVG } from '@/lib/qr-utils';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
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

    const { id: tableId } = await params;
    const searchParams = request.nextUrl.searchParams;
    const format = searchParams.get('format') || 'image'; // 'image' or 'svg'
    const download = searchParams.get('download') === 'true';

    // Get the table
    const table = await prisma.table.findUnique({
      where: { id: tableId },
      include: {
        restaurant: true
      }
    });

    if (!table) {
      return NextResponse.json(
        { error: 'Table not found' },
        { status: 404 }
      );
    }

    // Check if staff has permission to access this table
    if (table.restaurantId !== authResult.staff.restaurantId) {
      return NextResponse.json(
        { error: 'Access denied' },
        { status: 403 }
      );
    }

    // Generate QR code URL
    const baseUrl = request.headers.get('origin') || process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
    const qrUrl = `${baseUrl}/qr/${table.qrCodeToken}`;

    if (format === 'svg') {
      // Generate SVG QR code
      const qrCodeSVG = await generateQRCodeSVG(qrUrl);
      
      const headers = new Headers({
        'Content-Type': 'image/svg+xml',
      });
      
      if (download) {
        headers.set('Content-Disposition', `attachment; filename="table-${table.tableNumber}-qr.svg"`);
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
            'Content-Disposition': `attachment; filename="table-${table.tableNumber}-qr.png"`
          }
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
            restaurant: table.restaurant.name
          }
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