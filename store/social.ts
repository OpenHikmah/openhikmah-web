"use client";

import { create } from "zustand";

interface SocialProfile {
  userId: number;
  username: string;
}

interface SocialStore {
  userId: number | null;
  username: string | null;
  streak: number;
  longestStreak: number;

  setProfile: (profile: SocialProfile) => void;
  clearSocial: () => void;
  bumpStreak: (newStreak: number, newLongest?: number) => void;
}

export const useSocialStore = create<SocialStore>()((set) => ({
  userId: null,
  username: null,
  streak: 0,
  longestStreak: 0,

  setProfile: ({ userId, username }) => set({ userId, username }),

  clearSocial: () =>
    set({ userId: null, username: null, streak: 0, longestStreak: 0 }),

  bumpStreak: (newStreak, newLongest) =>
    set((s) => ({
      streak: newStreak,
      longestStreak: newLongest ?? Math.max(s.longestStreak, newStreak),
    })),
}));
