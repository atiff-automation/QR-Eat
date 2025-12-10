import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/database';
import { AuthServiceV2 } from '@/lib/auth/AuthServiceV2';
import { PERMISSION_GROUPS } from '@/lib/constants/permissions';

export async function GET(request: NextRequest) {
  try {
    // Authenticate and authorize using modern AuthServiceV2
    const authResult = await AuthServiceV2.validateToken(request, {
      requiredPermissions: [PERMISSION_GROUPS.STAFF.VIEW_STAFF]
    });

    if (!authResult.success || !authResult.user) {
      return NextResponse.json(
        { error: authResult.error || 'Authentication required' },
        { status: authResult.statusCode || 401 }
      );
    }

    // Fetch all staff roles
    const roles = await prisma.staffRole.findMany({
      orderBy: {
        name: 'asc'
      },
      select: {
        id: true,
        name: true,
        description: true,
        permissions: true
      }
    });

    return NextResponse.json({
      success: true,
      roles
    });

  } catch (error) {
    console.error('Failed to fetch staff roles:', error);
    return NextResponse.json(
      { 
        error: 'Failed to fetch staff roles',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
      },
      { status: 500 }
    );
  }
}