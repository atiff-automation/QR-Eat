import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/database';
import { AuthServiceV2 } from '@/lib/rbac/auth-service';

export async function GET(request: NextRequest) {
  try {
    // 1. Authenticate Request (Basic check to ensure they are logged in)
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
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const restaurantId =
      authResult.user.restaurantId || authResult.user.currentRole?.restaurantId;
    if (!restaurantId) {
      return NextResponse.json(
        { error: 'No active restaurant context' },
        { status: 400 }
      );
    }

    // 2. Fetch Categories
    // We only need the ID and Name for the filter UI
    const categories = await prisma.menuCategory.findMany({
      where: {
        restaurantId: restaurantId,
        isActive: true, // Only show active categories
      },
      select: {
        id: true,
        name: true,
      },
      orderBy: {
        sortOrder: 'asc',
      },
    });

    return NextResponse.json({
      success: true,
      categories,
    });
  } catch (error) {
    console.error('Failed to fetch kitchen categories:', error);
    return NextResponse.json(
      { error: 'Failed to fetch categories' },
      { status: 500 }
    );
  }
}
