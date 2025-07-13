/**
 * Public Restaurant Information API
 * Provides restaurant details for subdomain routing
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/database';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;

    if (!slug) {
      return NextResponse.json(
        { error: 'Restaurant slug is required' },
        { status: 400 }
      );
    }

    // Find restaurant by slug
    const restaurant = await prisma.restaurant.findUnique({
      where: { 
        slug: slug.toLowerCase(),
        isActive: true 
      },
      select: {
        id: true,
        name: true,
        slug: true,
        address: true,
        phone: true,
        email: true,
        currency: true,
        taxRate: true,
        serviceChargeRate: true,
        timezone: true,
        businessType: true,
        owner: {
          select: {
            firstName: true,
            lastName: true,
            companyName: true
          }
        }
      }
    });

    if (!restaurant) {
      return NextResponse.json(
        { 
          error: 'Restaurant not found',
          message: 'The restaurant you are looking for does not exist or is currently inactive.'
        },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      restaurant: {
        id: restaurant.id,
        name: restaurant.name,
        slug: restaurant.slug,
        address: restaurant.address,
        phone: restaurant.phone,
        email: restaurant.email,
        currency: restaurant.currency,
        taxRate: restaurant.taxRate,
        serviceChargeRate: restaurant.serviceChargeRate,
        timezone: restaurant.timezone,
        businessType: restaurant.businessType,
        owner: restaurant.owner
      }
    });

  } catch (error) {
    console.error('Error fetching restaurant:', error);
    return NextResponse.json(
      { 
        error: 'Internal server error',
        message: 'Failed to fetch restaurant information. Please try again later.'
      },
      { status: 500 }
    );
  }
}