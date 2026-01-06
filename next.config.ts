import type { NextConfig } from 'next';
import withSerwistInit from '@serwist/next';

const withSerwist = withSerwistInit({
  swSrc: 'src/sw.ts',
  swDest: 'public/sw.js',
  cacheOnNavigation: true,
  reloadOnOnline: true,
  disable: process.env.NODE_ENV === 'development',
});

const nextConfig: NextConfig = {
  serverExternalPackages: [
    'jsonwebtoken',
    'bcryptjs',
    'pg',
    'pg-connection-string',
  ],
  // Temporarily exclude admin pages to unblock Settings MVP deployment
  // TODO: Fix admin page module resolution issues separately
  experimental: {
    outputFileTracingExcludes: {
      '*': ['src/app/admin/**/*'],
    },
  },
  webpack: (config, { isServer }) => {
    config.resolve.fallback = {
      ...config.resolve.fallback,
      fs: false,
      net: false,
      tls: false,
    };

    // Exclude admin pages from build temporarily
    if (!isServer) {
      config.resolve.alias = {
        ...config.resolve.alias,
        '@/app/admin': false,
      };
    }

    return config;
  },
};

export default withSerwist(nextConfig);
