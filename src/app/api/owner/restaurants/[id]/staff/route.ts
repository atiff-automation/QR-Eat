import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/database';
import { AuthService } from '@/lib/auth';
import { AuthServiceV2 } from '@/lib/rbac/auth-service';
import { UserType } from '@/lib/rbac/types';
import { Sanitizer } from '@/lib/validation';
import { EmailService } from '@/lib/email';
import { buildLoginUrl } from '@/lib/url-config';

// GET - Fetch staff for a restaurant
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: restaurantId } = await params;

    // Verify authentication using RBAC system
    const token =
      request.cookies.get('qr_rbac_token')?.value ||
      request.cookies.get('qr_auth_token')?.value;

    if (!token) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    const authResult = await AuthServiceV2.validateToken(token);

    if (!authResult.isValid || !authResult.user) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    // Only restaurant owners can access staff
    if (authResult.user.userType !== UserType.RESTAURANT_OWNER) {
      return NextResponse.json(
        { error: 'Only restaurant owners can access staff data' },
        { status: 403 }
      );
    }

    // Verify the restaurant belongs to the owner
    const restaurant = await prisma.restaurant.findFirst({
      where: {
        id: restaurantId,
        ownerId: authResult.user.id,
      },
    });

    if (!restaurant) {
      return NextResponse.json(
        { error: 'Restaurant not found or access denied' },
        { status: 404 }
      );
    }

    // Fetch staff with their roles
    const staff = await prisma.staff.findMany({
      where: {
        restaurantId,
      },
      include: {
        role: {
          select: {
            id: true,
            name: true,
            description: true,
            permissions: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return NextResponse.json({
      success: true,
      staff,
    });
  } catch (error) {
    console.error('Failed to fetch staff:', error);
    return NextResponse.json(
      {
        error: 'Failed to fetch staff',
        details:
          process.env.NODE_ENV === 'development' ? error.message : undefined,
      },
      { status: 500 }
    );
  }
}

// POST - Create new staff member
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: restaurantId } = await params;

    // Verify authentication using RBAC system
    const token =
      request.cookies.get('qr_rbac_token')?.value ||
      request.cookies.get('qr_auth_token')?.value;

    if (!token) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    const authResult = await AuthServiceV2.validateToken(token);

    if (!authResult.isValid || !authResult.user) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    // Only restaurant owners can create staff
    if (authResult.user.userType !== UserType.RESTAURANT_OWNER) {
      return NextResponse.json(
        { error: 'Only restaurant owners can create staff' },
        { status: 403 }
      );
    }

    // Verify the restaurant belongs to the owner
    const restaurant = await prisma.restaurant.findFirst({
      where: {
        id: restaurantId,
        ownerId: authResult.user.id,
      },
    });

    if (!restaurant) {
      return NextResponse.json(
        { error: 'Restaurant not found or access denied' },
        { status: 404 }
      );
    }

    const requestData = await request.json();

    // Validate required fields
    const requiredFields = [
      'username',
      'email',
      'firstName',
      'lastName',
      'roleId',
      'tempPassword',
    ];
    for (const field of requiredFields) {
      if (!requestData[field]) {
        return NextResponse.json(
          { error: `${field} is required` },
          { status: 400 }
        );
      }
    }

    // Check if username already exists
    const existingUsername = await prisma.staff.findUnique({
      where: { username: requestData.username },
    });

    if (existingUsername) {
      return NextResponse.json(
        { error: 'Username already exists' },
        { status: 409 }
      );
    }

    // Check if email already exists
    const existingEmail = await prisma.staff.findUnique({
      where: { email: requestData.email.toLowerCase() },
    });

    if (existingEmail) {
      return NextResponse.json(
        { error: 'Email already exists' },
        { status: 409 }
      );
    }

    // Validate role exists
    const role = await prisma.staffRole.findUnique({
      where: { id: requestData.roleId },
    });

    if (!role) {
      return NextResponse.json(
        { error: 'Invalid role selected' },
        { status: 400 }
      );
    }

    // Hash the temporary password
    const hashedPassword = await AuthService.hashPassword(
      requestData.tempPassword
    );

    // Create staff member
    const staff = await prisma.staff.create({
      data: {
        username: Sanitizer.sanitizeString(requestData.username),
        email: Sanitizer.sanitizeEmail(requestData.email),
        passwordHash: hashedPassword,
        firstName: Sanitizer.sanitizeString(requestData.firstName),
        lastName: Sanitizer.sanitizeString(requestData.lastName),
        phone: requestData.phone
          ? Sanitizer.sanitizePhone(requestData.phone)
          : null,
        restaurantId,
        roleId: requestData.roleId,
        isActive: true,
        mustChangePassword: true,
      },
      include: {
        role: {
          select: {
            id: true,
            name: true,
            description: true,
            permissions: true,
          },
        },
      },
    });

    // Send welcome email to the staff member
    try {
      const loginUrl = buildLoginUrl(request);
      await EmailService.sendEmail({
        to: staff.email,
        subject: `Welcome to ${restaurant.name} - Your Staff Account`,
        htmlContent: `
          <h2>Welcome to ${restaurant.name}!</h2>
          <p>Hello ${staff.firstName},</p>
          <p>A staff account has been created for you at ${restaurant.name}.</p>
          <p><strong>Your login credentials:</strong></p>
          <p>Username: ${staff.username}<br>
          Temporary Password: ${requestData.tempPassword}</p>
          <p><strong>Role:</strong> ${role.name}</p>
          <p><strong>Login URL:</strong> <a href="${loginUrl}">${loginUrl}</a></p>
          <p><strong>Important:</strong> You will be required to change your password on first login.</p>
          <p>Best regards,<br>The ${restaurant.name} Team</p>
        `,
        textContent: `
          Welcome to ${restaurant.name}!
          
          Hello ${staff.firstName},
          
          A staff account has been created for you at ${restaurant.name}.
          
          Your login credentials:
          Username: ${staff.username}
          Temporary Password: ${requestData.tempPassword}
          Role: ${role.name}
          Login URL: ${loginUrl}
          
          Important: You will be required to change your password on first login.
          
          Best regards,
          The ${restaurant.name} Team
        `,
      });
    } catch (emailError) {
      console.error('Failed to send welcome email:', emailError);
      // Don't fail the entire request if email fails
    }

    return NextResponse.json({
      success: true,
      message: 'Staff member created successfully',
      staff: {
        id: staff.id,
        username: staff.username,
        email: staff.email,
        firstName: staff.firstName,
        lastName: staff.lastName,
        role: staff.role,
      },
    });
  } catch (error) {
    console.error('Failed to create staff:', error);
    return NextResponse.json(
      {
        error: 'Failed to create staff',
        details:
          process.env.NODE_ENV === 'development' ? error.message : undefined,
      },
      { status: 500 }
    );
  }
}
