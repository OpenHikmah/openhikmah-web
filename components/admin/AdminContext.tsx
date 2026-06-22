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
 * Returns an authenticated fetch bound to the current access token. Sends/parses
 * JSON and throws `AdminApiError` on failure. `path` is relative to `/api/admin`.
 */
export function useAdminFetch() {
  const token = useAuthStore((s) => s.accessToken);

  return useCallback(
    async <T,>(path: string, init?: RequestInit & { json?: unknown }): Promise<T> => {
      // Use the Headers constructor so any caller-supplied headers (object, array,
      // or Headers instance) are merged correctly rather than lost by a spread.
      const headers = new Headers(init?.headers);
      headers.set("Authorization", `Bearer ${token ?? ""}`);
      let body = init?.body;
      if (init?.json !== undefined) {
        headers.set("Content-Type", "application/json");
        body = JSON.stringify(init.json);
      }
      const res = await fetch(`/api/admin${path}`, { ...init, headers, body });
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
