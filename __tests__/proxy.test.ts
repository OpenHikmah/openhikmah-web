import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const { mockGetFlagBoolean } = vi.hoisted(() => ({ mockGetFlagBoolean: vi.fn() }));
vi.mock("@/lib/admin/feature-flags", () => ({ getFlagBoolean: mockGetFlagBoolean }));

import { proxy } from "@/proxy";

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
