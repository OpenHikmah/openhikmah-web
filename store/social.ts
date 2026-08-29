"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

interface SocialProfile {
  userId: number;
  username: string;
}

interface ActivityResult {
  streak: number;
  longestStreak: number;
  activityDate: string;
}

interface SocialStore {
  userId: number | null;
  username: string | null;
  streak: number;
  longestStreak: number;
  // The client-local "YYYY-MM-DD" the current streak/longestStreak were computed
  // against. Lets a hydration read (GET /me, GET /activity) be ignored when it's
  // older than — or a same-day regression of — a value already applied, so a
  // slow in-flight GET can't clobber a fresh POST result back to a stale number.
  streakAsOf: string | null;
  pendingFriendCount: number;
  pendingChallengeCount: number;
  pendingMentionCount: number;

  setProfile: (profile: SocialProfile) => void;
  clearSocial: () => void;
  bumpStreak: (newStreak: number, newLongest?: number, asOf?: string | null) => void;
  applyActivityResult: (result: ActivityResult) => void;
  setPendingFriendCount: (count: number) => void;
  setPendingChallengeCount: (count: number) => void;
  setPendingMentionCount: (count: number) => void;
}

export const useSocialStore = create<SocialStore>()(
  persist(
    (set) => ({
      userId: null,
      username: null,
      streak: 0,
      longestStreak: 0,
      streakAsOf: null,
      pendingFriendCount: 0,
      pendingChallengeCount: 0,
      pendingMentionCount: 0,

      setProfile: ({ userId, username }) => set({ userId, username }),

      clearSocial: () =>
        set({
          userId: null,
          username: null,
          streak: 0,
          longestStreak: 0,
          streakAsOf: null,
          pendingFriendCount: 0,
          pendingChallengeCount: 0,
          pendingMentionCount: 0,
        }),

      bumpStreak: (newStreak, newLongest, asOf) =>
        set((s) => {
          const longestStreak = Math.max(s.longestStreak, newLongest ?? newStreak);
          // A hydration read only loses to what's already applied when we can
          // date both: an older day, or the same day with a lower streak (a
          // stale pre-increment GET landing after the POST result).
          if (asOf != null && s.streakAsOf != null) {
            if (asOf < s.streakAsOf) return { longestStreak };
            if (asOf === s.streakAsOf && newStreak < s.streak) return { longestStreak };
          }
          return {
            streak: newStreak,
            longestStreak,
            streakAsOf: asOf ?? s.streakAsOf,
          };
        }),

      applyActivityResult: ({ streak, longestStreak, activityDate }) =>
        set((s) => {
          const nextLongest = Math.max(s.longestStreak, longestStreak);
          // Multiple POSTs can be in flight; an earlier local-date response
          // landing after a later one must not roll the streak back. Same
          // date + same-day guard as bumpStreak.
          if (s.streakAsOf != null) {
            if (activityDate < s.streakAsOf) return { longestStreak: nextLongest };
            if (activityDate === s.streakAsOf && streak < s.streak) {
              return { longestStreak: nextLongest };
            }
          }
          return { streak, longestStreak: nextLongest, streakAsOf: activityDate };
        }),

      setPendingFriendCount: (count) => set({ pendingFriendCount: count }),

      setPendingChallengeCount: (count) => set({ pendingChallengeCount: count }),

      setPendingMentionCount: (count) => set({ pendingMentionCount: count }),
    }),
    {
      name: "open-hikmah-social",
      // Persist the streak too so it shows immediately on reload (then refreshes
      // from /api/social/me) instead of flashing to 0.
      partialize: (s) => ({
        userId: s.userId,
        username: s.username,
        streak: s.streak,
        longestStreak: s.longestStreak,
        streakAsOf: s.streakAsOf,
      }),
    }
  )
);
