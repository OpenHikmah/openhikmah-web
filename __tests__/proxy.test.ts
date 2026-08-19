import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server";

const { mockGetFlagBoolean } = vi.hoisted(() => ({ mockGetFlagBoolean: vi.fn() }));
vi.mock("@/lib/admin/feature-flags", () => ({ getFlagBoolean: mockGetFlagBoolean }));

import { proxy, config } from "@/proxy";

function req(path: string) {
  return new NextRequest(`http://localhost${path}`);
}

beforeEach(() => {
  mockGetFlagBoolean.mockReset();
});

describe("proxy (maintenance mode)", () => {
  it("passes requests through when maintenance mode is off", async () => {
    mockGetFlagBoolean.mockResolvedValue(false);
    const res = await proxy(req("/"));
    expect(res.status).toBe(200);
  });

  it("serves a 503 maintenance response when maintenance mode is on", async () => {
    mockGetFlagBoolean.mockResolvedValue(true);
    const res = await proxy(req("/"));
    expect(res.status).toBe(503);
    expect(res.headers.get("Retry-After")).toBe("1800");
    expect(await res.text()).toContain("maintenance");
  });

  it("checks the maintenance_mode flag with a false default", async () => {
    mockGetFlagBoolean.mockResolvedValue(false);
    await proxy(req("/"));
    expect(mockGetFlagBoolean).toHaveBeenCalledWith("maintenance_mode", false);
  });
});

// The admin surface must stay reachable even when maintenance mode is on —
// a matcher regression here would silently reintroduce a DB round-trip (and
// its failure mode) on every /admin request, exactly what the operator's
// escape hatch is meant to avoid. See lib/admin/feature-flags.ts.
describe("proxy config.matcher", () => {
  const excluded = [
    "/admin",
    "/admin/flags",
    "/api/admin",
    "/api/admin/overview",
    "/api/auth",
    "/api/auth/refresh",
    "/api/health",
    "/api/metrics",
    "/api/csp-report",
    "/_next/static/chunk.js",
    "/_next/image",
    "/favicon.ico",
  ];

  const included = ["/", "/search", "/canvas", "/api/bookmarks", "/settings"];

  it.each(excluded)("does not run proxy for %s", (path) => {
    expect(unstable_doesMiddlewareMatch({ config, url: `http://localhost${path}` })).toBe(false);
  });

  it.each(included)("runs proxy for %s", (path) => {
    expect(unstable_doesMiddlewareMatch({ config, url: `http://localhost${path}` })).toBe(true);
  });
});
