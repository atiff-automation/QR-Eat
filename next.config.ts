import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  serverExternalPackages: [
    'jsonwebtoken',
    'bcryptjs',
    'pg',
    'pg-connection-string',
  ],
};

export default nextConfig;
