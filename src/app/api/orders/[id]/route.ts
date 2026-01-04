import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/database';
import {
  getTenantContext,
  requireAuth,
  requirePermission,
} from '@/lib/tenant-context';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const context = await getTenantContext(request);
    requireAuth(context);
    requirePermission(context!, 'orders', 'read');

    const { id: orderId } = await params;

    // Single optimized query with all relations including modifications
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: {
        table: {
          select: {
            tableNumber: true,
            tableName: true,
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
            variations: {
              include: {
                variation: {
                  select: {
                    name: true,
                    variationType: true,
                  },
                },
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

    return NextResponse.json({
      success: true,
      order: {
        ...order,
        modifications: modificationsWithUsers,
      },
    });
  } catch (error) {
    console.error('Order fetch error:', error);

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

    if (!context?.userId) {
      return NextResponse.json(
        { error: 'Authentication required to update order status' },
        { status: 401 }
      );
    }

    const { id: orderId } = await params;
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

    const order = await prisma.order.update({
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
            variations: {
              include: {
                variation: {
                  select: {
                    name: true,
                    variationType: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    // Update table status if order is completed/cancelled
    if (status === 'SERVED' || status === 'CANCELLED') {
      await prisma.table.update({
        where: { id: order.tableId },
        data: { status: 'AVAILABLE' },
      });
    }

    return NextResponse.json({ order });
  } catch (error) {
    console.error('Order update error:', error);
    return NextResponse.json(
      { error: 'Failed to update order' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/orders/[id]
 *
 * Cancel order with reason tracking and transaction safety.
 *
 * Features:
 * - Database transaction for atomicity
 * - Optimistic locking
 * - Idempotency
 * - RBAC permission check (orders:write)
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const context = await getTenantContext(request);
    requireAuth(context);
    requirePermission(context!, 'orders', 'write');

    const { id: orderId } = await params;

    // Import validation schema dynamically to avoid circular deps
    const { CancelOrderSchema } = await import(
      '@/lib/validation/order-modification-schemas'
    );

    const body = await request.json();
    const data = CancelOrderSchema.parse(body);

    const result = await prisma.$transaction(
      async (tx) => {
        // 1. Fetch order
        const order = await tx.order.findUnique({
          where: { id: orderId },
        });

        if (!order) {
          throw new Error('Order not found');
        }

        // 2. Validate status
        if (!['PENDING', 'CONFIRMED'].includes(order.status)) {
          throw new Error(
            `Cannot cancel order with status: ${order.status}. Only pending or confirmed orders can be cancelled.`
          );
        }

        // 3. Check version
        if (order.version !== data.version) {
          throw new Error(
            'Order was modified by another user. Please refresh and try again.'
          );
        }

        // 4. Check idempotency
        const existing = await tx.orderModification.findUnique({
          where: { idempotencyKey: data.idempotencyKey },
        });

        if (existing) {
          return { isDuplicate: true, refundNeeded: null };
        }

        // 5. Create cancellation record
        await tx.orderModification.create({
          data: {
            order: { connect: { id: orderId } }, // Explicit connection
            modifiedBy: context!.userId,
            reason: data.reason,
            reasonNotes: data.reasonNotes,
            oldTotal: order.totalAmount,
            newTotal: 0,
            customerNotified: data.customerNotified,
            notifiedAt: data.customerNotified ? new Date() : null,
            idempotencyKey: data.idempotencyKey,
          },
        });

        // 6. Update order status
        await tx.order.update({
          where: { id: orderId },
          data: {
            status: 'CANCELLED',
            version: { increment: 1 },
            lastModifiedAt: new Date(),
          },
        });

        // 7. Check refund
        let refundNeeded = null;
        if (order.paymentStatus === 'COMPLETED') {
          refundNeeded = order.totalAmount;
        }

        return { isDuplicate: false, refundNeeded };
      },
      {
        maxWait: 5000,
        timeout: 10000,
      }
    );

    return NextResponse.json({
      success: true,
      message: 'Order cancelled successfully',
      refundNeeded: result.refundNeeded,
      isDuplicate: result.isDuplicate,
    });
  } catch (error) {
    console.error('Failed to cancel order:', error);

    const { z } = await import('zod');

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid input', details: error.issues },
        { status: 400 }
      );
    }

    if (error instanceof Error) {
      if (error.message.includes('modified by another user')) {
        return NextResponse.json({ error: error.message }, { status: 409 });
      }

      if (error.message.includes('Cannot cancel')) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }

      if (error.message.includes('Permission denied')) {
        return NextResponse.json({ error: error.message }, { status: 403 });
      }
    }

    return NextResponse.json(
      { error: 'Failed to cancel order' },
      { status: 500 }
    );
  }
}
