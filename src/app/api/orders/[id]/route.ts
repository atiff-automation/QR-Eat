import { NextRequest, NextResponse } from 'next/server';
import { handleOrderAdjustmentRequest } from '@/lib/orders/order-adjustment-http';
import { prisma } from '@/lib/database';
import {
  getTenantContext,
  requireAuth,
  requirePermission,
} from '@/lib/tenant-context';
import { requireOrderAccess } from '@/lib/rbac/resource-auth';
import { autoUpdateTableStatus } from '@/lib/table-status-manager';
import { RBACError } from '@/lib/rbac/types';
import { getOrderAdjustmentPolicy } from '@/lib/orders/order-adjustment-policy';
import { isOrderBusinessDayClosed } from '@/lib/orders/order-business-day';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const context = await getTenantContext(request);
    requireAuth(context);
    requirePermission(context!, 'orders', 'read');

    const { id: orderId } = await params;

    // ✅ NEW: Validate resource access (IDOR protection)
    await requireOrderAccess(orderId, context!);

    // Single optimized query with all relations including modifications
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: {
        table: {
          select: {
            tableNumber: true,
            tableName: true,
            restaurant: {
              select: {
                taxLabel: true,
                serviceChargeLabel: true,
              },
            },
          },
        },
        customerSession: {
          select: {
            customerName: true,
            customerPhone: true,
          },
        },
        items: {
          include: {
            menuItem: {
              select: {
                id: true,
                name: true,
                description: true,
                price: true,
                preparationTime: true,
              },
            },
            selectedOptions: {
              select: {
                id: true,
                name: true,
                priceModifier: true,
              },
            },
          },
          orderBy: { createdAt: 'asc' },
        },
        modifications: {
          include: {
            items: {
              include: {
                menuItem: {
                  select: {
                    id: true,
                    name: true,
                  },
                },
              },
            },
            // Note: modifiedByUser relation removed - modifiedBy is just a string ID
          },
          orderBy: { modifiedAt: 'desc' },
        },
        payments: {
          select: {
            id: true,
            paymentMethod: true,
            amount: true,
            status: true,
            receiptNumber: true,
            cashReceived: true,
            changeGiven: true,
            createdAt: true,
            completedAt: true,
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    // Fetch user details for modifications
    // Since modifiedBy can be platform_admin, restaurant_owner, or staff, we need to check all tables
    const modificationsWithUsers = await Promise.all(
      order.modifications.map(async (mod) => {
        if (!mod.modifiedBy) {
          return {
            ...mod,
            modifiedByUser: { name: 'System', email: null },
          };
        }

        console.log('Looking up user:', mod.modifiedBy);

        // Try to find user in Staff table first
        let user = await prisma.staff.findUnique({
          where: { id: mod.modifiedBy },
          select: { firstName: true, lastName: true, email: true },
        });

        if (user) {
          console.log('Found in Staff table:', user);
          return {
            ...mod,
            modifiedByUser: {
              name: `${user.firstName} ${user.lastName}`,
              email: user.email,
            },
          };
        }

        // Try RestaurantOwner table
        user = await prisma.restaurantOwner.findUnique({
          where: { id: mod.modifiedBy },
          select: { firstName: true, lastName: true, email: true },
        });

        if (user) {
          console.log('Found in RestaurantOwner table:', user);
          return {
            ...mod,
            modifiedByUser: {
              name: `${user.firstName} ${user.lastName}`,
              email: user.email,
            },
          };
        }

        // Try PlatformAdmin table
        user = await prisma.platformAdmin.findUnique({
          where: { id: mod.modifiedBy },
          select: { firstName: true, lastName: true, email: true },
        });

        if (user) {
          console.log('Found in PlatformAdmin table:', user);
          return {
            ...mod,
            modifiedByUser: {
              name: `${user.firstName} ${user.lastName}`,
              email: user.email,
            },
          };
        }

        // User not found in any table
        console.log('User not found in any table:', mod.modifiedBy);
        return {
          ...mod,
          modifiedByUser: { name: 'Unknown User', email: null },
        };
      })
    );

    const businessDayClosed = await isOrderBusinessDayClosed(
      order.restaurantId,
      order.createdAt
    );
    const adjustment = getOrderAdjustmentPolicy({
      status: order.status,
      paymentStatus: order.paymentStatus,
      orderType: order.orderType,
      businessDayClosed,
      userType: context!.userType,
      roleTemplate: context!.roleTemplate,
      permissions: context!.permissions,
    });

    return NextResponse.json({
      success: true,
      adjustment,
      order: {
        ...order,
        modifications: modificationsWithUsers,
      },
    });
  } catch (error) {
    console.error('Order fetch error:', error);

    if (error instanceof RBACError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.statusCode }
      );
    }

    if (error instanceof Error && error.message.includes('Permission denied')) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }

    return NextResponse.json(
      { error: 'Failed to fetch order' },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Require authentication for PATCH operations (staff only)
    const context = await getTenantContext(request);
    requireAuth(context);
    requirePermission(context!, 'orders', 'write');

    const { id: orderId } = await params;

    // ✅ NEW: Validate resource access (IDOR protection)
    await requireOrderAccess(orderId, context!);
    const { status, estimatedReadyTime } = await request.json();

    if (!status) {
      return NextResponse.json(
        { error: 'Status is required' },
        { status: 400 }
      );
    }

    // Update order status
    const updateData: Record<string, string | Date> = {
      status,
      updatedAt: new Date(),
    };

    // Set timestamps based on status
    if (status === 'CONFIRMED' && !updateData.confirmedAt) {
      updateData.confirmedAt = new Date();
    } else if (status === 'READY' && !updateData.readyAt) {
      updateData.readyAt = new Date();
    } else if (status === 'SERVED' && !updateData.servedAt) {
      updateData.servedAt = new Date();
    }

    if (estimatedReadyTime) {
      updateData.estimatedReadyTime = new Date(estimatedReadyTime);
    }

    const result = await prisma.$transaction(async (tx) => {
      const order = await tx.order.update({
        where: { id: orderId },
        data: updateData,
        include: {
          table: {
            select: {
              tableNumber: true,
              tableName: true,
            },
          },
          items: {
            include: {
              menuItem: {
                select: {
                  name: true,
                  description: true,
                  preparationTime: true,
                },
              },
              selectedOptions: {
                select: {
                  id: true,
                  name: true,
                  priceModifier: true,
                },
              },
            },
          },
        },
      });

      // ✅ NEW: Update table status atomically using the single source of truth
      // This handles "Served" checks and re-verifies if table should be cleared
      // It runs INSIDE the transaction to prevent race conditions
      await autoUpdateTableStatus(order.tableId, tx);

      return { order };
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error('Order update error:', error);
    if (error instanceof RBACError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.statusCode }
      );
    }
    return NextResponse.json(
      { error: 'Failed to update order' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/orders/[id]
 *
 * Cancel a pre-service order. Served orders must use /void or /refund.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return handleOrderAdjustmentRequest(request, params, 'CANCEL', {
    resource: 'orders',
    action: 'write',
  });
}
