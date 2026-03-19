const path = require("path");

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  reactStrictMode: true,
  // Monorepo: trace deps from workspace root so Next uses the root lockfile (silences lockfile warning)
  outputFileTracingRoot: path.resolve(__dirname, "../.."),
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
