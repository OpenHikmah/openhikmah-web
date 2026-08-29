"use client";

import { createContext, useCallback, useContext } from "react";
import { useAuthStore } from "@/store/auth";

/**
 * Client-side admin plumbing. The access token lives in memory in the auth store,
 * so every admin API call must attach it as a Bearer header. `useAdminFetch`
 * returns a thin `fetch` wrapper that does exactly that and throws a typed error
 * on non-2xx so callers can render a message instead of silently failing.
 */

export class AdminApiError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
    this.name = "AdminApiError";
  }
}

interface AdminCtx {
  /** QF id of the signed-in admin (for display). */
  adminQfId: string;
  username: string;
}

export const AdminContext = createContext<AdminCtx | null>(null);

/** The signed-in admin's identity (only valid inside an authorised AdminGate). */
export function useAdmin(): AdminCtx {
  const ctx = useContext(AdminContext);
  if (!ctx) throw new Error("useAdmin must be used within AdminGate");
  return ctx;
}

/**
 * A single in-flight `/api/auth/refresh` shared by every admin call, so a burst
 * of parallel loaders that all 401 on an expired access token triggers exactly
 * one refresh. Resolves to the new access token, or null if refresh failed.
 */
let refreshInFlight: Promise<string | null> | null = null;

function refreshAccessToken(): Promise<string | null> {
  if (!refreshInFlight) {
    refreshInFlight = fetch("/api/auth/refresh", { method: "POST" })
      .then(async (res) => {
        if (!res.ok) return null;
        const { accessToken } = (await res.json()) as { accessToken?: string };
        return accessToken ?? null;
      })
      .catch(() => null)
      .finally(() => {
        refreshInFlight = null;
      });
  }
  return refreshInFlight;
}

/**
 * Returns an authenticated fetch bound to the current access token. Sends/parses
 * JSON and throws `AdminApiError` on failure. `path` is relative to `/api/admin`.
 *
 * On a 401 (the short-lived access token expired mid-session), it refreshes the
 * token once and replays the request — so a soft-nav to another admin page no
 * longer surfaces a spurious "Unauthorized" that a manual reload would fix.
 */
export function useAdminFetch() {
  const token = useAuthStore((s) => s.accessToken);

  return useCallback(
    async <T,>(path: string, init?: RequestInit & { json?: unknown }): Promise<T> => {
      let body = init?.body;
      let jsonBody: string | undefined;
      if (init?.json !== undefined) {
        jsonBody = JSON.stringify(init.json);
        body = jsonBody;
      }

      const send = async (authToken: string | null): Promise<Response> => {
        // Use the Headers constructor so any caller-supplied headers (object,
        // array, or Headers instance) are merged correctly rather than lost.
        const headers = new Headers(init?.headers);
        headers.set("Authorization", `Bearer ${authToken ?? ""}`);
        if (jsonBody !== undefined) headers.set("Content-Type", "application/json");
        return fetch(`/api/admin${path}`, { ...init, headers, body });
      };

      let res = await send(token);
      if (res.status === 401) {
        const fresh = await refreshAccessToken();
        if (fresh) {
          useAuthStore.getState().setTokens(fresh);
          res = await send(fresh);
        }
      }

      if (!res.ok) {
        let message = `Request failed (${res.status})`;
        try {
          const data = (await res.json()) as { error?: string };
          if (data?.error) message = data.error;
        } catch {
          /* non-JSON error body */
        }
        throw new AdminApiError(res.status, message);
      }
      if (res.status === 204) return undefined as T;
      return (await res.json()) as T;
    },
    [token]
  );
}
