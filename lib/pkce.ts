function randomString(length: number): string {
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => chars[b % chars.length]).join("");
}

// OAuth scopes the QF client is approved for — hardcoded (the scope is public; it
// appears in the authorize URL). Kept to exactly what BOTH the prod and prelive
// clients allow: the production client is NOT approved for `collection`, and
// requesting it makes Ory reject the whole authorize request (invalid_scope), so
// it's omitted. We don't call QF's collection API anyway (bookmarks live in our
// own DB), so nothing is lost.
//   openid         → OIDC id token
//   offline_access → REQUIRED for a refresh token; without it the session can't
//                    survive a page reload
//   user           → userinfo / profile claims
const SCOPE = "openid offline_access user";

async function sha256Base64url(input: string): Promise<string> {
  const encoded = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", encoded);
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
}

export async function buildAuthUrl(): Promise<{
  url: string;
  codeVerifier: string;
  state: string;
  nonce: string;
}> {
  const codeVerifier = randomString(128);
  const codeChallenge = await sha256Base64url(codeVerifier);
  const state = randomString(32);
  // nonce is required by the QF OIDC server when requesting the openid scope
  const nonce = randomString(32);

  const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL}/callback`;

  const params = new URLSearchParams({
    response_type: "code",
    client_id: process.env.NEXT_PUBLIC_QF_CLIENT_ID ?? "",
    redirect_uri: redirectUri,
    scope: SCOPE,
    state,
    nonce,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
  });

  const authBase = process.env.NEXT_PUBLIC_QF_AUTH_BASE ?? "";
  // Ory Hydra (used by QF) exposes /oauth2/auth — override via NEXT_PUBLIC_QF_AUTHORIZE_PATH if needed
  const authorizePath = process.env.NEXT_PUBLIC_QF_AUTHORIZE_PATH ?? "/oauth2/auth";
  return {
    url: `${authBase}${authorizePath}?${params.toString()}`,
    codeVerifier,
    state,
    nonce,
  };
}
