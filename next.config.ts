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
    // Baseline security headers on every response. proxy.ts enforces a
    // nonce'd Content-Security-Policy for every route its matcher covers
    // (the whole public app surface — see issue #125, building on the nonce
    // infra from #570). The static value below is only the fallback for
    // routes that matcher excludes: admin, api/*, and static assets.
    //
    // This fallback stays Content-Security-Policy-Report-Only, NOT enforced:
    // unlike the nonce'd path, this script-src has no nonce, and testing
    // against a real production build (`next build` + standalone server)
    // showed /admin — a real server-rendered React page, not just JSON/static
    // assets — breaks hard under enforcement here. Next's own
    // framework-injected inline scripts (hydration/flight-data payloads) and
    // the GTM script tag both get blocked with only `script-src 'self'` and
    // no nonce, which visibly errors the admin panel out. Fixing that
    // properly means giving admin its own nonce (routing it through the
    // proxy, which currently excludes it deliberately for the
    // maintenance-mode DB-flag escape hatch) — out of scope here since
    // AGENTS.md calls out app/api/admin/ as a high-risk surface that
    // shouldn't be broken silently by a security PR. Tracked as a follow-up.
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

export default withNextIntl(nextConfig);
