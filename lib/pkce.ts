function randomString(length: number): string {
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => chars[b % chars.length]).join("");
}

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
}> {
  const codeVerifier = randomString(128);
  const codeChallenge = await sha256Base64url(codeVerifier);
  const state = randomString(32);

  const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL}/callback`;

  const params = new URLSearchParams({
    response_type: "code",
    client_id: process.env.NEXT_PUBLIC_QF_CLIENT_ID ?? "",
    redirect_uri: redirectUri,
    scope: "openid offline_access bookmark",
    state,
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
  };
}
