"use client";

import { useSyncExternalStore } from "react";
import { useAuthStore } from "@/store/auth";
import { MarketingHero } from "./MarketingHero";
import { PersonalHome } from "./PersonalHome";
import { AuthLoadingSkeleton } from "./AuthLoadingSkeleton";
import { CANVAS_STORAGE_KEY } from "@/hooks/useCanvasPersistence";
import type { Verse } from "@/types/quran";

function detectLocalCanvas(): boolean {
  try {
    const raw = localStorage.getItem(CANVAS_STORAGE_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw) as { v?: number; nodes?: unknown[] };
    return parsed?.v === 1 && Array.isArray(parsed.nodes) && parsed.nodes.length > 0;
  } catch {
    return false;
  }
}

function subscribeToStorage() {
  return () => {};
}

export function HomeView({ verse }: { verse: Verse | null }) {
  const accessToken = useAuthStore((s) => s.accessToken);
  const isSessionLoading = useAuthStore((s) => s.isSessionLoading);

  // Detect guests who have an in-progress canvas in localStorage — they should
  // see the PersonalHome dashboard (with bookmarks & continue-canvas) rather
  // than the marketing landing. Uses useSyncExternalStore to avoid the
  // react-hooks/set-state-in-effect lint violation.
  const hasLocalCanvas = useSyncExternalStore(subscribeToStorage, detectLocalCanvas, () => false);

  // While the session is restoring, show a skeleton that matches PersonalHome's
  // layout. Without this, signed-in users briefly see the MarketingHero on every
  // reload, which also briefly exposes the "Sign in" button to signed-in users.
  if (isSessionLoading && !accessToken) {
    return <AuthLoadingSkeleton />;
  }

  return accessToken || hasLocalCanvas ? (
    <PersonalHome verse={verse} />
  ) : (
    <MarketingHero verse={verse} />
  );
}
