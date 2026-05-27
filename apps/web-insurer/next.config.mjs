/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@autoclaimx/shared-types'],
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '*.amazonaws.com' },
      { protocol: 'https', hostname: '*.cloudfront.net' },
    ],
  },
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000',
    NEXT_PUBLIC_WS_URL: process.env.NEXT_PUBLIC_WS_URL ?? 'ws://localhost:3000',
    NEXT_PUBLIC_CLAIMS_SERVICE_URL: process.env.NEXT_PUBLIC_CLAIMS_SERVICE_URL ?? 'http://localhost:3001',
  },
};

export default nextConfig;
