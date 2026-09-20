import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Next 16.3 + Vercel adapter does not emit .next/next-server.js.nft.json
  // while standalone finalization still expects it. Vercel does not use
  // Next standalone output, so keep standalone for Cloud Run/Docker only.
  output: process.env.VERCEL ? undefined : 'standalone',
  poweredByHeader: false,
};

export default nextConfig;
