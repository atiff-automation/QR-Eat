/**
 * QR Cart Retrieval Endpoint
 *
 * Public endpoint (no authentication required) for getting cart from table session.
 * Returns current cart items for a table's active session.
 *
 * @see CLAUDE.md - Type Safety, Validation, Error Handling
 */

import { NextRequest, NextResponse } from 'next/server';
import { getTableCart } from '@/lib/table-session';
import { z } from 'zod';

// ============================================================================
// API Handler
// ============================================================================

export async function GET(
  request: NextRequest,
  { params }: { params: { tableId: string } }
) {
  try {
    // Validate tableId
    const validatedTableId = z
      .string()
      .uuid('Invalid table ID format')
      .parse(params.tableId);

    // Get table cart
    const cart = await getTableCart(validatedTableId);

    return NextResponse.json({
      success: true,
      cart: {
        items: cart.items,
        totalItems: cart.totalItems,
        totalAmount: cart.totalAmount,
      },
    });
  } catch (error) {
    console.error('QR cart retrieval error:', error);

    // Handle validation errors
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          error: 'Invalid table ID',
          details: error.errors.map((e) => `${e.path.join('.')}: ${e.message}`),
        },
        { status: 400 }
      );
    }

    // Handle known errors
    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Handle unknown errors
    return NextResponse.json(
      { error: 'Failed to retrieve cart' },
      { status: 500 }
    );
  }
}
