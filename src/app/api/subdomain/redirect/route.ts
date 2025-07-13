/**
 * Subdomain Redirection API
 * Helps users find their restaurant's subdomain URL
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/database';
import { getTenantContext } from '@/lib/tenant-context';
import { generateSubdomainUrl, isSubdomainRoutingEnabled } from '@/lib/subdomain';
import { UserType } from '@/lib/auth';

export async function POST(request: NextRequest) {
  try {
    if (!isSubdomainRoutingEnabled()) {
      return NextResponse.json(
        { error: 'Subdomain routing is not enabled' },
        { status: 400 }
      );
    }

    const { email, restaurantSlug } = await request.json();

    if (!email && !restaurantSlug) {
      return NextResponse.json(
        { error: 'Email or restaurant slug is required' },
        { status: 400 }
      );
    }

    let restaurants: any[] = [];

    // If restaurant slug/name is provided, search for it
    if (restaurantSlug) {
      // Search by slug first (exact match)
      let restaurant = await prisma.restaurant.findUnique({
        where: { slug: restaurantSlug },
        select: {
          id: true,
          name: true,
          slug: true,
          isActive: true,
          owner: {
            select: {
              email: true,
              firstName: true,
              lastName: true
            }
          }
        }
      });

      // If not found by slug, search by name (case-insensitive partial match)
      if (!restaurant) {
        const restaurantsByName = await prisma.restaurant.findMany({
          where: {
            name: {
              contains: restaurantSlug,
              mode: 'insensitive'
            },
            isActive: true
          },
          select: {
            id: true,
            name: true,
            slug: true,
            isActive: true,
            owner: {
              select: {
                email: true,
                firstName: true,
                lastName: true
              }
            }
          },
          take: 10 // Limit results
        });

        if (restaurantsByName.length === 0) {
          return NextResponse.json(
            { error: 'Restaurant not found' },
            { status: 404 }
          );
        }

        restaurants = restaurantsByName;
      } else {
        if (!restaurant.isActive) {
          return NextResponse.json(
            { error: 'Restaurant is currently inactive' },
            { status: 400 }
          );
        }
        restaurants = [restaurant];
      }
    }

    // If email is provided, find all restaurants associated with that user
    if (email && !restaurantSlug) {
      // Check if user is a staff member
      const staffMember = await prisma.staff.findUnique({
        where: { email },
        include: {
          restaurant: {
            select: {
              id: true,
              name: true,
              slug: true,
              isActive: true,
              owner: {
                select: {
                  email: true,
                  firstName: true,
                  lastName: true
                }
              }
            }
          }
        }
      });

      if (staffMember && staffMember.restaurant) {
        restaurants.push(staffMember.restaurant);
      }

      // Check if user is a restaurant owner
      const owner = await prisma.restaurantOwner.findUnique({
        where: { email },
        include: {
          restaurants: {
            where: { isActive: true },
            select: {
              id: true,
              name: true,
              slug: true,
              isActive: true,
              owner: {
                select: {
                  email: true,
                  firstName: true,
                  lastName: true
                }
              }
            }
          }
        }
      });

      if (owner && owner.restaurants) {
        restaurants.push(...owner.restaurants);
      }

      // Remove duplicates
      const uniqueRestaurants = restaurants.filter((restaurant, index, self) =>
        index === self.findIndex(r => r.id === restaurant.id)
      );
      restaurants = uniqueRestaurants;
    }

    if (restaurants.length === 0) {
      return NextResponse.json(
        { error: 'No restaurants found for this user' },
        { status: 404 }
      );
    }

    // Generate subdomain URLs for each restaurant
    const restaurantUrls = restaurants.map(restaurant => ({
      id: restaurant.id,
      name: restaurant.name,
      slug: restaurant.slug,
      subdomainUrl: generateSubdomainUrl(restaurant.slug),
      dashboardUrl: generateSubdomainUrl(restaurant.slug, '/dashboard'),
      menuUrl: generateSubdomainUrl(restaurant.slug, '/'),
      isActive: restaurant.isActive,
      owner: restaurant.owner
    }));

    return NextResponse.json({
      success: true,
      restaurants: restaurantUrls,
      message: restaurants.length === 1 
        ? 'Restaurant found' 
        : `${restaurants.length} restaurants found`
    });

  } catch (error) {
    console.error('Subdomain redirect error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    if (!isSubdomainRoutingEnabled()) {
      return NextResponse.json(
        { error: 'Subdomain routing is not enabled' },
        { status: 400 }
      );
    }

    // Get current user context
    const context = getTenantContext(request);
    
    if (!context) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    let restaurants: any[] = [];

    // Get restaurants based on user type
    switch (context.userType) {
      case UserType.PLATFORM_ADMIN:
        // Platform admins can see all restaurants
        const allRestaurants = await prisma.restaurant.findMany({
          where: { isActive: true },
          select: {
            id: true,
            name: true,
            slug: true,
            isActive: true,
            owner: {
              select: {
                email: true,
                firstName: true,
                lastName: true
              }
            }
          },
          orderBy: { name: 'asc' }
        });
        restaurants = allRestaurants;
        break;

      case UserType.RESTAURANT_OWNER:
        // Restaurant owners see their restaurants
        const ownerRestaurants = await prisma.restaurant.findMany({
          where: {
            ownerId: context.userId,
            isActive: true
          },
          select: {
            id: true,
            name: true,
            slug: true,
            isActive: true,
            owner: {
              select: {
                email: true,
                firstName: true,
                lastName: true
              }
            }
          },
          orderBy: { name: 'asc' }
        });
        restaurants = ownerRestaurants;
        break;

      case UserType.STAFF:
        // Staff see only their assigned restaurant
        if (context.restaurantId) {
          const staffRestaurant = await prisma.restaurant.findUnique({
            where: { id: context.restaurantId },
            select: {
              id: true,
              name: true,
              slug: true,
              isActive: true,
              owner: {
                select: {
                  email: true,
                  firstName: true,
                  lastName: true
                }
              }
            }
          });
          if (staffRestaurant) {
            restaurants = [staffRestaurant];
          }
        }
        break;
    }

    // Generate subdomain URLs
    const restaurantUrls = restaurants.map(restaurant => ({
      id: restaurant.id,
      name: restaurant.name,
      slug: restaurant.slug,
      subdomainUrl: generateSubdomainUrl(restaurant.slug),
      dashboardUrl: generateSubdomainUrl(restaurant.slug, '/dashboard'),
      menuUrl: generateSubdomainUrl(restaurant.slug, '/'),
      isActive: restaurant.isActive,
      owner: restaurant.owner
    }));

    return NextResponse.json({
      success: true,
      restaurants: restaurantUrls,
      userType: context.userType,
      message: restaurants.length === 1 
        ? 'Restaurant found' 
        : `${restaurants.length} restaurants found`
    });

  } catch (error) {
    console.error('Subdomain redirect error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}