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
    // Baseline security headers on every response. CSP starts in report-only
    // mode: the app uses inline `style={{...}}` throughout the canvas UI (so
    // style-src needs 'unsafe-inline' regardless), and we want a monitoring
    // window against real traffic — via the /api/csp-report endpoint wired
    // below — before flipping script-src enforcement on and risking the
    // OAuth/canvas flows in prod. Flip to `Content-Security-Policy` once that
    // endpoint has been observed clean for a while.
    const securityHeaders = [
      { key: "X-Frame-Options", value: "DENY" },
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
      { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
      {
        key: "Content-Security-Policy-Report-Only",
        value: [
          "default-src 'self'",
          "script-src 'self'",
          "style-src 'self' 'unsafe-inline'",
          "img-src 'self' data: blob:",
          "font-src 'self' data:",
          "connect-src 'self'",
          "object-src 'none'",
          "frame-ancestors 'none'",
          "base-uri 'self'",
          "form-action 'self' https://*.quran.foundation",
          "report-uri /api/csp-report",
          "report-to csp-endpoint",
        ].join("; "),
      },
      {
        // Pairs with the `report-to` CSP directive above (the modern
        // Reporting API); report-uri is kept alongside it for older browsers.
        key: "Reporting-Endpoints",
        value: 'csp-endpoint="/api/csp-report"',
      },
    ];
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
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
