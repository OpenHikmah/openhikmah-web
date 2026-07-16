"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

interface SocialProfile {
  userId: number;
  username: string;
}

interface SocialStore {
  userId: number | null;
  username: string | null;
  streak: number;
  longestStreak: number;
  pendingFriendCount: number;
  pendingChallengeCount: number;
  pendingMentionCount: number;

  setProfile: (profile: SocialProfile) => void;
  clearSocial: () => void;
  bumpStreak: (newStreak: number, newLongest?: number) => void;
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
          pendingFriendCount: 0,
          pendingChallengeCount: 0,
          pendingMentionCount: 0,
        }),

      bumpStreak: (newStreak, newLongest) =>
        set((s) => ({
          streak: newStreak,
          longestStreak: newLongest ?? Math.max(s.longestStreak, newStreak),
        })),

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
      }),
    }
  )
);
