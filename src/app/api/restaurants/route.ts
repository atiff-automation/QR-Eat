import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/database';
import { 
  getTenantContext, 
  requireAuth, 
  requirePermission,
  getUserRestaurants,
  validateRestaurantOwnership
} from '@/lib/tenant-context';
import { UserType } from '@/lib/auth';

export async function GET(request: NextRequest) {
  try {
    // Get tenant context from middleware headers
    const context = getTenantContext(request);
    requireAuth(context);

    const url = new URL(request.url);
    const includeSubscription = url.searchParams.get('includeSubscription') === 'true';
    const includeStats = url.searchParams.get('includeStats') === 'true';

    // Get restaurants based on user type and permissions
    if (context!.isAdmin) {
      // Platform admins can see all restaurants
      const restaurants = await prisma.restaurant.findMany({
        include: {
          owner: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              companyName: true
            }
          },
          subscription: includeSubscription ? {
            include: {
              plan: {
                select: {
                  name: true,
                  monthlyFee: true,
                  features: true
                }
              }
            }
          } : false,
          _count: includeStats ? {
            select: {
              staff: true,
              tables: true,
              orders: true,
              menuItems: true
            }
          } : false
        },
        orderBy: { name: 'asc' }
      });

      return NextResponse.json({
        success: true,
        restaurants,
        userContext: {
          userType: context!.userType,
          isAdmin: true
        }
      });
    }

    if (context!.userType === UserType.RESTAURANT_OWNER) {
      // Restaurant owners can see their restaurants
      const restaurants = await prisma.restaurant.findMany({
        where: { ownerId: context!.userId },
        include: {
          subscription: includeSubscription ? {
            include: {
              plan: {
                select: {
                  name: true,
                  monthlyFee: true,
                  features: true
                }
              }
            }
          } : false,
          _count: includeStats ? {
            select: {
              staff: true,
              tables: true,
              orders: true,
              menuItems: true
            }
          } : false
        },
        orderBy: { name: 'asc' }
      });

      return NextResponse.json({
        success: true,
        restaurants,
        userContext: {
          userType: context!.userType,
          ownerId: context!.userId
        }
      });
    }

    if (context!.userType === UserType.STAFF) {
      // Staff can only see their assigned restaurant
      requirePermission(context!, 'restaurants', 'read');
      
      if (!context!.restaurantId) {
        return NextResponse.json(
          { error: 'Staff member not assigned to any restaurant' },
          { status: 400 }
        );
      }

      const restaurant = await prisma.restaurant.findUnique({
        where: { id: context!.restaurantId },
        include: {
          owner: {
            select: {
              firstName: true,
              lastName: true,
              email: true,
              companyName: true
            }
          },
          _count: includeStats ? {
            select: {
              staff: true,
              tables: true,
              orders: true,
              menuItems: true
            }
          } : false
        }
      });

      if (!restaurant) {
        return NextResponse.json(
          { error: 'Restaurant not found' },
          { status: 404 }
        );
      }

      return NextResponse.json({
        success: true,
        restaurants: [restaurant],
        userContext: {
          userType: context!.userType,
          restaurantId: context!.restaurantId
        }
      });
    }

    return NextResponse.json(
      { error: 'Invalid user type' },
      { status: 400 }
    );

  } catch (error) {
    console.error('Failed to fetch restaurants:', error);
    
    // Handle tenant context errors
    if (error instanceof Error) {
      if (error.message.includes('Authentication required')) {
        return NextResponse.json(
          { error: 'Authentication required' },
          { status: 401 }
        );
      }
      if (error.message.includes('Permission denied')) {
        return NextResponse.json(
          { error: error.message },
          { status: 403 }
        );
      }
    }

    return NextResponse.json(
      { error: 'Failed to fetch restaurants' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    // Get tenant context from middleware headers
    const context = getTenantContext(request);
    requireAuth(context);

    const body = await request.json();
    const { name, address, phone, email, timezone, currency, businessType, ownerId } = body;

    // Only platform admins and restaurant owners can create restaurants
    if (context!.userType === UserType.STAFF) {
      return NextResponse.json(
        { error: 'Permission denied: Staff cannot create restaurants' },
        { status: 403 }
      );
    }

    // Validate required fields
    if (!name || !address) {
      return NextResponse.json(
        { error: 'Name and address are required' },
        { status: 400 }
      );
    }

    // Generate slug from name
    const slug = name
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .trim();

    // Check if slug already exists
    const existingRestaurant = await prisma.restaurant.findUnique({
      where: { slug }
    });

    if (existingRestaurant) {
      return NextResponse.json(
        { error: 'Restaurant name already exists, please choose a different name' },
        { status: 400 }
      );
    }

    // Determine owner ID
    let restaurantOwnerId = context!.userId;
    
    // Platform admins can create restaurants for other owners
    if (context!.isAdmin && ownerId) {
      // Validate the owner exists
      const owner = await prisma.restaurantOwner.findUnique({
        where: { id: ownerId }
      });
      
      if (!owner) {
        return NextResponse.json(
          { error: 'Restaurant owner not found' },
          { status: 404 }
        );
      }
      
      restaurantOwnerId = ownerId;
    }

    // Create the restaurant
    const restaurant = await prisma.restaurant.create({
      data: {
        name,
        slug,
        address,
        phone: phone || null,
        email: email || null,
        timezone: timezone || 'UTC',
        currency: currency || 'USD',
        businessType: businessType || 'restaurant',
        ownerId: restaurantOwnerId,
        brandingConfig: {
          colors: {
            primary: '#3b82f6',
            secondary: '#64748b',
            background: '#ffffff',
            text: '#1e293b'
          },
          theme: 'modern'
        }
      },
      include: {
        owner: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            companyName: true
          }
        }
      }
    });

    return NextResponse.json({
      success: true,
      restaurant,
      message: 'Restaurant created successfully'
    });

  } catch (error) {
    console.error('Failed to create restaurant:', error);
    
    // Handle tenant context errors
    if (error instanceof Error) {
      if (error.message.includes('Authentication required')) {
        return NextResponse.json(
          { error: 'Authentication required' },
          { status: 401 }
        );
      }
      if (error.message.includes('Permission denied')) {
        return NextResponse.json(
          { error: error.message },
          { status: 403 }
        );
      }
    }

    return NextResponse.json(
      { error: 'Failed to create restaurant' },
      { status: 500 }
    );
  }
}