/**
 * ToyyibPay Credentials Service
 * Secure encrypted storage and retrieval of ToyyibPay API credentials
 *
 * Features:
 * - AES-256-GCM encryption for credential security
 * - Master key derived from NEXTAUTH_SECRET
 * - 5-minute in-memory cache for performance
 * - Credential validation via API test calls
 *
 * Reference: TOYYIBPAY_INTEGRATION_DOCUMENTATION.md
 */

import { prisma } from '@/lib/database';
import {
  encryptData,
  decryptData,
  deriveMasterKey,
  type EncryptedData,
} from '@/lib/utils/crypto-utils';

const CONFIG_KEY = 'toyyibpay_credentials';
const CACHE_DURATION_MS = 5 * 60 * 1000; // 5 minutes

/**
 * ToyyibPay credentials structure
 */
export interface ToyyibPayCredentials {
  userSecretKey: string;
  environment: 'sandbox' | 'production';
  categoryCode?: string;
}

/**
 * Credential status (without exposing sensitive data)
 */
export interface ToyyibPayCredentialStatus {
  isConfigured: boolean;
  environment?: 'sandbox' | 'production';
  hasCategoryCode: boolean;
  lastUpdated?: Date;
}

/**
 * Credentials for service usage
 */
export interface ServiceCredentials {
  userSecretKey: string;
  environment: 'sandbox' | 'production';
  categoryCode?: string;
  isSandbox: boolean;
}

/**
 * In-memory cache entry
 */
interface CacheEntry {
  credentials: ToyyibPayCredentials;
  timestamp: number;
}

/**
 * ToyyibPay Credentials Service (Singleton)
 */
class ToyyibPayCredentialsService {
  private static instance: ToyyibPayCredentialsService;
  private masterKey: string;
  private cache: CacheEntry | null = null;

  private constructor() {
    // Derive master key from NEXTAUTH_SECRET
    const secret = process.env.NEXTAUTH_SECRET;
    if (!secret) {
      throw new Error(
        'NEXTAUTH_SECRET is required for credential encryption'
      );
    }

    this.masterKey = deriveMasterKey(
      secret,
      'toyyibpay-credentials-salt',
      100000
    );
  }

  /**
   * Get singleton instance
   */
  public static getInstance(): ToyyibPayCredentialsService {
    if (!ToyyibPayCredentialsService.instance) {
      ToyyibPayCredentialsService.instance =
        new ToyyibPayCredentialsService();
    }
    return ToyyibPayCredentialsService.instance;
  }

  /**
   * Store encrypted credentials in database
   * @param credentials - ToyyibPay credentials to store
   * @param updatedBy - User ID who updated the credentials
   */
  public async storeCredentials(
    credentials: ToyyibPayCredentials,
    updatedBy: string
  ): Promise<void> {
    try {
      // Validate input
      if (!credentials.userSecretKey || credentials.userSecretKey.trim() === '') {
        throw new Error('User Secret Key is required');
      }

      if (!['sandbox', 'production'].includes(credentials.environment)) {
        throw new Error('Environment must be either sandbox or production');
      }

      // Optionally validate credentials via API
      const validation = await this.validateCredentials(
        credentials.userSecretKey,
        credentials.environment
      );

      if (!validation.isValid) {
        throw new Error(
          `Credential validation failed: ${validation.error || 'Invalid credentials'}`
        );
      }

      // Encrypt credentials
      const credentialsJSON = JSON.stringify(credentials);
      const encrypted = encryptData(credentialsJSON, this.masterKey);

      // Store in database (upsert)
      await prisma.systemConfig.upsert({
        where: { key: CONFIG_KEY },
        create: {
          key: CONFIG_KEY,
          value: encrypted.encrypted,
          iv: encrypted.iv,
          tag: encrypted.tag,
          description: 'ToyyibPay API credentials (encrypted)',
          updatedBy,
        },
        update: {
          value: encrypted.encrypted,
          iv: encrypted.iv,
          tag: encrypted.tag,
          updatedBy,
          updatedAt: new Date(),
        },
      });

      // Update cache
      this.cache = {
        credentials,
        timestamp: Date.now(),
      };
    } catch (error) {
      throw new Error(
        `Failed to store credentials: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Retrieve and decrypt credentials from database
   * Uses cache if available and not expired
   * @returns Decrypted credentials or null if not found
   */
  public async getCredentials(): Promise<ToyyibPayCredentials | null> {
    try {
      // Check cache first
      if (this.cache && this.isCacheValid()) {
        return this.cache.credentials;
      }

      // Fetch from database
      const config = await prisma.systemConfig.findUnique({
        where: { key: CONFIG_KEY },
      });

      if (!config) {
        return null;
      }

      // Decrypt credentials
      const decrypted = decryptData(
        config.value,
        this.masterKey,
        config.iv,
        config.tag
      );

      const credentials = JSON.parse(decrypted) as ToyyibPayCredentials;

      // Update cache
      this.cache = {
        credentials,
        timestamp: Date.now(),
      };

      return credentials;
    } catch (error) {
      throw new Error(
        `Failed to retrieve credentials: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Get credential status without exposing sensitive data
   * @returns Status information
   */
  public async getCredentialStatus(): Promise<ToyyibPayCredentialStatus> {
    try {
      const config = await prisma.systemConfig.findUnique({
        where: { key: CONFIG_KEY },
        select: {
          updatedAt: true,
        },
      });

      if (!config) {
        return {
          isConfigured: false,
          hasCategoryCode: false,
        };
      }

      const credentials = await this.getCredentials();

      if (!credentials) {
        return {
          isConfigured: false,
          hasCategoryCode: false,
        };
      }

      return {
        isConfigured: true,
        environment: credentials.environment,
        hasCategoryCode: !!credentials.categoryCode,
        lastUpdated: config.updatedAt,
      };
    } catch (error) {
      return {
        isConfigured: false,
        hasCategoryCode: false,
      };
    }
  }

  /**
   * Switch between sandbox and production environment
   * @param environment - Target environment
   * @param updatedBy - User ID who updated
   */
  public async switchEnvironment(
    environment: 'sandbox' | 'production',
    updatedBy: string
  ): Promise<void> {
    try {
      const credentials = await this.getCredentials();

      if (!credentials) {
        throw new Error('No credentials configured');
      }

      credentials.environment = environment;

      await this.storeCredentials(credentials, updatedBy);
    } catch (error) {
      throw new Error(
        `Failed to switch environment: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Clear stored credentials from database and cache
   */
  public async clearCredentials(): Promise<void> {
    try {
      await prisma.systemConfig.delete({
        where: { key: CONFIG_KEY },
      });

      this.cache = null;
    } catch (error) {
      // Ignore error if already deleted
      this.cache = null;
    }
  }

  /**
   * Get credentials for service usage
   * Adds isSandbox flag for convenience
   * @returns Service credentials or null
   */
  public async getCredentialsForService(): Promise<ServiceCredentials | null> {
    try {
      const credentials = await this.getCredentials();

      if (!credentials) {
        return null;
      }

      return {
        ...credentials,
        isSandbox: credentials.environment === 'sandbox',
      };
    } catch (error) {
      return null;
    }
  }

  /**
   * Validate credentials by making a test API call to ToyyibPay
   * @param userSecretKey - User secret key to validate
   * @param environment - Environment to test against
   * @returns Validation result
   */
  public async validateCredentials(
    userSecretKey: string,
    environment: 'sandbox' | 'production'
  ): Promise<{
    isValid: boolean;
    error?: string;
    responseTime?: number;
  }> {
    try {
      const baseUrl =
        environment === 'sandbox'
          ? process.env.TOYYIBPAY_SANDBOX_URL || 'https://dev.toyyibpay.com'
          : process.env.TOYYIBPAY_PRODUCTION_URL || 'https://toyyibpay.com';

      const startTime = Date.now();

      // Test API call - Get user status/info
      const testUrl = `${baseUrl}/index.php/api/getUserStatus`;

      const formData = new FormData();
      formData.append('userSecretKey', userSecretKey);

      const response = await fetch(testUrl, {
        method: 'POST',
        body: formData,
        signal: AbortSignal.timeout(15000), // 15 second timeout
      });

      const responseTime = Date.now() - startTime;

      if (!response.ok) {
        return {
          isValid: false,
          error: `API returned status ${response.status}`,
          responseTime,
        };
      }

      const data = await response.json();

      // Check if response indicates success
      // ToyyibPay returns user status if valid
      if (data && (data.status || data.userSecretKey)) {
        return {
          isValid: true,
          responseTime,
        };
      }

      return {
        isValid: false,
        error: 'Invalid response from ToyyibPay API',
        responseTime,
      };
    } catch (error) {
      return {
        isValid: false,
        error:
          error instanceof Error
            ? error.message
            : 'Failed to validate credentials',
      };
    }
  }

  /**
   * Check if cache is still valid
   * @returns True if cache is valid
   */
  private isCacheValid(): boolean {
    if (!this.cache) {
      return false;
    }

    const age = Date.now() - this.cache.timestamp;
    return age < CACHE_DURATION_MS;
  }

  /**
   * Clear the in-memory cache
   */
  public clearCache(): void {
    this.cache = null;
  }
}

// Export singleton instance
export const toyyibPayCredentialsService =
  ToyyibPayCredentialsService.getInstance();
