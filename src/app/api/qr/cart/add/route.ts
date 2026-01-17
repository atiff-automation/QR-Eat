/**
 * QR Cart Add Item Endpoint
 *
 * Public endpoint (no authentication required) for adding items to cart.
 * Adds item to table's active session cart with validation.
 *
 * @see CLAUDE.md - Type Safety, Validation, Error Handling
 */

import { NextRequest, NextResponse } from 'next/server';
import { addToTableCart } from '@/lib/table-session';
import { prisma } from '@/lib/database';
import { z } from 'zod';
import { CART_LIMITS } from '@/lib/session-constants';

// ============================================================================
// Validation Schema
// ============================================================================

const AddToCartSchema = z.object({
  tableId: z.string().uuid('Invalid table ID format'),
  sessionId: z.string().uuid('Invalid session ID format').optional(),
  menuItemId: z.string().uuid('Invalid menu item ID format'),
  variationOptionIds: z.array(z.string().uuid()).optional().default([]),
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
  unitPrice: z.number().positive('Price must be positive'),
  specialInstructions: z
    .string()
    .max(500, 'Special instructions too long')
    .optional(),
});

// ============================================================================
// API Handler
// ============================================================================

export async function POST(request: NextRequest) {
  try {
    // Parse and validate request body
    const body = await request.json();
    const validatedData = AddToCartSchema.parse(body);

    // SECURITY: Limit check is handled in table-session
    // AVAILABILITY: Check menu item availability first
    const menuItem = await prisma.menuItem.findUnique({
      where: { id: validatedData.menuItemId },
      select: { isAvailable: true },
    });

    if (!menuItem) {
      return NextResponse.json(
        { error: 'Menu item not found' },
        { status: 404 }
      );
    }

    if (!menuItem.isAvailable) {
      return NextResponse.json(
        { error: 'Menu item is not available' },
        { status: 400 }
      );
    }

    // Add item to cart
    // Logic for price calculation and option validation is now centralized in addToTableCart
    const cartItem = await addToTableCart(validatedData);

    return NextResponse.json({
      success: true,
      cartItem,
      message: 'Item added to cart successfully',
    });
  } catch (error) {
    console.error('QR cart add item error:', error);

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

    // Handle known errors (cart limits, etc.)
    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    // Handle unknown errors
    return NextResponse.json(
      { error: 'Failed to add item to cart' },
      { status: 500 }
    );
  }
}
