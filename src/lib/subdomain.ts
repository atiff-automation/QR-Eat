/**
 * Subdomain Detection and Utility Functions
 * Handles multi-tenant subdomain routing for the SaaS restaurant system
 */

import { NextRequest } from 'next/server';

export interface SubdomainInfo {
  subdomain: string | null;
  isSubdomain: boolean;
  isMainDomain: boolean;
  fullDomain: string;
  host: string;
  baseDomain: string;
}

export interface TenantSubdomainConfig {
  slug: string;
  customDomain?: string;
  isActive: boolean;
  redirectToMainDomain?: boolean;
}

// Configuration for subdomain handling
const SUBDOMAIN_CONFIG = {
  // Main domain configurations
  MAIN_DOMAINS: [
    'localhost:3000',
    'tabtep.local',
    'tabtep.com',
    'tabtep.app',
    // Railway deployment domains
    'up.railway.app',
    'railway.app',
  ],

  // Reserved subdomains that cannot be used for restaurants
  RESERVED_SUBDOMAINS: [
    'www',
    'admin',
    'api',
    'app',
    'dashboard',
    'portal',
    'console',
    'manage',
    'system',
    'platform',
    'mail',
    'email',
    'support',
    'help',
    'docs',
    'cdn',
    'static',
    'assets',
    'media',
    'files',
    'images',
    'blog',
    'news',
    'about',
    'contact',
    'legal',
    'privacy',
    'terms',
    'billing',
    'payments',
    'auth',
    'login',
    'signup',
    'register',
    'test',
    'dev',
    'staging',
    'preview',
    'demo',
    'example',
  ],

  // Development environment settings
  DEV_MODE: process.env.NODE_ENV === 'development',

  // Force HTTPS in production
  FORCE_HTTPS: process.env.NODE_ENV === 'production',
};

/**
 * Extract subdomain information from a request
 */
export function getSubdomainInfo(request: NextRequest): SubdomainInfo {
  const host = request.headers.get('host') || '';

  // Extract subdomain from host first
  const parts = host.split('.');

  // Handle localhost development - check if it's a subdomain
  if (SUBDOMAIN_CONFIG.DEV_MODE && host.includes('localhost')) {
    // For localhost:3000 - this is main domain
    if (host === 'localhost:3000' || host === 'localhost') {
      return {
        subdomain: null,
        isSubdomain: false,
        isMainDomain: true,
        fullDomain: host,
        host: host,
        baseDomain: host,
      };
    }

    // For subdomain.localhost:3000 - this is a subdomain
    if (parts.length >= 2 && parts[1].startsWith('localhost')) {
      const subdomain = parts[0];
      return {
        subdomain: subdomain,
        isSubdomain: true,
        isMainDomain: false,
        fullDomain: host,
        host: host,
        baseDomain: parts.slice(1).join('.'),
      };
    }
  }

  // Need at least 3 parts for subdomain (sub.domain.com)
  if (parts.length < 3) {
    return {
      subdomain: null,
      isSubdomain: false,
      isMainDomain: true,
      fullDomain: host,
      host: host,
      baseDomain: host,
    };
  }

  const subdomain = parts[0];
  const baseDomain = parts.slice(1).join('.');

  // Check if this is a main domain
  // STRICT MATCH: Only consider it a main domain if the FULL HOST matches one of the main domains
  // This fixes the bug where *.tabtep.app was being treated as a main domain
  const isMainDomain = SUBDOMAIN_CONFIG.MAIN_DOMAINS.some(
    (domain) => host === domain
  );

  return {
    subdomain: subdomain,
    isSubdomain: !isMainDomain && subdomain !== 'www',
    isMainDomain: isMainDomain || subdomain === 'www',
    fullDomain: host,
    host: host,
    baseDomain: baseDomain,
  };
}

/**
 * Check if a subdomain is reserved and cannot be used for restaurants
 */
export function isReservedSubdomain(subdomain: string): boolean {
  return SUBDOMAIN_CONFIG.RESERVED_SUBDOMAINS.includes(subdomain.toLowerCase());
}

/**
 * Validate if a subdomain is available for restaurant use
 */
export function isValidRestaurantSubdomain(subdomain: string): boolean {
  // Must not be empty
  if (!subdomain || subdomain.trim() === '') {
    return false;
  }

  // Must be lowercase
  if (subdomain !== subdomain.toLowerCase()) {
    return false;
  }

  // Must not be reserved
  if (isReservedSubdomain(subdomain)) {
    return false;
  }

  // Must match allowed pattern (alphanumeric and hyphens, no consecutive hyphens)
  const subdomainPattern = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/;
  if (!subdomainPattern.test(subdomain)) {
    return false;
  }

  // Must not start or end with hyphen
  if (subdomain.startsWith('-') || subdomain.endsWith('-')) {
    return false;
  }

  // Must be between 3 and 63 characters
  if (subdomain.length < 3 || subdomain.length > 63) {
    return false;
  }

  return true;
}

/**
 * Generate a URL with subdomain
 */
export function generateSubdomainUrl(
  subdomain: string,
  path: string = '/',
  baseDomain?: string
): string {
  // Use provided base domain or determine from environment
  const domain = baseDomain || getBaseDomain();

  // Handle development localhost
  if (SUBDOMAIN_CONFIG.DEV_MODE && domain.includes('localhost')) {
    return `http://${subdomain}.${domain}${path}`;
  }

  const protocol = SUBDOMAIN_CONFIG.FORCE_HTTPS ? 'https' : 'http';
  return `${protocol}://${subdomain}.${domain}${path}`;
}

/**
 * Get the base domain for the current environment
 */
export function getBaseDomain(): string {
  if (SUBDOMAIN_CONFIG.DEV_MODE) {
    return 'localhost:3000';
  }

  // In production, this should be set via environment variable
  return process.env.BASE_DOMAIN || 'tabtep.com';
}

/**
 * Extract subdomain from URL string
 */
export function extractSubdomainFromUrl(url: string): string | null {
  try {
    const urlObj = new URL(url);
    const host = urlObj.hostname;
    const parts = host.split('.');

    if (parts.length >= 3) {
      const subdomain = parts[0];
      if (subdomain !== 'www' && !isReservedSubdomain(subdomain)) {
        return subdomain;
      }
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Check if current request is from a subdomain
 */
export function isSubdomainRequest(request: NextRequest): boolean {
  const info = getSubdomainInfo(request);
  return info.isSubdomain;
}

/**
 * Get the restaurant slug from subdomain
 * In our system, subdomain === restaurant.slug
 */
export function getRestaurantSlugFromSubdomain(
  request: NextRequest
): string | null {
  const info = getSubdomainInfo(request);

  if (!info.isSubdomain || !info.subdomain) {
    return null;
  }

  return info.subdomain;
}

/**
 * Generate main domain URL from subdomain request
 */
export function getMainDomainUrl(
  request: NextRequest,
  path: string = '/'
): string {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _info = getSubdomainInfo(request);
  const protocol = SUBDOMAIN_CONFIG.FORCE_HTTPS ? 'https' : 'http';

  if (SUBDOMAIN_CONFIG.DEV_MODE) {
    return `http://localhost:3000${path}`;
  }

  return `${protocol}://${getBaseDomain()}${path}`;
}

/**
 * Create redirect response to main domain
 */
export function redirectToMainDomain(
  request: NextRequest,
  path: string = '/'
): Response {
  const mainUrl = getMainDomainUrl(request, path);
  return Response.redirect(mainUrl, 302);
}

/**
 * Create redirect response to subdomain
 */
export function redirectToSubdomain(
  request: NextRequest,
  subdomain: string,
  path: string = '/'
): Response {
  const subdomainUrl = generateSubdomainUrl(subdomain, path);
  return Response.redirect(subdomainUrl, 302);
}

/**
 * Normalize subdomain for database lookup
 * Converts subdomain to restaurant slug format
 */
export function normalizeSubdomain(subdomain: string): string {
  return subdomain.toLowerCase().trim();
}

/**
 * Get allowed subdomain patterns for validation
 */
export function getSubdomainValidationRules(): {
  pattern: RegExp;
  minLength: number;
  maxLength: number;
  reservedList: string[];
} {
  return {
    pattern: /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/,
    minLength: 3,
    maxLength: 63,
    reservedList: SUBDOMAIN_CONFIG.RESERVED_SUBDOMAINS,
  };
}

/**
 * Format subdomain error message for user feedback
 */
export function getSubdomainErrorMessage(subdomain: string): string {
  if (!subdomain || subdomain.trim() === '') {
    return 'Subdomain cannot be empty';
  }

  if (subdomain !== subdomain.toLowerCase()) {
    return 'Subdomain must be lowercase';
  }

  if (isReservedSubdomain(subdomain)) {
    return 'This subdomain is reserved and cannot be used';
  }

  if (subdomain.startsWith('-') || subdomain.endsWith('-')) {
    return 'Subdomain cannot start or end with a hyphen';
  }

  if (subdomain.length < 3) {
    return 'Subdomain must be at least 3 characters long';
  }

  if (subdomain.length > 63) {
    return 'Subdomain cannot be longer than 63 characters';
  }

  const pattern = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/;
  if (!pattern.test(subdomain)) {
    return 'Subdomain can only contain lowercase letters, numbers, and hyphens';
  }

  return 'Invalid subdomain format';
}

/**
 * Check if subdomain routing is enabled for the current environment
 */
export function isSubdomainRoutingEnabled(): boolean {
  return (
    process.env.ENABLE_SUBDOMAIN_ROUTING === 'true' || SUBDOMAIN_CONFIG.DEV_MODE
  );
}

/**
 * Get subdomain configuration for development
 */
export function getDevSubdomainConfig(): {
  enabled: boolean;
  testSubdomains: string[];
  mainDomain: string;
} {
  return {
    enabled: SUBDOMAIN_CONFIG.DEV_MODE,
    testSubdomains: [
      'marios-authentic-italian',
      'tasty-burger-westside',
      'tasty-burger-downtown',
    ],
    mainDomain: 'localhost:3000',
  };
}

/**
 * Extract tenant context from subdomain
 */
export interface SubdomainTenantInfo {
  slug: string;
  isValid: boolean;
  isReserved: boolean;
  error?: string;
}

export function getSubdomainTenantInfo(
  request: NextRequest
): SubdomainTenantInfo | null {
  const info = getSubdomainInfo(request);

  if (!info.isSubdomain || !info.subdomain) {
    return null;
  }

  const slug = normalizeSubdomain(info.subdomain);

  return {
    slug,
    isValid: isValidRestaurantSubdomain(slug),
    isReserved: isReservedSubdomain(slug),
    error: isValidRestaurantSubdomain(slug)
      ? undefined
      : getSubdomainErrorMessage(slug),
  };
}

/**
 * Check if request should be handled by subdomain routing
 */
export function shouldHandleSubdomain(request: NextRequest): boolean {
  // Skip subdomain handling for API routes, static files, and system paths
  const pathname = request.nextUrl.pathname;

  const skipPaths = [
    '/api/',
    '/_next/',
    '/favicon.',
    '/robots.txt',
    '/sitemap.xml',
    '/health',
    '/ping',
    '/sw.js',
  ];

  if (skipPaths.some((path) => pathname.startsWith(path))) {
    return false;
  }

  // Only handle if subdomain routing is enabled and this is a subdomain request
  return isSubdomainRoutingEnabled() && isSubdomainRequest(request);
}

/**
 * Log subdomain information for debugging
 */
export function logSubdomainInfo(request: NextRequest): void {
  if (SUBDOMAIN_CONFIG.DEV_MODE) {
    const info = getSubdomainInfo(request);
    console.log('🌐 Subdomain Info:', {
      host: info.host,
      subdomain: info.subdomain,
      isSubdomain: info.isSubdomain,
      isMainDomain: info.isMainDomain,
      path: request.nextUrl.pathname,
    });
  }
}
