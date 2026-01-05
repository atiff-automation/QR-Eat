import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/database';
import { v4 as uuidv4 } from 'uuid';
import { buildQrCodeUrl } from '@/lib/url-config';
import {
  getTenantContext,
  requireAuth,
  requirePermission,
} from '@/lib/tenant-context';
import { requireTableAccess } from '@/lib/rbac/resource-auth';

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id: tableId } = await params;

    const context = await getTenantContext(request);
    requireAuth(context);
    requirePermission(context!, 'tables', 'write');

    // ✅ NEW: Validate resource access (IDOR protection)
    await requireTableAccess(tableId, context!);

    // Get the current table for logging
    const currentTable = await prisma.table.findUnique({
      where: { id: tableId },
    });

    if (!currentTable) {
      return NextResponse.json({ error: 'Table not found' }, { status: 404 });
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
        changedBy: context!.userId,
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
