/**
 * Counter loyalty notice read (§18.20.6).
 *
 * The Counter cannot capture consent without the server-derived notice: member
 * attach validates `consentVersion`/`consentTextHash` against it. The only other
 * source is the QR token response, which the Counter does not have.
 *
 * This service is intentionally narrow: it reads `LoyaltySettings` for one
 * restaurant and resolves the notice with `resolveNotice()`. It never returns
 * member data and never accepts a `restaurantId` from the caller's request
 * path/headers; callers pass the authenticated context's restaurant id.
 */

import { prisma } from '@/lib/database';
import { resolveNotice, type LoyaltyNotice } from '@/lib/loyalty/consent';
import { isLoyaltyActive, isLoyaltyGloballyEnabled } from '@/lib/loyalty/flags';

/** The Counter-facing notice state. `enabled` is the effective flag. */
export interface CounterLoyaltyNotice {
  enabled: boolean;
  notice: LoyaltyNotice | null;
}

/**
 * Resolve the Counter notice for a restaurant.
 *
 * Returns `enabled: false` (not an error) when loyalty is globally off, the
 * restaurant has not enabled it, or the stored notice is incomplete or
 * inconsistent. The global flag is checked first so a disabled deployment
 * performs no database query.
 */
export async function getCounterLoyaltyNotice(
  restaurantId: string
): Promise<CounterLoyaltyNotice> {
  if (!isLoyaltyGloballyEnabled()) {
    return { enabled: false, notice: null };
  }

  const settings = await prisma.loyaltySettings.findUnique({
    where: { restaurantId },
    select: {
      enabled: true,
      noticeVersion: true,
      noticeText: true,
      noticeTextHash: true,
      privacyUrl: true,
      termsText: true,
    },
  });

  if (!isLoyaltyActive(settings)) {
    return { enabled: false, notice: null };
  }

  const notice = resolveNotice(settings);
  if (!notice) {
    return { enabled: false, notice: null };
  }

  return { enabled: true, notice };
}
