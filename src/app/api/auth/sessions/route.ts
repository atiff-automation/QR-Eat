import { NextRequest, NextResponse } from 'next/server';
import { AuthServiceV2 } from '@/lib/rbac/auth-service';
import { SessionManager } from '@/lib/rbac/session-manager';
import { RBAC_CONSTANTS } from '@/lib/rbac/types';
import { getTokenFromRequest } from '@/lib/auth-utils';

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
    if (!auth.isValid || !auth.user || !auth.session) {
      return NextResponse.json(
        { success: false, error: 'Invalid or expired session' },
        { status: 401 }
      );
    }

    const sessions = await SessionManager.getUserSessionSummaries(
      auth.user.id,
      auth.session.id
    );

    sessions.sort((a, b) => {
      if (a.isCurrent !== b.isCurrent) return a.isCurrent ? -1 : 1;
      return b.lastActivity.getTime() - a.lastActivity.getTime();
    });

    return NextResponse.json({
      success: true,
      sessions,
      currentSessionId: auth.session.id,
      maxSessions: RBAC_CONSTANTS.MAX_SESSIONS_PER_USER,
    });
  } catch (error) {
    console.error('[Sessions] list failed:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to load sessions' },
      { status: 500 }
    );
  }
}
