import { describe, it, expect, vi, afterEach } from "vitest";
import { buildAuthUrl, randomString } from "@/lib/auth/pkce";

const PKCE_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";

describe("randomString", () => {
  afterEach(() => vi.restoreAllMocks());

  it("returns a string of the requested length using only the PKCE alphabet", () => {
    const s = randomString(64);
    expect(s).toHaveLength(64);
    expect([...s].every((c) => PKCE_CHARS.includes(c))).toBe(true);
  });

  it("rejects and redraws out-of-range bytes instead of using them (modulo bias fix)", () => {
    // 198 = MAX_UNBIASED_BYTE (largest multiple of 66 <= 256). Each draw pulls a
    // 2-byte batch (length=2): batch 1 has one out-of-range byte (255) and one
    // in-range byte (0 -> 'A'); batch 2 has one out-of-range byte (200) and one
    // in-range byte (1 -> 'B'). The out-of-range bytes must never appear, and a
    // second draw must happen since the first only yields one accepted char.
    const batches = [
      [255, 0],
      [200, 1],
    ];
    let call = 0;
    vi.spyOn(crypto, "getRandomValues").mockImplementation(((arr: Uint8Array) => {
      arr.set(batches[call]);
      call++;
      return arr;
    }) as typeof crypto.getRandomValues);

    const s = randomString(2);
    expect(s).toBe("AB");
    expect(call).toBe(2); // had to redraw a second batch to get the 2nd character
  });
});

describe("buildAuthUrl", () => {
  it("returns an object with url, codeVerifier, and state", async () => {
    const result = await buildAuthUrl();
    expect(result).toHaveProperty("url");
    expect(result).toHaveProperty("codeVerifier");
    expect(result).toHaveProperty("state");
  });

  it("url contains the auth base and authorize path", async () => {
    const { url } = await buildAuthUrl();
    // Default path is /oauth2/auth (Ory Hydra); overrideable via NEXT_PUBLIC_QF_AUTHORIZE_PATH
    expect(url).toContain("oauth2/auth");
    expect(url).toContain(process.env.NEXT_PUBLIC_QF_AUTH_BASE!);
  });

  it("url contains required OAuth2 params", async () => {
    const { url } = await buildAuthUrl();
    const parsed = new URL(url);
    expect(parsed.searchParams.get("response_type")).toBe("code");
    expect(parsed.searchParams.get("client_id")).toBe(process.env.NEXT_PUBLIC_QF_CLIENT_ID);
    expect(parsed.searchParams.get("code_challenge_method")).toBe("S256");
    expect(parsed.searchParams.get("redirect_uri")).toContain("/callback");
  });

  it("requests the fixed QF scope including offline_access", async () => {
    const { url } = await buildAuthUrl();
    const scope = new URL(url).searchParams.get("scope") ?? "";
    // Scope is hardcoded to what the QF client is approved for. offline_access is
    // mandatory (refresh token); `collection` is omitted — the prod client isn't
    // approved for it, which would make Ory reject the authorize request.
    expect(scope).toBe("openid offline_access user");
  });

  it("codeVerifier is 128 characters long", async () => {
    const { codeVerifier } = await buildAuthUrl();
    expect(codeVerifier).toHaveLength(128);
  });

  it("state is 32 characters long", async () => {
    const { state } = await buildAuthUrl();
    expect(state).toHaveLength(32);
  });

  it("generates unique codeVerifiers on successive calls", async () => {
    const a = await buildAuthUrl();
    const b = await buildAuthUrl();
    expect(a.codeVerifier).not.toBe(b.codeVerifier);
  });

  it("generates unique states on successive calls", async () => {
    const a = await buildAuthUrl();
    const b = await buildAuthUrl();
    expect(a.state).not.toBe(b.state);
  });

  it("url state param matches returned state", async () => {
    const { url, state } = await buildAuthUrl();
    expect(new URL(url).searchParams.get("state")).toBe(state);
  });
});
