/**
 * Settings Validation Schemas
 * Comprehensive validation for all settings sections
 *
 * @see implementation_plan_production_v3.md - Validation Layer
 */

import { z } from 'zod';

// ============================================================================
// Timezone Validation
// ============================================================================

/**
 * Valid IANA timezones for Southeast Asia + common zones
 * Expandable list based on restaurant locations
 */
const VALID_TIMEZONES = [
  'Asia/Kuala_Lumpur',
  'Asia/Singapore',
  'Asia/Bangkok',
  'Asia/Jakarta',
  'Asia/Manila',
  'Asia/Hong_Kong',
  'Asia/Tokyo',
  'Asia/Dubai',
  'UTC',
] as const;

// ============================================================================
// Operating Hours Validation
// ============================================================================

/**
 * Time slot schema with validation
 * Ensures close time is after open time
 */
export const TimeSlotSchema = z
  .object({
    open: z.string().regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, {
      message: 'Invalid time format. Use HH:MM (e.g., 09:00)',
    }),
    close: z.string().regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, {
      message: 'Invalid time format. Use HH:MM (e.g., 17:00)',
    }),
  })
  .refine(
    (data) => {
      // Validate that close time is after open time
      const [openHour, openMin] = data.open.split(':').map(Number);
      const [closeHour, closeMin] = data.close.split(':').map(Number);
      const openMinutes = openHour * 60 + openMin;
      const closeMinutes = closeHour * 60 + closeMin;
      return closeMinutes > openMinutes;
    },
    {
      message: 'Closing time must be after opening time',
    }
  );

/**
 * Operating hours schema for all days of the week
 */
export const OperatingHoursSchema = z.object({
  timezone: z.enum(VALID_TIMEZONES, {
    errorMap: () => ({ message: 'Invalid timezone' }),
  }),
  operatingHours: z.object({
    monday: z.array(TimeSlotSchema).optional(),
    tuesday: z.array(TimeSlotSchema).optional(),
    wednesday: z.array(TimeSlotSchema).optional(),
    thursday: z.array(TimeSlotSchema).optional(),
    friday: z.array(TimeSlotSchema).optional(),
    saturday: z.array(TimeSlotSchema).optional(),
    sunday: z.array(TimeSlotSchema).optional(),
  }),
});

// ============================================================================
// General Information Validation
// ============================================================================

export const GeneralInfoSchema = z.object({
  name: z
    .string()
    .min(2, 'Restaurant name must be at least 2 characters')
    .max(100, 'Restaurant name must not exceed 100 characters'),
  address: z
    .string()
    .min(5, 'Address must be at least 5 characters')
    .max(200, 'Address must not exceed 200 characters'),
  phone: z
    .string()
    .regex(
      /^[+]?[(]?[0-9]{1,4}[)]?[-\s.]?[(]?[0-9]{1,4}[)]?[-\s.]?[0-9]{1,9}$/,
      {
        message: 'Invalid phone number format',
      }
    )
    .optional()
    .or(z.literal('')),
  email: z.string().email('Invalid email address').optional().or(z.literal('')),
});

// ============================================================================
// Financial Settings Validation
// ============================================================================

export const FinancialSettingsSchema = z.object({
  currency: z
    .string()
    .length(3, 'Currency code must be 3 characters (ISO 4217)')
    .regex(
      /^[A-Z]{3}$/,
      'Currency code must be uppercase letters (e.g., MYR, USD)'
    ),
  taxRate: z
    .number()
    .min(0, 'Tax rate cannot be negative')
    .max(1, 'Tax rate cannot exceed 100% (use decimal, e.g., 0.06 for 6%)'),
  serviceChargeRate: z
    .number()
    .min(0, 'Service charge rate cannot be negative')
    .max(
      1,
      'Service charge rate cannot exceed 100% (use decimal, e.g., 0.10 for 10%)'
    ),
  taxLabel: z
    .string()
    .min(1, 'Tax label is required')
    .max(50, 'Tax label must not exceed 50 characters'),
  serviceChargeLabel: z
    .string()
    .min(1, 'Service charge label is required')
    .max(50, 'Service charge label must not exceed 50 characters'),
});

// ============================================================================
// Notification Settings Validation
// ============================================================================

export const NotificationSettingsSchema = z.object({
  notificationSettings: z.object({
    orderAlerts: z.boolean(),
    soundEnabled: z.boolean(),
    soundType: z.enum(['chime', 'bell', 'ding', 'silent'], {
      errorMap: () => ({ message: 'Invalid sound type' }),
    }),
    desktopNotifications: z.boolean(),
  }),
});

// ============================================================================
// Payment Methods Validation
// ============================================================================

export const PaymentMethodsSchema = z
  .object({
    paymentMethods: z.object({
      cash: z.boolean(),
      card: z.boolean(),
      ewallet: z.boolean(),
    }),
  })
  .refine(
    (data) => {
      // At least one payment method must be enabled
      const methods = data.paymentMethods;
      return methods.cash || methods.card || methods.ewallet;
    },
    {
      message: 'At least one payment method must be enabled',
      path: ['paymentMethods'],
    }
  );

// ============================================================================
// Receipt Settings Validation
// ============================================================================

export const ReceiptSettingsSchema = z.object({
  receiptSettings: z.object({
    headerText: z
      .string()
      .max(200, 'Header text must not exceed 200 characters')
      .optional()
      .or(z.literal('')),
    footerText: z
      .string()
      .max(200, 'Footer text must not exceed 200 characters')
      .optional()
      .or(z.literal('')),
    paperSize: z.literal('80mm'), // Fixed as per requirement
  }),
});

// ============================================================================
// System Preferences Validation
// ============================================================================

export const SystemPreferencesSchema = z.object({
  systemPreferences: z.object({
    dateFormat: z.enum(['DD/MM/YYYY', 'MM/DD/YYYY', 'YYYY-MM-DD'], {
      errorMap: () => ({ message: 'Invalid date format' }),
    }),
    timeFormat: z.enum(['12h', '24h'], {
      errorMap: () => ({ message: 'Invalid time format' }),
    }),
    numberFormat: z.enum(['1,234.56', '1.234,56'], {
      errorMap: () => ({ message: 'Invalid number format' }),
    }),
  }),
});

// ============================================================================
// Combined Settings Schema (for full update)
// ============================================================================

export const AllSettingsSchema = GeneralInfoSchema.merge(OperatingHoursSchema)
  .merge(FinancialSettingsSchema)
  .merge(NotificationSettingsSchema)
  .merge(PaymentMethodsSchema)
  .merge(ReceiptSettingsSchema)
  .merge(SystemPreferencesSchema);

// ============================================================================
// Type Exports
// ============================================================================

export type TimeSlot = z.infer<typeof TimeSlotSchema>;
export type OperatingHours = z.infer<typeof OperatingHoursSchema>;
export type GeneralInfo = z.infer<typeof GeneralInfoSchema>;
export type FinancialSettings = z.infer<typeof FinancialSettingsSchema>;
export type NotificationSettings = z.infer<typeof NotificationSettingsSchema>;
export type PaymentMethods = z.infer<typeof PaymentMethodsSchema>;
export type ReceiptSettings = z.infer<typeof ReceiptSettingsSchema>;
export type SystemPreferences = z.infer<typeof SystemPreferencesSchema>;
export type AllSettings = z.infer<typeof AllSettingsSchema>;
