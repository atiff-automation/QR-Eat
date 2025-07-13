import { NextRequest, NextResponse } from 'next/server';
import { unlink } from 'fs/promises';
import { join } from 'path';
import { verifyAuthToken } from '@/lib/auth';

const UPLOAD_DIR = join(process.cwd(), 'public', 'uploads', 'menu-images');

export async function DELETE(
  request: NextRequest,
  { params }: { params: { filename: string } }
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

    // Check permissions
    const hasMenuPermission = authResult.staff.role.permissions.menu?.includes('write');
    if (!hasMenuPermission) {
      return NextResponse.json(
        { error: 'Insufficient permissions' },
        { status: 403 }
      );
    }

    const filename = params.filename;
    
    // Security: Ensure filename doesn't contain path traversal
    if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
      return NextResponse.json(
        { error: 'Invalid filename' },
        { status: 400 }
      );
    }

    const filepath = join(UPLOAD_DIR, filename);

    try {
      await unlink(filepath);
      return NextResponse.json({
        success: true,
        message: 'Image deleted successfully'
      });
    } catch {
      // File might not exist
      return NextResponse.json(
        { error: 'Image not found' },
        { status: 404 }
      );
    }

  } catch (error) {
    console.error('Image deletion error:', error);
    return NextResponse.json(
      { error: 'Failed to delete image' },
      { status: 500 }
    );
  }
}