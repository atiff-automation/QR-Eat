/** @type {import('next').NextConfig} */
const nextConfig = {
  // Disable ESLint during builds to prevent blocking on legacy code
  eslint: {
    ignoreDuringBuilds: true,
  },
  // Disable TypeScript checks during build for legacy code compatibility
  typescript: {
    ignoreBuildErrors: true,
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
  // Experimental features
  experimental: {
    middlewareSourceMaps: true,
  },
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

module.exports = nextConfig;
