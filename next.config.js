/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ['airtable'],
  typescript: {
    // During development, allow builds even with TypeScript errors
    ignoreBuildErrors: false,
  },
  eslint: {
    // During development, allow builds even with ESLint errors
    ignoreDuringBuilds: false,
  },
}

module.exports = nextConfig