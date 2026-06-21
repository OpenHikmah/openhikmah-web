"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuthStore } from "@/store/auth";
import { AdminContext } from "./AdminContext";

type GateState =
  | { phase: "checking" }
  | { phase: "denied" }
  | { phase: "ok"; adminQfId: string; username: string };

/**
 * Client-side gate for the admin area. The server can't see the in-memory access
 * token, so the real security boundary is every `/api/admin/*` route. This gate
 * is purely UX: it asks `/api/admin/me` who you are and shows the console only to
 * an admin, a "not found" screen to everyone else. Nothing sensitive renders here
 * before the check resolves — all data is fetched from the guarded API.
 */
export function AdminGate({ children }: { children: React.ReactNode }) {
  const token = useAuthStore((s) => s.accessToken);
  const sessionLoading = useAuthStore((s) => s.isSessionLoading);
  const [state, setState] = useState<GateState>({ phase: "checking" });

  useEffect(() => {
    if (sessionLoading) return; // wait for SessionRestorer to settle the token
    let active = true;

    if (!token) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setState({ phase: "denied" });
      return;
    }

    setState({ phase: "checking" });
    fetch("/api/admin/me", { headers: { Authorization: `Bearer ${token}` } })
      .then(async (res) => {
        if (!active) return;
        if (!res.ok) {
          setState({ phase: "denied" });
          return;
        }
        const data = (await res.json()) as { qfId: string; username: string };
        setState({ phase: "ok", adminQfId: data.qfId, username: data.username });
      })
      .catch(() => active && setState({ phase: "denied" }));

    return () => {
      active = false;
    };
  }, [token, sessionLoading]);

  if (sessionLoading || state.phase === "checking") {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-bg">
        <span className="font-mono text-xs uppercase tracking-[0.16em] text-text-muted">
          Authorising…
        </span>
      </div>
    );
  }

  if (state.phase === "denied") {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-bg px-6 text-center">
        <p className="font-arabic text-2xl text-text-muted">٤٠٤</p>
        <h1 className="text-lg text-text-primary">This page could not be found.</h1>
        <Link href="/" className="text-sm text-gold hover:underline">
          Return home
        </Link>
      </div>
    );
  }

  return (
    <AdminContext.Provider value={{ adminQfId: state.adminQfId, username: state.username }}>
      {children}
    </AdminContext.Provider>
  );
}
