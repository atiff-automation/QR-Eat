import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/database';
import {
  getTenantContext,
  requireAuth,
  requirePermission,
} from '@/lib/tenant-context';
import { requireOrderAccess } from '@/lib/rbac/resource-auth';
import { autoUpdateTableStatus } from '@/lib/table-status-manager';

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

      // ✅ NEW: Update table status atomically using the single source of truth
      // This handles "Served" checks and re-verifies if table should be cleared
      // It runs INSIDE the transaction to prevent race conditions
      await autoUpdateTableStatus(order.tableId, tx);

      return { order };
    });

    return NextResponse.json(result);
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

    // ✅ NEW: Validate resource access (IDOR protection)
    await requireOrderAccess(orderId, context!);

    // Import validation schema dynamically to avoid circular deps
    const { CancelOrderSchema } = await import(
      '@/lib/validation/order-modification-schemas'
    );

    const body = await request.json();
    const data = CancelOrderSchema.parse(body);

    const result = await prisma.$transaction(
      async (tx) => {
        // 1. Fetch order with payments
        const order = await tx.order.findUnique({
          where: { id: orderId },
          include: { payments: { where: { status: 'PAID' } } },
        });

        if (!order) {
          throw new Error('Order not found');
        }

        // 2. Check if cancellation is allowed (includes permission check)
        const { canCancelOrder } = await import('@/lib/refund-utils');

        const cancellationCheck = canCancelOrder(
          order,
          context!.userType,
          context!.roleTemplate
        );
        if (!cancellationCheck.allowed) {
          throw new Error(cancellationCheck.reason!);
        }

        // 3. Check version (optimistic locking)
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
          return { isDuplicate: true, refundAmount: 0 };
        }

        // 5. Calculate refund (always full refund if paid)
        const { calculateRefundAmount } = await import('@/lib/refund-utils');
        const refundAmount = calculateRefundAmount(order);

        // 6. Process refund if needed
        if (refundAmount > 0 && order.payments.length > 0) {
          const originalPayment = order.payments[0];

          // Generate sequential receipt number for refund
          const { SequenceManager } = await import('@/lib/sequence-manager');
          const { number: refundDailySeq, formatted: refundReceiptNumber } =
            await SequenceManager.getNextReceipt(order.restaurantId);

          // Create refund payment record (negative amount for full refund)
          await tx.payment.create({
            data: {
              orderId: order.id,
              paymentMethod: originalPayment.paymentMethod,
              amount: -refundAmount,
              processingFee: 0,
              netAmount: -refundAmount,
              status: 'PAID',
              processedBy: context!.userId,
              processedByType: context!.userType,
              receiptNumber: refundReceiptNumber,
              dailySeq: refundDailySeq,
              paymentMetadata: {
                refundReason: data.reason,
                refundNotes: data.reasonNotes,
                originalPaymentId: originalPayment.id,
                refundType: 'full',
                orderStatusAtCancellation: order.status,
              },
              processedAt: new Date(),
              completedAt: new Date(),
              // Add FK based on user type
              ...(context!.userType === 'platform_admin'
                ? { processedByAdminId: context!.userId }
                : context!.userType === 'restaurant_owner'
                  ? { processedByOwnerId: context!.userId }
                  : { processedByStaffId: context!.userId }),
            },
          });
        }

        // 7. Create cancellation record
        await tx.orderModification.create({
          data: {
            order: { connect: { id: orderId } },
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

        // 8. Update order status and payment status
        // 8. Update order status and payment status
        await tx.order.update({
          where: { id: orderId },
          data: {
            status: 'CANCELLED',
            paymentStatus: refundAmount > 0 ? 'REFUNDED' : order.paymentStatus,
            version: { increment: 1 },
            lastModifiedAt: new Date(),
          },
        });

        // 9. ✅ NEW: Auto-update table status within transaction
        // This ensures if this was the last active order, the table becomes AVAILABLE
        await autoUpdateTableStatus(order.tableId, tx);

        return {
          isDuplicate: false,
          refundAmount,
        };
      },
      {
        maxWait: 5000,
        timeout: 10000,
      }
    );

    // Get refund message
    const { getRefundMessage: getRefundMessageAfterTransaction } = await import(
      '@/lib/refund-utils'
    );
    const order = await prisma.order.findUnique({ where: { id: orderId } });

    return NextResponse.json({
      success: true,
      message: 'Order cancelled successfully',
      refundAmount: result.refundAmount,
      refundMessage: order
        ? getRefundMessageAfterTransaction(order)
        : 'Order cancelled successfully.',
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
