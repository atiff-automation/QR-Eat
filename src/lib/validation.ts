export interface ValidationResult {
  isValid: boolean;
  errors: string[];
}

export interface FieldValidation {
  value: any;
  required?: boolean;
  type?: 'string' | 'number' | 'email' | 'phone' | 'url' | 'boolean' | 'array' | 'object';
  minLength?: number;
  maxLength?: number;
  min?: number;
  max?: number;
  pattern?: RegExp;
  customValidator?: (value: any) => string | null;
}

export class Validator {
  private errors: string[] = [];

  validate(fields: Record<string, FieldValidation>): ValidationResult {
    this.errors = [];

    for (const [fieldName, validation] of Object.entries(fields)) {
      this.validateField(fieldName, validation);
    }

    return {
      isValid: this.errors.length === 0,
      errors: this.errors
    };
  }

  private validateField(fieldName: string, validation: FieldValidation): void {
    const { value, required, type, minLength, maxLength, min, max, pattern, customValidator } = validation;

    // Check required
    if (required && (value === undefined || value === null || value === '')) {
      this.addError(fieldName, 'is required');
      return;
    }

    // If not required and empty, skip other validations
    if (!required && (value === undefined || value === null || value === '')) {
      return;
    }

    // Type validation
    if (type && !this.validateType(value, type)) {
      this.addError(fieldName, `must be of type ${type}`);
      return;
    }

    // String-specific validations
    if (type === 'string' && typeof value === 'string') {
      if (minLength !== undefined && value.length < minLength) {
        this.addError(fieldName, `must be at least ${minLength} characters long`);
      }
      if (maxLength !== undefined && value.length > maxLength) {
        this.addError(fieldName, `must be at most ${maxLength} characters long`);
      }
      if (pattern && !pattern.test(value)) {
        this.addError(fieldName, 'format is invalid');
      }
    }

    // Number-specific validations
    if (type === 'number' && typeof value === 'number') {
      if (min !== undefined && value < min) {
        this.addError(fieldName, `must be at least ${min}`);
      }
      if (max !== undefined && value > max) {
        this.addError(fieldName, `must be at most ${max}`);
      }
    }

    // Array-specific validations
    if (type === 'array' && Array.isArray(value)) {
      if (minLength !== undefined && value.length < minLength) {
        this.addError(fieldName, `must have at least ${minLength} items`);
      }
      if (maxLength !== undefined && value.length > maxLength) {
        this.addError(fieldName, `must have at most ${maxLength} items`);
      }
    }

    // Custom validation
    if (customValidator) {
      const customError = customValidator(value);
      if (customError) {
        this.addError(fieldName, customError);
      }
    }
  }

  private validateType(value: any, type: string): boolean {
    switch (type) {
      case 'string':
        return typeof value === 'string';
      case 'number':
        return typeof value === 'number' && !isNaN(value);
      case 'boolean':
        return typeof value === 'boolean';
      case 'array':
        return Array.isArray(value);
      case 'object':
        return typeof value === 'object' && value !== null && !Array.isArray(value);
      case 'email':
        return typeof value === 'string' && this.isValidEmail(value);
      case 'phone':
        return typeof value === 'string' && this.isValidPhone(value);
      case 'url':
        return typeof value === 'string' && this.isValidUrl(value);
      default:
        return true;
    }
  }

  private isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  private isValidPhone(phone: string): boolean {
    // Basic phone validation - can be enhanced based on requirements
    const phoneRegex = /^[\+]?[1-9][\d]{0,15}$/;
    return phoneRegex.test(phone.replace(/[\s\-\(\)]/g, ''));
  }

  private isValidUrl(url: string): boolean {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  }

  private addError(fieldName: string, message: string): void {
    this.errors.push(`${fieldName} ${message}`);
  }
}

// Common validation patterns
export const ValidationPatterns = {
  PASSWORD: /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/,
  SLUG: /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
  CURRENCY: /^[A-Z]{3}$/,
  TIMEZONE: /^[A-Za-z_\/]+$/,
  HEX_COLOR: /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/,
  UUID: /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
};

// Pre-defined validation schemas
export const ValidationSchemas = {
  createRestaurant: {
    name: { value: '', required: true, type: 'string' as const, minLength: 2, maxLength: 100 },
    slug: { value: '', required: true, type: 'string' as const, minLength: 2, maxLength: 50, pattern: ValidationPatterns.SLUG },
    address: { value: '', required: true, type: 'string' as const, minLength: 5, maxLength: 200 },
    phone: { value: '', required: false, type: 'phone' as const },
    email: { value: '', required: false, type: 'email' as const },
    currency: { value: '', required: true, type: 'string' as const, pattern: ValidationPatterns.CURRENCY },
    timezone: { value: '', required: true, type: 'string' as const }
  },

  createMenuItem: {
    name: { value: '', required: true, type: 'string' as const, minLength: 2, maxLength: 100 },
    description: { value: '', required: false, type: 'string' as const, maxLength: 500 },
    price: { value: 0, required: true, type: 'number' as const, min: 0 },
    categoryId: { value: '', required: true, type: 'string' as const, pattern: ValidationPatterns.UUID },
    preparationTime: { value: 0, required: false, type: 'number' as const, min: 0, max: 180 },
    calories: { value: 0, required: false, type: 'number' as const, min: 0 },
    allergens: { value: [], required: false, type: 'array' as const },
    dietaryInfo: { value: [], required: false, type: 'array' as const }
  },

  createOrder: {
    tableId: { value: '', required: true, type: 'string' as const, pattern: ValidationPatterns.UUID },
    items: { value: [], required: true, type: 'array' as const, minLength: 1 },
    customerName: { value: '', required: false, type: 'string' as const, maxLength: 100 },
    customerEmail: { value: '', required: false, type: 'email' as const },
    customerPhone: { value: '', required: false, type: 'phone' as const },
    specialInstructions: { value: '', required: false, type: 'string' as const, maxLength: 500 }
  },

  updateUserProfile: {
    firstName: { value: '', required: true, type: 'string' as const, minLength: 1, maxLength: 50 },
    lastName: { value: '', required: true, type: 'string' as const, minLength: 1, maxLength: 50 },
    email: { value: '', required: true, type: 'email' as const },
    phone: { value: '', required: false, type: 'phone' as const }
  }
};

// Utility function for API route validation
export function validateApiInput(data: any, schema: Record<string, Omit<FieldValidation, 'value'>>): ValidationResult {
  const validator = new Validator();
  
  const validationFields: Record<string, FieldValidation> = {};
  for (const [fieldName, fieldSchema] of Object.entries(schema)) {
    validationFields[fieldName] = {
      ...fieldSchema,
      value: data[fieldName]
    };
  }

  return validator.validate(validationFields);
}

// Sanitization utilities
export class Sanitizer {
  static sanitizeString(value: any): string {
    if (typeof value !== 'string') return '';
    return value.trim().replace(/\s+/g, ' ');
  }

  static sanitizeEmail(value: any): string {
    if (typeof value !== 'string') return '';
    return value.trim().toLowerCase();
  }

  static sanitizePhone(value: any): string {
    if (typeof value !== 'string') return '';
    return value.replace(/[\s\-\(\)]/g, '');
  }

  static sanitizeNumber(value: any): number | null {
    const num = Number(value);
    return isNaN(num) ? null : num;
  }

  static sanitizeBoolean(value: any): boolean {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') {
      return value.toLowerCase() === 'true' || value === '1';
    }
    return Boolean(value);
  }

  static sanitizeArray(value: any): any[] {
    if (Array.isArray(value)) return value;
    if (typeof value === 'string') {
      try {
        const parsed = JSON.parse(value);
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
    }
    return [];
  }
}

// Security validation helpers
export class SecurityValidator {
  static isSafeHtml(value: string): boolean {
    // Basic HTML safety check - blocks script tags and javascript: URLs
    const dangerousPatterns = [
      /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
      /javascript:/gi,
      /on\w+\s*=/gi,
      /<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi
    ];
    
    return !dangerousPatterns.some(pattern => pattern.test(value));
  }

  static isSafePath(path: string): boolean {
    // Prevent path traversal attacks
    const dangerousPatterns = [
      /\.\./,
      /\/\//,
      /\\\\?/,
      /[<>:"|?*]/
    ];
    
    return !dangerousPatterns.some(pattern => pattern.test(path));
  }

  static isValidFileExtension(filename: string, allowedExtensions: string[]): boolean {
    const extension = filename.split('.').pop()?.toLowerCase();
    return extension ? allowedExtensions.includes(extension) : false;
  }
}