/**
 * Table Session Management Utilities
 *
 * Implements table-based session model:
 * - One session per table (shared across all devices)
 * - Server-side cart storage
 * - Session reuse (get or create pattern)
 *
 * @see CLAUDE.md - Single Responsibility, DRY, Type Safety
 */

import { prisma } from '@/lib/database';
import {
  SESSION_STATUS,
  SESSION_DURATION,
  CART_LIMITS,
} from '@/lib/session-constants';
import { randomBytes } from 'crypto';
import { z } from 'zod';

// ============================================================================
// Zod Validation Schemas
// ============================================================================

export const AddToCartSchema = z.object({
  tableId: z.string().uuid(),
  sessionId: z.string().uuid().optional(), // Added for session persistence
  menuItemId: z.string().uuid(),
  variationId: z.string().uuid().optional(),
  quantity: z
    .number()
    .int()
    .min(CART_LIMITS.MIN_QUANTITY)
    .max(CART_LIMITS.MAX_QUANTITY_PER_ITEM),
  unitPrice: z.number().positive(),
  specialInstructions: z.string().max(500).optional(),
});

const UpdateCartItemSchema = z.object({
  cartItemId: z.string().uuid(),
  quantity: z
    .number()
    .int()
    .min(CART_LIMITS.MIN_QUANTITY)
    .max(CART_LIMITS.MAX_QUANTITY_PER_ITEM),
  specialInstructions: z.string().max(500).optional(),
});

// ============================================================================
// Types
// ============================================================================

export interface TableSession {
  id: string;
  tableId: string;
  sessionToken: string;
  status: string;
  startedAt: Date;
  expiresAt: Date;
}

export interface CartItem {
  id: string;
  menuItemId: string;
  variationId: string | null;
  quantity: number;
  unitPrice: number;
  subtotal: number;
  specialInstructions: string | null;
  menuItem: {
    id: string;
    name: string;
    imageUrl: string | null;
  };
  variation: {
    id: string;
    name: string;
  } | null;
}

export interface TableCart {
  sessionId: string;
  items: CartItem[];
  totalItems: number;
  totalAmount: number;
}

// ============================================================================
// Session Management Functions
// ============================================================================

/**
 * Create a new customer session for QR ordering
 *
 * Each QR scan creates a new session, allowing multiple people
 * at the same table to order independently.
 *
 * @param tableId - UUID of the table
 * @returns New customer session
 */
export async function createCustomerSession(
  tableId: string
): Promise<TableSession> {
  try {
    // Validate tableId
    const validTableId = z.string().uuid().parse(tableId);

    // Always create new session (no reuse)
    const sessionToken = generateSessionToken();
    const expiresAt = new Date(Date.now() + SESSION_DURATION.DEFAULT);

    const newSession = await prisma.customerSession.create({
      data: {
        tableId: validTableId,
        sessionToken,
        status: SESSION_STATUS.ACTIVE,
        expiresAt,
      },
    });

    console.log(
      `[Session] Created new session ${newSession.id} for table ${tableId}`
    );

    return newSession;
  } catch (error) {
    console.error('Error creating customer session:', error);
    throw new Error('Failed to create customer session');
  }
}

/**
 * Get or create active session for a table
 *
 * @deprecated Use createCustomerSession instead for individual orders
 * This function now creates a new session each time (no reuse)
 * Kept for backward compatibility only
 */
export async function getOrCreateTableSession(
  tableId: string
): Promise<TableSession> {
  return createCustomerSession(tableId);
}

/**
 * Get session by table ID (does not create if missing)
 */
export async function getTableSession(
  tableId: string
): Promise<TableSession | null> {
  try {
    const validTableId = z.string().uuid().parse(tableId);

    const session = await prisma.customerSession.findFirst({
      where: {
        tableId: validTableId,
        status: SESSION_STATUS.ACTIVE,
        expiresAt: {
          gt: new Date(),
        },
      },
      orderBy: {
        startedAt: 'desc',
      },
    });

    return session;
  } catch (error) {
    console.error('Error in getTableSession:', error);
    return null;
  }
}

/**
 * Get customer session by ID
 */
export async function getCustomerSessionById(
  sessionId: string
): Promise<TableSession | null> {
  try {
    const session = await prisma.customerSession.findUnique({
      where: {
        id: sessionId,
        status: SESSION_STATUS.ACTIVE,
        expiresAt: { gt: new Date() },
      },
    });
    return session;
  } catch (error) {
    console.error('Error in getCustomerSessionById:', error);
    return null;
  }
}

/**
 * End a table session (when table is cleared)
 */
export async function endTableSession(tableId: string): Promise<void> {
  try {
    const validTableId = z.string().uuid().parse(tableId);

    await prisma.customerSession.updateMany({
      where: {
        tableId: validTableId,
        status: SESSION_STATUS.ACTIVE,
      },
      data: {
        status: SESSION_STATUS.ENDED,
        endedAt: new Date(),
      },
    });
  } catch (error) {
    console.error('Error in endTableSession:', error);
    throw new Error('Failed to end table session');
  }
}

// ============================================================================
// Cart Management Functions
// ============================================================================

/**
 * Get cart for a table
 */
export async function getTableCart(
  tableId: string,
  sessionId?: string
): Promise<TableCart> {
  try {
    const validTableId = z.string().uuid().parse(tableId);

    let session: TableSession | null = null;

    // 1. Try to resume session if ID provided
    if (sessionId) {
      session = await getCustomerSessionById(sessionId);
    }

    // 2. If no valid session found, create new one
    if (!session) {
      session = await createCustomerSession(validTableId);
    } else if (session.tableId !== validTableId) {
      // Security check: ensure session belongs to requested table
      console.warn(
        `Session ${sessionId} belongs to different table. Creating new.`
      );
      session = await createCustomerSession(validTableId);
    }

    // Get cart items
    const cartItems = await prisma.cartItem.findMany({
      where: {
        customerSessionId: session.id,
      },
      include: {
        menuItem: {
          select: {
            id: true,
            name: true,
            imageUrl: true,
          },
        },
        variation: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: {
        createdAt: 'asc',
      },
    });

    // Calculate totals
    const totalItems = cartItems.reduce((sum, item) => sum + item.quantity, 0);
    const totalAmount = cartItems.reduce(
      (sum, item) => sum + Number(item.subtotal),
      0
    );

    return {
      sessionId: session.id,
      items: cartItems.map((item) => ({
        id: item.id,
        menuItemId: item.menuItemId,
        variationId: item.variationId,
        quantity: item.quantity,
        unitPrice: Number(item.unitPrice),
        subtotal: Number(item.subtotal),
        specialInstructions: item.specialInstructions,
        menuItem: item.menuItem,
        variation: item.variation,
      })),
      totalItems,
      totalAmount,
    };
  } catch (error) {
    console.error('Error in getTableCart:', error);
    throw new Error('Failed to get table cart');
  }
}

/**
 * Add item to table cart
 */
export async function addToTableCart(
  params: z.infer<typeof AddToCartSchema>
): Promise<CartItem> {
  try {
    // Validate input
    const validParams = AddToCartSchema.parse(params);

    // Get or create session
    const session = await getOrCreateTableSession(validParams.tableId);

    // Check cart item limit
    const existingItemCount = await prisma.cartItem.count({
      where: { customerSessionId: session.id },
    });

    if (existingItemCount >= CART_LIMITS.MAX_ITEMS) {
      throw new Error(`Cart limit reached (${CART_LIMITS.MAX_ITEMS} items)`);
    }

    // Check if same item+variation already in cart
    const existingCartItem = await prisma.cartItem.findFirst({
      where: {
        customerSessionId: session.id,
        menuItemId: validParams.menuItemId,
        variationId: validParams.variationId || null,
      },
    });

    let cartItem;

    if (existingCartItem) {
      // Update existing cart item quantity
      const newQuantity = existingCartItem.quantity + validParams.quantity;

      if (newQuantity > CART_LIMITS.MAX_QUANTITY_PER_ITEM) {
        throw new Error(
          `Maximum quantity per item is ${CART_LIMITS.MAX_QUANTITY_PER_ITEM}`
        );
      }

      const newSubtotal = validParams.unitPrice * newQuantity;

      cartItem = await prisma.cartItem.update({
        where: { id: existingCartItem.id },
        data: {
          quantity: newQuantity,
          subtotal: newSubtotal,
          specialInstructions:
            validParams.specialInstructions ||
            existingCartItem.specialInstructions,
        },
        include: {
          menuItem: {
            select: {
              id: true,
              name: true,
              imageUrl: true,
            },
          },
          variation: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      });
    } else {
      // Create new cart item
      const subtotal = validParams.unitPrice * validParams.quantity;

      cartItem = await prisma.cartItem.create({
        data: {
          customerSessionId: session.id,
          menuItemId: validParams.menuItemId,
          variationId: validParams.variationId,
          quantity: validParams.quantity,
          unitPrice: validParams.unitPrice,
          subtotal,
          specialInstructions: validParams.specialInstructions,
        },
        include: {
          menuItem: {
            select: {
              id: true,
              name: true,
              imageUrl: true,
            },
          },
          variation: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      });
    }

    return {
      id: cartItem.id,
      menuItemId: cartItem.menuItemId,
      variationId: cartItem.variationId,
      quantity: cartItem.quantity,
      unitPrice: Number(cartItem.unitPrice),
      subtotal: Number(cartItem.subtotal),
      specialInstructions: cartItem.specialInstructions,
      menuItem: cartItem.menuItem,
      variation: cartItem.variation,
    };
  } catch (error) {
    console.error('Error in addToTableCart:', error);
    if (error instanceof z.ZodError) {
      throw new Error(
        `Validation error: ${error.issues.map((e: { message: string }) => e.message).join(', ')}`
      );
    }
    if (error instanceof Error) {
      throw error;
    }
    throw new Error('Failed to add item to cart');
  }
}

/**
 * Update cart item quantity
 */
export async function updateCartItem(
  params: z.infer<typeof UpdateCartItemSchema>
): Promise<CartItem> {
  try {
    const validParams = UpdateCartItemSchema.parse(params);

    const existingItem = await prisma.cartItem.findUnique({
      where: { id: validParams.cartItemId },
    });

    if (!existingItem) {
      throw new Error('Cart item not found');
    }

    const newSubtotal = Number(existingItem.unitPrice) * validParams.quantity;

    const updatedItem = await prisma.cartItem.update({
      where: { id: validParams.cartItemId },
      data: {
        quantity: validParams.quantity,
        subtotal: newSubtotal,
        specialInstructions: validParams.specialInstructions,
      },
      include: {
        menuItem: {
          select: {
            id: true,
            name: true,
            imageUrl: true,
          },
        },
        variation: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    return {
      id: updatedItem.id,
      menuItemId: updatedItem.menuItemId,
      variationId: updatedItem.variationId,
      quantity: updatedItem.quantity,
      unitPrice: Number(updatedItem.unitPrice),
      subtotal: Number(updatedItem.subtotal),
      specialInstructions: updatedItem.specialInstructions,
      menuItem: updatedItem.menuItem,
      variation: updatedItem.variation,
    };
  } catch (error) {
    console.error('Error in updateCartItem:', error);
    if (error instanceof z.ZodError) {
      throw new Error(
        `Validation error: ${error.issues.map((e: { message: string }) => e.message).join(', ')}`
      );
    }
    if (error instanceof Error) {
      throw error;
    }
    throw new Error('Failed to update cart item');
  }
}

/**
 * Remove item from cart
 */
export async function removeFromCart(cartItemId: string): Promise<void> {
  try {
    const validCartItemId = z.string().uuid().parse(cartItemId);

    await prisma.cartItem.delete({
      where: { id: validCartItemId },
    });
  } catch (error) {
    console.error('Error in removeFromCart:', error);
    throw new Error('Failed to remove item from cart');
  }
}

/**
 * Clear entire table cart
 */
export async function clearTableCart(tableId: string): Promise<void> {
  try {
    const validTableId = z.string().uuid().parse(tableId);

    const session = await getTableSession(validTableId);

    if (!session) {
      return; // No session, nothing to clear
    }

    await prisma.cartItem.deleteMany({
      where: { customerSessionId: session.id },
    });
  } catch (error) {
    console.error('Error in clearTableCart:', error);
    throw new Error('Failed to clear table cart');
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Generate cryptographically secure session token
 */
function generateSessionToken(): string {
  return randomBytes(32).toString('hex'); // 64 characters
}

/**
 * Cleanup expired sessions (should be run periodically)
 */
export async function cleanupExpiredSessions(): Promise<number> {
  try {
    const result = await prisma.customerSession.updateMany({
      where: {
        status: SESSION_STATUS.ACTIVE,
        expiresAt: {
          lt: new Date(),
        },
      },
      data: {
        status: SESSION_STATUS.EXPIRED,
        endedAt: new Date(),
      },
    });

    return result.count;
  } catch (error) {
    console.error('Error in cleanupExpiredSessions:', error);
    return 0;
  }
}
