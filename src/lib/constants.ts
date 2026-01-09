/**
 * Application Constants
 * Single source of truth for app-wide configuration
 */

/**
 * Default restaurant timezone for MVP
 * All restaurants operate in Malaysia timezone (GMT+8)
 *
 * @constant
 * @readonly
 */
export const DEFAULT_RESTAURANT_TIMEZONE = 'Asia/Kuala_Lumpur' as const;

/**
 * Timezone display name for UI
 */
export const TIMEZONE_DISPLAY_NAME = 'Malaysia (GMT+8)' as const;
