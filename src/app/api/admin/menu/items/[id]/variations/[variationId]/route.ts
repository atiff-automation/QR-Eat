import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/database';
import { AuthServiceV2 } from '@/lib/rbac/auth-service';

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string; variationId: string } }
) {
  try {
    // Verify authentication using RBAC system
    const token = request.cookies.get('qr_rbac_token')?.value ||
                  request.cookies.get('qr_auth_token')?.value;

    if (!token) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    const authResult = await AuthServiceV2.validateToken(token);

    if (!authResult.isValid || !authResult.user) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    // Get restaurant ID from RBAC payload
    const restaurantId = authResult.user.currentRole?.restaurantId;

    if (!restaurantId) {
      return NextResponse.json(
        { error: 'Restaurant access required' },
        { status: 403 }
      );
    }

    const hasMenuPermission = authResult.user.currentRole?.permissions.menu?.includes('write');
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
        variation.menuItem.category.restaurantId !== restaurantId) {
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
    // Verify authentication using RBAC system
    const token = request.cookies.get('qr_rbac_token')?.value ||
                  request.cookies.get('qr_auth_token')?.value;

    if (!token) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    const authResult = await AuthServiceV2.validateToken(token);

    if (!authResult.isValid || !authResult.user) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    // Get restaurant ID from RBAC payload
    const restaurantId = authResult.user.currentRole?.restaurantId;

    if (!restaurantId) {
      return NextResponse.json(
        { error: 'Restaurant access required' },
        { status: 403 }
      );
    }

    const hasMenuPermission = authResult.user.currentRole?.permissions.menu?.includes('delete');
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
        variation.menuItem.category.restaurantId !== restaurantId) {
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