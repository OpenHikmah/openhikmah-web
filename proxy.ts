import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { randomUUID } from "node:crypto";
import { getFlagBoolean } from "@/lib/admin/feature-flags";

const isDev = process.env.NODE_ENV === "development";

/**
 * Builds this request's Content-Security-Policy-Report-Only value with a
 * fresh nonce baked into script-src (see issue #570). Still report-only —
 * enforcing is a separate follow-up once /api/csp-report has been observed
 * clean for a window. 'strict-dynamic' plus the explicit googletagmanager.com
 * host covers both nonce-aware and older browsers; the GA beacon/pixel hosts
 * in connect-src/img-src are the ones actually observed violating in prod
 * console (see issue #570) — img-src's `https://*.google.com` is a best
 * effort for the regional-TLD ad-audience pixel (`google.<tld>/ads/...`),
 * which CSP host-source syntax can't wildcard across TLDs; any remaining
 * regional-TLD reports during the observation window are a known GA gap, not
 * a bug here.
 *
 * next.config.ts keeps the original non-nonce'd CSP-Report-Only as the
 * fallback for routes this proxy's matcher excludes (admin, api/*, static
 * assets) — Proxy runs after next.config.ts's `headers()` (see Next's docs),
 * so `.set()` below cleanly replaces that header rather than duplicating it,
 * for every route this proxy actually matches.
 */
function buildCspReportOnly(nonce: string): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' https://www.googletagmanager.com${isDev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https://*.google.com",
    "font-src 'self' data:",
    "connect-src 'self' https://analytics.google.com https://stats.g.doubleclick.net",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self' https://*.quran.foundation",
    "report-uri /api/csp-report",
    "report-to csp-endpoint",
  ].join("; ");
}

/**
 * Maintenance mode, gated by the `maintenance_mode` admin flag. Runs on every
 * matched request (Proxy defaults to the Node.js runtime, so the DB-backed
 * flag read is safe here — see lib/admin/feature-flags.ts for its short-TTL
 * cache). The matcher below already excludes the admin surface, auth, and
 * health/metrics endpoints so an operator can always reach the flag to turn
 * maintenance back off.
 *
 * Also generates this request's CSP nonce (see buildCspReportOnly above),
 * exposed as an `x-nonce` request header so a Server Component can read it
 * via `(await headers()).get("x-nonce")` — see app/layout.tsx.
 */
export async function proxy(request: NextRequest): Promise<NextResponse> {
  const nonce = Buffer.from(randomUUID()).toString("base64");
  const csp = buildCspReportOnly(nonce);

  const maintenance = await getFlagBoolean("maintenance_mode", false);
  if (maintenance) {
    const res = new NextResponse(MAINTENANCE_HTML, {
      status: 503,
      headers: { "Content-Type": "text/html; charset=utf-8", "Retry-After": "1800" },
    });
    res.headers.set("Content-Security-Policy-Report-Only", csp);
    return res;
  }

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  const res = NextResponse.next({ request: { headers: requestHeaders } });
  res.headers.set("Content-Security-Policy-Report-Only", csp);
  return res;
}

const MAINTENANCE_HTML = `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>Open Hikmah — Maintenance</title>
<meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="font-family: system-ui, sans-serif; display: flex; min-height: 100vh; align-items: center; justify-content: center; margin: 0; background: #0f1115; color: #e8e6df;">
  <div style="text-align: center; padding: 2rem;">
    <h1 style="font-size: 1.25rem; font-weight: 600;">Down for maintenance</h1>
    <p style="color: #9a9890;">We'll be back shortly. Thanks for your patience.</p>
  </div>
</body>
</html>`;

export const config = {
  matcher: [
    "/((?!admin|api/admin|api/auth|api/health|api/metrics|api/csp-report|_next/static|_next/image|favicon.ico).*)",
  ],
};
