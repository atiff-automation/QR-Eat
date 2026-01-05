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
    .default('false')
    .transform((v) => v === 'true'),

  // Security Preferences
  SESSION_TIMEOUT_MINUTES: z
    .string()
    .default('1440')
    .transform((v) => parseInt(v, 10)),
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

// Lazy singleton pattern - only validates when first accessed
let cachedEnv: Env | null = null;

/**
 * Get validated environment variables (lazy initialization).
 * Validation only occurs on first call, then cached.
 */
export function getEnv(): Env {
  if (!cachedEnv) {
    cachedEnv = validateEnv();
  }
  return cachedEnv;
}

/**
 * Lazy environment validation using Proxy.
 * Validates on first property access, not at module load time.
 * This prevents crashes during Next.js build when env vars may not be available.
 */
export const env = new Proxy({} as Env, {
  get(_target, prop) {
    const validatedEnv = getEnv();
    return validatedEnv[prop as keyof Env];
  },
});
