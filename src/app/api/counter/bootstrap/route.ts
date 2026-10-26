import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/database';
import {
  getTenantContext,
  requireAuth,
  requirePermission,
} from '@/lib/tenant-context';
import { counterAccessDenied } from '@/lib/counter/access';

/**
 * GET /api/counter/bootstrap
 *
 * Minimal Counter-app bootstrap: restaurant display/currency/tax/payment
 * settings without granting the cashier general settings access.
 */
export async function GET(request: NextRequest) {
  try {
    const context = await getTenantContext(request);
    const denied = counterAccessDenied(context);
    if (denied) return denied;
    requireAuth(context);
    requirePermission(context!, 'orders', 'read');

    let restaurantId = context!.restaurantId;
    if (!restaurantId && context!.isAdmin) {
      restaurantId =
        new URL(request.url).searchParams.get('restaurantId') || undefined;
    }

    if (!restaurantId) {
      return NextResponse.json(
        { success: false, error: 'Restaurant context is required' },
        { status: 400 }
      );
    }

    const restaurant = await prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: {
        id: true,
        name: true,
        slug: true,
        address: true,
        phone: true,
        email: true,
        currency: true,
        timezone: true,
        taxLabel: true,
        serviceChargeLabel: true,
        taxRate: true,
        serviceChargeRate: true,
        paymentMethods: true,
        receiptSettings: true,
        notificationSettings: true,
        brandingConfig: true,
        logoUrl: true,
      },
    });

    if (!restaurant) {
      return NextResponse.json(
        { success: false, error: 'Restaurant not found' },
        { status: 404 }
      );
    }

    const permissionKeys = Object.entries(context!.permissions).flatMap(
      ([resource, actions]) => actions.map((action) => `${resource}:${action}`)
    );

    return NextResponse.json({
      success: true,
      restaurant,
      user: {
        id: context!.userId,
        email: context!.email,
        userType: context!.userType,
        roleTemplate: context!.roleTemplate,
      },
      permissions: context!.permissions,
      // Keep the object for existing consumers and expose the flat list for
      // the Android Counter, which gates operational actions by permission.
      permissionKeys,
      serverTime: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[CounterBootstrap] Error:', error);
    if (error instanceof Error) {
      if (error.message.includes('Authentication required')) {
        return NextResponse.json(
          { success: false, error: 'Authentication required' },
          { status: 401 }
        );
      }
      if (error.message.includes('Permission denied')) {
        return NextResponse.json(
          { success: false, error: error.message },
          { status: 403 }
        );
      }
    }
    return NextResponse.json(
      { success: false, error: 'Failed to load Counter bootstrap' },
      { status: 500 }
    );
  }
}
