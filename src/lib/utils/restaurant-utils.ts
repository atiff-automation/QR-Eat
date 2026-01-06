/**
 * Restaurant Utilities
 * Operating hours validation and restaurant-specific logic
 *
 * @see implementation_plan_production_v3.md - Integration Utilities
 */

import { Prisma } from '@prisma/client';

interface TimeSlot {
  open: string; // "HH:MM"
  close: string; // "HH:MM"
}

interface OperatingHours {
  monday?: TimeSlot[];
  tuesday?: TimeSlot[];
  wednesday?: TimeSlot[];
  thursday?: TimeSlot[];
  friday?: TimeSlot[];
  saturday?: TimeSlot[];
  sunday?: TimeSlot[];
}

/**
 * Check if restaurant is currently open based on operating hours and timezone
 *
 * @param operatingHours - Restaurant operating hours (JSONB from database)
 * @param timezone - Restaurant timezone (IANA timezone string)
 * @returns true if restaurant is open, false if closed
 */
export function isRestaurantOpen(
  operatingHours: Prisma.JsonValue,
  timezone: string
): boolean {
  try {
    const hours = operatingHours as OperatingHours;

    // Get current time in restaurant's timezone
    const now = new Date();
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      weekday: 'long',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });

    const parts = formatter.formatToParts(now);
    const weekday = parts
      .find((p) => p.type === 'weekday')
      ?.value.toLowerCase();
    const currentHour = parseInt(
      parts.find((p) => p.type === 'hour')?.value || '0'
    );
    const currentMinute = parseInt(
      parts.find((p) => p.type === 'minute')?.value || '0'
    );
    const currentMinutes = currentHour * 60 + currentMinute;

    // Get time slots for current day
    const daySlots = hours[weekday as keyof OperatingHours];
    if (!daySlots || daySlots.length === 0) {
      return false; // Closed on this day
    }

    // Check if current time falls within any time slot
    for (const slot of daySlots) {
      const [openHour, openMin] = slot.open.split(':').map(Number);
      const [closeHour, closeMin] = slot.close.split(':').map(Number);
      const openMinutes = openHour * 60 + openMin;
      const closeMinutes = closeHour * 60 + closeMin;

      if (currentMinutes >= openMinutes && currentMinutes < closeMinutes) {
        return true;
      }
    }

    return false;
  } catch (error) {
    console.error('Error checking operating hours:', error);
    return true; // Fail open - allow orders if check fails
  }
}
