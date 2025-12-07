/**
 * QR Cart Item Update/Delete Endpoint
 *
 * Public endpoint (no authentication required) for updating or removing cart items.
 * PATCH: Update cart item quantity or special instructions
 * DELETE: Remove item from cart
 *
 * @see CLAUDE.md - Type Safety, Validation, Error Handling
 */

import { NextRequest, NextResponse } from 'next/server';
import { updateCartItem, removeFromCart } from '@/lib/table-session';
import { z } from 'zod';
import { CART_LIMITS } from '@/lib/session-constants';

// ============================================================================
// Validation Schema
// ============================================================================

const UpdateCartItemSchema = z.object({
  quantity: z
    .number()
    .int()
    .min(
      CART_LIMITS.MIN_QUANTITY,
      `Minimum quantity is ${CART_LIMITS.MIN_QUANTITY}`
    )
    .max(
      CART_LIMITS.MAX_QUANTITY_PER_ITEM,
      `Maximum quantity per item is ${CART_LIMITS.MAX_QUANTITY_PER_ITEM}`
    ),
  specialInstructions: z
    .string()
    .max(500, 'Special instructions too long')
    .optional(),
});

// ============================================================================
// API Handlers
// ============================================================================

export async function PATCH(
  request: NextRequest,
  { params }: { params: { itemId: string } }
) {
  try {
    // Validate itemId
    const validatedItemId = z
      .string()
      .uuid('Invalid cart item ID format')
      .parse(params.itemId);

    // Parse and validate request body
    const body = await request.json();
    const validatedData = UpdateCartItemSchema.parse(body);

    // Update cart item
    const cartItem = await updateCartItem({
      cartItemId: validatedItemId,
      ...validatedData,
    });

    return NextResponse.json({
      success: true,
      cartItem,
      message: 'Cart item updated successfully',
    });
  } catch (error) {
    console.error('QR cart update item error:', error);

    // Handle validation errors
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          error: 'Invalid request data',
          details: error.issues.map((e) => `${e.path.join('.')}: ${e.message}`),
        },
        { status: 400 }
      );
    }

    // Handle known errors
    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    // Handle unknown errors
    return NextResponse.json(
      { error: 'Failed to update cart item' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { itemId: string } }
) {
  try {
    // Validate itemId
    const validatedItemId = z
      .string()
      .uuid('Invalid cart item ID format')
      .parse(params.itemId);

    // Remove cart item
    await removeFromCart(validatedItemId);

    return NextResponse.json({
      success: true,
      message: 'Cart item removed successfully',
    });
  } catch (error) {
    console.error('QR cart remove item error:', error);

    // Handle validation errors
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          error: 'Invalid cart item ID',
          details: error.issues.map((e) => `${e.path.join('.')}: ${e.message}`),
        },
        { status: 400 }
      );
    }

    // Handle known errors
    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    // Handle unknown errors
    return NextResponse.json(
      { error: 'Failed to remove cart item' },
      { status: 500 }
    );
  }
}
