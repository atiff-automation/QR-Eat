import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/database';
import {
  getTenantContext,
  requireAuth,
  requirePermission,
} from '@/lib/tenant-context';
import {
  ModifyOrderSchema,
  type ModifyOrderInput,
} from '@/lib/validation/order-modification-schemas';
import { calculateOrderTotals } from '@/lib/order-utils';
import { requireOrderAccess } from '@/lib/rbac/resource-auth';

/**
 * PATCH /api/orders/[id]/modify
 *
 * Modify order items with transaction safety and validation.
 *
 * Features:
 * - Database transaction for atomicity
 * - Optimistic locking to prevent concurrent edits
 * - Idempotency to prevent duplicate modifications
 * - Input validation with Zod
 * - RBAC permission check (orders:write)
 * - Comprehensive error handling
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: orderId } = await params;

    // Get tenant context for RBAC checks
    const context = await getTenantContext(request);
    requireAuth(context);
    requirePermission(context!, 'orders', 'write');

    // ✅ NEW: Validate resource access (IDOR protection)
    await requireOrderAccess(orderId, context!);

    // Parse and validate input
    const body = await request.json();
    const data: ModifyOrderInput = ModifyOrderSchema.parse(body);

    // Execute modification in transaction
    const result = await prisma.$transaction(
      async (tx) => {
        // 1. Fetch and lock order
        const order = await tx.order.findUnique({
          where: { id: orderId },
          include: {
            items: {
              include: { menuItem: true },
            },
          },
        });

        if (!order) {
          throw new Error('Order not found');
        }

        // 2. Check if modification is allowed based on status and user role
        const { canModifyOrder } = await import('@/lib/modification-utils');

        for (const change of data.itemChanges) {
          const operation =
            change.action === 'remove' ? 'remove' : 'modify_qty';
          const permissionCheck = canModifyOrder(
            order,
            context!.userType,
            context!.roleTemplate,
            operation
          );

          if (!permissionCheck.allowed) {
            throw new Error(permissionCheck.reason!);
          }
        }

        // 3. Block modifications to paid orders
        if (order.paymentStatus === 'PAID') {
          throw new Error(
            'Cannot modify paid orders. Please contact staff to process a refund first.'
          );
        }

        // 4. Check version (optimistic locking)
        if (order.version !== data.version) {
          throw new Error(
            'Order was modified by another user. Please refresh and try again.'
          );
        }

        // 4. Check idempotency
        const existingModification = await tx.orderModification.findUnique({
          where: { idempotencyKey: data.idempotencyKey },
        });

        if (existingModification) {
          // Already processed, return cached result
          const cachedOrder = await tx.order.findUnique({
            where: { id: orderId },
            include: { items: { include: { menuItem: true } } },
          });

          return {
            order: cachedOrder,
            modification: existingModification,
            isDuplicate: true,
            refundNeeded: null,
          };
        }

        // 5. Apply item changes
        const modificationItems = [];
        for (const change of data.itemChanges) {
          const item = order.items.find((i) => i.id === change.itemId);
          if (!item) {
            throw new Error(`Order item ${change.itemId} not found`);
          }

          if (change.action === 'remove') {
            await tx.orderItem.delete({
              where: { id: change.itemId },
            });

            modificationItems.push({
              orderItemId: null,
              menuItemId: item.menuItemId,
              action: 'removed',
              oldQuantity: item.quantity,
              newQuantity: 0,
              oldPrice: item.totalAmount,
              newPrice: 0,
            });
          } else if (change.action === 'update_quantity') {
            if (!change.newQuantity) {
              throw new Error(
                'newQuantity is required for update_quantity action'
              );
            }

            const newTotal = Number(item.menuItem.price) * change.newQuantity;

            await tx.orderItem.update({
              where: { id: change.itemId },
              data: {
                quantity: change.newQuantity,
                totalAmount: newTotal,
              },
            });

            modificationItems.push({
              orderItemId: item.id,
              menuItemId: item.menuItemId,
              action: 'quantity_changed',
              oldQuantity: item.quantity,
              newQuantity: change.newQuantity,
              oldPrice: item.totalAmount,
              newPrice: newTotal,
            });
          }
        }

        // 6. Recalculate order totals
        const updatedItems = await tx.orderItem.findMany({
          where: { orderId },
          include: { menuItem: true },
        });

        if (updatedItems.length === 0) {
          throw new Error(
            'Cannot remove all items from order. Please cancel the order instead.'
          );
        }

        const totals = calculateOrderTotals(
          updatedItems.map((item) => ({
            ...item,
            menuItem: {
              ...item.menuItem,
              price: Number(item.menuItem.price),
            },
            totalPrice: Number(item.totalAmount),
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
          })) as any,
          0.1, // 10% tax
          0.05 // 5% service charge
        );

        // 7. Create modification record
        const modification = await tx.orderModification.create({
          data: {
            order: { connect: { id: orderId } }, // Explicit connection
            modifiedBy: context!.userId,
            reason: data.reason,
            reasonNotes: data.reasonNotes,
            oldTotal: order.totalAmount,
            newTotal: totals.totalAmount,
            customerNotified: data.customerNotified,
            notifiedAt: data.customerNotified ? new Date() : null,
            idempotencyKey: data.idempotencyKey,
            items: {
              create: modificationItems,
            },
          },
          include: {
            items: {
              include: { menuItem: true },
            },
          },
        });

        // 8. Update order with new totals and increment version
        const updatedOrder = await tx.order.update({
          where: { id: orderId },
          data: {
            subtotalAmount: totals.subtotal,
            taxAmount: totals.taxAmount,
            serviceCharge: totals.serviceCharge,
            totalAmount: totals.totalAmount,
            version: { increment: 1 },
            lastModifiedAt: new Date(),
            hasModifications: true,
            modificationCount: { increment: 1 },
          },
          include: {
            items: {
              include: { menuItem: true },
            },
          },
        });

        // 9. Check if refund needed
        let refundNeeded = null;
        if (
          order.paymentStatus === 'PAID' &&
          totals.totalAmount < Number(order.totalAmount)
        ) {
          refundNeeded = Number(order.totalAmount) - totals.totalAmount;
        }

        return {
          order: updatedOrder,
          modification,
          refundNeeded,
          isDuplicate: false,
        };
      },
      {
        maxWait: 5000, // Wait max 5 seconds for transaction lock
        timeout: 10000, // Transaction timeout 10 seconds
      }
    );

    return NextResponse.json({
      success: true,
      order: result.order,
      modification: result.modification,
      refundNeeded: result.refundNeeded,
      isDuplicate: result.isDuplicate,
    });
  } catch (error) {
    console.error('Failed to modify order:', error);

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

      if (
        error.message.includes('Cannot modify order') ||
        error.message.includes('Cannot remove all items')
      ) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }

      if (error.message.includes('Permission denied')) {
        return NextResponse.json({ error: error.message }, { status: 403 });
      }
    }

    return NextResponse.json(
      { error: 'Failed to modify order' },
      { status: 500 }
    );
  }
}
