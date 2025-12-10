import { NextRequest, NextResponse } from 'next/server';
import { unlink } from 'fs/promises';
import { join } from 'path';
import { AuthServiceV2 } from '@/lib/rbac/auth-service';

const UPLOAD_DIR = join(process.cwd(), 'public', 'uploads', 'menu-images');

export async function DELETE(
  request: NextRequest,
  { params }: { params: { filename: string } }
) {
  try {
    // Verify authentication using RBAC system
    const token = request.cookies.get('qr_rbac_token')?.value ||
                  request.cookies.get('qr_auth_token')?.value;

    if (!token) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const authResult = await AuthServiceV2.validateToken(token);

    if (!authResult.isValid || !authResult.user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    // Verify user has restaurant access
    const restaurantId = authResult.user.currentRole?.restaurantId;
    if (!restaurantId) {
      return NextResponse.json({ error: 'Restaurant access required' }, { status: 403 });
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