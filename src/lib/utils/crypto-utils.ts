/**
 * Cryptography Utilities
 * Provides encryption/decryption functions for sensitive data
 * Using AES-256-GCM for authenticated encryption
 */

import * as crypto from 'crypto';

/**
 * Encrypted data structure
 */
export interface EncryptedData {
  encrypted: string; // Base64 encoded ciphertext
  iv: string; // Base64 encoded initialization vector
  tag: string; // Base64 encoded authentication tag
}

/**
 * Encrypt data using AES-256-GCM
 * @param data - Plain text data to encrypt
 * @param key - Encryption key (32 bytes/256 bits)
 * @returns Encrypted data with IV and auth tag
 */
export function encryptData(data: string, key: string): EncryptedData {
  try {
    // Generate random IV (12 bytes recommended for GCM)
    const iv = crypto.randomBytes(12);

    // Create cipher
    const cipher = crypto.createCipheriv(
      'aes-256-gcm',
      Buffer.from(key, 'hex'),
      iv
    );

    // Encrypt the data
    let encrypted = cipher.update(data, 'utf8', 'base64');
    encrypted += cipher.final('base64');

    // Get authentication tag
    const tag = cipher.getAuthTag();

    return {
      encrypted,
      iv: iv.toString('base64'),
      tag: tag.toString('base64'),
    };
  } catch (error) {
    throw new Error(
      `Encryption failed: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Decrypt data using AES-256-GCM
 * @param encrypted - Base64 encoded ciphertext
 * @param key - Decryption key (32 bytes/256 bits)
 * @param iv - Base64 encoded initialization vector
 * @param tag - Base64 encoded authentication tag
 * @returns Decrypted plain text
 */
export function decryptData(
  encrypted: string,
  key: string,
  iv: string,
  tag: string
): string {
  try {
    // Create decipher
    const decipher = crypto.createDecipheriv(
      'aes-256-gcm',
      Buffer.from(key, 'hex'),
      Buffer.from(iv, 'base64')
    );

    // Set auth tag
    decipher.setAuthTag(Buffer.from(tag, 'base64'));

    // Decrypt the data
    let decrypted = decipher.update(encrypted, 'base64', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  } catch (error) {
    throw new Error(
      `Decryption failed: ${error instanceof Error ? error.message : 'Invalid key or corrupted data'}`
    );
  }
}

/**
 * Derive a master key from a secret using PBKDF2
 * @param secret - Source secret (e.g., NEXTAUTH_SECRET)
 * @param salt - Salt for key derivation
 * @param iterations - Number of iterations (default: 100000)
 * @returns Hex-encoded master key (32 bytes)
 */
export function deriveMasterKey(
  secret: string,
  salt: string,
  iterations: number = 100000
): string {
  try {
    const key = crypto.pbkdf2Sync(secret, salt, iterations, 32, 'sha256');
    return key.toString('hex');
  } catch (error) {
    throw new Error(
      `Key derivation failed: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Generate a secure random string
 * @param length - Number of bytes to generate
 * @returns Hex-encoded random string
 */
export function generateRandomString(length: number = 32): string {
  return crypto.randomBytes(length).toString('hex');
}

/**
 * Hash a string using SHA-256
 * @param data - Data to hash
 * @returns Hex-encoded hash
 */
export function hashSHA256(data: string): string {
  return crypto.createHash('sha256').update(data).digest('hex');
}

/**
 * Verify HMAC signature
 * @param data - Data that was signed
 * @param signature - HMAC signature to verify
 * @param secret - Secret key used for signing
 * @returns True if signature is valid
 */
export function verifyHMAC(
  data: string,
  signature: string,
  secret: string
): boolean {
  try {
    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(data)
      .digest('hex');

    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    );
  } catch {
    return false;
  }
}
