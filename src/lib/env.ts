import { z } from 'zod';

/**
 * Environment variable schema for QR-Eat
 * Ensures all required variables are present and correctly formatted.
 */
const envSchema = z.object({
  // Database
  DATABASE_URL: z.string().url(),

  // Security
  JWT_SECRET: z.string().min(32),
  JWT_EXPIRES_IN: z.string().default('24h'),

  // App Config
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  NEXT_PUBLIC_APP_URL: z.string().url(),
  PORT: z.string().default('3000'),

  // Multi-tenant
  BASE_DOMAIN: z.string().default('localhost'),
  ENABLE_SUBDOMAIN_ROUTING: z
    .string()
    .transform((v) => v === 'true')
    .default('false'),

  // Security Preferences
  SESSION_TIMEOUT_MINUTES: z
    .string()
    .transform((v) => parseInt(v, 10))
    .default('1440'),
});

export type Env = z.infer<typeof envSchema>;

/**
 * Validates environment variables and returns the parsed object.
 * Throws a detailed error if validation fails.
 */
export function validateEnv(): Env {
  try {
    return envSchema.parse(process.env);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const missingVars = error.issues
        .map((issue) => issue.path.join('.'))
        .join(', ');
      console.error('❌ Invalid environment variables:', missingVars);
      throw new Error(`Invalid environment variables: ${missingVars}`);
    }
    throw error;
  }
}

// Export a singleton instance for easy access
export const env = validateEnv();
