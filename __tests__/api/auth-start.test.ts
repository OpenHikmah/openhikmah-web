import { describe, it, expect } from "vitest";
import { POST } from "@/app/api/auth/start/route";
import { matchesOAuthState } from "@/lib/auth/oauth-state-cookie";

describe("POST /api/auth/start", () => {
  it("returns a fresh state and nonce and binds both in an HttpOnly cookie", async () => {
    const res = await POST();
    expect(res.status).toBe(200);
    const { state, nonce } = await res.json();
    expect(state).toHaveLength(32);
    expect(nonce).toHaveLength(32);

    const cookie = res.headers.getSetCookie().find((c) => c.startsWith("qf_oauth_state=")) ?? "";
    expect(cookie).toContain(`qf_oauth_state=${encodeURIComponent(`${state}:${nonce}`)}`);
    expect(cookie.toLowerCase()).toContain("httponly");
    expect(cookie.toLowerCase()).toContain("samesite=lax");
    expect(cookie).toContain("Path=/api/auth");
    expect(cookie).toContain("Max-Age=1800");
  });

  it("issues different values on each call", async () => {
    const a = await (await POST()).json();
    const b = await (await POST()).json();
    expect(a.state).not.toBe(b.state);
    expect(a.nonce).not.toBe(b.nonce);
  });
});

describe("matchesOAuthState", () => {
  it("accepts only an exact state + nonce match", () => {
    expect(matchesOAuthState("s:n", "s", "n")).toBe(true);
    expect(matchesOAuthState("s:n", "s", "x")).toBe(false);
    expect(matchesOAuthState("s:n", "x", "n")).toBe(false);
    expect(matchesOAuthState("s:n", "s:n", "")).toBe(false);
    expect(matchesOAuthState(undefined, "s", "n")).toBe(false);
    expect(matchesOAuthState("s:n:extra", "s", "n")).toBe(false);
  });
});
