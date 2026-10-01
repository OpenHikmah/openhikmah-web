import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

const nextConfig: NextConfig = {
  reactCompiler: true,
  output: "standalone",
  // Minor info-disclosure: don't advertise the framework on every response.
  poweredByHeader: false,
  // The self-hosted Coolify build container has less memory than CI's runner,
  // and OOM-kills during `next build`'s own "Running TypeScript" pass (no
  // output, non-zero exit) once the project grows past its ceiling. Type
  // errors are already a hard gate in CI (`bun run typecheck`, required
  // before merge to main), so re-running the same check here is redundant
  // work that just risks crashing the production build.
  typescript: {
    ignoreBuildErrors: true,
  },
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
    // Baseline security headers on every response. proxy.ts sets a nonce'd
    // Content-Security-Policy for every route its matcher covers — the whole
    // app surface including /admin (issues #125, #570, #625) — and replaces
    // the value below on those routes (same header key, proxy runs after
    // `headers()`; see buildCsp's comment in proxy.ts).
    //
    // The static value below therefore only reaches routes the matcher
    // excludes: a handful of api/* subpaths (auth, health, metrics,
    // csp-report, admin) and static assets. None of those render HTML with
    // inline scripts, so it is enforced with no nonce. Any server-rendered
    // page added under an excluded path would break under it — route it
    // through the proxy instead.
    const securityHeaders = [
      { key: "X-Frame-Options", value: "DENY" },
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
      { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
      {
        key: "Content-Security-Policy",
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

export default withNextIntl(nextConfig);
