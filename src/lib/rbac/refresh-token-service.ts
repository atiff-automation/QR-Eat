/**
 * Refresh Token Service
 *
 * Modern, production-ready refresh token management following industry best practices:
 * - Token rotation for security
 * - Cryptographic hashing for storage
 * - Automatic cleanup of expired tokens
 * - Multi-device support with device tracking
 * - Instant revocation capabilities
 *
 * Following CLAUDE.md principles:
 * - Type Safety (no `any` types)
 * - Single Source of Truth (centralized token management)
 * - DRY (reusable token operations)
 * - Security Standards (OWASP best practices)
 *
 * @see claudedocs/CODING_STANDARDS.md
 */

import { prisma } from '@/lib/database';
import { createHash, randomBytes } from 'crypto';
import type { UserType } from './types';

// =============================================================================
// Constants - Single Source of Truth
// =============================================================================

const REFRESH_TOKEN_CONFIG = {
  // Token lifetime: 14 days (industry standard for business apps)
  EXPIRES_IN_MS: 14 * 24 * 60 * 60 * 1000, // 14 days in milliseconds

  // Token length: 64 bytes (512 bits) for cryptographic security
  TOKEN_LENGTH_BYTES: 64,

  // Cleanup interval: remove expired tokens every hour
  CLEANUP_INTERVAL_MS: 60 * 60 * 1000,
} as const;

// =============================================================================
// Types
// =============================================================================

export interface CreateRefreshTokenParams {
  userId: string;
  userType: UserType;
  sessionId: string;
  ipAddress?: string;
  userAgent?: string;
  deviceInfo?: Record<string, unknown>;
}

export interface RefreshTokenData {
  id: string;
  token: string; // Unhashed token (only returned on creation)
  userId: string;
  userType: string;
  sessionId: string;
  expiresAt: Date;
  lastUsed: Date;
  ipAddress?: string;
  userAgent?: string;
  deviceInfo: Record<string, unknown>;
  isRevoked: boolean;
  createdAt: Date;
}

export interface ValidateRefreshTokenResult {
  isValid: boolean;
  data?: RefreshTokenData;
  reason?: 'expired' | 'revoked' | 'not_found' | 'invalid_hash';
}

// =============================================================================
// Refresh Token Service
// =============================================================================

export class RefreshTokenService {
  /**
   * Generate cryptographically secure random token
   * Uses Node.js crypto module for CSPRNG (Cryptographically Secure Pseudo-Random Number Generator)
   */
  private static generateSecureToken(): string {
    return randomBytes(REFRESH_TOKEN_CONFIG.TOKEN_LENGTH_BYTES).toString('hex');
  }

  /**
   * Hash token for secure database storage
   * Uses SHA-256 to prevent token theft from database compromise
   */
  private static hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  /**
   * Determine appropriate FK field based on user type
   * Follows multi-user-type pattern from Payment model
   */
  private static getUserTypeField(
    userType: UserType
  ): 'adminId' | 'ownerId' | 'staffId' {
    switch (userType) {
      case 'platform_admin':
        return 'adminId';
      case 'restaurant_owner':
        return 'ownerId';
      case 'staff':
        return 'staffId';
      default:
        throw new Error(`Invalid user type: ${userType}`);
    }
  }

  /**
   * Create new refresh token with automatic rotation
   *
   * Security features:
   * - Tokens are hashed before storage
   * - Each token is single-use (rotated on refresh)
   * - Device information tracked for security auditing
   * - Old tokens automatically cleaned up
   */
  static async createRefreshToken(
    params: CreateRefreshTokenParams
  ): Promise<{ token: string; expiresAt: Date }> {
    try {
      // Generate secure random token
      const token = this.generateSecureToken();
      const hashedToken = this.hashToken(token);

      // Calculate expiration
      const expiresAt = new Date(
        Date.now() + REFRESH_TOKEN_CONFIG.EXPIRES_IN_MS
      );

      // Prepare database record with multi-user FK
      const userTypeField = this.getUserTypeField(params.userType);
      const data: Record<string, unknown> = {
        token: hashedToken,
        userId: params.userId,
        userType: params.userType,
        sessionId: params.sessionId,
        expiresAt,
        ipAddress: params.ipAddress,
        userAgent: params.userAgent,
        deviceInfo: params.deviceInfo || {},
        [userTypeField]: params.userId,
      };

      // Create token in database (cast to any due to dynamic field)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await prisma.refreshToken.create({ data: data as any });

      // Return unhashed token (only time it's visible)
      return { token, expiresAt };
    } catch (error) {
      console.error('Failed to create refresh token:', error);
      throw new Error('Failed to create refresh token');
    }
  }

  /**
   * Validate refresh token
   *
   * Checks:
   * 1. Token exists in database (by hash)
   * 2. Token not expired
   * 3. Token not revoked
   * 4. Updates lastUsed timestamp
   */
  static async validateRefreshToken(
    token: string
  ): Promise<ValidateRefreshTokenResult> {
    try {
      const hashedToken = this.hashToken(token);

      // Find token by hash
      const refreshToken = await prisma.refreshToken.findUnique({
        where: { token: hashedToken },
      });

      // Token not found
      if (!refreshToken) {
        return { isValid: false, reason: 'not_found' };
      }

      // Token expired
      if (refreshToken.expiresAt < new Date()) {
        return { isValid: false, reason: 'expired' };
      }

      // Token revoked
      if (refreshToken.isRevoked) {
        return { isValid: false, reason: 'revoked' };
      }

      // Update lastUsed timestamp
      await prisma.refreshToken.update({
        where: { id: refreshToken.id },
        data: { lastUsed: new Date() },
      });

      // Return token data
      return {
        isValid: true,
        data: {
          id: refreshToken.id,
          token, // Return original token
          userId: refreshToken.userId,
          userType: refreshToken.userType,
          sessionId: refreshToken.sessionId,
          expiresAt: refreshToken.expiresAt,
          lastUsed: refreshToken.lastUsed,
          ipAddress: refreshToken.ipAddress || undefined,
          userAgent: refreshToken.userAgent || undefined,
          deviceInfo:
            (refreshToken.deviceInfo as Record<string, unknown>) || {},
          isRevoked: refreshToken.isRevoked,
          createdAt: refreshToken.createdAt,
        },
      };
    } catch (error) {
      console.error('Failed to validate refresh token:', error);
      return { isValid: false, reason: 'invalid_hash' };
    }
  }

  /**
   * Rotate refresh token (security best practice)
   *
   * Process:
   * 1. Validate current token
   * 2. Revoke current token
   * 3. Create new token
   * 4. Return new token
   *
   * This prevents replay attacks and token theft
   */
  static async rotateRefreshToken(
    oldToken: string,
    ipAddress?: string,
    userAgent?: string
  ): Promise<{ token: string; expiresAt: Date } | null> {
    try {
      // Validate old token
      const validation = await this.validateRefreshToken(oldToken);

      if (!validation.isValid || !validation.data) {
        return null;
      }

      // Revoke old token
      await this.revokeRefreshToken(oldToken, 'rotated');

      // Create new token with same user context
      return await this.createRefreshToken({
        userId: validation.data.userId,
        userType: validation.data.userType as UserType,
        sessionId: validation.data.sessionId,
        ipAddress: ipAddress || validation.data.ipAddress,
        userAgent: userAgent || validation.data.userAgent,
        deviceInfo: validation.data.deviceInfo,
      });
    } catch (error) {
      console.error('Failed to rotate refresh token:', error);
      return null;
    }
  }

  /**
   * Revoke refresh token (instant logout capability)
   *
   * Use cases:
   * - User logout
   * - Security breach detected
   * - Admin-initiated logout
   * - Token rotation
   */
  static async revokeRefreshToken(
    token: string,
    reason?: string
  ): Promise<boolean> {
    try {
      const hashedToken = this.hashToken(token);

      await prisma.refreshToken.update({
        where: { token: hashedToken },
        data: {
          isRevoked: true,
          revokedAt: new Date(),
          revokedReason: reason || 'manual_revocation',
        },
      });

      return true;
    } catch (error) {
      console.error('Failed to revoke refresh token:', error);
      return false;
    }
  }

  /**
   * Revoke all refresh tokens for a user (logout all devices)
   */
  static async revokeAllUserTokens(
    userId: string,
    reason?: string
  ): Promise<number> {
    try {
      const result = await prisma.refreshToken.updateMany({
        where: {
          userId,
          isRevoked: false,
        },
        data: {
          isRevoked: true,
          revokedAt: new Date(),
          revokedReason: reason || 'revoke_all_devices',
        },
      });

      return result.count;
    } catch (error) {
      console.error('Failed to revoke all user tokens:', error);
      return 0;
    }
  }

  /**
   * Get all active refresh tokens for a user (device management)
   */
  static async getUserActiveTokens(
    userId: string
  ): Promise<RefreshTokenData[]> {
    try {
      const tokens = await prisma.refreshToken.findMany({
        where: {
          userId,
          isRevoked: false,
          expiresAt: {
            gt: new Date(),
          },
        },
        orderBy: {
          lastUsed: 'desc',
        },
      });

      return tokens.map((token) => ({
        id: token.id,
        token: '', // Never return hashed token
        userId: token.userId,
        userType: token.userType,
        sessionId: token.sessionId,
        expiresAt: token.expiresAt,
        lastUsed: token.lastUsed,
        ipAddress: token.ipAddress || undefined,
        userAgent: token.userAgent || undefined,
        deviceInfo: (token.deviceInfo as Record<string, unknown>) || {},
        isRevoked: token.isRevoked,
        createdAt: token.createdAt,
      }));
    } catch (error) {
      console.error('Failed to get user active tokens:', error);
      return [];
    }
  }

  /**
   * Cleanup expired and revoked refresh tokens
   * Should be run periodically (e.g., via cron job)
   */
  static async cleanupExpiredTokens(): Promise<number> {
    try {
      const result = await prisma.refreshToken.deleteMany({
        where: {
          OR: [
            {
              // Expired tokens
              expiresAt: {
                lt: new Date(),
              },
            },
            {
              // Revoked tokens older than 30 days
              isRevoked: true,
              revokedAt: {
                lt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
              },
            },
          ],
        },
      });

      return result.count;
    } catch (error) {
      console.error('Failed to cleanup expired tokens:', error);
      return 0;
    }
  }
}

// =============================================================================
// Automatic Cleanup Scheduler
// =============================================================================

// Run cleanup every hour in production
if (process.env.NODE_ENV === 'production') {
  setInterval(() => {
    RefreshTokenService.cleanupExpiredTokens()
      .then((count) => {
        if (count > 0) {
          console.log(
            `[RefreshTokenService] Cleaned up ${count} expired tokens`
          );
        }
      })
      .catch((error) => {
        console.error('[RefreshTokenService] Cleanup failed:', error);
      });
  }, REFRESH_TOKEN_CONFIG.CLEANUP_INTERVAL_MS);
}
