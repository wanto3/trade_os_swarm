/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    // Required for instrumentation.ts to fire on server boot in Next.js 14.x.
    // Pre-warms the Polymarket Opus 4.7 cache so the first dashboard visit
    // is instant. Becomes default in Next.js 15.
    instrumentationHook: true,
  },
}

module.exports = nextConfig
