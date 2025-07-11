// Security utilities and validation
import { NextRequest } from 'next/server';

// Rate limiting store
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();

export class SecurityUtils {
  // Rate limiting
  static isRateLimited(ip: string, maxRequests: number = 100, windowMs: number = 60000): boolean {
    const now = Date.now();
    
    const record = rateLimitMap.get(ip);
    
    if (!record || record.resetTime < now) {
      rateLimitMap.set(ip, { count: 1, resetTime: now + windowMs });
      return false;
    }
    
    if (record.count >= maxRequests) {
      return true;
    }
    
    record.count++;
    return false;
  }

  // Input sanitization
  static sanitizeInput(input: string): string {
    return input
      .replace(/[<>]/g, '') // Remove potential HTML tags
      .replace(/[\x00-\x1F\x7F]/g, '') // Remove control characters
      .trim();
  }

  // SQL injection prevention patterns
  static containsSQLInjection(input: string): boolean {
    const sqlPatterns = [
      /(\bunion\b.*\bselect\b)/i,
      /(\bselect\b.*\bfrom\b)/i,
      /(\binsert\b.*\binto\b)/i,
      /(\bupdate\b.*\bset\b)/i,
      /(\bdelete\b.*\bfrom\b)/i,
      /(\bdrop\b.*\btable\b)/i,
      /(\bexec\b.*\()/i,
      /(\bscript\b.*\>)/i,
      /(\b(or|and)\b.*\b(=|like)\b)/i,
      /(--|\/\*|\*\/)/
    ];
    
    return sqlPatterns.some(pattern => pattern.test(input));
  }

  // XSS prevention
  static containsXSS(input: string): boolean {
    const xssPatterns = [
      /<script[^>]*>.*?<\/script>/gi,
      /<iframe[^>]*>.*?<\/iframe>/gi,
      /<object[^>]*>.*?<\/object>/gi,
      /<embed[^>]*>/gi,
      /<link[^>]*>/gi,
      /javascript:/gi,
      /vbscript:/gi,
      /onload=/gi,
      /onerror=/gi,
      /onclick=/gi,
      /onmouseover=/gi
    ];
    
    return xssPatterns.some(pattern => pattern.test(input));
  }

  // Validate request origin
  static validateOrigin(request: NextRequest, allowedOrigins: string[]): boolean {
    const origin = request.headers.get('origin');
    if (!origin) return false;
    
    return allowedOrigins.includes(origin);
  }

  // CSRF token validation
  static validateCSRFToken(request: NextRequest): boolean {
    const csrfToken = request.headers.get('x-csrf-token');
    const cookieToken = request.cookies.get('csrf-token')?.value;
    
    return csrfToken === cookieToken && csrfToken !== undefined;
  }

  // Password strength validation
  static validatePasswordStrength(password: string): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];
    
    if (password.length < 8) {
      errors.push('Password must be at least 8 characters long');
    }
    
    if (!/[a-z]/.test(password)) {
      errors.push('Password must contain at least one lowercase letter');
    }
    
    if (!/[A-Z]/.test(password)) {
      errors.push('Password must contain at least one uppercase letter');
    }
    
    if (!/[0-9]/.test(password)) {
      errors.push('Password must contain at least one number');
    }
    
    if (!/[^a-zA-Z0-9]/.test(password)) {
      errors.push('Password must contain at least one special character');
    }
    
    return { isValid: errors.length === 0, errors };
  }

  // Email validation
  static validateEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  // Phone number validation
  static validatePhoneNumber(phone: string): boolean {
    const phoneRegex = /^\+?[\d\s\-\(\)]+$/;
    return phoneRegex.test(phone) && phone.replace(/\D/g, '').length >= 10;
  }

  // Get client IP address
  static getClientIP(request: NextRequest): string {
    const forwardedFor = request.headers.get('x-forwarded-for');
    if (forwardedFor) {
      return forwardedFor.split(',')[0].trim();
    }
    
    const realIP = request.headers.get('x-real-ip');
    if (realIP) {
      return realIP;
    }
    
    return request.headers.get('x-forwarded-for') || 'unknown';
  }

  // Log security events
  static logSecurityEvent(event: string, details: Record<string, unknown>): void {
    console.warn(`[SECURITY] ${event}:`, {
      timestamp: new Date().toISOString(),
      ...details
    });
  }
}

// Security middleware wrapper
export function withSecurity(handler: (...args: unknown[]) => Promise<Response>, options?: {
  rateLimit?: { maxRequests: number; windowMs: number };
  validateOrigin?: string[];
  requireCSRF?: boolean;
}) {
  return async (request: NextRequest, ...args: unknown[]) => {
    const ip = SecurityUtils.getClientIP(request);
    
    // Rate limiting
    if (options?.rateLimit) {
      const { maxRequests, windowMs } = options.rateLimit;
      if (SecurityUtils.isRateLimited(ip, maxRequests, windowMs)) {
        SecurityUtils.logSecurityEvent('Rate limit exceeded', { ip });
        return new Response('Too Many Requests', { status: 429 });
      }
    }
    
    // Origin validation
    if (options?.validateOrigin) {
      if (!SecurityUtils.validateOrigin(request, options.validateOrigin)) {
        SecurityUtils.logSecurityEvent('Invalid origin', { ip, origin: request.headers.get('origin') });
        return new Response('Forbidden', { status: 403 });
      }
    }
    
    // CSRF validation
    if (options?.requireCSRF) {
      if (!SecurityUtils.validateCSRFToken(request)) {
        SecurityUtils.logSecurityEvent('CSRF token validation failed', { ip });
        return new Response('CSRF token invalid', { status: 403 });
      }
    }
    
    return handler(request, ...args);
  };
}

// Input validation middleware
export function validateInput(data: Record<string, unknown>): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  for (const [key, value] of Object.entries(data)) {
    if (typeof value === 'string') {
      if (SecurityUtils.containsSQLInjection(value)) {
        errors.push(`${key} contains potential SQL injection`);
      }
      
      if (SecurityUtils.containsXSS(value)) {
        errors.push(`${key} contains potential XSS payload`);
      }
    }
  }
  
  return { isValid: errors.length === 0, errors };
}