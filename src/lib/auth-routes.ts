/**
 * Centralized Authentication Routes Configuration
 *
 * Single source of truth for all authentication-related routes.
 * Following CLAUDE.md principles:
 * - Single Responsibility: Manage all auth route paths
 * - DRY Principle: Define routes once, use everywhere
 * - Type Safety: Const assertions for compile-time safety
 *
 * @see CLAUDE.md - Coding Standards: Single Source of Truth
 */

/**
 * Authentication route paths
 * Use these constants instead of hardcoding paths
 */
export const AUTH_ROUTES = {
  /** Main login page */
  LOGIN: '/login',

  /** User registration page */
  REGISTER: '/register',

  /** Forgot password request page */
  FORGOT_PASSWORD: '/forgot-password',

  /** Password reset page (with token) */
  RESET_PASSWORD: '/reset-password',

  /** Change password page (authenticated users) */
  CHANGE_PASSWORD: '/change-password',

  /** Staff password help page */
  STAFF_PASSWORD_HELP: '/staff-password-help',
} as const;

/**
 * Type for authentication route keys
 */
export type AuthRouteKey = keyof typeof AUTH_ROUTES;

/**
 * Type for authentication route paths
 */
export type AuthRoutePath = (typeof AUTH_ROUTES)[AuthRouteKey];

/**
 * Build a login URL with optional redirect parameter
 *
 * @param redirectPath - Optional path to redirect to after login
 * @returns Full login URL with redirect query parameter if provided
 *
 * @example
 * ```typescript
 * // Simple login URL
 * getLoginUrl() // => '/login'
 *
 * // Login with redirect
 * getLoginUrl('/dashboard') // => '/login?redirect=%2Fdashboard'
 * ```
 */
export function getLoginUrl(redirectPath?: string): string {
  if (!redirectPath || redirectPath === AUTH_ROUTES.LOGIN) {
    return AUTH_ROUTES.LOGIN;
  }

  const url = new URL(AUTH_ROUTES.LOGIN, 'http://localhost');
  url.searchParams.set('redirect', redirectPath);
  return `${url.pathname}${url.search}`;
}

/**
 * Check if a path is an authentication route
 *
 * @param pathname - Path to check
 * @returns True if the path is an authentication route
 *
 * @example
 * ```typescript
 * isAuthRoute('/login') // => true
 * isAuthRoute('/dashboard') // => false
 * ```
 */
export function isAuthRoute(pathname: string): boolean {
  return Object.values(AUTH_ROUTES).some((route) => pathname.startsWith(route));
}
