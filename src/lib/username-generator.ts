// Username generator utility for staff creation
// Generates usernames from firstName + lastName with proper handling

import { randomInt } from 'crypto';

export interface UsernameOptions {
  includeNumbers?: boolean;
  maxLength?: number;
  separator?: string;
}

export class UsernameGenerator {
  /**
   * Generate username from firstName + lastName
   * Handles special characters, spaces, and ensures uniqueness
   */
  static generateUsername(
    firstName: string,
    lastName: string,
    options: UsernameOptions = {}
  ): string {
    const {
      includeNumbers = false,
      maxLength = 50,
      separator = ''
    } = options;

    // Validate input
    if (!firstName?.trim() || !lastName?.trim()) {
      throw new Error('First name and last name are required for username generation');
    }

    // Clean and normalize names
    const cleanFirstName = this.cleanName(firstName);
    const cleanLastName = this.cleanName(lastName);

    // Validate cleaned names are not empty
    if (!cleanFirstName || !cleanLastName) {
      throw new Error('Names contain no valid alphanumeric characters for username generation');
    }

    // Ensure minimum length for each part
    const minFirstName = cleanFirstName.length >= 2 ? cleanFirstName : cleanFirstName + 'x';
    const minLastName = cleanLastName.length >= 2 ? cleanLastName : cleanLastName + 'y';

    // Combine names
    let username = minFirstName + separator + minLastName;

    // Truncate if too long but maintain minimum viable username
    if (username.length > maxLength) {
      const minLength = 6; // Minimum viable username length
      if (maxLength < minLength) {
        throw new Error(`Maximum length ${maxLength} is too short for username generation`);
      }

      // Try to keep both first and last name parts
      const firstPart = Math.max(2, Math.floor((maxLength - separator.length) / 2));
      const lastPart = Math.max(2, maxLength - firstPart - separator.length);
      
      username = minFirstName.substring(0, firstPart) + 
                separator + 
                minLastName.substring(0, lastPart);
    }

    // Add numbers if requested
    if (includeNumbers) {
      const remainingLength = maxLength - username.length;
      if (remainingLength > 0) {
        const numberLength = Math.min(3, remainingLength);
        // Use crypto-secure random number
        const randomNumber = randomInt(0, Math.pow(10, numberLength));
        username += randomNumber.toString().padStart(numberLength, '0');
      }
    }

    const finalUsername = username.toLowerCase();
    
    // Final validation
    if (finalUsername.length < 3) {
      throw new Error('Generated username is too short');
    }

    return finalUsername;
  }

  /**
   * Generate multiple username variations for uniqueness checking
   */
  static generateUsernameVariations(
    firstName: string,
    lastName: string,
    count: number = 5
  ): string[] {
    const variations: string[] = [];
    const baseUsername = this.generateUsername(firstName, lastName);
    
    // Add base username
    variations.push(baseUsername);
    
    // Add numbered variations
    for (let i = 1; i < count; i++) {
      variations.push(`${baseUsername}${i}`);
    }
    
    // Add variations with different separators
    if (variations.length < count) {
      variations.push(this.generateUsername(firstName, lastName, { separator: '.' }));
      variations.push(this.generateUsername(firstName, lastName, { separator: '_' }));
      variations.push(this.generateUsername(firstName, lastName, { includeNumbers: true }));
    }
    
    return variations.slice(0, count);
  }

  /**
   * Check if username is valid according to business rules
   */
  static isValidUsername(username: string): {
    isValid: boolean;
    errors: string[];
  } {
    const errors: string[] = [];
    
    // Length check
    if (username.length < 3) {
      errors.push('Username must be at least 3 characters long');
    }
    
    if (username.length > 50) {
      errors.push('Username must be no more than 50 characters long');
    }
    
    // Character check
    if (!/^[a-zA-Z0-9._-]+$/.test(username)) {
      errors.push('Username can only contain letters, numbers, dots, underscores, and hyphens');
    }
    
    // Must start with letter
    if (!/^[a-zA-Z]/.test(username)) {
      errors.push('Username must start with a letter');
    }
    
    // Cannot end with special characters
    if (/[._-]$/.test(username)) {
      errors.push('Username cannot end with special characters');
    }
    
    // No consecutive special characters
    if (/[._-]{2,}/.test(username)) {
      errors.push('Username cannot have consecutive special characters');
    }
    
    // Reserved words check
    if (this.isReservedUsername(username)) {
      errors.push('Username is reserved and cannot be used');
    }
    
    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Generate a unique username by checking against existing usernames
   */
  static async generateUniqueUsername(
    firstName: string,
    lastName: string,
    checkExistence: (username: string) => Promise<boolean>
  ): Promise<string> {
    const variations = this.generateUsernameVariations(firstName, lastName, 10);
    
    for (const username of variations) {
      const validation = this.isValidUsername(username);
      if (validation.isValid) {
        const exists = await checkExistence(username);
        if (!exists) {
          return username;
        }
      }
    }
    
    // If all variations are taken, generate with timestamp
    const timestamp = Date.now().toString().slice(-6);
    const fallbackUsername = this.generateUsername(firstName, lastName) + timestamp;
    
    return fallbackUsername;
  }

  /**
   * Extract display name from username
   */
  static getDisplayName(username: string): string {
    // Remove numbers and special characters, capitalize first letter
    const cleaned = username.replace(/[0-9._-]/g, '');
    return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
  }

  // Private helper methods
  private static cleanName(name: string): string {
    return name
      .toLowerCase()
      .trim()
      // Remove accents and diacritics
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      // Handle common special characters
      .replace(/['\u2019]/g, '') // apostrophes
      .replace(/[^a-zA-Z0-9]/g, '') // remove all non-alphanumeric
      .replace(/\s+/g, ''); // remove any remaining spaces
  }

  private static isReservedUsername(username: string): boolean {
    const reserved = [
      'admin', 'administrator', 'root', 'system', 'user', 'guest',
      'api', 'www', 'mail', 'email', 'support', 'help', 'info',
      'contact', 'service', 'staff', 'manager', 'owner', 'restaurant',
      'kitchen', 'waiter', 'cashier', 'test', 'demo', 'null', 'undefined'
    ];
    
    return reserved.includes(username.toLowerCase());
  }
}

// Export convenience function
export const generateUsername = UsernameGenerator.generateUsername;