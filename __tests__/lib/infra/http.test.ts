import { describe, expect, it } from "vitest";
import { clientKey } from "@/lib/infra/http";

function reqWithHeaders(headers: Record<string, string>): Request {
  return new Request("https://example.com", { headers });
}

describe("clientKey", () => {
  it("trusts x-real-ip over x-forwarded-for, since nginx always overwrites x-real-ip", () => {
    const req = reqWithHeaders({
      "x-real-ip": "203.0.113.9",
      "x-forwarded-for": "1.2.3.4",
    });
    expect(clientKey(req)).toBe("203.0.113.9");
  });

  it("uses the last x-forwarded-for entry, not the client-controlled first one", () => {
    // A spoofing client can prepend arbitrary values; nginx appends the real
    // peer address last via $proxy_add_x_forwarded_for.
    const req = reqWithHeaders({
      "x-forwarded-for": "1.2.3.4, 203.0.113.9",
    });
    expect(clientKey(req)).toBe("203.0.113.9");
  });

  it("falls back to unknown when no valid IP is present", () => {
    const req = reqWithHeaders({});
    expect(clientKey(req)).toBe("unknown");
  });

  it("rejects malformed IP values", () => {
    const req = reqWithHeaders({ "x-real-ip": "'; DROP TABLE users;--" });
    expect(clientKey(req)).toBe("unknown");
  });

  it("does not let a client mint a fresh bucket per request via a spoofed x-forwarded-for prefix", () => {
    const req1 = reqWithHeaders({ "x-forwarded-for": "9.9.9.1, 203.0.113.9" });
    const req2 = reqWithHeaders({ "x-forwarded-for": "9.9.9.2, 203.0.113.9" });
    expect(clientKey(req1)).toBe(clientKey(req2));
  });
});
