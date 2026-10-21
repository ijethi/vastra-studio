import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // A second `next dev` in the same folder (the e2e suite beside a running dev server) needs its own build directory.
  distDir: process.env.NEXT_DIST_DIR || ".next",
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
    // Resolves to a binary path at runtime; bundling would break it.
    "ffmpeg-static",
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
