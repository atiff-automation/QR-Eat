import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/database';
import { AuthServiceV2 } from '@/lib/rbac/auth-service';

export async function GET(request: NextRequest) {
  try {
    const token =
      request.cookies.get('qr_rbac_token')?.value ||
      request.cookies.get('qr_auth_token')?.value;
    if (!token)
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );

    const authResult = await AuthServiceV2.validateToken(token);
    if (!authResult.isValid || !authResult.user)
      return NextResponse.json({ error: 'Invalid session' }, { status: 401 });

    const staff = await prisma.staff.findUnique({
      where: { id: authResult.user.id },
      select: { preferences: true },
    });

    return NextResponse.json({
      success: true,
      preferences: staff?.preferences || {},
    });
  } catch {
    return NextResponse.json(
      { error: 'Failed to fetch preferences' },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    // 1. Authenticate Request
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
      return NextResponse.json({ error: 'Invalid session' }, { status: 401 });
    }

    const userId = authResult.user.id;
    const body = await request.json();

    // 2. Validate Helper: Ensure we only update allowed preference keys
    // Currently only supporting 'kdsCategories'
    const { kdsCategories } = body;

    // Validate structure if provided
    if (kdsCategories !== undefined) {
      if (!Array.isArray(kdsCategories)) {
        return NextResponse.json(
          { error: 'kdsCategories must be an array of strings' },
          { status: 400 }
        );
      }
    }

    // 3. Update Staff Preferences
    // We merge with existing preferences rather than overwriting
    const currentStaff = await prisma.staff.findUnique({
      where: { id: userId },
      select: { preferences: true },
    });

    const currentPrefs =
      (currentStaff?.preferences as Record<string, unknown>) || {};
    const newPrefs = {
      ...currentPrefs,
      ...(kdsCategories !== undefined && { kdsCategories }),
    };

    const updatedStaff = await prisma.staff.update({
      where: { id: userId },
      data: {
        preferences: newPrefs,
      },
      select: {
        id: true,
        preferences: true,
      },
    });

    return NextResponse.json({
      success: true,
      preferences: updatedStaff.preferences,
    });
  } catch (error) {
    console.error('Failed to update staff preferences:', error);
    return NextResponse.json(
      { error: 'Failed to update preferences' },
      { status: 500 }
    );
  }
}
