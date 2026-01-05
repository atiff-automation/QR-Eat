/**
 * Restaurant Profile Management API
 * Allows restaurant owners to manage their public restaurant profile
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/database';
import {
  getTenantContext,
  requireAuth,
  requirePermission,
} from '@/lib/tenant-context';
import { requireRestaurantAccess } from '@/lib/rbac/resource-auth';

// GET - Fetch restaurant profile for editing
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const context = await getTenantContext(request);
    requireAuth(context);
    requirePermission(context!, 'restaurants', 'read');

    // ✅ NEW: Validate resource access (IDOR protection)
    await requireRestaurantAccess(id, context!);

    // Fetch restaurant profile
    const restaurant = await prisma.restaurant.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        slug: true,
        address: true,
        phone: true,
        email: true,
        timezone: true,
        currency: true,
        businessType: true,
        description: true,
        website: true,
        logoUrl: true,
        coverImageUrl: true,
        galleryImages: true,
        socialMedia: true,
        operatingHours: true,
        features: true,
        cuisineTypes: true,
        priceRange: true,
        showOnDirectory: true,
        acceptsReservations: true,
        deliveryAvailable: true,
        takeoutAvailable: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!restaurant) {
      return NextResponse.json(
        { error: 'Restaurant not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      restaurant,
    });
  } catch (error) {
    console.error('Error fetching restaurant profile:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// PUT - Update restaurant profile
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const context = await getTenantContext(request);
    requireAuth(context);
    requirePermission(context!, 'restaurants', 'write');

    // ✅ NEW: Validate resource access (IDOR protection)
    await requireRestaurantAccess(id, context!);

    const updateData = await request.json();

    // Validate and sanitize the update data
    const validatedData = validateProfileData(updateData);

    // Update restaurant profile
    const updatedRestaurant = await prisma.restaurant.update({
      where: { id },
      data: validatedData,
      select: {
        id: true,
        name: true,
        slug: true,
        address: true,
        phone: true,
        email: true,
        timezone: true,
        currency: true,
        businessType: true,
        description: true,
        website: true,
        logoUrl: true,
        coverImageUrl: true,
        galleryImages: true,
        socialMedia: true,
        operatingHours: true,
        features: true,
        cuisineTypes: true,
        priceRange: true,
        showOnDirectory: true,
        acceptsReservations: true,
        deliveryAvailable: true,
        takeoutAvailable: true,
        updatedAt: true,
      },
    });

    return NextResponse.json({
      success: true,
      message: 'Restaurant profile updated successfully',
      restaurant: updatedRestaurant,
    });
  } catch (error) {
    console.error('Error updating restaurant profile:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// Helper function to validate and sanitize profile data
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function validateProfileData(data: any) {
  const allowedFields = [
    'name',
    'address',
    'phone',
    'email',
    'timezone',
    'currency',
    'businessType',
    'description',
    'website',
    'logoUrl',
    'coverImageUrl',
    'galleryImages',
    'socialMedia',
    'operatingHours',
    'features',
    'cuisineTypes',
    'priceRange',
    'showOnDirectory',
    'acceptsReservations',
    'deliveryAvailable',
    'takeoutAvailable',
  ];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const validatedData: Record<string, any> = {};

  for (const field of allowedFields) {
    if (data[field] !== undefined) {
      validatedData[field] = data[field];
    }
  }

  // Additional validation
  if (validatedData.email && !isValidEmail(validatedData.email)) {
    delete validatedData.email;
  }

  if (validatedData.website && !isValidUrl(validatedData.website)) {
    delete validatedData.website;
  }

  if (
    validatedData.priceRange &&
    !['$', '$$', '$$$', '$$$$'].includes(validatedData.priceRange)
  ) {
    validatedData.priceRange = '$$';
  }

  return validatedData;
}

// Helper validation functions
function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

function isValidUrl(url: string): boolean {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}
