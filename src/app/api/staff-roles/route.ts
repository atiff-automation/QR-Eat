import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/database';
import { verifyAuthToken, UserType } from '@/lib/auth';

export async function GET(request: NextRequest) {
  try {
    const authResult = await verifyAuthToken(request);
    
    if (!authResult.isValid || !authResult.user) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    // Only restaurant owners and platform admins can access staff roles
    if (![UserType.RESTAURANT_OWNER, UserType.PLATFORM_ADMIN].includes(authResult.user.type)) {
      return NextResponse.json(
        { error: 'Access denied' },
        { status: 403 }
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