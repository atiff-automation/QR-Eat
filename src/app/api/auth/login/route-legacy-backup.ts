import { NextRequest, NextResponse } from 'next/server';
import { AuthService, AUTH_CONSTANTS, UserType, getCookieNameForUserType } from '@/lib/auth';
import { prisma } from '@/lib/database';
import { getSubdomainInfo, getRestaurantSlugFromSubdomain } from '@/lib/subdomain';
import { resolveTenant } from '@/lib/tenant-resolver';
import { canUserAccessRestaurantSubdomain } from '@/lib/subdomain-auth';

export async function POST(request: NextRequest) {
  try {
    const { email, password, restaurantSlug } = await request.json();

    if (!email || !password) {
      return NextResponse.json(
        { error: 'Email and password are required' },
        { status: 400 }
      );
    }

    // Check if this is a subdomain request
    const currentSlug = getRestaurantSlugFromSubdomain(request) || restaurantSlug;
    
    // If subdomain access, validate the restaurant exists
    let tenantContext = null;
    if (currentSlug) {
      const tenantResult = await resolveTenant(currentSlug);
      if (!tenantResult.isValid || !tenantResult.tenant) {
        return NextResponse.json(
          { error: 'Restaurant not found or unavailable' },
          { status: 404 }
        );
      }
      tenantContext = tenantResult.tenant;
    }

    // Authenticate user (platform admin, restaurant owner, or staff)
    let user;
    try {
      user = await AuthService.authenticateUser(email, password);
    } catch (error) {
      // Handle specific errors
      if (error instanceof Error) {
        if (error.message.includes('Restaurant is inactive')) {
          return NextResponse.json(
            { error: error.message },
            { status: 403 }
          );
        }
      }
      throw error; // Re-throw other errors
    }

    if (!user) {
      return NextResponse.json(
        { error: 'Invalid credentials' },
        { status: 401 }
      );
    }

    // Validate subdomain access if applicable
    if (tenantContext) {
      const accessCheck = canUserAccessRestaurantSubdomain(
        user.type,
        user.type === UserType.STAFF ? user.user.restaurantId : null,
        tenantContext.id,
        user.type === UserType.RESTAURANT_OWNER ? user.user.id : undefined
      );

      if (!accessCheck.canAccess) {
        return NextResponse.json(
          { error: accessCheck.reason || 'Access denied to this restaurant' },
          { status: 403 }
        );
      }

      // Additional validation for restaurant owners
      if (user.type === UserType.RESTAURANT_OWNER) {
        const ownsRestaurant = await prisma.restaurant.findFirst({
          where: {
            id: tenantContext.id,
            ownerId: user.user.id
          }
        });

        if (!ownsRestaurant) {
          return NextResponse.json(
            { error: 'You do not own this restaurant' },
            { status: 403 }
          );
        }
      }

      // Additional validation for staff
      if (user.type === UserType.STAFF && user.user.restaurantId !== tenantContext.id) {
        return NextResponse.json(
          { error: 'You are not assigned to this restaurant' },
          { status: 403 }
        );
      }
    }

    // Check for account lockout (if applicable)
    if ('lockedUntil' in user.user && user.user.lockedUntil && user.user.lockedUntil > new Date()) {
      const lockoutMinutes = Math.ceil(
        (user.user.lockedUntil.getTime() - Date.now()) / (1000 * 60)
      );
      return NextResponse.json(
        { error: `Account locked. Try again in ${lockoutMinutes} minutes.` },
        { status: 423 }
      );
    }

    // Reset failed login attempts if applicable
    if ('failedLoginAttempts' in user.user) {
      const updateData = {
        failedLoginAttempts: 0,
        lockedUntil: null,
        lastLoginAt: new Date(),
      };

      switch (user.type) {
        case UserType.PLATFORM_ADMIN:
          await prisma.platformAdmin.update({
            where: { id: user.user.id },
            data: updateData,
          });
          break;
        case UserType.RESTAURANT_OWNER:
          await prisma.restaurantOwner.update({
            where: { id: user.user.id },
            data: updateData,
          });
          break;
        case UserType.STAFF:
          await prisma.staff.update({
            where: { id: user.user.id },
            data: updateData,
          });
          break;
      }
    }

    // Generate JWT token
    const token = AuthService.generateToken(user);

    // Create session based on user type
    const sessionToken = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
    const ipAddress = request.headers.get('x-forwarded-for') || 'unknown';
    const userAgent = request.headers.get('user-agent') || 'unknown';

    // Clean up any existing sessions for this user to prevent conflicts
    switch (user.type) {
      case UserType.PLATFORM_ADMIN:
        // Remove old sessions for this admin
        await prisma.platformAdminSession.deleteMany({
          where: { adminId: user.user.id }
        });
        await prisma.platformAdminSession.create({
          data: {
            adminId: user.user.id,
            sessionToken,
            ipAddress,
            userAgent,
            expiresAt,
          },
        });
        break;
      case UserType.RESTAURANT_OWNER:
        // Remove old sessions for this owner
        await prisma.restaurantOwnerSession.deleteMany({
          where: { ownerId: user.user.id }
        });
        await prisma.restaurantOwnerSession.create({
          data: {
            ownerId: user.user.id,
            sessionToken,
            ipAddress,
            userAgent,
            expiresAt,
          },
        });
        break;
      case UserType.STAFF:
        // Remove old sessions for this staff member
        await prisma.staffSession.deleteMany({
          where: { staffId: user.user.id }
        });
        await prisma.staffSession.create({
          data: {
            staffId: user.user.id,
            sessionToken,
            ipAddress,
            userAgent,
            expiresAt,
          },
        });
        break;
    }

    // Create response based on user type
    const responseData: Record<string, unknown> = {
      message: 'Login successful',
      userType: user.type,
      user: {
        id: user.user.id,
        email: user.user.email,
        firstName: user.user.firstName,
        lastName: user.user.lastName,
      },
    };

    // Add tenant context if subdomain access
    if (tenantContext) {
      responseData.tenant = {
        id: tenantContext.id,
        name: tenantContext.name,
        slug: tenantContext.slug,
        isActive: tenantContext.isActive
      };
    }

    switch (user.type) {
      case UserType.PLATFORM_ADMIN:
        responseData.user.role = 'platform_admin';
        break;
      case UserType.RESTAURANT_OWNER:
        responseData.user.restaurants = user.user.restaurants;
        responseData.user.companyName = user.user.companyName;
        responseData.user.mustChangePassword = user.user.mustChangePassword;
        break;
      case UserType.STAFF:
        responseData.user.username = user.user.username;
        responseData.user.restaurantId = user.user.restaurantId;
        responseData.user.mustChangePassword = user.user.mustChangePassword;
        responseData.user.restaurant = user.user.restaurant;
        responseData.user.role = {
          id: user.user.role.id,
          name: user.user.role.name,
          permissions: user.user.role.permissions,
        };
        break;
    }

    const response = NextResponse.json(responseData);

    // Use user-type specific cookie names to prevent session mixing
    const cookieName = getCookieNameForUserType(user.type);
    
    // CRITICAL: Only clear cookies that exist in the current request
    // This prevents affecting other browsers/sessions
    const currentCookies = [
      request.cookies.get(AUTH_CONSTANTS.COOKIE_NAME)?.value ? AUTH_CONSTANTS.COOKIE_NAME : null,
      request.cookies.get(AUTH_CONSTANTS.OWNER_COOKIE_NAME)?.value ? AUTH_CONSTANTS.OWNER_COOKIE_NAME : null,
      request.cookies.get(AUTH_CONSTANTS.STAFF_COOKIE_NAME)?.value ? AUTH_CONSTANTS.STAFF_COOKIE_NAME : null,
      request.cookies.get(AUTH_CONSTANTS.ADMIN_COOKIE_NAME)?.value ? AUTH_CONSTANTS.ADMIN_COOKIE_NAME : null
    ].filter(Boolean);
    
    // Only clear cookies that actually exist in this request and are not the one we're setting
    currentCookies.forEach(name => {
      if (name !== cookieName) {
        response.cookies.set({
          name: name,
          value: '',
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'lax',
          maxAge: 0, // Expire immediately
          path: '/',
        });
      }
    });
    
    // Set the correct user-type specific cookie
    response.cookies.set({
      name: cookieName,
      value: token,
      httpOnly: true, // Security: Prevent XSS attacks by disabling client-side access
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 24 * 60 * 60, // 24 hours
      path: '/',
      // In development, ensure cookies are properly isolated per session
      domain: process.env.NODE_ENV === 'development' ? undefined : undefined
    });

    // Debug logging (non-sensitive info only)
    if (process.env.NODE_ENV === 'development') {
      console.log('🔑 Login successful for user type:', user.type);
      console.log('🌐 Request URL:', request.url);
      console.log('🔧 Session Debug:', {
        userId: user.user.id,
        userType: user.type,
        email: user.user.email,
        cookieName: cookieName,
        tokenLength: token.length,
        clearedCookies: currentCookies.filter(name => name !== cookieName),
        currentCookiesInRequest: currentCookies,
        ipAddress,
        userAgent: userAgent.substring(0, 50) + '...'
      });
    }

    return response;
  } catch (error) {
    console.error('Login error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
