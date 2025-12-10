import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/database';
import { AuthServiceV2 } from '@/lib/rbac/auth-service';
import { generateQRCodeImage } from '@/lib/qr-utils';
import { buildQrCodeUrl } from '@/lib/url-config';

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

    const { tableIds } = await request.json();

    if (!Array.isArray(tableIds) || tableIds.length === 0) {
      return NextResponse.json(
        { error: 'Table IDs array is required' },
        { status: 400 }
      );
    }

    // Get the tables
    const tables = await prisma.table.findMany({
      where: {
        id: { in: tableIds },
        restaurantId: authResult.user.currentRole.restaurantId,
      },
      include: {
        restaurant: true,
      },
    });

    if (tables.length === 0) {
      return NextResponse.json({ error: 'No tables found' }, { status: 404 });
    }

    // Generate QR codes for all tables using centralized configuration
    const qrCodes = await Promise.all(
      tables.map(async (table) => {
        const qrUrl = buildQrCodeUrl(table.qrCodeToken, request);
        const qrCodeImage = await generateQRCodeImage(qrUrl);

        return {
          tableId: table.id,
          tableNumber: table.tableNumber,
          tableName: table.tableName,
          qrCode: qrCodeImage,
          qrUrl,
        };
      })
    );

    // Generate HTML for bulk printing
    const printHTML = generateBulkPrintHTML(tables[0].restaurant.name, qrCodes);

    return NextResponse.json({
      success: true,
      qrCodes,
      printHTML,
    });
  } catch (error) {
    console.error('Failed to generate bulk QR codes:', error);
    return NextResponse.json(
      { error: 'Failed to generate QR codes' },
      { status: 500 }
    );
  }
}

interface QRCodeData {
  tableId: string;
  tableNumber: string;
  tableName: string | null;
  qrCode: string;
  qrUrl: string;
}

function generateBulkPrintHTML(
  restaurantName: string,
  qrCodes: QRCodeData[]
): string {
  return `
    <!DOCTYPE html>
    <html>
      <head>
        <title>QR Codes - ${restaurantName}</title>
        <style>
          body {
            font-family: Arial, sans-serif;
            margin: 0;
            padding: 20px;
          }
          .page {
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 20px;
            page-break-after: always;
          }
          .qr-card {
            border: 2px solid #000;
            padding: 20px;
            text-align: center;
            background: white;
            break-inside: avoid;
          }
          .restaurant-name {
            font-size: 20px;
            font-weight: bold;
            margin-bottom: 10px;
          }
          .table-name {
            font-size: 16px;
            margin-bottom: 15px;
          }
          .qr-code {
            margin: 15px 0;
          }
          .qr-code img {
            width: 150px;
            height: 150px;
          }
          .instructions {
            font-size: 12px;
            color: #666;
            margin-top: 10px;
          }
          @media print {
            body { margin: 0; }
            .page { margin: 0; padding: 10px; }
            .qr-card { margin-bottom: 20px; }
          }
        </style>
      </head>
      <body>
        <div class="page">
          ${qrCodes
            .map(
              (qr) => `
            <div class="qr-card">
              <div class="restaurant-name">${restaurantName}</div>
              <div class="table-name">Table ${qr.tableNumber}${qr.tableName ? ` - ${qr.tableName}` : ''}</div>
              <div class="qr-code">
                <img src="${qr.qrCode}" alt="QR Code" />
              </div>
              <div class="instructions">
                <p><strong>Scan to order:</strong></p>
                <p>Open camera • Point at QR code • Tap notification</p>
              </div>
            </div>
          `
            )
            .join('')}
        </div>
      </body>
    </html>
  `;
}
