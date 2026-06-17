import { describe, it, expect } from "vitest";
import { buildAuthUrl } from "@/lib/pkce";

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
    // Scope is hardcoded (not env-configurable). offline_access is mandatory —
    // without it no refresh token is issued and the session dies on reload.
    expect(scope).toBe("openid offline_access user collection");
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
