import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyAuthToken } from '@/lib/auth';

export async function GET(request: NextRequest) {
  try {
    const authResult = await verifyAuthToken(request);
    if (!authResult.isValid || !authResult.staff) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    // Kitchen display shows orders in active cooking states
    const orders = await prisma.order.findMany({
      where: {
        restaurantId: authResult.staff.restaurantId,
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