import { describe, it, expect } from "vitest";
import nextConfig from "../next.config";

// Issue #625: /admin now runs through proxy.ts and gets its own nonce'd CSP,
// so this static no-nonce fallback only reaches the api/* subpaths and static
// assets the proxy matcher excludes — none of which render inline scripts —
// and is enforced. It must use the same header key as proxy.ts so the proxy's
// nonce'd value replaces it (rather than stacking a second policy) on every
// route the proxy matches.
describe("next.config.ts fallback CSP", () => {
  it("enforces the no-nonce fallback CSP under the same key proxy.ts sets", async () => {
    const headerGroups = await nextConfig.headers?.();
    const baseline = headerGroups?.find((g) => g.source === "/:path*");
    const csp = baseline?.headers.find((h) => h.key === "Content-Security-Policy");
    expect(csp).toBeDefined();
    expect(csp?.value).toContain("script-src 'self'");
    expect(csp?.value).not.toMatch(/nonce-/);
    expect(csp?.value).toContain("object-src 'none'");
    expect(csp?.value).toContain("frame-ancestors 'none'");

    const reportOnly = baseline?.headers.find(
      (h) => h.key === "Content-Security-Policy-Report-Only"
    );
    expect(reportOnly).toBeUndefined();
  });
});
