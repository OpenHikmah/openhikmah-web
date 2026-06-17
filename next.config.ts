import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  output: "standalone",
  // Pin the workspace root to this project. Without it, Turbopack finds a stray
  // lockfile higher up (e.g. C:\Users\User\package-lock.json) and warns that it
  // guessed the wrong root. The dev/build scripts always run from the project dir.
  turbopack: {
    root: process.cwd(),
  },
  // Long-lived caching for static assets served from /public (images, icons,
  // fonts). Next already marks hashed /_next/static assets immutable; this covers
  // the un-hashed public files so Cloudflare (and browsers) can cache them at the
  // edge. The extension-anchored source only matches asset files — never HTML
  // routes (which have no extension) or API routes — so pages are never cached.
  async headers() {
    return [
      {
        source: "/:path*.(ico|png|jpg|jpeg|gif|svg|webp|avif|woff|woff2)",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=86400, stale-while-revalidate=604800",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
