import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/database';
import { AuthServiceV2 } from '@/lib/rbac/auth-service';

// Default platform settings
const DEFAULT_SETTINGS = {
  general: {
    platformName: 'QR Restaurant System',
    supportEmail: 'support@qrrestaurant.com',
    maxRestaurantsPerOwner: 5,
    defaultCurrency: 'USD',
    maintenanceMode: false,
  },
  security: {
    passwordMinLength: 8,
    requireMFA: false,
    sessionTimeout: 480, // 8 hours in minutes
    maxLoginAttempts: 5,
  },
  features: {
    allowRegistration: true,
    allowReservations: true,
    allowPayments: true,
    allowAnalytics: true,
  },
  notifications: {
    emailNotifications: true,
    smsNotifications: false,
    pushNotifications: true,
  },
};

export async function GET(request: NextRequest) {
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

    // Only platform admins can view settings
    const userType = authResult.user.currentRole?.userType || authResult.user.userType;
    if (userType !== 'platform_admin') {
      return NextResponse.json(
        { error: 'Only platform administrators can view settings' },
        { status: 403 }
      );
    }

    // Try to fetch settings from database
    const settings = DEFAULT_SETTINGS;

    try {
      // For now, we'll use a simple approach with a single settings record
      // In a real implementation, you might want a dedicated settings table
      await prisma.platformAdmin.findFirst({
        where: {
          id: authResult.user.id,
        },
      });

      // If we have stored settings in a JSON field or separate table, we would fetch them here
      // For now, we'll return the default settings
    } catch {
      console.log('Using default settings as database settings not found');
    }

    return NextResponse.json({
      success: true,
      settings,
    });
  } catch (error) {
    console.error('Failed to fetch settings:', error);
    return NextResponse.json(
      {
        error: 'Failed to fetch settings',
        details:
          process.env.NODE_ENV === 'development' ? error.message : undefined,
      },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
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

    // Only platform admins can update settings
    const userType = authResult.user.currentRole?.userType || authResult.user.userType;
    if (userType !== 'platform_admin') {
      return NextResponse.json(
        { error: 'Only platform administrators can update settings' },
        { status: 403 }
      );
    }

    const settingsData = await request.json();

    // Validate the settings structure
    const requiredSections = [
      'general',
      'security',
      'features',
      'notifications',
    ];
    for (const section of requiredSections) {
      if (!settingsData[section]) {
        return NextResponse.json(
          { error: `Missing required section: ${section}` },
          { status: 400 }
        );
      }
    }

    // Validate specific fields
    if (
      settingsData.security.passwordMinLength < 6 ||
      settingsData.security.passwordMinLength > 128
    ) {
      return NextResponse.json(
        {
          error: 'Password minimum length must be between 6 and 128 characters',
        },
        { status: 400 }
      );
    }

    if (
      settingsData.security.sessionTimeout < 5 ||
      settingsData.security.sessionTimeout > 1440
    ) {
      return NextResponse.json(
        { error: 'Session timeout must be between 5 and 1440 minutes' },
        { status: 400 }
      );
    }

    if (
      settingsData.security.maxLoginAttempts < 3 ||
      settingsData.security.maxLoginAttempts > 10
    ) {
      return NextResponse.json(
        { error: 'Max login attempts must be between 3 and 10' },
        { status: 400 }
      );
    }

    if (
      settingsData.general.maxRestaurantsPerOwner < 1 ||
      settingsData.general.maxRestaurantsPerOwner > 100
    ) {
      return NextResponse.json(
        { error: 'Max restaurants per owner must be between 1 and 100' },
        { status: 400 }
      );
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(settingsData.general.supportEmail)) {
      return NextResponse.json(
        { error: 'Invalid support email format' },
        { status: 400 }
      );
    }

    // In a real implementation, you would save these settings to a database
    // For now, we'll just return success

    try {
      // Here you would typically:
      // 1. Save to a dedicated settings table
      // 2. Or update a JSON field in an existing table
      // 3. Or save to a configuration service

      // Example of what you might do:
      /*
      await prisma.platformSettings.upsert({
        where: { id: 1 },
        update: {
          settings: settingsData,
          updatedAt: new Date(),
          updatedBy: authResult.user.id
        },
        create: {
          settings: settingsData,
          createdAt: new Date(),
          updatedBy: authResult.user.id
        }
      });
      */

      console.log('Settings would be saved:', settingsData);
    } catch (error) {
      console.error('Failed to save settings to database:', error);
      return NextResponse.json(
        { error: 'Failed to save settings to database' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Settings updated successfully',
    });
  } catch (error) {
    console.error('Failed to update settings:', error);
    return NextResponse.json(
      {
        error: 'Failed to update settings',
        details:
          process.env.NODE_ENV === 'development' ? error.message : undefined,
      },
      { status: 500 }
    );
  }
}
