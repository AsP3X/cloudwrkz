/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Configure for reverse proxy setup
  allowedDevOrigins: ['cloudwrkz.corespace.de', 'localhost'],
  experimental: {
    serverActions: {
      allowedOrigins: ['cloudwrkz.corespace.de', 'localhost'],
    },
  },
  // Configure server external packages for jsdom
  serverExternalPackages: ['jsdom'],
};

module.exports = nextConfig;
