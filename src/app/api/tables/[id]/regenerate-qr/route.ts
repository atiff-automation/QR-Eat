import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/database';
import { AuthServiceV2 } from '@/lib/rbac/auth-service';
import { v4 as uuidv4 } from 'uuid';
import { buildQrCodeUrl } from '@/lib/url-config';

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
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

    if (!authResult.isValid || !authResult.user) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    const tableId = params.id;

    // Get the current table
    const currentTable = await prisma.table.findUnique({
      where: { id: tableId },
      include: {
        restaurant: true,
      },
    });

    if (!currentTable) {
      return NextResponse.json({ error: 'Table not found' }, { status: 404 });
    }

    // Check if user has permission to update this table
    if (
      currentTable.restaurantId !== authResult.user.currentRole.restaurantId
    ) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    // Generate new QR code token
    const newQrCodeToken = uuidv4();

    // Update the table with new QR code token
    const updatedTable = await prisma.table.update({
      where: { id: tableId },
      data: {
        qrCodeToken: newQrCodeToken,
        updatedAt: new Date(),
      },
    });

    // Log the QR code regeneration
    await prisma.auditLog.create({
      data: {
        tableName: 'tables',
        recordId: tableId,
        operation: 'UPDATE',
        oldValues: { qrCodeToken: currentTable.qrCodeToken },
        newValues: { qrCodeToken: newQrCodeToken },
        changedBy: authResult.user.id,
        ipAddress:
          request.headers.get('x-forwarded-for') ||
          request.headers.get('x-real-ip') ||
          'unknown',
      },
    });

    // Generate the new QR URL using centralized configuration
    const qrUrl = buildQrCodeUrl(newQrCodeToken, request);

    return NextResponse.json({
      success: true,
      table: updatedTable,
      qrUrl,
      message: 'QR code regenerated successfully',
    });
  } catch (error) {
    console.error('Failed to regenerate QR code:', error);
    return NextResponse.json(
      { error: 'Failed to regenerate QR code' },
      { status: 500 }
    );
  }
}
