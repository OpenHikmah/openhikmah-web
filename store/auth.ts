"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { useSocialStore } from "@/store/social";
import { resetActivityQueue } from "@/lib/social/post-activity";

interface AuthStore {
  // Access token kept in memory — restored on page load via /api/auth/refresh (HttpOnly cookie)
  accessToken: string | null;
  // True until SessionRestorer finishes its first attempt (success or failure)
  isSessionLoading: boolean;
  // Bookmarks are non-sensitive and are persisted for offline use
  bookmarks: string[];
  // True when the most recent loadRemoteBookmarks call failed (network error
  // or non-OK response) — lets the bookmarks page distinguish "really empty"
  // from "failed to load" instead of rendering both identically.
  bookmarksLoadError: boolean;
  // Refs with a POST/DELETE currently in flight — guards toggleBookmark
  // against a second click racing the first before it resolves.
  bookmarkBusy: Record<string, boolean>;
  // Bumped by clearAuth — lets a toggleBookmark request started in a prior
  // session detect that it's stale and skip its clearBusy/rollback, so it
  // can't clobber busy/bookmark state that belongs to a later session.
  bookmarkGeneration: number;

  setTokens: (accessToken: string) => void;
  setSessionLoaded: () => void;
  clearAuth: () => void;
  toggleBookmark: (ref: string) => void;
  isBookmarked: (ref: string) => boolean;
  isBookmarkBusy: (ref: string) => boolean;
  loadRemoteBookmarks: () => Promise<void>;
}

// Concurrency limit for syncing local-only bookmarks up to the DB after a
// remote load — bounds how many parallel POSTs a large guest bookmark list
// can burst at the per-user rate limiter (lib/infra/rate-limit.ts).
const BOOKMARK_SYNC_CONCURRENCY = 3;

// Fire-and-forget from loadRemoteBookmarks (not awaited) so a large sync
// doesn't hold up isSessionLoading/AuthShell's spinner — but bounded and with
// failures logged instead of silently dropped, unlike the old unbounded fan-out.
async function syncLocalOnlyBookmarks(refs: string[], accessToken: string): Promise<void> {
  let failedCount = 0;
  for (let i = 0; i < refs.length; i += BOOKMARK_SYNC_CONCURRENCY) {
    const chunk = refs.slice(i, i + BOOKMARK_SYNC_CONCURRENCY);
    const results = await Promise.allSettled(
      chunk.map((ref) =>
        fetch("/api/bookmarks", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({ ref }),
        }).then((r) => {
          if (!r.ok) throw new Error(`sync POST returned ${r.status}`);
        })
      )
    );
    failedCount += results.filter((r) => r.status === "rejected").length;
  }
  if (failedCount > 0) {
    console.error(
      `loadRemoteBookmarks: failed to sync ${failedCount}/${refs.length} local-only bookmark(s) to the server`
    );
  }
}

export const useAuthStore = create<AuthStore>()(
  persist(
    (set, get) => ({
      accessToken: null,
      isSessionLoading: true,
      bookmarks: [],
      bookmarksLoadError: false,
      bookmarkBusy: {},
      bookmarkGeneration: 0,

      setTokens: (accessToken) => set({ accessToken }),
      setSessionLoaded: () => set({ isSessionLoading: false }),

      clearAuth: () => {
        set((s) => ({
          accessToken: null,
          bookmarks: [],
          bookmarksLoadError: false,
          bookmarkBusy: {},
          bookmarkGeneration: s.bookmarkGeneration + 1,
        }));
        useSocialStore.getState().clearSocial();
        resetActivityQueue();
      },

      isBookmarked: (ref) => get().bookmarks.includes(ref),
      isBookmarkBusy: (ref) => Boolean(get().bookmarkBusy[ref]),

      toggleBookmark: (ref) => {
        const { bookmarks, accessToken, bookmarkBusy, bookmarkGeneration: generation } = get();
        if (bookmarkBusy[ref]) return;

        const wasBookmarked = bookmarks.includes(ref);

        // Optimistic update
        set((s) => ({
          bookmarks: wasBookmarked ? bookmarks.filter((r) => r !== ref) : [...bookmarks, ref],
          bookmarkBusy: { ...s.bookmarkBusy, [ref]: true },
        }));

        if (!accessToken) {
          set((s) => {
            if (s.bookmarkGeneration !== generation) return s;
            const nextBusy = { ...s.bookmarkBusy };
            delete nextBusy[ref];
            return { bookmarkBusy: nextBusy };
          });
          return;
        }

        const clearBusy = () =>
          set((s) => {
            if (s.bookmarkGeneration !== generation) return s;
            const nextBusy = { ...s.bookmarkBusy };
            delete nextBusy[ref];
            return { bookmarkBusy: nextBusy };
          });

        const rollback = () =>
          set((s) => {
            if (s.bookmarkGeneration !== generation) return s;
            return {
              bookmarks: wasBookmarked
                ? [...s.bookmarks, ref]
                : s.bookmarks.filter((r) => r !== ref),
            };
          });

        if (wasBookmarked) {
          fetch(`/api/bookmarks/${encodeURIComponent(ref)}`, {
            method: "DELETE",
            headers: { Authorization: `Bearer ${accessToken}` },
          })
            .then((r) => {
              if (!r.ok) rollback();
            })
            .catch(rollback)
            .finally(clearBusy);
        } else {
          fetch("/api/bookmarks", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${accessToken}`,
            },
            body: JSON.stringify({ ref }),
          })
            .then((r) => {
              if (!r.ok) rollback();
            })
            .catch(rollback)
            .finally(clearBusy);
        }
      },

      loadRemoteBookmarks: async () => {
        const { accessToken } = get();
        if (!accessToken) return;
        try {
          const res = await fetch("/api/bookmarks", {
            headers: { Authorization: `Bearer ${accessToken}` },
          });
          if (!res.ok) {
            console.error(`loadRemoteBookmarks: /api/bookmarks returned ${res.status}`);
            set({ bookmarksLoadError: true });
            return;
          }
          const { refs } = (await res.json()) as { refs: string[] };
          // Merge: DB is authoritative, but sync any local-only bookmarks up to DB
          const local = get().bookmarks;
          const localOnly = local.filter((r) => !refs.includes(r));
          set({ bookmarks: [...new Set([...refs, ...localOnly])], bookmarksLoadError: false });
          if (localOnly.length > 0) void syncLocalOnlyBookmarks(localOnly, accessToken);
        } catch (err) {
          console.error("loadRemoteBookmarks: failed to load bookmarks", err);
          set({ bookmarksLoadError: true });
        }
      },
    }),
    {
      name: "open-hikmah-auth",
      // Only persist the bookmark list — tokens stay in memory for security
      partialize: (s) => ({ bookmarks: s.bookmarks }),
    }
  )
);
