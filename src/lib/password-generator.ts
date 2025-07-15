// Password generator utility for staff creation
// Generates secure random passwords with specified criteria

import { randomInt, randomBytes } from 'crypto';

export interface PasswordOptions {
  length?: number;
  includeUppercase?: boolean;
  includeLowercase?: boolean;
  includeNumbers?: boolean;
  includeSymbols?: boolean;
  excludeAmbiguous?: boolean;
}

export class PasswordGenerator {
  // Character sets
  private static readonly LOWERCASE = 'abcdefghijkmnpqrstuvwxyz'; // Exclude l, o
  private static readonly UPPERCASE = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // Exclude I, O
  private static readonly NUMBERS = '23456789'; // Exclude 0, 1
  private static readonly SYMBOLS = '!@#$%^&*()_+-=[]{}|;:,.<>?';

  /**
   * Generate a random password for staff creation
   * Requirements: 8-10 characters, letters + numbers only, avoid confusing characters
   */
  static generateStaffPassword(): string {
    // Generate password with validation loop to ensure quality
    let attempts = 0;
    const maxAttempts = 10;
    
    while (attempts < maxAttempts) {
      const length = PasswordGenerator.getRandomInt(8, 10);
      const chars = PasswordGenerator.LOWERCASE + PasswordGenerator.UPPERCASE + PasswordGenerator.NUMBERS;
      
      let password = '';
      
      // Ensure at least one character from each required type
      password += PasswordGenerator.getRandomChar(PasswordGenerator.LOWERCASE);
      password += PasswordGenerator.getRandomChar(PasswordGenerator.UPPERCASE);
      password += PasswordGenerator.getRandomChar(PasswordGenerator.NUMBERS);
      
      // Fill remaining length with random characters
      for (let i = password.length; i < length; i++) {
        password += PasswordGenerator.getRandomChar(chars);
      }
      
      // Shuffle the password to randomize positions
      password = PasswordGenerator.shuffleString(password);
      
      // Validate password quality
      if (PasswordGenerator.isPasswordSecure(password)) {
        return password;
      }
      
      attempts++;
    }
    
    // Fallback if generation fails (should never happen)
    throw new Error('Failed to generate secure password after multiple attempts');
  }

  /**
   * Validate password security (no repeated patterns, good distribution)
   */
  private static isPasswordSecure(password: string): boolean {
    // Check for repeated characters (no more than 2 consecutive)
    if (/(.)\1{2,}/.test(password)) {
      return false;
    }
    
    // Ensure good character distribution
    const hasLower = /[a-z]/.test(password);
    const hasUpper = /[A-Z]/.test(password);
    const hasNumber = /[0-9]/.test(password);
    
    return hasLower && hasUpper && hasNumber;
  }

  /**
   * Generate a random password with custom options
   */
  static generatePassword(options: PasswordOptions = {}): string {
    const {
      length = 12,
      includeUppercase = true,
      includeLowercase = true,
      includeNumbers = true,
      includeSymbols = false,
      excludeAmbiguous = true
    } = options;

    let chars = '';
    let password = '';

    // Build character set
    if (includeLowercase) {
      chars += excludeAmbiguous ? this.LOWERCASE : 'abcdefghijklmnopqrstuvwxyz';
    }
    if (includeUppercase) {
      chars += excludeAmbiguous ? this.UPPERCASE : 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    }
    if (includeNumbers) {
      chars += excludeAmbiguous ? this.NUMBERS : '0123456789';
    }
    if (includeSymbols) {
      chars += this.SYMBOLS;
    }

    if (chars.length === 0) {
      throw new Error('No character sets selected for password generation');
    }

    // Generate password
    for (let i = 0; i < length; i++) {
      password += this.getRandomChar(chars);
    }

    return password;
  }

  /**
   * Validate password strength
   */
  static validatePassword(password: string): {
    isValid: boolean;
    score: number;
    feedback: string[];
  } {
    const feedback: string[] = [];
    let score = 0;

    // Length check
    if (password.length < 8) {
      feedback.push('Password must be at least 8 characters long');
    } else if (password.length >= 8) {
      score += 1;
    }

    // Character variety checks
    if (/[a-z]/.test(password)) score += 1;
    if (/[A-Z]/.test(password)) score += 1;
    if (/[0-9]/.test(password)) score += 1;
    if (/[^a-zA-Z0-9]/.test(password)) score += 1;

    // Additional security checks
    if (password.length >= 12) score += 1;
    if (!/(.)\1{2,}/.test(password)) score += 1; // No repeated characters

    const isValid = score >= 3 && password.length >= 8;

    if (!isValid) {
      if (!/[a-z]/.test(password)) feedback.push('Add lowercase letters');
      if (!/[A-Z]/.test(password)) feedback.push('Add uppercase letters');
      if (!/[0-9]/.test(password)) feedback.push('Add numbers');
      if (feedback.length === 0) feedback.push('Password needs improvement');
    }

    return {
      isValid,
      score,
      feedback
    };
  }

  /**
   * Check if password is commonly used
   */
  static isCommonPassword(password: string): boolean {
    const commonPasswords = [
      'password', '123456', '123456789', 'qwerty', 'abc123',
      'password123', 'admin', 'letmein', 'welcome', 'monkey',
      'dragon', 'master', 'shadow', 'football', 'baseball'
    ];
    
    return commonPasswords.some(common => 
      password.toLowerCase().includes(common.toLowerCase())
    );
  }

  // Private helper methods - using cryptographically secure randomness
  private static getRandomInt(min: number, max: number): number {
    return randomInt(min, max + 1);
  }

  private static getRandomChar(chars: string): string {
    return chars[randomInt(0, chars.length)];
  }

  private static shuffleString(str: string): string {
    const array = str.split('');
    for (let i = array.length - 1; i > 0; i--) {
      const j = randomInt(0, i + 1);
      [array[i], array[j]] = [array[j], array[i]];
    }
    return array.join('');
  }
}

// Export convenience function
export const generateStaffPassword = PasswordGenerator.generateStaffPassword;