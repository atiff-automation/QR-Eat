import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/database';
import { requireAuth } from '@/lib/rbac/middleware';
import { STAFF_PERMISSIONS } from '@/lib/rbac/permission-constants';

export async function GET(request: NextRequest) {
  try {
    // Authenticate and authorize using RBAC middleware
    const auth = await requireAuth(request, [STAFF_PERMISSIONS.READ]);

    if (!auth.success) {
      return NextResponse.json(
        { error: auth.error || 'Authentication required' },
        { status: auth.statusCode || 401 }
      );
    }

    // Fetch all staff roles
    const roles = await prisma.staffRole.findMany({
      orderBy: {
        name: 'asc',
      },
      select: {
        id: true,
        name: true,
        description: true,
        permissions: true,
      },
    });

    return NextResponse.json({
      success: true,
      roles,
    });
  } catch (error) {
    console.error('Failed to fetch staff roles:', error);
    return NextResponse.json(
      {
        error: 'Failed to fetch staff roles',
        details:
          process.env.NODE_ENV === 'development' ? error.message : undefined,
      },
      { status: 500 }
    );
  }
}
