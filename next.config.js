/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Enable the instrumentation.ts hook (Next 14 needs the experimental flag; in 15+ it's default).
  // We use it to pre-warm the Polymarket pipeline on server boot so the first user request
  // doesn't block on a cold Groq round-trip.
  experimental: {
    instrumentationHook: true,
  },
}

module.exports = nextConfig
