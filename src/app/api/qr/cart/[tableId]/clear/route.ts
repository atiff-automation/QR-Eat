/**
 * QR Cart Clear Endpoint
 *
 * Public endpoint (no authentication required) for clearing all cart items.
 * Clears all items from the customer's session cart.
 *
 * @see CLAUDE.md - Type Safety, Validation, Error Handling
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/database';
import { getCustomerSessionById, getTableSession } from '@/lib/table-session';
import { z } from 'zod';

// ============================================================================
// API Handler
// ============================================================================

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ tableId: string }> }
) {
  try {
    const { tableId } = await params;
    const { searchParams } = new URL(request.url);
    const sessionId = searchParams.get('sessionId');

    // Validate tableId
    const validTableId = z
      .string()
      .uuid('Invalid table ID format')
      .parse(tableId);

    console.log(
      '[clearCart] Clearing cart for tableId:',
      validTableId,
      'sessionId:',
      sessionId
    );

    // Get session (prefer sessionId if provided, otherwise get table session)
    let session = null;

    if (sessionId) {
      session = await getCustomerSessionById(sessionId);
      console.log('[clearCart] Found session by ID:', session?.id || 'NULL');
    }

    if (!session) {
      session = await getTableSession(validTableId);
      console.log('[clearCart] Found session by table:', session?.id || 'NULL');
    }

    if (!session) {
      return NextResponse.json(
        { error: 'No active session found' },
        { status: 404 }
      );
    }

    // Delete all cart items for this session
    const result = await prisma.cartItem.deleteMany({
      where: { customerSessionId: session.id },
    });

    console.log('[clearCart] Deleted', result.count, 'cart items');

    return NextResponse.json({
      success: true,
      message: 'Cart cleared successfully',
      deletedCount: result.count,
    });
  } catch (error) {
    console.error('Clear cart error:', error);

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
