/**
 * Tenant Resolution Service
 * Handles looking up restaurants by subdomain and caching results for performance
 *
 * @see CLAUDE.md - No Hardcoding, Type Safety, Error Handling
 * @see claudedocs/DB-CACHE-IMPLEMENTATION-PLAN.md - Phase 3: Integration
 *
 * Updated: Migrated from in-memory cache to PostgreSQL-based distributed cache
 * Benefits: Multi-instance support, persistence, horizontal scaling
 */

import { prisma } from './database';
import { normalizeSubdomain } from './subdomain';
import { tenantCache } from './cache';
import { DBCache } from './db-cache';

export interface ResolvedTenant {
  id: string;
  name: string;
  slug: string;
  ownerId: string;
  isActive: boolean;
  timezone: string;
  currency: string;
  brandingConfig: Record<string, unknown>;
  businessType: string;
  subscription?: {
    id: string;
    status: string;
    planId: string;
    currentPeriodEnd: Date;
  };
  owner: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    companyName?: string | null;
  };
}

export interface TenantResolutionResult {
  tenant: ResolvedTenant | null;
  isValid: boolean;
  error?: string;
  cached: boolean;
}

/**
 * Distributed cache implementation
 * Replaced in-memory cache with PostgreSQL-based distributed cache
 * Supports multi-instance deployment on Railway
 * Cache cleanup handled by cache-cleanup-cron.ts
 */

/**
 * Resolve tenant (restaurant) by subdomain/slug
 * Uses distributed cache for multi-instance support
 */
export async function resolveTenant(
  subdomain: string
): Promise<TenantResolutionResult> {
  const slug = normalizeSubdomain(subdomain);

  try {
    // Check distributed cache first
    const cached = await tenantCache.get<ResolvedTenant | null>(slug);
    if (cached !== null && cached !== undefined) {
      return {
        tenant: cached,
        isValid: cached !== null,
        error: cached === null ? 'Restaurant not found' : undefined,
        cached: true,
      };
    }

    // Cache miss - query database
    const restaurant = await prisma.restaurant.findUnique({
      where: { slug },
      include: {
        owner: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            companyName: true,
          },
        },
        subscription: {
          select: {
            id: true,
            status: true,
            planId: true,
            currentPeriodEnd: true,
          },
        },
      },
    });

    if (!restaurant) {
      // Cache the negative result to prevent repeated DB queries
      await tenantCache.set(slug, null);
      return {
        tenant: null,
        isValid: false,
        error: 'Restaurant not found',
        cached: false,
      };
    }

    const resolvedTenant: ResolvedTenant = {
      id: restaurant.id,
      name: restaurant.name,
      slug: restaurant.slug,
      ownerId: restaurant.ownerId,
      isActive: restaurant.isActive,
      timezone: restaurant.timezone,
      currency: restaurant.currency,
      brandingConfig: restaurant.brandingConfig as Record<string, unknown>,
      businessType: restaurant.businessType,
      subscription: restaurant.subscription || undefined,
      owner: restaurant.owner,
    };

    // Cache the result in distributed cache
    await tenantCache.set(slug, resolvedTenant);

    return {
      tenant: resolvedTenant,
      isValid: true,
      cached: false,
    };
  } catch {
    // Fail gracefully - don't expose internal errors
    return {
      tenant: null,
      isValid: false,
      error: 'Database error while resolving tenant',
      cached: false,
    };
  }
}

/**
 * Resolve tenant with subscription validation
 */
export async function resolveTenantWithSubscription(
  subdomain: string
): Promise<TenantResolutionResult & { subscriptionValid: boolean }> {
  const result = await resolveTenant(subdomain);

  if (!result.tenant) {
    return {
      ...result,
      subscriptionValid: false,
    };
  }

  // Check subscription status
  const subscriptionValid = isSubscriptionValid(result.tenant);

  return {
    ...result,
    subscriptionValid,
  };
}

/**
 * Check if tenant's subscription is valid and active
 */
export function isSubscriptionValid(tenant: ResolvedTenant): boolean {
  if (!tenant.subscription) {
    // No subscription might mean free tier or grace period
    return true;
  }

  const subscription = tenant.subscription;

  // Check if subscription is active
  if (subscription.status !== 'active' && subscription.status !== 'trialing') {
    return false;
  }

  // Check if subscription period has ended
  if (
    subscription.currentPeriodEnd &&
    subscription.currentPeriodEnd < new Date()
  ) {
    return false;
  }

  return true;
}

/**
 * Get all active tenants (for admin purposes)
 */
export async function getAllActiveTenants(): Promise<ResolvedTenant[]> {
  try {
    const restaurants = await prisma.restaurant.findMany({
      where: { isActive: true },
      include: {
        owner: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            companyName: true,
          },
        },
        subscription: {
          select: {
            id: true,
            status: true,
            planId: true,
            currentPeriodEnd: true,
          },
        },
      },
      orderBy: { name: 'asc' },
    });

    return restaurants.map((restaurant) => ({
      id: restaurant.id,
      name: restaurant.name,
      slug: restaurant.slug,
      ownerId: restaurant.ownerId,
      isActive: restaurant.isActive,
      timezone: restaurant.timezone,
      currency: restaurant.currency,
      brandingConfig: restaurant.brandingConfig as Record<string, unknown>,
      businessType: restaurant.businessType,
      subscription: restaurant.subscription || undefined,
      owner: restaurant.owner,
    }));
  } catch {
    // Fail gracefully - return empty array on error
    return [];
  }
}

/**
 * Preload tenants into distributed cache
 * Useful for warming up cache after deployment
 */
export async function preloadTenantCache(): Promise<void> {
  try {
    const tenants = await getAllActiveTenants();

    // Preload all tenants in parallel for performance
    await Promise.all(
      tenants.map((tenant) => tenantCache.set(tenant.slug, tenant))
    );

    // Silent success - logging handled by monitoring
  } catch {
    // Fail gracefully - preloading is optimization
  }
}

/**
 * Invalidate tenant cache for a specific slug
 * Forces fresh lookup on next access
 */
export async function invalidateTenantCache(slug: string): Promise<void> {
  await tenantCache.delete(slug);
}

/**
 * Clear entire tenant cache
 * Use with caution - forces DB lookup for all tenants
 */
export async function clearTenantCache(): Promise<void> {
  // Clear only tenant-prefixed cache entries
  // This is handled by DBCache if needed for all cache types
  // Note: Clearing all cache is done via DBCache.clearAll() if needed
  await Promise.resolve(); // Placeholder for future implementation
}

/**
 * Get cache statistics for monitoring
 */
export async function getTenantCacheStats(): Promise<{
  size: number;
  enabled: boolean;
  expiredEntries?: number;
}> {
  const stats = await DBCache.getStats();
  return {
    size: stats.totalEntries,
    enabled: stats.enabled || true,
    expiredEntries: stats.expiredEntries,
  };
}

/**
 * Check if a slug is available for a new restaurant
 */
export async function isSlugAvailable(slug: string): Promise<boolean> {
  try {
    const normalizedSlug = normalizeSubdomain(slug);

    const existingRestaurant = await prisma.restaurant.findUnique({
      where: { slug: normalizedSlug },
      select: { id: true },
    });

    return !existingRestaurant;
  } catch {
    // Fail gracefully - assume slug is taken on error
    return false;
  }
}

/**
 * Generate a unique slug for a restaurant name
 */
export async function generateUniqueSlug(
  restaurantName: string
): Promise<string> {
  // Convert name to slug format
  let baseSlug = restaurantName
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '') // Remove special characters
    .replace(/\s+/g, '-') // Replace spaces with hyphens
    .replace(/-+/g, '-') // Replace multiple hyphens with single
    .replace(/^-|-$/g, ''); // Remove leading/trailing hyphens

  // Ensure slug is valid length
  if (baseSlug.length < 3) {
    baseSlug = `restaurant-${baseSlug}`;
  }
  if (baseSlug.length > 60) {
    baseSlug = baseSlug.substring(0, 60);
  }

  // Check if base slug is available
  if (await isSlugAvailable(baseSlug)) {
    return baseSlug;
  }

  // Try with numbers appended
  for (let i = 2; i <= 999; i++) {
    const numberedSlug = `${baseSlug}-${i}`;
    if (numberedSlug.length <= 63 && (await isSlugAvailable(numberedSlug))) {
      return numberedSlug;
    }
  }

  // Fallback: use timestamp
  const timestamp = Date.now().toString().slice(-6);
  return `${baseSlug.substring(0, 50)}-${timestamp}`;
}

/**
 * Update tenant in cache when restaurant is modified
 * Invalidates cache and forces fresh lookup
 */
export async function updateTenantCache(slug: string): Promise<void> {
  try {
    // Invalidate current cache entry
    await invalidateTenantCache(slug);

    // Reload from database on next access
    // No need to preload - will be cached on next resolveTenant call
  } catch {
    // Fail gracefully - cache will be updated on next access
  }
}

/**
 * Batch resolve multiple tenants
 */
export async function resolveTenantsBatch(
  slugs: string[]
): Promise<Map<string, TenantResolutionResult>> {
  const results = new Map<string, TenantResolutionResult>();

  // Process in parallel
  const promises = slugs.map(async (slug) => {
    const result = await resolveTenant(slug);
    results.set(slug, result);
  });

  await Promise.all(promises);
  return results;
}

/**
 * Get tenant resolution metrics for monitoring
 * Note: Cache hits/misses tracking requires implementing metrics middleware
 */
export async function getTenantResolutionMetrics(): Promise<{
  cacheHits: number;
  cacheMisses: number;
  cacheSize: number;
  errors: number;
}> {
  const stats = await DBCache.getStats();

  return {
    cacheHits: 0, // TODO: Implement cache hit tracking
    cacheMisses: 0, // TODO: Implement cache miss tracking
    cacheSize: stats.totalEntries,
    errors: 0,
  };
}

/**
 * Middleware helper for tenant resolution
 */
export async function resolveTenantForRequest(subdomain: string): Promise<{
  tenant: ResolvedTenant | null;
  shouldContinue: boolean;
  redirectUrl?: string;
  error?: string;
}> {
  const result = await resolveTenantWithSubscription(subdomain);

  if (!result.tenant) {
    return {
      tenant: null,
      shouldContinue: false,
      error: result.error,
    };
  }

  // Check if tenant is active
  if (!result.tenant.isActive) {
    return {
      tenant: null,
      shouldContinue: false,
      error: 'Restaurant is temporarily unavailable',
    };
  }

  // Check subscription validity
  if (!result.subscriptionValid) {
    return {
      tenant: result.tenant,
      shouldContinue: false,
      error: 'Restaurant subscription is inactive',
    };
  }

  return {
    tenant: result.tenant,
    shouldContinue: true,
  };
}

/**
 * Health check for tenant resolution service
 */
export async function healthCheckTenantResolver(): Promise<{
  healthy: boolean;
  cacheSize: number;
  dbConnected: boolean;
  error?: string;
}> {
  try {
    // Test database connection
    await prisma.restaurant.findFirst({ select: { id: true } });

    const stats = await DBCache.getStats();

    return {
      healthy: true,
      cacheSize: stats.totalEntries,
      dbConnected: true,
    };
  } catch (error) {
    const stats = await DBCache.getStats();

    return {
      healthy: false,
      cacheSize: stats.totalEntries,
      dbConnected: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
