"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

interface AuthStore {
  // Tokens kept in memory only — not persisted (prevents localStorage XSS exposure)
  accessToken: string | null;
  refreshToken: string | null;
  // Bookmarks are non-sensitive and are persisted for offline use
  bookmarks: string[];

  setTokens: (accessToken: string, refreshToken: string | null) => void;
  clearAuth: () => void;
  toggleBookmark: (ref: string) => void;
  isBookmarked: (ref: string) => boolean;
  loadRemoteBookmarks: () => Promise<void>;
}

export const useAuthStore = create<AuthStore>()(
  persist(
    (set, get) => ({
      accessToken: null,
      refreshToken: null,
      bookmarks: [],

      setTokens: (accessToken, refreshToken) =>
        set({ accessToken, refreshToken }),

      clearAuth: () =>
        set({ accessToken: null, refreshToken: null, bookmarks: [] }),

      isBookmarked: (ref) => get().bookmarks.includes(ref),

      toggleBookmark: (ref) => {
        const { bookmarks, accessToken } = get();
        const wasBookmarked = bookmarks.includes(ref);

        // Optimistic update
        set({
          bookmarks: wasBookmarked
            ? bookmarks.filter((r) => r !== ref)
            : [...bookmarks, ref],
        });

        if (!accessToken) return;

        const rollback = () =>
          set((s) => ({
            bookmarks: wasBookmarked
              ? [...s.bookmarks, ref]
              : s.bookmarks.filter((r) => r !== ref),
          }));

        if (wasBookmarked) {
          fetch(`/api/bookmarks/${encodeURIComponent(ref)}`, {
            method: "DELETE",
            headers: { Authorization: `Bearer ${accessToken}` },
          })
            .then((r) => { if (!r.ok) rollback(); })
            .catch(rollback);
        } else {
          fetch("/api/bookmarks", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${accessToken}`,
            },
            body: JSON.stringify({ ref }),
          })
            .then((r) => { if (!r.ok) rollback(); })
            .catch(rollback);
        }
      },

      loadRemoteBookmarks: async () => {
        const { accessToken } = get();
        if (!accessToken) return;
        try {
          const res = await fetch("/api/bookmarks", {
            headers: { Authorization: `Bearer ${accessToken}` },
          });
          if (!res.ok) return;
          const { refs } = await res.json();
          set({ bookmarks: refs });
        } catch {}
      },
    }),
    {
      name: "open-hikmah-auth",
      // Only persist the bookmark list — tokens stay in memory for security
      partialize: (s) => ({ bookmarks: s.bookmarks }),
    }
  )
);
