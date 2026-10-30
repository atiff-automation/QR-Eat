/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  // Disable ESLint during builds to prevent blocking on legacy code
  eslint: {
    ignoreDuringBuilds: true,
  },
  // Disable TypeScript checks during build for legacy code compatibility
  typescript: {
    ignoreBuildErrors: true,
  },
  // Keep old report bookmarks working after the legacy stack was removed.
  async redirects() {
    return [
      {
        source: '/dashboard/reports/comprehensive',
        destination: '/dashboard/reports',
        permanent: true,
      },
      {
        source: '/dashboard/reports/customer',
        destination: '/dashboard/reports',
        permanent: true,
      },
      {
        source: '/dashboard/reports/financial',
        destination: '/dashboard/reports',
        permanent: true,
      },
      {
        source: '/dashboard/reports/menu',
        destination: '/dashboard/reports',
        permanent: true,
      },
      {
        source: '/dashboard/reports/operational',
        destination: '/dashboard/reports',
        permanent: true,
      },
      {
        source: '/dashboard/reports/sales',
        destination: '/dashboard/reports',
        permanent: true,
      },
      {
        source: '/dashboard/analytics/:path*',
        destination: '/dashboard/reports',
        permanent: true,
      },
    ];
  },
  // Environment variables
  env: {
    ENABLE_SUBDOMAIN_ROUTING: process.env.ENABLE_SUBDOMAIN_ROUTING,
    BASE_DOMAIN: process.env.BASE_DOMAIN,
  },
  // Image optimization
  images: {
    domains: ['localhost'],
    unoptimized: true,
  },
  // Output server components external packages
  serverExternalPackages: ['jsonwebtoken'],
  // Webpack configuration
  webpack: (config, { isServer }) => {
    // Fixes for Node.js modules in browser
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        net: false,
        tls: false,
      };
    }
    return config;
  },
};

/**
 * @serwist/next is ESM-only. next.config.js is CommonJS in the Railway Node 20
 * build, so load it dynamically rather than using require().
 */
module.exports = async () => {
  const { default: withSerwistInit } = await import('@serwist/next');

  const withSerwist = withSerwistInit({
    swSrc: 'src/sw.ts',
    swDest: 'public/sw.js',
    cacheOnNavigation: true,
    reloadOnOnline: true,
    disable: process.env.NODE_ENV === 'development',
  });

  return withSerwist(nextConfig);
};
