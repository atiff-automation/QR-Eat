import { prisma } from '@/lib/database';
import {
  SESSION_STATUS,
  SESSION_DURATION,
  CART_LIMITS,
} from '@/lib/session-constants';
import { randomBytes } from 'crypto';
import { z } from 'zod';
import { Prisma } from '@prisma/client';

// ============================================================================
// Zod Validation Schemas
// ============================================================================

export const AddToCartSchema = z.object({
  tableId: z.string().uuid(),
  sessionId: z.string().uuid().optional(),
  menuItemId: z.string().uuid(),
  variationOptionIds: z.array(z.string().uuid()).optional().default([]),
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

// Local CartItem definition matching the Prisma structure + flattened options
export interface CartItem {
  id: string;
  menuItemId: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
  specialInstructions: string | null;
  menuItem: {
    id: string;
    name: string;
    imageUrl: string | null;
  };
  selectedOptions: {
    id: string; // VariationOption ID
    name: string;
    priceModifier: number;
    isAvailable: boolean;
    displayOrder: number;
  }[];
}

export interface TableCart {
  sessionId: string;
  items: CartItem[];
  totalItems: number;
  totalAmount: number;
}

// Define strict type for Prisma inclusion results (Global for this file)
// Define strict type for Prisma inclusion results (Global for this file)
type CartItemWithDetails = {
  id: string;
  customerSessionId: string;
  menuItemId: string;
  quantity: number;
  unitPrice: Prisma.Decimal;
  subtotal: Prisma.Decimal;
  specialInstructions: string | null;
  createdAt: Date;
  updatedAt: Date;
  menuItem: { id: string; name: string; imageUrl: string | null };
  selectedOptions: {
    id: string;
    cartItemId: string;
    variationOptionId: string;
    variationOption: {
      id: string;
      variationGroupId: string;
      name: string;
      priceModifier: Prisma.Decimal;
      isAvailable: boolean;
      displayOrder: number;
      createdAt: Date;
      updatedAt: Date;
    };
  }[];
};

// ============================================================================
// Session Management Functions
// ============================================================================

export async function createCustomerSession(
  tableId: string
): Promise<TableSession> {
  try {
    const validTableId = z.string().uuid().parse(tableId);
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

export async function getOrCreateTableSession(
  tableId: string
): Promise<TableSession> {
  return createCustomerSession(tableId);
}

export async function getTableSession(
  tableId: string
): Promise<TableSession | null> {
  try {
    const validTableId = z.string().uuid().parse(tableId);
    const session = await prisma.customerSession.findFirst({
      where: {
        tableId: validTableId,
        status: SESSION_STATUS.ACTIVE,
        expiresAt: { gt: new Date() },
      },
      orderBy: { startedAt: 'desc' },
    });
    return session;
  } catch (error) {
    console.error('Error in getTableSession:', error);
    return null;
  }
}

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
 * Add item to table cart with option support and price calculation
 */
export async function addToTableCart(
  params: z.infer<typeof AddToCartSchema>
): Promise<CartItem> {
  try {
    // Validate input
    const validParams = AddToCartSchema.parse(params);
    const {
      tableId,
      sessionId,
      menuItemId,
      variationOptionIds = [],
      quantity,
      specialInstructions,
    } = validParams;

    // Get or create session
    let session: TableSession | null = null;
    if (sessionId) {
      session = await getCustomerSessionById(sessionId);
    }
    if (!session || session.tableId !== tableId) {
      session = await createCustomerSession(tableId);
    }

    // Check limit
    const existingItemCount = await prisma.cartItem.count({
      where: { customerSessionId: session.id },
    });
    if (existingItemCount >= CART_LIMITS.MAX_ITEMS) {
      throw new Error(`Cart limit reached (${CART_LIMITS.MAX_ITEMS} items)`);
    }

    // 1. Fetch MenuItem & Base Price
    const menuItem = await prisma.menuItem.findUnique({
      where: { id: menuItemId },
      select: { price: true },
    });
    if (!menuItem) throw new Error('Menu item not found');

    const basePrice = Number(menuItem.price);

    // 2. Fetch Option Prices & Validate
    let optionsTotal = 0;
    if (variationOptionIds.length > 0) {
      const options = await prisma.variationOption.findMany({
        where: { id: { in: variationOptionIds } },
      });
      if (options.length !== variationOptionIds.length) {
        throw new Error('One or more selected options are invalid');
      }
      options.forEach((opt) => {
        optionsTotal += Number(opt.priceModifier);
      });
    }

    const finalUnitPrice = basePrice + optionsTotal;
    const finalSubtotal = finalUnitPrice * quantity;

    // 3. Find if Identical Item already exists (Exact Option Match)
    const existingItems = (await prisma.cartItem.findMany({
      where: {
        customerSessionId: session.id,
        menuItemId: menuItemId,
      },
      include: {
        selectedOptions: true,
      },
    })) as unknown as CartItemWithDetails[];
    // Typescript struggles here because we only include selectedOptions for matching logic
    // but the type expects menuItem too. We handle matching first, then fetch full object later.

    const existingMatch = existingItems.find((item) => {
      // safe cast or check
      if (!item.selectedOptions) return false;

      const currentIds = item.selectedOptions
        .map((opt) => opt.variationOptionId)
        .sort();
      const newIds = [...variationOptionIds].sort();
      if (currentIds.length !== newIds.length) return false;
      return currentIds.every((id, index) => id === newIds[index]);
    });

    let cartItem: CartItemWithDetails;

    if (existingMatch) {
      // Update existing
      const newQuantity = existingMatch.quantity + quantity;
      if (newQuantity > CART_LIMITS.MAX_QUANTITY_PER_ITEM) {
        throw new Error(
          `Maximum quantity per item is ${CART_LIMITS.MAX_QUANTITY_PER_ITEM}`
        );
      }

      cartItem = (await prisma.cartItem.update({
        where: { id: existingMatch.id },
        data: {
          quantity: newQuantity,
          subtotal: finalUnitPrice * newQuantity,
          specialInstructions:
            specialInstructions || existingMatch.specialInstructions,
          unitPrice: finalUnitPrice,
        },
        include: {
          menuItem: { select: { id: true, name: true, imageUrl: true } },
          selectedOptions: { include: { variationOption: true } },
        },
      })) as unknown as CartItemWithDetails;
    } else {
      // Create new
      cartItem = (await prisma.cartItem.create({
        data: {
          customerSessionId: session.id,
          menuItemId,
          quantity,
          unitPrice: finalUnitPrice,
          subtotal: finalSubtotal,
          specialInstructions,
          selectedOptions: {
            create: variationOptionIds.map((optId) => ({
              variationOptionId: optId,
            })),
          },
        },
        include: {
          menuItem: { select: { id: true, name: true, imageUrl: true } },
          selectedOptions: { include: { variationOption: true } },
        },
      })) as unknown as CartItemWithDetails;
    }

    // Map to result interface
    return mapToCartItem(cartItem);
  } catch (error) {
    console.error('Error in addToTableCart:', error);
    if (error instanceof z.ZodError) {
      throw new Error(`Validation error: ${error.message}`);
    }
    throw error;
  }
}

export async function getTableCart(
  tableId: string,
  sessionId?: string
): Promise<TableCart> {
  try {
    const validTableId = z.string().uuid().parse(tableId);

    // Session resolution logic
    let session: TableSession | null = null;
    if (sessionId) {
      session = await getCustomerSessionById(sessionId);
    }
    if (!session || session.tableId !== validTableId) {
      session = await createCustomerSession(validTableId);
    }

    // Fetch Items
    const rawCartItems = (await prisma.cartItem.findMany({
      where: { customerSessionId: session.id },
      include: {
        menuItem: {
          select: { id: true, name: true, imageUrl: true },
        },
        selectedOptions: {
          include: { variationOption: true },
        },
      },
      orderBy: { createdAt: 'asc' },
    })) as unknown as CartItemWithDetails[];

    const items: CartItem[] = rawCartItems.map(mapToCartItem);

    const totalItems = items.reduce((sum, item) => sum + item.quantity, 0);
    const totalAmount = items.reduce((sum, item) => sum + item.subtotal, 0);

    return {
      sessionId: session.id,
      items,
      totalItems,
      totalAmount,
    };
  } catch (error) {
    console.error('Error in getTableCart:', error);
    throw new Error('Failed to get table cart');
  }
}

export async function updateCartItem(
  params: z.infer<typeof UpdateCartItemSchema>
): Promise<CartItem> {
  try {
    const validParams = UpdateCartItemSchema.parse(params);
    const { cartItemId, quantity, specialInstructions } = validParams;

    const existingItem = await prisma.cartItem.findUnique({
      where: { id: cartItemId },
    });

    if (!existingItem) throw new Error('Cart item not found');

    const unitPrice = Number(existingItem.unitPrice);
    const subtotal = unitPrice * quantity;

    const updatedItem = (await prisma.cartItem.update({
      where: { id: cartItemId },
      data: {
        quantity,
        subtotal,
        specialInstructions:
          specialInstructions !== undefined
            ? specialInstructions
            : existingItem.specialInstructions,
      },
      include: {
        menuItem: { select: { id: true, name: true, imageUrl: true } },
        selectedOptions: { include: { variationOption: true } },
      },
    })) as unknown as CartItemWithDetails;

    return mapToCartItem(updatedItem);
  } catch (error) {
    console.error('Error in updateCartItem:', error);
    if (error instanceof z.ZodError)
      throw new Error(`Validation error: ${error.message}`);
    throw error;
  }
}

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

export async function clearTableCart(tableId: string): Promise<void> {
  try {
    const validTableId = z.string().uuid().parse(tableId);
    const session = await getTableSession(validTableId);
    if (!session) return;

    await prisma.cartItem.deleteMany({
      where: { customerSessionId: session.id },
    });
  } catch (error) {
    console.error('Error in clearTableCart:', error);
    throw new Error('Failed to clear table cart');
  }
}

function generateSessionToken(): string {
  return randomBytes(32).toString('hex');
}

export async function cleanupExpiredSessions(): Promise<number> {
  try {
    const result = await prisma.customerSession.updateMany({
      where: {
        status: SESSION_STATUS.ACTIVE,
        expiresAt: { lt: new Date() },
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

// Helper to map Prisma result to Frontend interface
function mapToCartItem(item: CartItemWithDetails): CartItem {
  return {
    id: item.id,
    menuItemId: item.menuItemId,
    quantity: item.quantity,
    unitPrice: Number(item.unitPrice),
    subtotal: Number(item.subtotal),
    specialInstructions: item.specialInstructions,
    menuItem: {
      id: item.menuItem.id,
      name: item.menuItem.name,
      imageUrl: item.menuItem.imageUrl,
    },
    selectedOptions: item.selectedOptions.map((opt) => ({
      id: opt.variationOption.id,
      name: opt.variationOption.name,
      priceModifier: Number(opt.variationOption.priceModifier),
      isAvailable: opt.variationOption.isAvailable,
      displayOrder: opt.variationOption.displayOrder,
    })),
  };
}
