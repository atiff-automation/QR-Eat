/**
 * Loyalty feature flags.
 *
 * Loyalty runs only when both switches are on (§18.20.15 D):
 * - the process-wide `LOYALTY_ENABLED` env flag, and
 * - `LoyaltySettings.enabled` for the restaurant.
 *
 * The env flag is fail-closed: only the exact string `"true"` enables it.
 * `"TRUE"`, `"1"`, `"yes"`, an unset value or anything else is off.
 */

/** The environment shape accepted by the flag helpers. */
export type LoyaltyFlagEnv = Record<string, string | undefined>;

/** The subset of `LoyaltySettings` the flag helper needs. */
export interface LoyaltySettingsFlag {
  enabled: boolean;
}

/**
 * Whether the global loyalty feature is enabled.
 *
 * Only the exact string `"true"` is accepted. Whitespace or a different case is
 * deliberately treated as disabled so a typo cannot enable loyalty in
 * production.
 */
export function isLoyaltyGloballyEnabled(
  env: LoyaltyFlagEnv = process.env
): boolean {
  return env.LOYALTY_ENABLED === 'true';
}

/**
 * Whether loyalty is active for a restaurant.
 *
 * Both the global flag and the restaurant setting must be on. A missing
 * settings row is inactive.
 */
export function isLoyaltyActive(
  settings: LoyaltySettingsFlag | null | undefined,
  env: LoyaltyFlagEnv = process.env
): boolean {
  return isLoyaltyGloballyEnabled(env) && settings?.enabled === true;
}
