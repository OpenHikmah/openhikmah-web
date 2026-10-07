"use client";

import { createContext, useCallback, useContext } from "react";
import { authFetch } from "@/lib/auth/auth-fetch";

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
 * Returns an authenticated fetch bound to the current access token. Sends/parses
 * JSON and throws `AdminApiError` on failure. `path` is relative to `/api/admin`.
 *
 * On a 401 (the short-lived access token expired mid-session), `authFetch`
 * refreshes the token once and replays the request — so a soft-nav to another
 * admin page no longer surfaces a spurious "Unauthorized" that a manual reload
 * would fix.
 */
export function useAdminFetch() {
  return useCallback(
    async <T,>(path: string, init?: RequestInit & { json?: unknown }): Promise<T> => {
      let body = init?.body;
      let jsonBody: string | undefined;
      if (init?.json !== undefined) {
        jsonBody = JSON.stringify(init.json);
        body = jsonBody;
      }

      // Use the Headers constructor so any caller-supplied headers (object,
      // array, or Headers instance) are merged correctly rather than lost.
      const headers = new Headers(init?.headers);
      if (jsonBody !== undefined) headers.set("Content-Type", "application/json");
      const res = await authFetch(`/api/admin${path}`, { ...init, headers, body });

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
    []
  );
}
