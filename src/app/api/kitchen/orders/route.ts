import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/database';
import { AuthServiceV2 } from '@/lib/rbac/auth-service';
import { getTokenFromRequest } from '@/lib/auth-utils';
import { ORDER_WITH_DETAILS_INCLUDE } from '@/lib/order-utils';

export async function GET(request: NextRequest) {
  try {
    console.log('[KITCHEN-ORDERS] Request URL:', request.url);
    console.log(
      '[KITCHEN-ORDERS] Headers:',
      Object.fromEntries(request.headers.entries())
    );

    // Verify authentication using RBAC system
    // Supports both cookie auth (web) and ?token= query param (mobile)
    const token = getTokenFromRequest(request);

    console.log('[KITCHEN-ORDERS] Token extracted:', token ? 'yes' : 'no');
    if (token) {
      console.log(
        '[KITCHEN-ORDERS] Token preview:',
        token.substring(0, 50) + '...'
      );
    }

    if (!token) {
      console.log('[KITCHEN-ORDERS] No token found, returning 401');
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

    // Get restaurant ID from auth result
    const restaurantId = authResult.user.currentRole.restaurantId;

    if (!restaurantId) {
      return NextResponse.json(
        { error: 'Restaurant access required' },
        { status: 403 }
      );
    }

    // Kitchen display shows orders in active cooking states
    const orders = await prisma.order.findMany({
      where: {
        restaurantId: restaurantId,
        status: {
          in: ['CONFIRMED', 'PREPARING', 'READY'],
        },
      },
      include: ORDER_WITH_DETAILS_INCLUDE,
      orderBy: {
        createdAt: 'asc',
      },
    });

    return NextResponse.json({
      success: true,
      orders,
    });
  } catch (error) {
    console.error('Failed to fetch kitchen orders:', error);
    return NextResponse.json(
      { error: 'Failed to fetch kitchen orders' },
      { status: 500 }
    );
  }
}
