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
import { calculateOrderTotals, PAYMENT_STATUS } from '@/lib/order-utils';
import { requireOrderAccess } from '@/lib/rbac/resource-auth';
import {
  acquireOrderModificationLocks,
  reapplyPromotionForModifiedOrder,
} from '@/lib/services/loyalty-order-modify-service';

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
              include: {
                menuItem: true,
                selectedOptions: true, // Include options for context
              },
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

        // 3. Safe v1 boundary: only PENDING orders can be modified. After the
        // kitchen has a ticket, cancel and re-order rather than silently
        // changing an item the kitchen may already be preparing.
        if (order.status !== 'PENDING') {
          throw new Error(
            'Cannot modify order after it has been confirmed. Cancel and re-order instead.'
          );
        }

        // 4. Block modifications to paid orders
        if (order.paymentStatus === PAYMENT_STATUS.PAID) {
          throw new Error(
            'Cannot modify paid orders. Please contact staff to process a refund first.'
          );
        }

        // 4. Check version (optimistic locking) is repeated on the row re-read
        // under the bill lock below, so a concurrent modification cannot be
        // overwritten between this read and the lock.

        // 5. Check idempotency (fast path, before taking the bill lock). A
        // concurrent duplicate that loses the lock race is re-checked under the
        // lock below, so it replays instead of failing the version guard.
        const findReplayedModification = async () => {
          const existingModification = await tx.orderModification.findUnique({
            where: { idempotencyKey: data.idempotencyKey },
          });

          if (!existingModification) return null;

          // Already processed, return cached result
          const cachedOrder = await tx.order.findUnique({
            where: { id: orderId },
            include: {
              items: { include: { menuItem: true, selectedOptions: true } },
            },
          });

          return {
            order: cachedOrder,
            modification: existingModification,
            isDuplicate: true,
            refundNeeded: null,
          };
        };

        const replayedModification = await findReplayedModification();
        if (replayedModification) return replayedModification;

        // 6. Take the same locks as the bill read and payment before changing
        // the bill: customer/day first, then bill/order (§18.20.14 F/I).
        const now = new Date();
        const session = order.diningSessionId
          ? await tx.diningSession.findFirst({
              where: {
                id: order.diningSessionId,
                restaurantId: order.restaurantId,
              },
              select: { id: true, customerId: true },
            })
          : null;

        await acquireOrderModificationLocks(tx, {
          restaurantId: order.restaurantId,
          orderId,
          diningSessionId: session?.id ?? null,
          customerId: session ? session.customerId : (order.customerId ?? null),
          now,
        });

        // 6b. Re-check the idempotency record under the lock (F-5). A
        // concurrent duplicate that committed while this request waited must
        // replay the stored result, not fail the stale-version guard with 409.
        const lockedReplay = await findReplayedModification();
        if (lockedReplay) return lockedReplay;

        // Re-read under the lock. The optimistic version and the paid/status
        // guards are enforced against this row, not the pre-lock read.
        const lockedOrder = await tx.order.findUnique({
          where: { id: orderId },
          include: {
            items: {
              include: { menuItem: true, selectedOptions: true },
            },
          },
        });

        if (!lockedOrder) {
          throw new Error('Order not found');
        }

        if (lockedOrder.paymentStatus === PAYMENT_STATUS.PAID) {
          throw new Error(
            'Cannot modify paid orders. Please contact staff to process a refund first.'
          );
        }

        if (lockedOrder.status !== 'PENDING') {
          throw new Error(
            'Cannot modify order after it has been confirmed. Cancel and re-order instead.'
          );
        }

        if (lockedOrder.version !== data.version) {
          throw new Error(
            'Order was modified by another user. Please refresh and try again.'
          );
        }

        // 7. Apply item changes
        const modificationItems = [];
        for (const change of data.itemChanges) {
          const item = lockedOrder.items.find((i) => i.id === change.itemId);
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

            // Trusting existing unitPrice (which includes options)
            const newTotal = Number(item.unitPrice) * change.newQuantity;

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

        // 8. Recalculate order totals
        const updatedItems = await tx.orderItem.findMany({
          where: { orderId },
          include: { menuItem: true, selectedOptions: true },
        });

        if (updatedItems.length === 0) {
          throw new Error(
            'Cannot remove all items from order. Please cancel the order instead.'
          );
        }

        // Calculate tax and service charge rates from original order
        // STRICT MODE: Use snapshots only. Do not guess.
        let taxRate = 0;
        let serviceChargeRate = 0;

        if (
          lockedOrder.taxRateSnapshot !== null &&
          lockedOrder.serviceChargeRateSnapshot !== null
        ) {
          taxRate = Number(lockedOrder.taxRateSnapshot);
          serviceChargeRate = Number(lockedOrder.serviceChargeRateSnapshot);
        } else {
          // STRICT LEGACY POLICY: If snapshots are missing on a fresh system, something is wrong.
          // We intentionally fail here to prevent "Guess Mode" financial errors.
          throw new Error(
            `Modification Failed: Order ${lockedOrder.orderNumber} is missing tax/service rate snapshots. Cannot safely recalculate totals.`
          );
        }

        // A loyalty-active restaurant re-evaluates the promotion against the
        // new contents and refreshes the ACTIVE `OrderDiscount` ledger under the
        // lock (§18.20.14 I). The flag-off path keeps the legacy calculation
        // exactly and never touches the ledger.
        const loyaltyPricing = await reapplyPromotionForModifiedOrder(tx, {
          restaurantId: lockedOrder.restaurantId,
          orderId,
          diningSessionId: lockedOrder.diningSessionId,
          items: updatedItems.map((item) => ({
            menuItemId: item.menuItemId,
            totalAmount: item.totalAmount,
            menuItem: {
              name: item.menuItem.name,
              categoryId: item.menuItem.categoryId,
            },
          })),
          taxRate: lockedOrder.taxRateSnapshot,
          serviceRate: lockedOrder.serviceChargeRateSnapshot,
          actorId: context!.userId,
          actorType: context!.userType,
          now,
        });

        const totals = loyaltyPricing
          ? {
              subtotal: loyaltyPricing.subtotal,
              taxAmount: loyaltyPricing.taxAmount,
              serviceCharge: loyaltyPricing.serviceCharge,
              totalAmount: loyaltyPricing.totalAmount,
            }
          : calculateOrderTotals(
              updatedItems.map((item) => ({
                ...item,
                menuItem: {
                  ...item.menuItem,
                  price: Number(item.menuItem.price),
                },
                totalPrice: Number(item.totalAmount), // Map totalAmount to totalPrice for calculateOrderTotals
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
              })) as any,
              taxRate,
              serviceChargeRate
            );

        // 9. Create modification record
        const modification = await tx.orderModification.create({
          data: {
            order: { connect: { id: orderId } }, // Explicit connection
            modifiedBy: context!.userId,
            reason: data.reason,
            reasonNotes: data.reasonNotes,
            oldTotal: lockedOrder.totalAmount,
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

        // 10. Update order with new totals and increment version. On the
        // loyalty path the ACTIVE ledger and the bill revision moved in the
        // same transaction; `discountVersion` is the order-level price lock.
        const updatedOrder = await tx.order.update({
          where: { id: orderId },
          data: {
            subtotalAmount: totals.subtotal,
            taxAmount: totals.taxAmount,
            serviceCharge: totals.serviceCharge,
            totalAmount: totals.totalAmount,
            ...(loyaltyPricing
              ? {
                  discountAmount: loyaltyPricing.discountAmount,
                  discountSource: loyaltyPricing.discountSource,
                  discountLabel: loyaltyPricing.discountLabel,
                  discountVersion: { increment: 1 },
                }
              : {}),
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

        // 11. Paid orders are blocked above; a modification never needs a
        // refund here. Keep the response shape stable for existing clients.
        const refundNeeded = null;

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
    console.error('Error details:', {
      message: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
    });

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
