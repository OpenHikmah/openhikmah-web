import { useAuthStore } from "@/store/auth";

type RefreshOutcome =
  | { kind: "ok"; accessToken: string }
  // The server says the session is gone (401) — the user must sign in again.
  | { kind: "invalid" }
  // Network error or 5xx — the session may still be fine, so don't sign out.
  | { kind: "unavailable" };

// One in-flight /api/auth/refresh shared by every caller. The refresh token
// rotates on use, so a burst of parallel 401s must trigger exactly one refresh —
// replaying the old token would make the auth server revoke the whole session.
let refreshInFlight: Promise<RefreshOutcome> | null = null;

function refreshAccessToken(): Promise<RefreshOutcome> {
  if (!refreshInFlight) {
    refreshInFlight = fetch("/api/auth/refresh", { method: "POST" })
      .then(async (res): Promise<RefreshOutcome> => {
        if (res.status === 401) return { kind: "invalid" };
        if (!res.ok) return { kind: "unavailable" };
        const { accessToken } = (await res.json()) as { accessToken?: string };
        return accessToken ? { kind: "ok", accessToken } : { kind: "unavailable" };
      })
      .catch((): RefreshOutcome => ({ kind: "unavailable" }))
      .finally(() => {
        refreshInFlight = null;
      });
  }
  return refreshInFlight;
}

function send(url: string, init: RequestInit | undefined, token: string): Promise<Response> {
  const headers = new Headers(init?.headers);
  headers.set("Authorization", `Bearer ${token}`);
  return fetch(url, { ...init, headers });
}

/**
 * `fetch` for authenticated `/api/*` calls. Sends the in-memory access token; on
 * a 401 (the short-lived token expired while the tab stayed open) it refreshes
 * once and replays the request. If the refresh says the session is gone, the
 * user is signed out (the UI swaps to "Sign in") and the 401 is returned.
 * A transient refresh failure leaves the session alone and returns the 401.
 *
 * `init.body` must be replayable (string/FormData), which every caller's is.
 * With no token it is a plain unauthenticated fetch and never refreshes.
 */
export async function authFetch(url: string, init?: RequestInit): Promise<Response> {
  const token = useAuthStore.getState().accessToken;
  if (!token) return fetch(url, init);

  const res = await send(url, init, token);
  if (res.status !== 401) return res;

  // Another request already rotated the token while this one was in flight —
  // replay with it instead of burning a second refresh on the same cookie.
  const current = useAuthStore.getState().accessToken;
  if (!current) return res;
  if (current !== token) return send(url, init, current);

  const outcome = await refreshAccessToken();
  if (outcome.kind === "invalid") {
    // Only sign out if nobody re-authenticated while the refresh was running.
    if (useAuthStore.getState().accessToken === token) useAuthStore.getState().clearAuth();
    return res;
  }
  if (outcome.kind === "unavailable") return res;

  useAuthStore.getState().setTokens(outcome.accessToken);
  return send(url, init, outcome.accessToken);
}
