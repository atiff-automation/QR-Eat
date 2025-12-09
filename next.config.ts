import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Enable experimental instrumentation for server startup hooks
  experimental: {
    instrumentationHook: true,
  },
  serverExternalPackages: [
    'jsonwebtoken',
    'bcryptjs',
    'pg',
    'pg-connection-string',
  ],
  webpack: (config) => {
    config.resolve.fallback = {
      ...config.resolve.fallback,
      fs: false,
      net: false,
      tls: false,
    };
    return config;
  },
};

export default nextConfig;
