import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyAuthToken } from '@/lib/auth';

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string; variationId: string } }
) {
  try {
    const authResult = await verifyAuthToken(request);
    if (!authResult.isValid || !authResult.staff) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    const hasMenuPermission = authResult.staff.role.permissions.menu?.includes('write');
    if (!hasMenuPermission) {
      return NextResponse.json(
        { error: 'Insufficient permissions' },
        { status: 403 }
      );
    }

    const { id: itemId, variationId } = params;
    const updateData = await request.json();

    // Verify variation belongs to restaurant
    const variation = await prisma.menuItemVariation.findUnique({
      where: { id: variationId },
      include: {
        menuItem: {
          include: {
            category: true
          }
        }
      }
    });

    if (!variation || 
        variation.menuItem.id !== itemId ||
        variation.menuItem.category.restaurantId !== authResult.staff.restaurantId) {
      return NextResponse.json(
        { error: 'Variation not found' },
        { status: 404 }
      );
    }

    const {
      name,
      priceModifier,
      variationType,
      isRequired,
      maxSelections,
      displayOrder
    } = updateData;

    const updatedVariation = await prisma.menuItemVariation.update({
      where: { id: variationId },
      data: {
        ...(name && { name }),
        ...(priceModifier !== undefined && { priceModifier: parseFloat(priceModifier) }),
        ...(variationType && { variationType }),
        ...(isRequired !== undefined && { isRequired }),
        ...(maxSelections !== undefined && { maxSelections }),
        ...(displayOrder !== undefined && { displayOrder })
      }
    });

    return NextResponse.json({
      success: true,
      variation: updatedVariation,
      message: 'Variation updated successfully'
    });

  } catch (error) {
    console.error('Failed to update variation:', error);
    return NextResponse.json(
      { error: 'Failed to update variation' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string; variationId: string } }
) {
  try {
    const authResult = await verifyAuthToken(request);
    if (!authResult.isValid || !authResult.staff) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    const hasMenuPermission = authResult.staff.role.permissions.menu?.includes('delete');
    if (!hasMenuPermission) {
      return NextResponse.json(
        { error: 'Insufficient permissions' },
        { status: 403 }
      );
    }

    const { id: itemId, variationId } = params;

    // Verify variation belongs to restaurant
    const variation = await prisma.menuItemVariation.findUnique({
      where: { id: variationId },
      include: {
        menuItem: {
          include: {
            category: true
          }
        }
      }
    });

    if (!variation || 
        variation.menuItem.id !== itemId ||
        variation.menuItem.category.restaurantId !== authResult.staff.restaurantId) {
      return NextResponse.json(
        { error: 'Variation not found' },
        { status: 404 }
      );
    }

    await prisma.menuItemVariation.delete({
      where: { id: variationId }
    });

    return NextResponse.json({
      success: true,
      message: 'Variation deleted successfully'
    });

  } catch (error) {
    console.error('Failed to delete variation:', error);
    return NextResponse.json(
      { error: 'Failed to delete variation' },
      { status: 500 }
    );
  }
}