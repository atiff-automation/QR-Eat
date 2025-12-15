/**
 * Token Refresh Endpoint
 *
 * Modern, production-ready token refresh implementation following industry best practices:
 * - Automatic token rotation for security
 * - Seamless user experience (no re-login required)
 * - Rate limiting to prevent abuse
 * - Comprehensive audit logging
 *
 * Following CLAUDE.md principles:
 * - Type Safety
 * - Error Handling
 * - Security Standards (OWASP best practices)
 * - Single Source of Truth
 *
 * @see claudedocs/CODING_STANDARDS.md
 */

import { NextRequest, NextResponse } from 'next/server';
import { RefreshTokenService } from '@/lib/rbac/refresh-token-service';
import { AuthServiceV2 } from '@/lib/rbac/auth-service';
import { SecurityUtils } from '@/lib/security';
import { AuditLogger } from '@/lib/rbac/audit-logger';
import { EnhancedJWTService } from '@/lib/rbac/jwt';

// =============================================================================
// Rate Limiting Configuration
// =============================================================================

const RATE_LIMIT_WINDOW = 5 * 60 * 1000; // 5 minutes
const RATE_LIMIT_MAX_ATTEMPTS = 10; // Allow 10 refreshes per 5 minutes
const rateLimitMap = new Map<string, { attempts: number; resetTime: number }>();

// =============================================================================
// Main Endpoint Handler
// =============================================================================

export async function POST(request: NextRequest) {
  try {
    // Get refresh token from cookie
    const refreshToken = request.cookies.get('qr_refresh_token')?.value;

    if (!refreshToken) {
      return NextResponse.json(
        { success: false, error: 'No refresh token provided' },
        { status: 401 }
      );
    }

    // Get client information for security and audit
    const clientIP = SecurityUtils.getClientIP(request);
    const userAgent = request.headers.get('user-agent') || 'unknown';

    // Rate limiting by IP to prevent abuse
    const now = Date.now();
    const clientKey = `${clientIP}:refresh`;
    const rateLimit = rateLimitMap.get(clientKey);

    if (rateLimit) {
      if (now < rateLimit.resetTime) {
        if (rateLimit.attempts >= RATE_LIMIT_MAX_ATTEMPTS) {
          await AuditLogger.logSecurityEvent(
            'anonymous',
            'REFRESH_RATE_LIMIT_EXCEEDED',
            'medium',
            `Refresh rate limit exceeded for IP ${clientIP}`,
            {
              ipAddress: clientIP,
              userAgent,
              metadata: { endpoint: 'refresh' },
            }
          );

          return NextResponse.json(
            {
              success: false,
              error: 'Too many refresh attempts. Please try again later.',
            },
            { status: 429 }
          );
        }
      } else {
        // Reset the rate limit window
        rateLimitMap.set(clientKey, {
          attempts: 1,
          resetTime: now + RATE_LIMIT_WINDOW,
        });
      }
    } else {
      rateLimitMap.set(clientKey, {
        attempts: 1,
        resetTime: now + RATE_LIMIT_WINDOW,
      });
    }

    // Validate refresh token
    const validation =
      await RefreshTokenService.validateRefreshToken(refreshToken);

    if (!validation.isValid || !validation.data) {
      // Increment rate limit on failure
      const currentRateLimit = rateLimitMap.get(clientKey);
      if (currentRateLimit) {
        rateLimitMap.set(clientKey, {
          attempts: currentRateLimit.attempts + 1,
          resetTime: currentRateLimit.resetTime,
        });
      }

      // Log failed refresh attempt
      await AuditLogger.logSecurityEvent(
        'anonymous',
        'REFRESH_TOKEN_INVALID',
        'low',
        `Invalid refresh token used: ${validation.reason || 'unknown'}`,
        {
          ipAddress: clientIP,
          userAgent,
          metadata: {
            endpoint: 'refresh',
            reason: validation.reason,
          },
        }
      );

      return NextResponse.json(
        {
          success: false,
          error: 'Invalid or expired refresh token',
          reason: validation.reason,
        },
        { status: 401 }
      );
    }

    // Refresh token is valid - generate new tokens
    const { userId, userType, sessionId } = validation.data;

    // Rotate refresh token (security best practice)
    const newRefreshToken = await RefreshTokenService.rotateRefreshToken(
      refreshToken,
      clientIP,
      userAgent
    );

    if (!newRefreshToken) {
      return NextResponse.json(
        { success: false, error: 'Failed to rotate refresh token' },
        { status: 500 }
      );
    }

    // Generate new access token using existing session
    // This reuses the existing session and role context
    const newAccessToken =
      await AuthServiceV2.generateTokenFromSession(sessionId);

    if (!newAccessToken) {
      return NextResponse.json(
        { success: false, error: 'Failed to generate new access token' },
        { status: 500 }
      );
    }

    // Success - clear rate limit
    rateLimitMap.delete(clientKey);

    // Log successful token refresh
    await AuditLogger.logSecurityEvent(
      userId,
      'TOKEN_REFRESH',
      'low',
      'Token refreshed successfully',
      {
        ipAddress: clientIP,
        userAgent,
        metadata: {
          endpoint: 'refresh',
          sessionId,
          userType,
        },
      }
    );

    // Development logging
    if (process.env.NODE_ENV === 'development') {
      console.log('🔄 Token refresh successful:', {
        userId,
        userType,
        sessionId,
      });
    }

    // Calculate token expiration times dynamically
    const accessTokenExpiration = EnhancedJWTService.getTokenExpirationTime();

    const response = NextResponse.json({
      success: true,
      message: 'Token refreshed successfully',
      tokenExpiration: {
        accessToken: accessTokenExpiration, // ✅ Now dynamic based on JWT_EXPIRES_IN
        refreshToken: newRefreshToken.expiresAt,
      },
    });

    // Set new access token cookie (short-lived: 30 minutes)
    response.cookies.set({
      name: 'qr_rbac_token',
      value: newAccessToken,
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 30 * 60, // 30 minutes
      path: '/',
    });

    // Set new refresh token cookie (long-lived: 14 days)
    response.cookies.set({
      name: 'qr_refresh_token',
      value: newRefreshToken.token,
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 14 * 24 * 60 * 60, // 14 days
      path: '/',
    });

    return response;
  } catch (error) {
    console.error('Token refresh error:', error);

    // Log error
    const clientIP = SecurityUtils.getClientIP(request);
    await AuditLogger.logSecurityEvent(
      'anonymous',
      'REFRESH_ERROR',
      'high',
      `Token refresh failed with error: ${error instanceof Error ? error.message : 'unknown'}`,
      {
        ipAddress: clientIP,
        userAgent: request.headers.get('user-agent') || 'unknown',
        metadata: {
          endpoint: 'refresh',
          errorMessage: error instanceof Error ? error.message : 'unknown',
        },
      }
    );

    return NextResponse.json(
      { success: false, error: 'Failed to refresh token' },
      { status: 500 }
    );
  }
}
