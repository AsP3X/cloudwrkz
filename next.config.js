/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Configure for reverse proxy setup
  experimental: {
    serverActions: {
      allowedOrigins: ['cloudwrkz.corespace.de', 'localhost'],
    },
  },
};

module.exports = nextConfig;
