import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/database';
import { generateQRCodeImage, generateQRCodeSVG } from '@/lib/qr-utils';
import { buildQrCodeUrl } from '@/lib/url-config';
import {
  getTenantContext,
  requireAuth,
  requirePermission,
} from '@/lib/tenant-context';
import { requireTableAccess } from '@/lib/rbac/resource-auth';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: tableId } = await params;

    const context = await getTenantContext(request);
    requireAuth(context);
    requirePermission(context!, 'tables', 'read');

    // ✅ NEW: Validate resource access (IDOR protection)
    await requireTableAccess(tableId, context!);

    const searchParams = request.nextUrl.searchParams;
    const format = searchParams.get('format') || 'image'; // 'image' or 'svg'
    const download = searchParams.get('download') === 'true';

    // Get the table
    const table = await prisma.table.findUnique({
      where: { id: tableId },
    });

    if (!table) {
      return NextResponse.json({ error: 'Table not found' }, { status: 404 });
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
