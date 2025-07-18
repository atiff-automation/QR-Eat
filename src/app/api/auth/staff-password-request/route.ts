import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/database';

export async function POST(request: NextRequest) {
  try {
    const { email, restaurantContext } = await request.json();

    if (!email) {
      return NextResponse.json(
        { error: 'Email is required' },
        { status: 400 }
      );
    }

    // Find staff member
    const staff = await prisma.staff.findUnique({
      where: { email },
      include: { 
        restaurant: {
          include: {
            owner: {
              select: {
                id: true,
                email: true,
                firstName: true,
                lastName: true
              }
            }
          }
        },
        role: {
          select: {
            name: true
          }
        }
      }
    });

    if (!staff) {
      // Don't reveal if email exists for security
      return NextResponse.json(
        { message: 'If this email belongs to a staff member, the restaurant owner has been notified.' },
        { status: 200 }
      );
    }

    // Create notification for restaurant owner
    await prisma.notification.create({
      data: {
        userId: staff.restaurant.owner.id,
        userType: 'restaurant_owner',
        restaurantId: staff.restaurant.id,
        title: 'Staff Password Reset Request',
        message: `${staff.firstName} ${staff.lastName} (${staff.role.name}) has requested a password reset. You can reset their password from the Staff Management page.`,
        type: 'info',
        metadata: {
          staffId: staff.id,
          staffEmail: staff.email,
          staffName: `${staff.firstName} ${staff.lastName}`,
          requestedAt: new Date().toISOString(),
          action: 'password_reset_request'
        }
      }
    });

    // In development, also log this for convenience
    if (process.env.NODE_ENV === 'development') {
      console.log(`🔑 Password reset requested by: ${staff.firstName} ${staff.lastName} (${staff.email})`);
      console.log(`📧 Owner notified: ${staff.restaurant.owner.firstName} ${staff.restaurant.owner.lastName} (${staff.restaurant.owner.email})`);
      console.log(`🏢 Restaurant: ${staff.restaurant.name}`);
    }

    return NextResponse.json({
      message: 'Password reset request has been sent to your restaurant owner. They will help you reset your password.',
      restaurantName: staff.restaurant.name,
      ownerName: `${staff.restaurant.owner.firstName} ${staff.restaurant.owner.lastName}`
    });

  } catch (error) {
    console.error('Staff password request error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}