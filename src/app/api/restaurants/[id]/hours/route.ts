/**
 * Restaurant Operating Hours Management API
 * Handles complex operating hours with special days, holidays, etc.
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/database';
import { AuthServiceV2 } from '@/lib/rbac/auth-service';

interface DayHours {
  isOpen: boolean;
  openTime?: string;  // "09:00"
  closeTime?: string; // "22:00"
  breaks?: Array<{
    startTime: string;
    endTime: string;
    reason?: string;
  }>;
}

interface OperatingHours {
  // Regular weekly schedule
  monday: DayHours;
  tuesday: DayHours;
  wednesday: DayHours;
  thursday: DayHours;
  friday: DayHours;
  saturday: DayHours;
  sunday: DayHours;

  // Special dates (overrides regular schedule)
  specialDates?: {
    [date: string]: DayHours & {
      reason?: string; // "Holiday", "Private Event", etc.
    };
  };

  // Timezone for proper display
  timezone: string;

  // Last updated timestamp
  lastUpdated: string;
}

// GET - Fetch restaurant operating hours
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // RBAC Authentication
    const token = request.cookies.get('qr_rbac_token')?.value;
    if (!token) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const validation = await AuthServiceV2.validateToken(token);
    if (!validation.isValid || !validation.user) {
      return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401 });
    }

    const user = validation.user;

    // Check access using RBAC user
    const hasAccess = await checkRestaurantAccessRBAC(user, id);
    if (!hasAccess) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    const restaurant = await prisma.restaurant.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        operatingHours: true,
        timezone: true
      }
    });

    if (!restaurant) {
      return NextResponse.json({ error: 'Restaurant not found' }, { status: 404 });
    }

    // Parse operating hours or return default structure
    const operatingHours = parseOperatingHours(restaurant.operatingHours, restaurant.timezone);

    return NextResponse.json({
      success: true,
      operatingHours,
      timezone: restaurant.timezone
    });

  } catch (error) {
    console.error('Error fetching operating hours:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// PUT - Update restaurant operating hours
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // RBAC Authentication  
    const token = request.cookies.get('qr_rbac_token')?.value;
    if (!token) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const validation = await AuthServiceV2.validateToken(token);
    if (!validation.isValid || !validation.user) {
      return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401 });
    }

    const user = validation.user;

    // Check permission - only owners and admins can modify hours
    const canModify = user.currentRole.userType === 'restaurant_owner' ||
      user.currentRole.userType === 'platform_admin';
    if (!canModify) {
      return NextResponse.json({ error: 'Permission denied: Only owners can modify hours' }, { status: 403 });
    }

    const hasAccess = await checkRestaurantAccessRBAC(user, id);
    if (!hasAccess) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    const { operatingHours } = await request.json();

    // Validate operating hours structure
    const validatedHours = validateOperatingHours(operatingHours);
    if (!validatedHours) {
      return NextResponse.json({ error: 'Invalid operating hours format' }, { status: 400 });
    }

    // Add timestamp
    validatedHours.lastUpdated = new Date().toISOString();

    // Update restaurant
    const updatedRestaurant = await prisma.restaurant.update({
      where: { id },
      data: {
        operatingHours: validatedHours
      },
      select: {
        id: true,
        name: true,
        operatingHours: true,
        timezone: true
      }
    });

    return NextResponse.json({
      success: true,
      message: 'Operating hours updated successfully',
      operatingHours: updatedRestaurant.operatingHours,
      timezone: updatedRestaurant.timezone
    });

  } catch (error) {
    console.error('Error updating operating hours:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// Helper function to parse operating hours with defaults
function parseOperatingHours(hoursData: any, timezone: string): OperatingHours {
  const defaultDayHours: DayHours = {
    isOpen: true,
    openTime: "09:00",
    closeTime: "22:00"
  };

  const defaultHours: OperatingHours = {
    monday: defaultDayHours,
    tuesday: defaultDayHours,
    wednesday: defaultDayHours,
    thursday: defaultDayHours,
    friday: defaultDayHours,
    saturday: defaultDayHours,
    sunday: { isOpen: false },
    timezone: timezone,
    lastUpdated: new Date().toISOString()
  };

  if (!hoursData || typeof hoursData !== 'object') {
    return defaultHours;
  }

  return {
    ...defaultHours,
    ...hoursData,
    timezone: timezone
  };
}

// Helper function to validate operating hours structure
function validateOperatingHours(hours: any): OperatingHours | null {
  if (!hours || typeof hours !== 'object') {
    return null;
  }

  const daysOfWeek = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

  for (const day of daysOfWeek) {
    if (!hours[day] || typeof hours[day] !== 'object') {
      return null;
    }

    const dayHours = hours[day];
    if (typeof dayHours.isOpen !== 'boolean') {
      return null;
    }

    if (dayHours.isOpen) {
      if (!dayHours.openTime || !dayHours.closeTime) {
        return null;
      }

      // Validate time format (HH:MM)
      const timeRegex = /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/;
      if (!timeRegex.test(dayHours.openTime) || !timeRegex.test(dayHours.closeTime)) {
        return null;
      }
    }
  }

  return hours as OperatingHours;
}

// Helper function to check restaurant access with RBAC
async function checkRestaurantAccessRBAC(user: any, restaurantId: string): Promise<boolean> {
  try {
    // Platform admins have access to all restaurants
    if (user.currentRole.userType === 'platform_admin') {
      return true;
    }

    // Restaurant owners can access their own restaurants
    if (user.currentRole.userType === 'restaurant_owner') {
      const restaurant = await prisma.restaurant.findFirst({
        where: {
          id: restaurantId,
          ownerId: user.id
        }
      });
      return !!restaurant;
    }

    // Staff can access their assigned restaurant
    if (user.restaurantContext?.id === restaurantId) {
      return true;
    }

    return false;
  } catch (error) {
    console.error('Error checking restaurant access:', error);
    return false;
  }
}