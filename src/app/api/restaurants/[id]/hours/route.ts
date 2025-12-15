/**
 * Restaurant Operating Hours Management API
 * Handles complex operating hours with special days, holidays, etc.
 * 
 * Following CLAUDE.md principles:
 * - Type Safety: Proper TypeScript types throughout
 * - Error Handling: Comprehensive error cases
 * - RBAC Integration: Shared helpers for authentication
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/database';
import {
  validateRBACToken,
  checkRestaurantAccess,
  createErrorResponse,
  logAccessDenied,
  hasRoleType
} from '@/lib/rbac/route-helpers';
import type { EnhancedAuthenticatedUser } from '@/lib/rbac/types';

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

    // RBAC Authentication with proper types
    const authResult = await validateRBACToken(request);
    if (!authResult.success || !authResult.user) {
      return createErrorResponse(
        authResult.error!.message,
        authResult.error!.status
      );
    }

    const user: EnhancedAuthenticatedUser = authResult.user;

    // Check restaurant access
    const hasAccess = await checkRestaurantAccess(user, id);
    if (!hasAccess) {
      await logAccessDenied(user, `restaurant:${id}:hours`, 'No access to this restaurant', request);
      return createErrorResponse('Access denied', 403);
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

    // RBAC Authentication with proper types
    const authResult = await validateRBACToken(request);
    if (!authResult.success || !authResult.user) {
      return createErrorResponse(
        authResult.error!.message,
        authResult.error!.status
      );
    }

    const user: EnhancedAuthenticatedUser = authResult.user;

    // Check permission - only owners and admins can modify hours
    if (!hasRoleType(user, 'restaurant_owner', 'platform_admin')) {
      await logAccessDenied(user, `restaurant:${id}:hours`, 'Insufficient role permissions', request);
      return createErrorResponse('Permission denied: Only owners can modify hours', 403);
    }

    const hasAccess = await checkRestaurantAccess(user, id);
    if (!hasAccess) {
      await logAccessDenied(user, `restaurant:${id}:hours`, 'No access to this restaurant', request);
      return createErrorResponse('Access denied', 403);
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