import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/database';
import { AuthServiceV2 } from '@/lib/rbac/auth-service';

export async function GET(request: NextRequest) {
  try {
    // Verify authentication using RBAC system
    const token = request.cookies.get('qr_rbac_token')?.value || 
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
          in: ['confirmed', 'preparing', 'ready']
        }
      },
      include: {
        table: {
          select: {
            tableNumber: true,
            tableName: true
          }
        },
        customerSession: {
          select: {
            customerName: true
          }
        },
        items: {
          include: {
            menuItem: {
              select: {
                name: true,
                preparationTime: true
              }
            },
            variations: {
              include: {
                variation: {
                  select: {
                    name: true,
                    variationType: true
                  }
                }
              }
            }
          }
        }
      },
      orderBy: {
        createdAt: 'asc'
      }
    });

    return NextResponse.json({
      success: true,
      orders
    });

  } catch (error) {
    console.error('Failed to fetch kitchen orders:', error);
    return NextResponse.json(
      { error: 'Failed to fetch kitchen orders' },
      { status: 500 }
    );
  }
}