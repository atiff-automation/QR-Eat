import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/database';
import { UserType } from '@/lib/auth';
import {
  getTenantContext,
  requireAuth,
  requirePermission,
} from '@/lib/tenant-context';
import { hashStaffPin, pinLookup, validateStaffPin } from '@/lib/pin';

/**
 * Set or reset a staff member's station PIN.
 *
 * Only an owner/manager with staff:write can do this. The PIN is never
 * returned. Uniqueness is enforced through the keyed `pinLookup` column so two
 * people cannot share an operator identity.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const context = await getTenantContext(request);
    requireAuth(context);
    requirePermission(context!, 'staff', 'write');

    const { id: staffId } = await params;
    const body = await request.json();
    const pin = typeof body.pin === 'string' ? body.pin : '';

    const pinError = validateStaffPin(pin);
    if (pinError) {
      return NextResponse.json({ error: pinError }, { status: 400 });
    }

    let restaurantId: string;
    if (context!.userType === UserType.RESTAURANT_OWNER) {
      const ownerRestaurant = await prisma.restaurant.findFirst({
        where: { ownerId: context!.userId },
        select: { id: true },
      });
      if (!ownerRestaurant) {
        return NextResponse.json(
          { error: 'No restaurant found for owner' },
          { status: 404 }
        );
      }
      restaurantId = ownerRestaurant.id;
    } else {
      restaurantId = context!.restaurantId!;
    }

    const staff = await prisma.staff.findFirst({
      where: { id: staffId, restaurantId },
      select: { id: true, firstName: true, lastName: true },
    });

    if (!staff) {
      return NextResponse.json(
        { error: 'Staff member not found' },
        { status: 404 }
      );
    }

    const lookup = pinLookup(restaurantId, pin);
    const conflict = await prisma.staff.findFirst({
      where: {
        restaurantId,
        pinLookup: lookup,
        NOT: { id: staffId },
      },
      select: { id: true },
    });

    if (conflict) {
      return NextResponse.json(
        { error: 'PIN is already in use by another staff member' },
        { status: 409 }
      );
    }

    const pinHash = await hashStaffPin(pin);

    await prisma.staff.update({
      where: { id: staffId },
      data: { pinHash, pinLookup: lookup },
    });

    console.log(
      `[staff-pin] ${context!.email} set a station PIN for ${staff.firstName} ${staff.lastName}`
    );

    return NextResponse.json({ success: true, hasPin: true });
  } catch (error) {
    if (
      error &&
      typeof error === 'object' &&
      'code' in error &&
      error.code === 'P2002'
    ) {
      return NextResponse.json(
        { error: 'PIN is already in use by another staff member' },
        { status: 409 }
      );
    }

    if (error instanceof Error) {
      if (error.message.includes('Authentication required')) {
        return NextResponse.json(
          { error: 'Authentication required' },
          { status: 401 }
        );
      }
      if (error.message.includes('Permission denied')) {
        return NextResponse.json({ error: error.message }, { status: 403 });
      }
    }

    console.error('Set staff PIN error:', error);
    return NextResponse.json(
      { error: 'Failed to set staff PIN' },
      { status: 500 }
    );
  }
}
