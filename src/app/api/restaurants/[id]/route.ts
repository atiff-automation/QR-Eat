/**
 * Individual Restaurant Management API
 * DELETE and PATCH operations for restaurant management
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/database';
import { AuthServiceV2 } from '@/lib/auth/AuthServiceV2';
import { PERMISSION_GROUPS } from '@/lib/constants/permissions';

// GET - Fetch individual restaurant details
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const includeSettings = searchParams.get('includeSettings') === 'true';

    // Authenticate and authorize using modern AuthServiceV2
    const authResult = await AuthServiceV2.validateToken(request, {
      requiredPermissions: [PERMISSION_GROUPS.RESTAURANTS.VIEW_RESTAURANT],
      requireRestaurantId: id
    });

    if (!authResult.success || !authResult.user) {
      return NextResponse.json(
        { error: authResult.error || 'Authentication required' },
        { status: authResult.statusCode || 401 }
      );
    }

    // Fetch restaurant with detailed information
    const restaurant = await prisma.restaurant.findUnique({
      where: { id },
      include: {
        owner: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            phone: true,
            companyName: true
          }
        },
        _count: {
          select: {
            staff: true,
            tables: true,
            orders: true,
            menuItems: true
          }
        }
      }
    });

    if (!restaurant) {
      return NextResponse.json({ error: 'Restaurant not found' }, { status: 404 });
    }

    // Add default settings if requested
    let restaurantWithSettings = restaurant;
    if (includeSettings) {
      restaurantWithSettings = {
        ...restaurant,
        settings: {
          acceptReservations: restaurant.acceptsReservations || false,
          maxReservationDays: restaurant.maxReservationDays || 30,
          reservationTimeSlots: restaurant.reservationTimeSlots || 60,
          autoConfirmReservations: restaurant.autoConfirmReservations || false,
        }
      };
    }

    return NextResponse.json({
      success: true,
      restaurant: restaurantWithSettings
    });

  } catch (error) {
    console.error('Error fetching restaurant:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// PATCH - Update restaurant details
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Authenticate and authorize using modern AuthServiceV2 - Admin only
    const authResult = await AuthServiceV2.validateToken(request, {
      requiredPermissions: [PERMISSION_GROUPS.RESTAURANTS.MANAGE_RESTAURANT],
      requireRestaurantId: id
    });

    if (!authResult.success || !authResult.user) {
      return NextResponse.json(
        { error: authResult.error || 'Authentication required' },
        { status: authResult.statusCode || 401 }
      );
    }

    const updateData = await request.json();

    // Validate the restaurant exists
    const existingRestaurant = await prisma.restaurant.findUnique({
      where: { id }
    });

    if (!existingRestaurant) {
      return NextResponse.json({ error: 'Restaurant not found' }, { status: 404 });
    }

    // Update the restaurant
    const updatedRestaurant = await prisma.restaurant.update({
      where: { id },
      data: updateData,
      include: {
        owner: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            companyName: true
          }
        },
        _count: {
          select: {
            staff: true,
            tables: true,
            orders: true,
            menuItems: true
          }
        }
      }
    });

    return NextResponse.json({
      success: true,
      restaurant: updatedRestaurant,
      message: 'Restaurant updated successfully'
    });

  } catch (error) {
    console.error('Error updating restaurant:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// PUT - Comprehensive restaurant update (for edit page)
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Authenticate and authorize using modern AuthServiceV2 - Admin only
    const authResult = await AuthServiceV2.validateToken(request, {
      requiredPermissions: [PERMISSION_GROUPS.RESTAURANTS.MANAGE_RESTAURANT],
      requireRestaurantId: id
    });

    if (!authResult.success || !authResult.user) {
      return NextResponse.json(
        { error: authResult.error || 'Authentication required' },
        { status: authResult.statusCode || 401 }
      );
    }

    const updateData = await request.json();

    // Validate the restaurant exists
    const existingRestaurant = await prisma.restaurant.findUnique({
      where: { id },
      include: { owner: true }
    });

    if (!existingRestaurant) {
      return NextResponse.json({ error: 'Restaurant not found' }, { status: 404 });
    }

    // Use transaction to update restaurant and owner
    const result = await prisma.$transaction(async (tx) => {
      // Update owner if provided
      if (updateData.owner) {
        await tx.restaurantOwner.update({
          where: { id: existingRestaurant.ownerId },
          data: {
            firstName: updateData.owner.firstName,
            lastName: updateData.owner.lastName,
            email: updateData.owner.email,
            phone: updateData.owner.phone,
          }
        });
      }

      // Update restaurant
      const restaurantUpdateData: any = {
        name: updateData.name,
        slug: updateData.slug,
        description: updateData.description,
        address: updateData.address,
        phone: updateData.phone,
        email: updateData.email,
        website: updateData.website,
        isActive: updateData.isActive,
        currency: updateData.currency,
        timezone: updateData.timezone,
      };

      // Update settings if provided
      if (updateData.settings) {
        restaurantUpdateData.acceptsReservations = updateData.settings.acceptReservations;
        restaurantUpdateData.maxReservationDays = updateData.settings.maxReservationDays;
        restaurantUpdateData.reservationTimeSlots = updateData.settings.reservationTimeSlots;
        restaurantUpdateData.autoConfirmReservations = updateData.settings.autoConfirmReservations;
      }

      const updatedRestaurant = await tx.restaurant.update({
        where: { id },
        data: restaurantUpdateData,
        include: {
          owner: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              phone: true,
              companyName: true
            }
          },
          _count: {
            select: {
              staff: true,
              tables: true,
              orders: true,
              menuItems: true
            }
          }
        }
      });

      return updatedRestaurant;
    });

    return NextResponse.json({
      success: true,
      restaurant: result,
      message: 'Restaurant updated successfully'
    });

  } catch (error) {
    console.error('Error updating restaurant:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE - Delete restaurant
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Authenticate and authorize using modern AuthServiceV2 - Admin only
    const authResult = await AuthServiceV2.validateToken(request, {
      requiredPermissions: [PERMISSION_GROUPS.RESTAURANTS.MANAGE_RESTAURANT],
      requireRestaurantId: id
    });

    if (!authResult.success || !authResult.user) {
      return NextResponse.json(
        { error: authResult.error || 'Authentication required' },
        { status: authResult.statusCode || 401 }
      );
    }

    // Check if restaurant exists
    const restaurant = await prisma.restaurant.findUnique({
      where: { id },
      select: { id: true, name: true }
    });

    if (!restaurant) {
      return NextResponse.json({ error: 'Restaurant not found' }, { status: 404 });
    }

    // Delete the restaurant (cascade will handle related records)
    await prisma.restaurant.delete({
      where: { id }
    });

    return NextResponse.json({
      success: true,
      message: `Restaurant "${restaurant.name}" deleted successfully`
    });

  } catch (error) {
    console.error('Error deleting restaurant:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}