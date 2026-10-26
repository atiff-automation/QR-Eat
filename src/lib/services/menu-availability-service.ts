import { prisma } from '@/lib/database';
import { invalidateMenuCache } from '@/lib/cache/menu-cache';

export type MenuAvailabilitySource = 'WEB' | 'COUNTER';
export type MenuAvailabilityReason =
  | 'sold_out'
  | 'kitchen_unavailable'
  | 'other';

export interface MenuAvailabilityActor {
  userId: string;
  userType: string;
}

export interface MenuAvailabilityRequestContext {
  ipAddress?: string | null;
  userAgent?: string | null;
}

export interface SetMenuItemAvailabilityInput {
  restaurantId: string;
  itemId: string;
  isAvailable: boolean;
  source: MenuAvailabilitySource;
  reason?: MenuAvailabilityReason;
  actor: MenuAvailabilityActor;
  requestContext?: MenuAvailabilityRequestContext;
}

export interface MenuAvailabilityItem {
  id: string;
  name: string;
  categoryId: string;
  categoryName: string;
  price: string;
  imageUrl: string | null;
  isAvailable: boolean;
}

export class MenuAvailabilityError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode = 400
  ) {
    super(message);
    this.name = 'MenuAvailabilityError';
  }
}

export async function listMenuAvailability(
  restaurantId: string
): Promise<MenuAvailabilityItem[]> {
  const categories = await prisma.menuCategory.findMany({
    where: {
      restaurantId,
      status: 'ACTIVE',
      isActive: true,
    },
    select: {
      id: true,
      name: true,
      menuItems: {
        where: { status: 'ACTIVE' },
        select: {
          id: true,
          name: true,
          price: true,
          imageUrl: true,
          isAvailable: true,
        },
        orderBy: { displayOrder: 'asc' },
      },
    },
    orderBy: { displayOrder: 'asc' },
  });

  return categories.flatMap((category) =>
    category.menuItems.map((item) => ({
      id: item.id,
      name: item.name,
      categoryId: category.id,
      categoryName: category.name,
      price: item.price.toString(),
      imageUrl: item.imageUrl,
      isAvailable: item.isAvailable,
    }))
  );
}

export async function setMenuItemAvailability(
  input: SetMenuItemAvailabilityInput
): Promise<{
  id: string;
  name: string;
  isAvailable: boolean;
  updatedAt: string;
  changed: boolean;
}> {
  const item = await prisma.menuItem.findUnique({
    where: { id: input.itemId },
    select: {
      id: true,
      name: true,
      restaurantId: true,
      isAvailable: true,
      status: true,
      category: {
        select: {
          id: true,
          restaurantId: true,
          status: true,
          isActive: true,
        },
      },
    },
  });

  if (!item || item.restaurantId !== input.restaurantId) {
    throw new MenuAvailabilityError(
      'Menu item not found',
      'ITEM_NOT_FOUND',
      404
    );
  }

  if (item.status !== 'ACTIVE') {
    throw new MenuAvailabilityError(
      'Menu item is not active',
      'ITEM_INACTIVE',
      409
    );
  }

  if (
    item.category.restaurantId !== input.restaurantId ||
    item.category.status !== 'ACTIVE' ||
    item.category.isActive === false
  ) {
    throw new MenuAvailabilityError(
      'Cannot restore an item in an inactive category',
      'CATEGORY_INACTIVE',
      409
    );
  }

  if (item.isAvailable === input.isAvailable) {
    return {
      id: item.id,
      name: item.name,
      isAvailable: item.isAvailable,
      updatedAt: new Date().toISOString(),
      changed: false,
    };
  }

  const updated = await prisma.$transaction(async (tx) => {
    const next = await tx.menuItem.update({
      where: { id: item.id },
      data: {
        isAvailable: input.isAvailable,
        updatedAt: new Date(),
      },
      select: {
        id: true,
        name: true,
        isAvailable: true,
        updatedAt: true,
      },
    });

    await tx.auditLog.create({
      data: {
        tableName: 'menu_items',
        recordId: item.id,
        operation: 'UPDATE',
        oldValues: { isAvailable: item.isAvailable },
        newValues: { isAvailable: next.isAvailable },
        changedBy: input.actor.userId,
        changedByType: input.actor.userType,
        restaurantId: input.restaurantId,
        severity: 'info',
        category: 'menu',
        description: input.isAvailable
          ? `${item.name} marked available`
          : `${item.name} marked unavailable`,
        metadata: {
          source: input.source,
          reason: input.reason ?? null,
        },
        ipAddress: input.requestContext?.ipAddress ?? null,
        userAgent: input.requestContext?.userAgent ?? null,
      },
    });

    return next;
  });

  invalidateMenuCache(input.restaurantId);

  return {
    id: updated.id,
    name: updated.name,
    isAvailable: updated.isAvailable,
    updatedAt: updated.updatedAt.toISOString(),
    changed: true,
  };
}
