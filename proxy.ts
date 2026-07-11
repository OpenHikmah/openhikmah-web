import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getFlagBoolean } from "@/lib/admin/feature-flags";

/**
 * Maintenance mode, gated by the `maintenance_mode` admin flag. Runs on every
 * matched request (Proxy defaults to the Node.js runtime, so the DB-backed
 * flag read is safe here — see lib/admin/feature-flags.ts for its short-TTL
 * cache). The matcher below already excludes the admin surface, auth, and
 * health/metrics endpoints so an operator can always reach the flag to turn
 * maintenance back off.
 */
export async function proxy(_request: NextRequest): Promise<NextResponse> {
  const maintenance = await getFlagBoolean("maintenance_mode", false);
  if (!maintenance) return NextResponse.next();

  return new NextResponse(MAINTENANCE_HTML, {
    status: 503,
    headers: { "Content-Type": "text/html; charset=utf-8", "Retry-After": "1800" },
  });
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
