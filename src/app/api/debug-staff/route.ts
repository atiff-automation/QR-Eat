import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(request: NextRequest) {
  // Only allow in development mode for security
  if (process.env.NODE_ENV !== 'development') {
    return NextResponse.json(
      { error: 'Debug endpoint only available in development' },
      { status: 403 }
    );
  }

  try {
    const { searchParams } = new URL(request.url);
    const staffId = searchParams.get('id');

    if (!staffId) {
      return NextResponse.json(
        { error: 'Staff ID is required (use ?id=staff_id)' },
        { status: 400 }
      );
    }

    // Get staff member details
    const staff = await prisma.staff.findUnique({
      where: { id: staffId },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        mustChangePassword: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
        lastLoginAt: true
      }
    });

    if (!staff) {
      return NextResponse.json(
        { error: 'Staff member not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      message: 'Staff member details',
      staff,
      debug: {
        mustChangePassword: {
          value: staff.mustChangePassword,
          type: typeof staff.mustChangePassword,
          stringValue: String(staff.mustChangePassword),
          booleanValue: Boolean(staff.mustChangePassword)
        }
      }
    });
  } catch (error) {
    console.error('Debug staff endpoint error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}