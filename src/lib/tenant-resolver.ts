/**
 * Tenant Resolution Service
 * Handles looking up restaurants by subdomain and caching results for performance
 */

import { prisma } from './database';
import { normalizeSubdomain } from './subdomain';

export interface ResolvedTenant {
  id: string;
  name: string;
  slug: string;
  ownerId: string;
  isActive: boolean;
  timezone: string;
  currency: string;
  brandingConfig: any;
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
 * In-memory cache for tenant resolution
 * In production, this should be replaced with Redis or similar
 */
class TenantCache {
  private cache: Map<string, { data: ResolvedTenant | null; timestamp: number }> = new Map();
  private ttl: number = 5 * 60 * 1000; // 5 minutes TTL

  get(slug: string): ResolvedTenant | null | undefined {
    const cached = this.cache.get(slug);
    
    if (!cached) {
      return undefined; // Not in cache
    }
    
    // Check if cache entry is expired
    if (Date.now() - cached.timestamp > this.ttl) {
      this.cache.delete(slug);
      return undefined; // Expired
    }
    
    return cached.data;
  }

  set(slug: string, tenant: ResolvedTenant | null): void {
    this.cache.set(slug, {
      data: tenant,
      timestamp: Date.now()
    });
  }

  delete(slug: string): void {
    this.cache.delete(slug);
  }

  clear(): void {
    this.cache.clear();
  }

  size(): number {
    return this.cache.size;
  }

  // Clean up expired entries
  cleanup(): void {
    const now = Date.now();
    for (const [slug, cached] of this.cache.entries()) {
      if (now - cached.timestamp > this.ttl) {
        this.cache.delete(slug);
      }
    }
  }
}

// Global cache instance
const tenantCache = new TenantCache();

// Clean up cache every 10 minutes
if (typeof window === 'undefined') {
  setInterval(() => {
    tenantCache.cleanup();
  }, 10 * 60 * 1000);
}

/**
 * Resolve tenant (restaurant) by subdomain/slug
 */
export async function resolveTenant(subdomain: string): Promise<TenantResolutionResult> {
  const slug = normalizeSubdomain(subdomain);
  
  try {
    // Check cache first
    const cached = tenantCache.get(slug);
    if (cached !== undefined) {
      return {
        tenant: cached,
        isValid: cached !== null,
        error: cached === null ? 'Restaurant not found' : undefined,
        cached: true
      };
    }

    // Query database
    const restaurant = await prisma.restaurant.findUnique({
      where: { slug },
      include: {
        owner: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            companyName: true
          }
        },
        subscription: {
          select: {
            id: true,
            status: true,
            planId: true,
            currentPeriodEnd: true
          }
        }
      }
    });

    if (!restaurant) {
      // Cache the negative result
      tenantCache.set(slug, null);
      return {
        tenant: null,
        isValid: false,
        error: 'Restaurant not found',
        cached: false
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
      brandingConfig: restaurant.brandingConfig,
      businessType: restaurant.businessType,
      subscription: restaurant.subscription || undefined,
      owner: restaurant.owner
    };

    // Cache the result
    tenantCache.set(slug, resolvedTenant);

    return {
      tenant: resolvedTenant,
      isValid: true,
      cached: false
    };

  } catch (error) {
    console.error('Error resolving tenant:', error);
    return {
      tenant: null,
      isValid: false,
      error: 'Database error while resolving tenant',
      cached: false
    };
  }
}

/**
 * Resolve tenant with subscription validation
 */
export async function resolveTenantWithSubscription(subdomain: string): Promise<TenantResolutionResult & { subscriptionValid: boolean }> {
  const result = await resolveTenant(subdomain);
  
  if (!result.tenant) {
    return {
      ...result,
      subscriptionValid: false
    };
  }

  // Check subscription status
  const subscriptionValid = isSubscriptionValid(result.tenant);

  return {
    ...result,
    subscriptionValid
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
  if (subscription.currentPeriodEnd && subscription.currentPeriodEnd < new Date()) {
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
            companyName: true
          }
        },
        subscription: {
          select: {
            id: true,
            status: true,
            planId: true,
            currentPeriodEnd: true
          }
        }
      },
      orderBy: { name: 'asc' }
    });

    return restaurants.map(restaurant => ({
      id: restaurant.id,
      name: restaurant.name,
      slug: restaurant.slug,
      ownerId: restaurant.ownerId,
      isActive: restaurant.isActive,
      timezone: restaurant.timezone,
      currency: restaurant.currency,
      brandingConfig: restaurant.brandingConfig,
      businessType: restaurant.businessType,
      subscription: restaurant.subscription || undefined,
      owner: restaurant.owner
    }));

  } catch (error) {
    console.error('Error fetching all tenants:', error);
    return [];
  }
}

/**
 * Preload tenants into cache
 */
export async function preloadTenantCache(): Promise<void> {
  try {
    const tenants = await getAllActiveTenants();
    
    for (const tenant of tenants) {
      tenantCache.set(tenant.slug, tenant);
    }
    
    console.log(`🏢 Preloaded ${tenants.length} tenants into cache`);
  } catch (error) {
    console.error('Error preloading tenant cache:', error);
  }
}

/**
 * Invalidate tenant cache for a specific slug
 */
export function invalidateTenantCache(slug: string): void {
  tenantCache.delete(slug);
}

/**
 * Clear entire tenant cache
 */
export function clearTenantCache(): void {
  tenantCache.clear();
}

/**
 * Get cache statistics
 */
export function getTenantCacheStats(): {
  size: number;
  enabled: boolean;
} {
  return {
    size: tenantCache.size(),
    enabled: true
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
      select: { id: true }
    });

    return !existingRestaurant;
  } catch (error) {
    console.error('Error checking slug availability:', error);
    return false;
  }
}

/**
 * Generate a unique slug for a restaurant name
 */
export async function generateUniqueSlug(restaurantName: string): Promise<string> {
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
    if (numberedSlug.length <= 63 && await isSlugAvailable(numberedSlug)) {
      return numberedSlug;
    }
  }

  // Fallback: use timestamp
  const timestamp = Date.now().toString().slice(-6);
  return `${baseSlug.substring(0, 50)}-${timestamp}`;
}

/**
 * Update tenant in cache when restaurant is modified
 */
export async function updateTenantCache(slug: string): Promise<void> {
  try {
    // Invalidate current cache
    invalidateTenantCache(slug);
    
    // Reload from database
    await resolveTenant(slug);
  } catch (error) {
    console.error('Error updating tenant cache:', error);
  }
}

/**
 * Batch resolve multiple tenants
 */
export async function resolveTenantsBatch(slugs: string[]): Promise<Map<string, TenantResolutionResult>> {
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
 */
export function getTenantResolutionMetrics(): {
  cacheHits: number;
  cacheMisses: number;
  cacheSize: number;
  errors: number;
} {
  // In a production system, you'd track these metrics properly
  return {
    cacheHits: 0,
    cacheMisses: 0,
    cacheSize: tenantCache.size(),
    errors: 0
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
      error: result.error
    };
  }

  // Check if tenant is active
  if (!result.tenant.isActive) {
    return {
      tenant: null,
      shouldContinue: false,
      error: 'Restaurant is temporarily unavailable'
    };
  }

  // Check subscription validity
  if (!result.subscriptionValid) {
    return {
      tenant: result.tenant,
      shouldContinue: false,
      error: 'Restaurant subscription is inactive'
    };
  }

  return {
    tenant: result.tenant,
    shouldContinue: true
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
    
    return {
      healthy: true,
      cacheSize: tenantCache.size(),
      dbConnected: true
    };
  } catch (error) {
    return {
      healthy: false,
      cacheSize: tenantCache.size(),
      dbConnected: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}