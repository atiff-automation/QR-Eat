import { NextRequest, NextResponse } from 'next/server';
import { AuthServiceV2 } from '@/lib/rbac/auth-service';
import { SessionManager } from '@/lib/rbac/session-manager';
import { RefreshTokenService } from '@/lib/rbac/refresh-token-service';
import { AuditLogger } from '@/lib/rbac/audit-logger';
import { SecurityUtils } from '@/lib/security';
import { getTokenFromRequest } from '@/lib/auth-utils';

function clearAuthCookies(response: NextResponse): void {
  for (const name of [
    'qr_rbac_token',
    'qr_refresh_token',
    'qr_auth_token',
    'qr_owner_token',
    'qr_staff_token',
    'qr_admin_token',
  ]) {
    response.cookies.set({
      name,
      value: '',
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 0,
      path: '/',
    });
  }
}

export async function POST(request: NextRequest) {
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

    let othersOnly = false;
    try {
      const body = await request.json();
      othersOnly = body?.othersOnly === true;
    } catch {
      // Empty body means revoke all.
    }

    let revokedSessions: number;
    let revokedRefreshTokens: number;

    if (othersOnly) {
      revokedSessions = await SessionManager.invalidateOtherSessionsByRecordId(
        auth.user.id,
        auth.session.id
      );
      revokedRefreshTokens = await RefreshTokenService.revokeOtherUserTokens(
        auth.user.id,
        auth.payload?.sessionId || '',
        'revoke_other_devices'
      );
    } else {
      await SessionManager.invalidateAllUserSessions(auth.user.id);
      revokedSessions = 1; // current session is included; exact count is not needed
      revokedRefreshTokens = await RefreshTokenService.revokeAllUserTokens(
        auth.user.id,
        'revoke_all_devices'
      );
    }

    const clientIP = SecurityUtils.getClientIP(request);
    const userAgent = request.headers.get('user-agent') || 'unknown';
    await AuditLogger.logSecurityEvent(
      auth.user.id,
      othersOnly ? 'OTHER_SESSIONS_REVOKED' : 'ALL_SESSIONS_REVOKED',
      'medium',
      othersOnly
        ? 'User revoked other device sessions'
        : 'User revoked all sessions',
      {
        ipAddress: clientIP,
        userAgent,
        metadata: { othersOnly, revokedSessions, revokedRefreshTokens },
      }
    );

    const response = NextResponse.json({
      success: true,
      message: othersOnly
        ? 'Other devices signed out'
        : 'Signed out from all devices',
      revokedSessions,
      revokedRefreshTokens,
    });
    if (!othersOnly) clearAuthCookies(response);
    return response;
  } catch (error) {
    console.error('[Sessions] revoke-all failed:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to revoke sessions' },
      { status: 500 }
    );
  }
}
