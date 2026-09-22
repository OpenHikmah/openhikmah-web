import { describe, it, expect } from "vitest";
import nextConfig from "../next.config";

// Regression guard for issue #125: proxy.ts enforces a nonce'd
// Content-Security-Policy on the routes it matches, but this static fallback
// (served to admin/api/*/static assets, which the proxy matcher excludes)
// has no nonce. Testing against a real production build showed enforcing it
// here breaks /admin — Next's own framework-injected inline scripts get
// blocked with no nonce to allow them. This must stay report-only until
// admin gets its own nonce (a separate, deliberately out-of-scope follow-up
// — see the comment in next.config.ts) or a future edit could silently
// reintroduce that breakage.
describe("next.config.ts fallback CSP", () => {
  it("keeps the no-nonce fallback CSP report-only, not enforced", async () => {
    const headerGroups = await nextConfig.headers?.();
    const baseline = headerGroups?.find((g) => g.source === "/:path*");
    const csp = baseline?.headers.find((h) => h.key === "Content-Security-Policy-Report-Only");
    expect(csp).toBeDefined();
    expect(csp?.value).toContain("script-src 'self'");
    expect(csp?.value).not.toMatch(/nonce-/);

    const enforced = baseline?.headers.find((h) => h.key === "Content-Security-Policy");
    expect(enforced).toBeUndefined();
  });
});
