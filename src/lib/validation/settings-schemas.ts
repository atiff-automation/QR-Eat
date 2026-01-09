import { z } from 'zod';

/**
 * Settings Validation Schemas
 * Zod schemas for validating restaurant settings updates
 */

// ============================================================================
// GENERAL INFORMATION
// ============================================================================

export const GeneralInfoSchema = z.object({
  name: z
    .string()
    .min(2, 'Name must be at least 2 characters')
    .max(100, 'Name must be at most 100 characters'),
  address: z
    .string()
    .min(5, 'Address must be at least 5 characters')
    .max(200, 'Address must be at most 200 characters'),
  phone: z.string().optional(),
  email: z.string().email('Invalid email format').optional(),
  description: z
    .string()
    .max(500, 'Description must be at most 500 characters')
    .optional(),
});

export const GeneralInfoUpdateSchema = GeneralInfoSchema.omit({ name: true });

export type GeneralInfo = z.infer<typeof GeneralInfoSchema>;

// ============================================================================
// OPERATING HOURS
// ============================================================================

// Time slot with validation that close time is after open time
export const TimeSlotSchema = z
  .object({
    open: z
      .string()
      .regex(
        /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/,
        'Invalid time format (HH:MM)'
      ),
    close: z
      .string()
      .regex(
        /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/,
        'Invalid time format (HH:MM)'
      ),
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

export const OperatingHoursSchema = z.object({
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

export type OperatingHours = z.infer<typeof OperatingHoursSchema>;
export type TimeSlot = z.infer<typeof TimeSlotSchema>;

// ============================================================================
// FINANCIAL SETTINGS
// ============================================================================

// Supported currencies (ISO 4217 codes)
const SUPPORTED_CURRENCIES = [
  'MYR',
  'SGD',
  'THB',
  'IDR',
  'PHP',
  'VND',
  'USD',
  'EUR',
  'GBP',
  'AUD',
  'JPY',
  'CNY',
  'HKD',
  'TWD',
  'KRW',
  'INR',
  'BDT',
  'NPR',
] as const;

export const FinancialSettingsSchema = z.object({
  currency: z.enum(SUPPORTED_CURRENCIES),
  taxRate: z
    .number()
    .min(0, 'Tax rate cannot be negative')
    .max(1, 'Tax rate cannot exceed 100%'),
  serviceChargeRate: z
    .number()
    .min(0, 'Service charge rate cannot be negative')
    .max(1, 'Service charge rate cannot exceed 100%'),
  taxLabel: z
    .string()
    .min(1, 'Tax label is required')
    .max(50, 'Tax label must be at most 50 characters'),
  serviceChargeLabel: z
    .string()
    .min(1, 'Service charge label is required')
    .max(50, 'Service charge label must be at most 50 characters'),
});

export type FinancialSettings = z.infer<typeof FinancialSettingsSchema>;

// ============================================================================
// NOTIFICATION SETTINGS
// ============================================================================

export const NotificationSettingsSchema = z.object({
  notificationSettings: z.object({
    orderAlerts: z.boolean(),
    soundEnabled: z.boolean(),
    soundType: z.enum(['chime', 'bell', 'ding', 'silent']),
    desktopNotifications: z.boolean(),
  }),
});

export type NotificationSettings = z.infer<typeof NotificationSettingsSchema>;

// ============================================================================
// PAYMENT METHODS
// ============================================================================

export const PaymentMethodsSchema = z.object({
  paymentMethods: z
    .object({
      cash: z.boolean(),
      card: z.boolean(),
      ewallet: z.boolean(),
    })
    .refine(
      (data) => {
        // At least one payment method must be enabled
        return data.cash || data.card || data.ewallet;
      },
      {
        message: 'At least one payment method must be enabled',
      }
    ),
});

export type PaymentMethods = z.infer<typeof PaymentMethodsSchema>;

// ============================================================================
// RECEIPT SETTINGS
// ============================================================================

export const ReceiptSettingsSchema = z.object({
  receiptSettings: z.object({
    headerText: z
      .string()
      .max(200, 'Header text must be at most 200 characters'),
    footerText: z
      .string()
      .max(200, 'Footer text must be at most 200 characters'),
    paperSize: z.literal('80mm'), // Fixed as per requirement
  }),
});

export type ReceiptSettings = z.infer<typeof ReceiptSettingsSchema>;

// ============================================================================
// SYSTEM PREFERENCES
// ============================================================================

export const SystemPreferencesSchema = z.object({
  systemPreferences: z.object({
    dateFormat: z.enum(['DD/MM/YYYY', 'MM/DD/YYYY', 'YYYY-MM-DD']),
    timeFormat: z.enum(['12h', '24h']),
    language: z.enum(['en', 'ms', 'zh']),
  }),
});

export type SystemPreferences = z.infer<typeof SystemPreferencesSchema>;
