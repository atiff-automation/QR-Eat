/**
 * Restaurant Profile Management API
 * Allows restaurant owners to manage their public restaurant profile
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/database';
import { AuthService, UserType, AUTH_CONSTANTS } from '@/lib/auth';

// GET - Fetch restaurant profile for editing
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    
    // Get JWT token from any user-type specific cookie
    const token = request.cookies.get(AUTH_CONSTANTS.OWNER_COOKIE_NAME)?.value ||
      request.cookies.get(AUTH_CONSTANTS.STAFF_COOKIE_NAME)?.value ||
      request.cookies.get(AUTH_CONSTANTS.ADMIN_COOKIE_NAME)?.value ||
      request.cookies.get(AUTH_CONSTANTS.COOKIE_NAME)?.value;
    
    if (!token) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const payload = AuthService.verifyToken(token);
    
    if (!payload) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    // Check if user has access to this restaurant
    const hasAccess = await checkRestaurantAccess(payload, id);
    if (!hasAccess) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

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
        updatedAt: true
      }
    });

    if (!restaurant) {
      return NextResponse.json({ error: 'Restaurant not found' }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      restaurant
    });

  } catch (error) {
    console.error('Error fetching restaurant profile:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// PUT - Update restaurant profile
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    
    // Get JWT token from any user-type specific cookie
    const token = request.cookies.get(AUTH_CONSTANTS.OWNER_COOKIE_NAME)?.value ||
      request.cookies.get(AUTH_CONSTANTS.STAFF_COOKIE_NAME)?.value ||
      request.cookies.get(AUTH_CONSTANTS.ADMIN_COOKIE_NAME)?.value ||
      request.cookies.get(AUTH_CONSTANTS.COOKIE_NAME)?.value;
    
    if (!token) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const payload = AuthService.verifyToken(token);
    
    if (!payload) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    // Check if user has access to this restaurant
    const hasAccess = await checkRestaurantAccess(payload, id);
    if (!hasAccess) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

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
        updatedAt: true
      }
    });

    return NextResponse.json({
      success: true,
      message: 'Restaurant profile updated successfully',
      restaurant: updatedRestaurant
    });

  } catch (error) {
    console.error('Error updating restaurant profile:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// Helper function to check restaurant access
async function checkRestaurantAccess(payload: any, restaurantId: string): Promise<boolean> {
  try {
    // Platform admins have access to all restaurants
    if (payload.userType === UserType.PLATFORM_ADMIN) {
      return true;
    }

    // Restaurant owners can access their own restaurants
    if (payload.userType === UserType.RESTAURANT_OWNER) {
      const restaurant = await prisma.restaurant.findFirst({
        where: {
          id: restaurantId,
          ownerId: payload.userId
        }
      });
      return !!restaurant;
    }

    // Staff can access their assigned restaurant (read-only in most cases)
    if (payload.userType === UserType.STAFF && payload.restaurantId === restaurantId) {
      return true;
    }

    return false;
  } catch (error) {
    console.error('Error checking restaurant access:', error);
    return false;
  }
}

// Helper function to validate and sanitize profile data
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
    'takeoutAvailable'
  ];

  const validatedData: any = {};

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

  if (validatedData.priceRange && !['$', '$$', '$$$', '$$$$'].includes(validatedData.priceRange)) {
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