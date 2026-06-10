import type { NextConfig } from 'next'

// NEXT_PUBLIC_API_URL is loaded automatically by Next.js from .env files.
// Provide a fallback so the build never fails if the var is absent.
const apiBase =
  (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1').replace('/api/v1', '')

const nextConfig: NextConfig = {
  // Allow importing from workspace packages
  transpilePackages: ['@wms/shared'],

  // Strict mode for catching issues early
  reactStrictMode: true,
  output: 'standalone',

  webpack(config: any) {
    config.resolve.extensionAlias = {
      '.js': ['.ts', '.tsx', '.js', '.jsx'],
    }
    return config
  },
  
  // API rewrite — proxy /api/* to the Fastify server in dev
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${apiBase}/:path*`,
      },
    ]
  },

  // Image domains (for SKU images in future)
  images: {
    remotePatterns: [],
  },
}

export default nextConfig
