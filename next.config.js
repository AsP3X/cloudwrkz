/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    allowedDevOrigins: ['https://cloudwrkz.corespace.de'],
  },
};

module.exports = nextConfig;
