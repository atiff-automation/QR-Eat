/**
 * Subdomain-aware Authentication Functions
 * Handles authentication logic specific to subdomain access
 */

import { NextRequest } from 'next/server';
import { getSubdomainInfo, getRestaurantSlugFromSubdomain } from './subdomain';

export interface SubdomainAuthContext {
  isSubdomain: boolean;
  restaurantSlug: string | null;
  restaurantId: string | null;
  restaurantName: string | null;
  allowedUserTypes: UserTypeConfig[];
  loginRedirectUrl: string;
  defaultRedirectUrl: string;
}

export interface UserTypeConfig {
  type: 'staff' | 'restaurant_owner' | 'platform_admin';
  label: string;
  description: string;
  restrictToTenant?: boolean;
}

/**
 * Get authentication context for subdomain requests
 */
export function getSubdomainAuthContext(
  request?: NextRequest
): SubdomainAuthContext {
  // Default context for main domain
  let context: SubdomainAuthContext = {
    isSubdomain: false,
    restaurantSlug: null,
    restaurantId: null,
    restaurantName: null,
    allowedUserTypes: [
      {
        type: 'platform_admin',
        label: 'Platform Admin',
        description: 'Access to all restaurants and admin features',
      },
      {
        type: 'restaurant_owner',
        label: 'Restaurant Owner',
        description: 'Manage your restaurants',
      },
      {
        type: 'staff',
        label: 'Staff Member',
        description: 'Access to restaurant dashboard',
      },
    ],
    loginRedirectUrl: '/login',
    defaultRedirectUrl: '/dashboard',
  };

  if (request) {
    const subdomainInfo = getSubdomainInfo(request);

    if (subdomainInfo.isSubdomain && subdomainInfo.subdomain) {
      const restaurantSlug = getRestaurantSlugFromSubdomain(request);

      // Get tenant info from headers if available (set by middleware)
      const restaurantId = request.headers.get('x-tenant-id');
      const restaurantName = request.headers.get('x-tenant-name');

      context = {
        isSubdomain: true,
        restaurantSlug,
        restaurantId,
        restaurantName,
        allowedUserTypes: [
          {
            type: 'staff',
            label: 'Staff Login',
            description: `Access ${restaurantName || 'restaurant'} dashboard`,
            restrictToTenant: true,
          },
          {
            type: 'restaurant_owner',
            label: 'Owner Access',
            description: `Manage ${restaurantName || 'this restaurant'}`,
            restrictToTenant: true,
          },
        ],
        loginRedirectUrl: '/login',
        defaultRedirectUrl: '/dashboard',
      };
    }
  }

  return context;
}

/**
 * Get authentication context from browser (client-side)
 */
export function getClientSubdomainAuthContext(): SubdomainAuthContext {
  if (typeof window === 'undefined') {
    return getSubdomainAuthContext();
  }

  const hostname = window.location.hostname;
  const parts = hostname.split('.');

  // Check if this is localhost
  const isLocalhost = hostname.includes('localhost');

  // Check if this is a known main domain or platform deployment
  const isMainDomain =
    isLocalhost ||
    parts.length < 3 ||
    parts[0] === 'www' ||
    // Railway domains: *.up.railway.app, *.railway.app
    hostname.endsWith('.up.railway.app') ||
    hostname.endsWith('.railway.app') ||
    // Vercel domains: *.vercel.app
    hostname.endsWith('.vercel.app') ||
    // Netlify domains: *.netlify.app
    hostname.endsWith('.netlify.app');

  // Only treat as subdomain if it's NOT a main domain
  const isSubdomain = !isMainDomain;

  if (isSubdomain) {
    const restaurantSlug = parts[0];

    return {
      isSubdomain: true,
      restaurantSlug,
      restaurantId: null, // Will be resolved later
      restaurantName: null, // Will be resolved later
      allowedUserTypes: [
        {
          type: 'staff',
          label: 'Staff Login',
          description: 'Access restaurant dashboard',
          restrictToTenant: true,
        },
        {
          type: 'restaurant_owner',
          label: 'Owner Access',
          description: 'Manage this restaurant',
          restrictToTenant: true,
        },
      ],
      loginRedirectUrl: '/login',
      defaultRedirectUrl: '/dashboard',
    };
  }

  return getSubdomainAuthContext();
}

/**
 * Validate if a user can access a specific restaurant via subdomain
 */
export function canUserAccessRestaurantSubdomain(
  userType: string,
  userRestaurantId: string | null,
  targetRestaurantId: string,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _userOwnerId?: string
): { canAccess: boolean; reason?: string } {
  // Platform admins can access any restaurant
  if (userType === 'platform_admin') {
    return { canAccess: true };
  }

  // Restaurant owners can access their own restaurants
  if (userType === 'restaurant_owner') {
    // We need to verify the restaurant belongs to this owner
    // This will be checked in the API route
    return { canAccess: true };
  }

  // Staff can only access their assigned restaurant
  if (userType === 'staff') {
    if (userRestaurantId === targetRestaurantId) {
      return { canAccess: true };
    }
    return {
      canAccess: false,
      reason: 'Staff can only access their assigned restaurant',
    };
  }

  return {
    canAccess: false,
    reason: 'Invalid user type or insufficient permissions',
  };
}

/**
 * Get redirect URL after successful login based on context
 */
export function getLoginRedirectUrl(
  authContext: SubdomainAuthContext,
  userType: string,
  userRole?: string,
  redirectParam?: string
): string {
  // If there's a specific redirect parameter, use it
  if (redirectParam && redirectParam !== '/dashboard') {
    return redirectParam;
  }

  // Handle subdomain-specific redirects
  if (authContext.isSubdomain) {
    // For subdomain access, always redirect to dashboard
    // The subdomain context will be maintained
    if (userType === 'staff' && userRole === 'kitchen_staff') {
      return '/kitchen';
    }
    return '/dashboard';
  }

  // Handle main domain redirects
  switch (userType) {
    case 'platform_admin':
      return '/admin/dashboard';
    case 'restaurant_owner':
      // Always redirect to /dashboard first for password change check
      // DashboardLayout will handle the password change requirement
      return '/dashboard';
    case 'staff':
      if (userRole === 'kitchen_staff') {
        return '/kitchen';
      }
      return '/dashboard';
    default:
      return '/dashboard';
  }
}

/**
 * Get appropriate login form configuration for context
 */
export function getLoginFormConfig(authContext: SubdomainAuthContext): {
  title: string;
  subtitle: string;
  showQuickLogin: boolean;
  quickLoginOptions: Array<{
    id: string;
    label: string;
    email: string;
    password: string;
    userType: string;
  }>;
} {
  if (authContext.isSubdomain) {
    return {
      title: authContext.restaurantName || 'Restaurant Login',
      subtitle: 'Staff and Management Access',
      showQuickLogin: process.env.NODE_ENV === 'development',
      quickLoginOptions: [
        {
          id: 'staff1',
          label: 'Manager',
          email: 'mario@marios-authentic.com',
          password: 'staff123',
          userType: 'staff',
        },
        {
          id: 'staff2',
          label: 'Waiter',
          email: 'luigi@marios-authentic.com',
          password: 'staff123',
          userType: 'staff',
        },
        {
          id: 'staff3',
          label: 'Kitchen',
          email: 'giuseppe@marios-authentic.com',
          password: 'staff123',
          userType: 'staff',
        },
      ],
    };
  }

  return {
    title: 'QR Restaurant System',
    subtitle: 'Multi-Tenant SaaS Login',
    showQuickLogin: process.env.NODE_ENV === 'development',
    quickLoginOptions: [
      {
        id: 'admin',
        label: 'Platform Admin',
        email: 'admin@qrorder.com',
        password: 'admin123',
        userType: 'platform_admin',
      },
      {
        id: 'owner1',
        label: 'Mario (Owner)',
        email: 'mario@rossigroup.com',
        password: 'owner123',
        userType: 'restaurant_owner',
      },
      {
        id: 'owner2',
        label: 'John (Owner)',
        email: 'john@tastychainfood.com',
        password: 'owner123',
        userType: 'restaurant_owner',
      },
      {
        id: 'staff1',
        label: 'Manager',
        email: 'mario@marios-authentic.com',
        password: 'staff123',
        userType: 'staff',
      },
      {
        id: 'staff2',
        label: 'Waiter',
        email: 'luigi@marios-authentic.com',
        password: 'staff123',
        userType: 'staff',
      },
      {
        id: 'staff3',
        label: 'Kitchen',
        email: 'giuseppe@marios-authentic.com',
        password: 'staff123',
        userType: 'staff',
      },
    ],
  };
}

/**
 * Validate subdomain access permissions after login
 */
export function validateSubdomainAccess(
  authContext: SubdomainAuthContext,
  userType: string,
  userRestaurantId?: string,
  userOwnerId?: string
): { isValid: boolean; error?: string; redirectUrl?: string } {
  if (!authContext.isSubdomain) {
    return { isValid: true };
  }

  if (!authContext.restaurantId) {
    return {
      isValid: false,
      error: 'Restaurant not found',
      redirectUrl: '/restaurant-not-found',
    };
  }

  const accessCheck = canUserAccessRestaurantSubdomain(
    userType,
    userRestaurantId || null,
    authContext.restaurantId,
    userOwnerId
  );

  if (!accessCheck.canAccess) {
    return {
      isValid: false,
      error: accessCheck.reason || 'Access denied',
      redirectUrl: '/access-denied',
    };
  }

  return { isValid: true };
}

/**
 * Create subdomain-aware login payload
 */
export function createSubdomainLoginPayload(
  email: string,
  password: string,
  authContext: SubdomainAuthContext
): Record<string, unknown> {
  const payload: Record<string, unknown> = { email, password };

  if (authContext.isSubdomain && authContext.restaurantSlug) {
    payload.restaurantSlug = authContext.restaurantSlug;
    payload.expectedTenantId = authContext.restaurantId;
  }

  return payload;
}

/**
 * Handle post-login redirect with subdomain awareness
 */
export function handlePostLoginRedirect(
  authContext: SubdomainAuthContext,
  loginResponse: Record<string, unknown>,
  redirectParam?: string
): string {
  const userType = loginResponse.userType as string;
  const user = loginResponse.user as Record<string, unknown> | undefined;
  const currentRole = user?.currentRole as Record<string, unknown> | undefined;
  const userRole = currentRole?.roleTemplate as string | undefined;

  // Validate subdomain access if needed
  if (authContext.isSubdomain) {
    const validation = validateSubdomainAccess(
      authContext,
      userType,
      user?.restaurantId as string | undefined,
      user?.ownerId as string | undefined
    );

    if (!validation.isValid) {
      return validation.redirectUrl || '/access-denied';
    }
  }

  return getLoginRedirectUrl(authContext, userType, userRole, redirectParam);
}

/**
 * Get error message for subdomain authentication failures
 */
export function getSubdomainAuthErrorMessage(
  error: string,
  authContext: SubdomainAuthContext
): string {
  if (!authContext.isSubdomain) {
    return error;
  }

  // Customize error messages for subdomain context
  if (
    error.includes('User not found') ||
    error.includes('Invalid credentials')
  ) {
    return `Invalid credentials for ${authContext.restaurantName || 'this restaurant'}. Please check your email and password.`;
  }

  if (error.includes('restaurant') || error.includes('tenant')) {
    return `You don't have access to ${authContext.restaurantName || 'this restaurant'}. Please contact your manager.`;
  }

  return error;
}
