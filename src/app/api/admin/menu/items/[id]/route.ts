import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/database';
import { AuthServiceV2 } from '@/lib/rbac/auth-service';
import { unlink } from 'fs/promises';
import { join } from 'path';
import { z } from 'zod';
import { revalidateTag } from 'next/cache';

// ============================================================================
// Internal Utilities
// ============================================================================

async function deleteImageFile(imageUrl: string | null): Promise<void> {
  if (!imageUrl) return;
  try {
    const filename = imageUrl.split('/').pop();
    if (!filename) return;
    const UPLOAD_BASE_DIR = process.env.UPLOAD_BASE_DIR
      ? process.env.UPLOAD_BASE_DIR
      : join(process.cwd(), 'public', 'uploads');
    const UPLOAD_DIR = join(UPLOAD_BASE_DIR, 'menu-images');
    const filepath = join(UPLOAD_DIR, filename);
    await unlink(filepath);
    console.log('🗑️ [IMAGE CLEANUP] Deleted old image:', filename);
  } catch (error) {
    console.warn('⚠️ [IMAGE CLEANUP] Failed to delete image file:', error);
  }
}

// ============================================================================
// Validation Schemas
// ============================================================================

const VariationOptionSchema = z.object({
  name: z.string().min(1),
  priceModifier: z.number().min(0).default(0),
  isAvailable: z.boolean().default(true),
  displayOrder: z.number().int().default(0),
});

const VariationGroupSchema = z.object({
  name: z.string().min(1),
  minSelections: z.number().int().min(0).default(0),
  maxSelections: z.number().int().min(0).default(1),
  displayOrder: z.number().int().default(0),
  options: z.array(VariationOptionSchema).default([]),
});

const UpdateMenuItemSchema = z.object({
  categoryId: z.string().uuid().optional(),
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional(),
  price: z.number().min(0).optional(),
  imageUrl: z.string().optional().or(z.literal('')),
  preparationTime: z.number().int().min(0).optional(),
  calories: z.number().int().optional(),
  allergens: z.array(z.string()).optional(),
  dietaryInfo: z.array(z.string()).optional(),
  isAvailable: z.boolean().optional(),
  status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
  isFeatured: z.boolean().optional(),
  displayOrder: z.number().int().optional(),
  // Complete replacement of variation groups
  variationGroups: z.array(VariationGroupSchema).optional(),
});

// ============================================================================
// PATCH Handler
// ============================================================================

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: itemId } = await params;

    // Auth Check
    const token =
      request.cookies.get('qr_rbac_token')?.value ||
      request.cookies.get('qr_auth_token')?.value;

    if (!token)
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );

    const authResult = await AuthServiceV2.validateToken(token);
    if (!authResult.isValid || !authResult.user) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    // Permission Check
    const permissions = authResult.user.permissions || [];
    if (!permissions.includes('menu:write')) {
      return NextResponse.json(
        { error: 'Insufficient permissions' },
        { status: 403 }
      );
    }

    const { currentRole } = authResult.user;
    if (!currentRole?.restaurantId) {
      return NextResponse.json(
        { error: 'Restaurant context required' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const updateData = UpdateMenuItemSchema.parse(body);

    // Verify item ownership
    const existingItem = await prisma.menuItem.findUnique({
      where: { id: itemId },
      include: { category: true },
    });

    if (
      !existingItem ||
      existingItem.category.restaurantId !== currentRole.restaurantId
    ) {
      return NextResponse.json(
        { error: 'Menu item not found' },
        { status: 404 }
      );
    }

    // Constraint Check: Cannot activate item if category is inactive
    if (
      (updateData.status === 'ACTIVE' || updateData.isAvailable === true) &&
      (existingItem.category.status === 'INACTIVE' ||
        !existingItem.category.isActive)
    ) {
      return NextResponse.json(
        { error: 'Cannot activate item because its category is inactive' },
        { status: 400 }
      );
    }

    // Handle Image Delete
    if (
      updateData.imageUrl !== undefined &&
      existingItem.imageUrl !== updateData.imageUrl
    ) {
      await deleteImageFile(existingItem.imageUrl);
    }

    // Build Prisma Update Data
    // Destructure variationGroups out to avoid type mismatch with Prisma input
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { variationGroups: _variationGroups, ...scalarData } = updateData;

    const itemData: Prisma.MenuItemUpdateInput = {
      ...scalarData,
      updatedAt: new Date(),
    };

    // Explicitly delete undefined fields to avoid Prisma errors (Zod parses as undefined)
    (Object.keys(itemData) as Array<keyof Prisma.MenuItemUpdateInput>).forEach(
      (key) => itemData[key] === undefined && delete itemData[key]
    );

    // Handle Variation Groups Strategy: Replace All
    // If variationGroups is provided (even empty array), we replace.
    if (updateData.variationGroups) {
      itemData.variationGroups = {
        deleteMany: {}, // Clear existing
        create: updateData.variationGroups.map((group) => ({
          name: group.name,
          minSelections: group.minSelections,
          maxSelections: group.maxSelections,
          displayOrder: group.displayOrder,
          options: {
            create: group.options.map((opt) => ({
              name: opt.name,
              priceModifier: opt.priceModifier,
              isAvailable: opt.isAvailable,
              displayOrder: opt.displayOrder,
            })),
          },
        })),
      };
    }

    const updatedItem = await prisma.menuItem.update({
      where: { id: itemId },
      data: itemData,
      include: {
        category: { select: { id: true, name: true } },
        variationGroups: { include: { options: true } },
      },
    });

    // Clear menu cache
    revalidateTag('menu');
    revalidateTag(`menu-${currentRole.restaurantId}`);

    return NextResponse.json({
      success: true,
      item: updatedItem,
      message: 'Menu item updated successfully',
    });
  } catch (error) {
    console.error('Update menu item error:', error);
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid data', details: error.issues },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { error: 'Failed to update menu item' },
      { status: 500 }
    );
  }
}

// ============================================================================
// DELETE Handler
// ============================================================================

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: itemId } = await params;

    // Auth Check
    const token =
      request.cookies.get('qr_rbac_token')?.value ||
      request.cookies.get('qr_auth_token')?.value;

    if (!token)
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );

    const authResult = await AuthServiceV2.validateToken(token);
    if (!authResult.isValid || !authResult.user) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    const permissions = authResult.user.permissions || [];
    if (!permissions.includes('menu:delete')) {
      return NextResponse.json(
        { error: 'Insufficient permissions' },
        { status: 403 }
      );
    }

    const { currentRole } = authResult.user;
    if (!currentRole?.restaurantId) {
      return NextResponse.json(
        { error: 'Restaurant context required' },
        { status: 403 }
      );
    }

    // Ownership & Constraint Check
    const existingItem = await prisma.menuItem.findUnique({
      where: { id: itemId },
      include: {
        category: true,
        _count: { select: { orderItems: true } },
      },
    });

    if (
      !existingItem ||
      existingItem.category.restaurantId !== currentRole.restaurantId
    ) {
      return NextResponse.json(
        { error: 'Menu item not found' },
        { status: 404 }
      );
    }

    if (existingItem._count.orderItems > 0) {
      return NextResponse.json(
        {
          error: `Cannot delete item. It has ${existingItem._count.orderItems} associated order(s).`,
          suggestion: 'Archive the item instead.',
        },
        { status: 400 }
      );
    }

    // Cleanup Image
    await deleteImageFile(existingItem.imageUrl);

    // Delete Item (Cascade deletes variations)
    await prisma.menuItem.delete({
      where: { id: itemId },
    });

    // Clear menu cache
    revalidateTag('menu');
    revalidateTag(`menu-${currentRole.restaurantId}`);

    return NextResponse.json({
      success: true,
      message: 'Menu item deleted successfully',
    });
  } catch (error) {
    console.error('Delete menu item error:', error);
    return NextResponse.json(
      { error: 'Failed to delete menu item' },
      { status: 500 }
    );
  }
}
