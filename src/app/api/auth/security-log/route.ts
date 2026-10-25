import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/database';
import { AuthServiceV2 } from '@/lib/rbac/auth-service';
import { getTokenFromRequest } from '@/lib/auth-utils';

/** Recent security events for the signed-in user. */
export async function GET(request: NextRequest) {
  try {
    const token = getTokenFromRequest(request);
    if (!token) {
      return NextResponse.json(
        { success: false, error: 'Authentication required' },
        { status: 401 }
      );
    }

    const auth = await AuthServiceV2.validateToken(token);
    if (!auth.isValid || !auth.user) {
      return NextResponse.json(
        { success: false, error: 'Invalid or expired session' },
        { status: 401 }
      );
    }

    const limitParam = Number(new URL(request.url).searchParams.get('limit'));
    const take = Number.isFinite(limitParam)
      ? Math.min(Math.max(1, Math.trunc(limitParam)), 50)
      : 20;

    const logs = await prisma.rBACLog.findMany({
      where: { userId: auth.user.id },
      orderBy: { createdAt: 'desc' },
      take,
      select: {
        id: true,
        action: true,
        resource: true,
        fromRole: true,
        toRole: true,
        metadata: true,
        ipAddress: true,
        createdAt: true,
      },
    });

    return NextResponse.json({ success: true, events: logs });
  } catch (error) {
    console.error('[SecurityLog] failed:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to load security activity' },
      { status: 500 }
    );
  }
}
