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
  // Refs added locally that we don't yet know the server has — a guest add not
  // yet synced, or a signed-in add whose POST hasn't confirmed. Only these
  // survive a server omission on the next loadRemoteBookmarks; a ref that was
  // synced before and is now gone from the server was deleted on another
  // device, so it must not be resurrected (issue #554). Always a subset of
  // `bookmarks`.
  pendingBookmarkAdds: string[];
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
// `onSynced` is called per ref whose POST succeeded so the caller can drop it
// from `pendingBookmarkAdds` (a failed ref stays pending and is retried next load).
async function syncLocalOnlyBookmarks(
  refs: string[],
  accessToken: string,
  onSynced: (ref: string) => void
): Promise<void> {
  let failedCount = 0;
  for (let i = 0; i < refs.length; i += BOOKMARK_SYNC_CONCURRENCY) {
    const chunk = refs.slice(i, i + BOOKMARK_SYNC_CONCURRENCY);
    const results = await Promise.allSettled(
      chunk.map(async (ref) => {
        const r = await fetch("/api/bookmarks", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({ ref }),
        });
        if (!r.ok) throw new Error(`sync POST returned ${r.status}`);
        onSynced(ref);
      })
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
      pendingBookmarkAdds: [],
      bookmarksLoadError: false,
      bookmarkBusy: {},
      bookmarkGeneration: 0,

      setTokens: (accessToken) => set({ accessToken }),
      setSessionLoaded: () => set({ isSessionLoading: false }),

      clearAuth: () => {
        set((s) => ({
          accessToken: null,
          bookmarks: [],
          pendingBookmarkAdds: [],
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

        // Optimistic update. Adding marks the ref pending-sync; removing clears
        // any pending entry (undoing an add that hadn't synced, or a no-op for
        // an already-synced ref).
        set((s) => ({
          bookmarks: wasBookmarked ? bookmarks.filter((r) => r !== ref) : [...bookmarks, ref],
          bookmarkBusy: { ...s.bookmarkBusy, [ref]: true },
          pendingBookmarkAdds: wasBookmarked
            ? s.pendingBookmarkAdds.filter((r) => r !== ref)
            : [...new Set([...s.pendingBookmarkAdds, ref])],
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
            if (wasBookmarked) {
              // Failed DELETE — the ref is still on the server, restore it locally.
              return { bookmarks: [...s.bookmarks, ref] };
            }
            // Failed POST — the add didn't stick anywhere.
            return {
              bookmarks: s.bookmarks.filter((r) => r !== ref),
              pendingBookmarkAdds: s.pendingBookmarkAdds.filter((r) => r !== ref),
            };
          });

        const markSynced = () =>
          set((s) => {
            if (s.bookmarkGeneration !== generation) return s;
            return { pendingBookmarkAdds: s.pendingBookmarkAdds.filter((r) => r !== ref) };
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
              if (r.ok) markSynced();
              else rollback();
            })
            .catch(rollback)
            .finally(clearBusy);
        }
      },

      loadRemoteBookmarks: async () => {
        const { accessToken, bookmarkGeneration: generation } = get();
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
          // The server list is authoritative. A local ref the server doesn't
          // return is kept (and re-uploaded) ONLY if it's still in
          // pendingBookmarkAdds — an add we haven't confirmed. A ref that was
          // synced before and is now missing was deleted on another device, so
          // it's dropped instead of resurrected (issue #554).
          const stillPending = get().pendingBookmarkAdds.filter((r) => !refs.includes(r));
          set({
            bookmarks: [...new Set([...refs, ...stillPending])],
            pendingBookmarkAdds: stillPending,
            bookmarksLoadError: false,
          });
          if (stillPending.length > 0) {
            void syncLocalOnlyBookmarks(stillPending, accessToken, (ref) =>
              set((s) => {
                if (s.bookmarkGeneration !== generation) return s;
                return { pendingBookmarkAdds: s.pendingBookmarkAdds.filter((r) => r !== ref) };
              })
            );
          }
        } catch (err) {
          console.error("loadRemoteBookmarks: failed to load bookmarks", err);
          set({ bookmarksLoadError: true });
        }
      },
    }),
    {
      name: "open-hikmah-auth",
      version: 1,
      // Only persist the bookmark list + the pending-sync set — tokens stay in
      // memory for security.
      partialize: (s) => ({
        bookmarks: s.bookmarks,
        pendingBookmarkAdds: s.pendingBookmarkAdds,
      }),
      migrate: (persisted, version) => {
        const p = (persisted ?? {}) as {
          bookmarks?: string[];
          pendingBookmarkAdds?: string[];
        };
        if (version < 1) {
          // Pre-v1 persisted only `bookmarks`, with no way to tell a synced ref
          // from an unsynced guest add. Seed every persisted ref as pending so
          // the first authoritative loadRemoteBookmarks re-verifies them:
          // server-known refs drop out of pending, unknown ones are re-uploaded
          // (matching the old behaviour for that one load). Correct
          // delete-propagation kicks in from the next load on.
          return { bookmarks: p.bookmarks ?? [], pendingBookmarkAdds: p.bookmarks ?? [] };
        }
        return { bookmarks: p.bookmarks ?? [], pendingBookmarkAdds: p.pendingBookmarkAdds ?? [] };
      },
    }
  )
);
