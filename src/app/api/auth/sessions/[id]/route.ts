import { NextRequest, NextResponse } from 'next/server';
import { AuthServiceV2 } from '@/lib/rbac/auth-service';
import { SessionManager } from '@/lib/rbac/session-manager';
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

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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

    const { id } = await params;
    const removed = await SessionManager.invalidateSessionById(
      id,
      auth.user.id
    );
    if (!removed) {
      return NextResponse.json(
        { success: false, error: 'Session not found' },
        { status: 404 }
      );
    }

    const isCurrent = id === auth.session.id;
    const clientIP = SecurityUtils.getClientIP(request);
    const userAgent = request.headers.get('user-agent') || 'unknown';
    await AuditLogger.logSecurityEvent(
      auth.user.id,
      'SESSION_REVOKED',
      'medium',
      isCurrent ? 'Current session revoked' : 'Other device session revoked',
      {
        ipAddress: clientIP,
        userAgent,
        metadata: { sessionRecordId: id, current: isCurrent },
      }
    );

    const response = NextResponse.json({
      success: true,
      message: isCurrent
        ? 'Current session revoked'
        : 'Session revoked successfully',
      current: isCurrent,
    });
    if (isCurrent) clearAuthCookies(response);
    return response;
  } catch (error) {
    console.error('[Sessions] revoke failed:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to revoke session' },
      { status: 500 }
    );
  }
}
