import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/database';
import { AuthServiceV2 } from '@/lib/rbac/auth-service';
import { validateApiInput, Sanitizer } from '@/lib/validation';
import { EmailService } from '@/lib/email';

export async function POST(request: NextRequest) {
  try {
    // Verify authentication using RBAC system
    const token = request.cookies.get('qr_rbac_token')?.value ||
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

    // Only platform admins can create restaurants
    const userType = authResult.user.currentRole?.userType || authResult.user.userType;
    if (userType !== 'platform_admin') {
      return NextResponse.json(
        { error: 'Only platform administrators can create restaurants' },
        { status: 403 }
      );
    }

    // Parse and validate request body
    let requestData;
    try {
      requestData = await request.json();
    } catch {
      return NextResponse.json(
        { error: 'Invalid JSON in request body' },
        { status: 400 }
      );
    }

    // Comprehensive input validation
    const validation = validateApiInput(requestData, {
      // Restaurant data
      name: { required: true, type: 'string', minLength: 2, maxLength: 100 },
      slug: { required: true, type: 'string', minLength: 2, maxLength: 50 },
      address: { required: true, type: 'string', minLength: 5, maxLength: 200 },
      phone: { required: false, type: 'string' },
      email: { required: false, type: 'email' },
      timezone: { required: true, type: 'string' },
      currency: { required: true, type: 'string' },
      businessType: { required: true, type: 'string' },
      description: { required: false, type: 'string', maxLength: 500 },
      website: { required: false, type: 'url' },
      priceRange: { required: true, type: 'string' },
      
      // Owner data
      ownerFirstName: { required: true, type: 'string', minLength: 1, maxLength: 50 },
      ownerLastName: { required: true, type: 'string', minLength: 1, maxLength: 50 },
      ownerEmail: { required: true, type: 'email' },
      ownerPhone: { required: false, type: 'string' },
      ownerCompanyName: { required: false, type: 'string', maxLength: 100 },
      
      // Settings
      taxRate: { required: false, type: 'string' },
      serviceChargeRate: { required: false, type: 'string' },
      acceptsReservations: { required: false, type: 'boolean' },
      deliveryAvailable: { required: false, type: 'boolean' },
      takeoutAvailable: { required: false, type: 'boolean' }
    });

    if (!validation.isValid) {
      return NextResponse.json(
        { 
          error: 'Validation failed', 
          details: validation.errors 
        },
        { status: 400 }
      );
    }

    // Check if slug is unique
    const existingSlug = await prisma.restaurant.findUnique({
      where: { slug: requestData.slug.toLowerCase() }
    });

    if (existingSlug) {
      return NextResponse.json(
        { error: 'Restaurant slug already exists. Please choose a different one.' },
        { status: 409 }
      );
    }

    // Check if owner email already exists
    const existingOwner = await prisma.restaurantOwner.findUnique({
      where: { email: requestData.ownerEmail.toLowerCase() }
    });

    if (existingOwner) {
      return NextResponse.json(
        { error: 'Owner email already exists. Please use a different email.' },
        { status: 409 }
      );
    }

    // Generate temporary password for the owner
    const tempPassword = Math.random().toString(36).slice(-8) + 'A1!';
    const hashedPassword = await AuthService.hashPassword(tempPassword);

    // Create restaurant and owner in a transaction
    const result = await prisma.$transaction(async (tx) => {
      // Create restaurant owner first
      const owner = await tx.restaurantOwner.create({
        data: {
          email: Sanitizer.sanitizeEmail(requestData.ownerEmail),
          passwordHash: hashedPassword,
          firstName: Sanitizer.sanitizeString(requestData.ownerFirstName),
          lastName: Sanitizer.sanitizeString(requestData.ownerLastName),
          phone: requestData.ownerPhone ? Sanitizer.sanitizePhone(requestData.ownerPhone) : null,
          companyName: requestData.ownerCompanyName ? Sanitizer.sanitizeString(requestData.ownerCompanyName) : null,
          isActive: true,
          emailVerified: false,
          mustChangePassword: true
        }
      });

      // Create restaurant
      const restaurant = await tx.restaurant.create({
        data: {
          ownerId: owner.id,
          name: Sanitizer.sanitizeString(requestData.name),
          slug: requestData.slug.toLowerCase(),
          address: Sanitizer.sanitizeString(requestData.address),
          phone: requestData.phone ? Sanitizer.sanitizePhone(requestData.phone) : null,
          email: requestData.email ? Sanitizer.sanitizeEmail(requestData.email) : null,
          timezone: requestData.timezone,
          currency: requestData.currency,
          businessType: requestData.businessType,
          description: requestData.description ? Sanitizer.sanitizeString(requestData.description) : null,
          website: requestData.website || null,
          priceRange: requestData.priceRange,
          taxRate: requestData.taxRate ? parseFloat(requestData.taxRate) : 0.0850,
          serviceChargeRate: requestData.serviceChargeRate ? parseFloat(requestData.serviceChargeRate) : 0.1200,
          acceptsReservations: Sanitizer.sanitizeBoolean(requestData.acceptsReservations ?? false),
          deliveryAvailable: Sanitizer.sanitizeBoolean(requestData.deliveryAvailable ?? false),
          takeoutAvailable: Sanitizer.sanitizeBoolean(requestData.takeoutAvailable ?? true),
          isActive: true
        }
      });

      return { owner, restaurant, tempPassword };
    });

    // Send welcome email to the new restaurant owner
    try {
      const loginUrl = `${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/login`;
      const emailSent = await EmailService.sendNewRestaurantOwnerEmail({
        ownerName: `${result.owner.firstName} ${result.owner.lastName}`,
        ownerEmail: result.owner.email,
        restaurantName: result.restaurant.name,
        tempPassword: result.tempPassword,
        loginUrl
      });

      console.log(`Welcome email ${emailSent ? 'sent' : 'failed'} for ${result.owner.email}`);
    } catch (emailError) {
      console.error('Failed to send welcome email:', emailError);
      // Don't fail the entire request if email fails
    }

    return NextResponse.json({
      success: true,
      message: 'Restaurant and owner created successfully',
      restaurant: {
        id: result.restaurant.id,
        name: result.restaurant.name,
        slug: result.restaurant.slug
      },
      owner: {
        id: result.owner.id,
        email: result.owner.email,
        tempPassword: result.tempPassword
      },
      instructions: 'The owner will receive an email with login credentials and must change the password on first login.',
      emailSent: true
    });

  } catch (error) {
    console.error('Failed to create restaurant:', error);
    
    // Handle specific database errors
    if (error instanceof Error) {
      if (error.message.includes('Unique constraint')) {
        return NextResponse.json(
          { error: 'Restaurant slug or owner email already exists' },
          { status: 409 }
        );
      }
      
      if (error.message.includes('Foreign key constraint')) {
        return NextResponse.json(
          { error: 'Invalid reference data' },
          { status: 400 }
        );
      }
    }
    
    return NextResponse.json(
      { 
        error: 'Failed to create restaurant',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
      },
      { status: 500 }
    );
  }
}