"use client";

import { useState } from "react";
import { buildAuthUrl } from "@/lib/auth/pkce";

/**
 * Starts the PKCE sign-in redirect: stashes the verifier/state/nonce in
 * sessionStorage, then hard-navigates to Quran Foundation's auth URL. Shared
 * by every "Log in" entry point (header, canvas toolbar, auth-gated pages) so
 * the flow only lives in one place.
 */
export function useSignIn() {
  const [signingIn, setSigningIn] = useState(false);

  const signIn = async () => {
    if (signingIn) return;
    setSigningIn(true);
    try {
      const { url, codeVerifier, state, nonce } = await buildAuthUrl();
      sessionStorage.setItem("pkce_code_verifier", codeVerifier);
      sessionStorage.setItem("pkce_state", state);
      sessionStorage.setItem("pkce_nonce", nonce);
      window.location.href = url;
    } catch (err) {
      // Building the auth URL failed (e.g. crypto unavailable) — re-enable the
      // button instead of leaving it stuck on "signing in".
      console.error("useSignIn: buildAuthUrl failed:", err);
      setSigningIn(false);
    }
  };

  return { signIn, signingIn };
}
