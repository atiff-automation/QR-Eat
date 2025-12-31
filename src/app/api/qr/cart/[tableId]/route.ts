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
  { params }: { params: Promise<{ tableId: string }> }
) {
  try {
    const { tableId } = await params;

    // Get sessionId from query params
    const { searchParams } = new URL(request.url);
    const sessionId = searchParams.get('sessionId') || undefined;

    // Validate tableId
    const validatedTableId = z
      .string()
      .uuid('Invalid table ID format')
      .parse(tableId);

    // Get table cart (resume session if ID provided)
    const cart = await getTableCart(validatedTableId, sessionId);

    return NextResponse.json({
      success: true,
      cart: {
        sessionId: cart.sessionId, // Persist this to client
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
          details: error.issues.map((e) => `${e.path.join('.')}: ${e.message}`),
        },
        { status: 400 }
      );
    }

    // Handle unknown errors
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error occurred';
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
