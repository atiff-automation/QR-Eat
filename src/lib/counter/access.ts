import { NextResponse } from 'next/server';
import type { TenantContext } from '@/lib/tenant-context';

/**
 * Counter-only access gate.
 *
 * The web can still use its cookie/token to reach the change-password page, but
 * Counter endpoints must not be usable until the account has completed the
 * forced password change. The Counter is also restricted to the three native
 * Counter roles; waiter, kitchen and platform-admin accounts use their own
 * surfaces.
 */
export function counterAccessDenied(
  context: TenantContext | null
): NextResponse | null {
  if (!context) {
    return NextResponse.json(
      { error: 'Authentication required' },
      { status: 401 }
    );
  }

  if (context.mustChangePassword) {
    return NextResponse.json(
      {
        error:
          'Change your password on the web dashboard before using the Counter.',
        code: 'PASSWORD_CHANGE_REQUIRED',
      },
      { status: 403 }
    );
  }

  const isCounterRole =
    context.userType === 'restaurant_owner' ||
    (context.userType === 'staff' &&
      (context.roleTemplate === 'manager' ||
        context.roleTemplate === 'cashier'));

  if (!isCounterRole) {
    return NextResponse.json(
      {
        error:
          'The Counter is for owner, manager and cashier accounts. Use the web/PWA or kitchen station for this role.',
        code: 'COUNTER_ROLE_NOT_ALLOWED',
      },
      { status: 403 }
    );
  }

  return null;
}
