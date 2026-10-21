import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  // Node-native packages must not be bundled by Turbopack for the server.
  serverExternalPackages: [
    "sharp",
    "@imgly/background-removal-node",
    "onnxruntime-node",
    "@electric-sql/pglite",
    "pg",
    "bullmq",
    "ioredis",
    "better-auth",
  ],
  images: {
    // Images are served from our own signed routes or the configured CDN.
    remotePatterns: process.env.S3_PUBLIC_BASE_URL
      ? [{ protocol: "https", hostname: new URL(process.env.S3_PUBLIC_BASE_URL).hostname }]
      : [],
  },
  poweredByHeader: false,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
