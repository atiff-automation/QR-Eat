/**
 * Domain Configuration
 * Centralized domain settings for subdomain routing
 *
 * @module config/domains
 */

/**
 * Get the base domain for the application
 * @returns Base domain (e.g., 'tabtep.app')
 * @throws Error if NEXT_PUBLIC_BASE_DOMAIN is not set
 */
export function getBaseDomain(): string {
  const baseDomain = process.env.NEXT_PUBLIC_BASE_DOMAIN;

  if (!baseDomain) {
    const errorMsg = [
      'NEXT_PUBLIC_BASE_DOMAIN environment variable is not set.',
      'This is required for subdomain routing.',
      'Please add it to your .env file:',
      '  NEXT_PUBLIC_BASE_DOMAIN=tabtep.app',
    ].join('\n');

    console.error('[Domain Config Error]', errorMsg);
    throw new Error(errorMsg);
  }

  return baseDomain;
}

/**
 * Get the main domain (where staff/admin access the app)
 * @returns Main domain (e.g., 'tabtep.app')
 * @throws Error if NEXT_PUBLIC_MAIN_DOMAIN is not set
 */
export function getMainDomain(): string {
  const mainDomain = process.env.NEXT_PUBLIC_MAIN_DOMAIN;

  if (!mainDomain) {
    const errorMsg = [
      'NEXT_PUBLIC_MAIN_DOMAIN environment variable is not set.',
      'This is required for staff access routing.',
      'Please add it to your .env file:',
      '  NEXT_PUBLIC_MAIN_DOMAIN=tabtep.app',
    ].join('\n');

    console.error('[Domain Config Error]', errorMsg);
    throw new Error(errorMsg);
  }

  return mainDomain;
}

/**
 * Build a subdomain URL for a restaurant
 *
 * @example
 * ```typescript
 * buildSubdomainUrl('marios', '/qr/123')
 * // Returns: https://marios.tabtep.app/qr/123 (production)
 * // Returns: http://marios.localhost:3000/qr/123 (development)
 * ```
 *
 * @param slug - Restaurant slug (alphanumeric, hyphens, underscores only)
 * @param path - Path (must start with /)
 * @returns Full URL
 * @throws Error if slug is invalid
 */
export function buildSubdomainUrl(slug: string, path: string = '/'): string {
  // ✅ PRODUCTION: Validate slug format (prevent URL injection)
  const slugRegex = /^[a-z0-9-_]+$/i;
  if (!slugRegex.test(slug)) {
    throw new Error(
      `Invalid slug format: "${slug}". ` +
        `Slug must contain only letters, numbers, hyphens, and underscores.`
    );
  }

  // ✅ PRODUCTION: Validate slug length (DNS subdomain limits)
  if (slug.length < 2 || slug.length > 63) {
    throw new Error(
      `Invalid slug length: "${slug}". ` +
        `Slug must be between 2 and 63 characters.`
    );
  }

  const baseDomain = getBaseDomain();
  const protocol = process.env.NODE_ENV === 'production' ? 'https' : 'http';
  const cleanPath = path.startsWith('/') ? path : `/${path}`;

  return `${protocol}://${slug}.${baseDomain}${cleanPath}`;
}

/**
 * Build a URL for the main domain (staff access)
 *
 * @example
 * ```typescript
 * buildMainDomainUrl('/login')
 * // Returns: https://tabtep.app/login (production)
 * // Returns: http://localhost:3000/login (development)
 * ```
 *
 * @param path - Path to append (e.g., '/login', '/dashboard')
 * @returns Full URL to main domain
 */
export function buildMainDomainUrl(path: string = '/'): string {
  const mainDomain = getMainDomain();
  const protocol = process.env.NODE_ENV === 'production' ? 'https' : 'http';
  const cleanPath = path.startsWith('/') ? path : `/${path}`;

  return `${protocol}://${mainDomain}${cleanPath}`;
}

// Export as constants (these will throw if env vars not set)
export const BASE_DOMAIN = getBaseDomain();
export const MAIN_DOMAIN = getMainDomain();
