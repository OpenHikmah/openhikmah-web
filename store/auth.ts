"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

interface AuthStore {
  accessToken: string | null;
  refreshToken: string | null;
  bookmarks: string[];

  setTokens: (accessToken: string, refreshToken: string) => void;
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
        const isAlready = bookmarks.includes(ref);

        // optimistic update
        set({
          bookmarks: isAlready
            ? bookmarks.filter((r) => r !== ref)
            : [...bookmarks, ref],
        });

        // sync to API if authenticated
        if (accessToken) {
          if (isAlready) {
            fetch(`/api/bookmarks/${encodeURIComponent(ref)}`, {
              method: "DELETE",
              headers: { Authorization: `Bearer ${accessToken}` },
            }).catch(() => {});
          } else {
            fetch("/api/bookmarks", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${accessToken}`,
              },
              body: JSON.stringify({ ref }),
            }).catch(() => {});
          }
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
      partialize: (s) => ({
        accessToken: s.accessToken,
        refreshToken: s.refreshToken,
        bookmarks: s.bookmarks,
      }),
    }
  )
);
