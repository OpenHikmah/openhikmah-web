import { describe, it, expect, beforeEach } from "vitest";
import { useSocialStore } from "@/store/social";

const INITIAL = {
  userId: null,
  username: null,
  streak: 0,
  longestStreak: 0,
  streakAsOf: null,
  pendingFriendCount: 0,
  pendingChallengeCount: 0,
  pendingMentionCount: 0,
};

describe("social store", () => {
  beforeEach(() => {
    localStorage.clear();
    useSocialStore.setState(INITIAL);
  });

  it("defaults to a logged-out, zeroed-out profile", () => {
    const s = useSocialStore.getState();
    expect(s.userId).toBeNull();
    expect(s.username).toBeNull();
    expect(s.streak).toBe(0);
    expect(s.longestStreak).toBe(0);
    expect(s.pendingFriendCount).toBe(0);
    expect(s.pendingChallengeCount).toBe(0);
    expect(s.pendingMentionCount).toBe(0);
  });

  it("setProfile sets userId and username, leaving other state untouched", () => {
    useSocialStore.setState({ streak: 5, pendingFriendCount: 2 });
    useSocialStore.getState().setProfile({ userId: 42, username: "hikmah_seeker" });
    const s = useSocialStore.getState();
    expect(s.userId).toBe(42);
    expect(s.username).toBe("hikmah_seeker");
    expect(s.streak).toBe(5);
    expect(s.pendingFriendCount).toBe(2);
  });

  it("clearSocial resets every field back to its logged-out default", () => {
    useSocialStore.setState({
      userId: 42,
      username: "hikmah_seeker",
      streak: 10,
      longestStreak: 20,
      pendingFriendCount: 3,
      pendingChallengeCount: 1,
      pendingMentionCount: 4,
    });

    useSocialStore.getState().clearSocial();

    expect(useSocialStore.getState()).toMatchObject(INITIAL);
  });

  it("bumpStreak sets the current streak and raises longestStreak when exceeded", () => {
    useSocialStore.getState().bumpStreak(3);
    expect(useSocialStore.getState()).toMatchObject({ streak: 3, longestStreak: 3 });

    useSocialStore.getState().bumpStreak(7);
    expect(useSocialStore.getState()).toMatchObject({ streak: 7, longestStreak: 7 });
  });

  it("bumpStreak lowering the current streak (e.g. a missed day) does not lower longestStreak", () => {
    useSocialStore.getState().bumpStreak(10);
    useSocialStore.getState().bumpStreak(1);
    expect(useSocialStore.getState()).toMatchObject({ streak: 1, longestStreak: 10 });
  });

  it("bumpStreak honors an explicit newLongest instead of deriving it", () => {
    useSocialStore.getState().bumpStreak(5, 99);
    expect(useSocialStore.getState()).toMatchObject({ streak: 5, longestStreak: 99 });
  });

  it("bumpStreak ignores a hydration read older than the value already applied", () => {
    useSocialStore.getState().applyActivityResult({
      streak: 5,
      longestStreak: 5,
      activityDate: "2026-08-28",
    });
    // A slow GET from an earlier day resolves late.
    useSocialStore.getState().bumpStreak(3, 3, "2026-08-27");
    expect(useSocialStore.getState().streak).toBe(5);
  });

  it("bumpStreak ignores a same-day hydration read that regresses the streak", () => {
    useSocialStore.getState().applyActivityResult({
      streak: 5,
      longestStreak: 5,
      activityDate: "2026-08-28",
    });
    // A stale in-flight GET (pre-increment) lands after the POST result.
    useSocialStore.getState().bumpStreak(4, 5, "2026-08-28");
    expect(useSocialStore.getState().streak).toBe(5);
  });

  it("bumpStreak applies a newer hydration read, including a legitimate decay to 0", () => {
    useSocialStore.getState().applyActivityResult({
      streak: 5,
      longestStreak: 5,
      activityDate: "2026-08-28",
    });
    useSocialStore.getState().bumpStreak(0, 5, "2026-08-30");
    expect(useSocialStore.getState().streak).toBe(0);
    expect(useSocialStore.getState().longestStreak).toBe(5);
  });

  it("applyActivityResult wins over a hydration read and records the day it was computed for", () => {
    useSocialStore.getState().bumpStreak(2, 2, "2026-08-28");
    useSocialStore.getState().applyActivityResult({
      streak: 3,
      longestStreak: 9,
      activityDate: "2026-08-28",
    });
    expect(useSocialStore.getState().streak).toBe(3);
    expect(useSocialStore.getState().streakAsOf).toBe("2026-08-28");
  });

  it("applyActivityResult ignores an out-of-order response that regresses the same day", () => {
    useSocialStore.getState().applyActivityResult({
      streak: 6,
      longestStreak: 6,
      activityDate: "2026-08-28",
    });
    // An earlier POST resolving late with a lower same-day streak.
    useSocialStore.getState().applyActivityResult({
      streak: 5,
      longestStreak: 6,
      activityDate: "2026-08-28",
    });
    expect(useSocialStore.getState().streak).toBe(6);
  });

  it("applyActivityResult ignores a response older than the day already applied", () => {
    useSocialStore.getState().applyActivityResult({
      streak: 4,
      longestStreak: 4,
      activityDate: "2026-08-29",
    });
    useSocialStore.getState().applyActivityResult({
      streak: 3,
      longestStreak: 4,
      activityDate: "2026-08-28",
    });
    expect(useSocialStore.getState().streak).toBe(4);
    expect(useSocialStore.getState().streakAsOf).toBe("2026-08-29");
  });

  it("longestStreak never decreases", () => {
    useSocialStore.getState().applyActivityResult({
      streak: 10,
      longestStreak: 10,
      activityDate: "2026-08-28",
    });
    useSocialStore.getState().bumpStreak(1, 1, "2026-08-29");
    expect(useSocialStore.getState().longestStreak).toBe(10);
  });

  it("clearSocial resets streakAsOf so a stale guard can't block the next user", () => {
    useSocialStore.getState().applyActivityResult({
      streak: 7,
      longestStreak: 7,
      activityDate: "2026-08-28",
    });
    useSocialStore.getState().clearSocial();
    useSocialStore.getState().bumpStreak(2, 2, "2026-01-01");
    expect(useSocialStore.getState().streak).toBe(2);
  });

  it("setPendingFriendCount/setPendingChallengeCount/setPendingMentionCount each set their own field independently", () => {
    useSocialStore.getState().setPendingFriendCount(3);
    useSocialStore.getState().setPendingChallengeCount(2);
    useSocialStore.getState().setPendingMentionCount(1);

    expect(useSocialStore.getState()).toMatchObject({
      pendingFriendCount: 3,
      pendingChallengeCount: 2,
      pendingMentionCount: 1,
    });
  });

  it("persists userId, username, streak, and longestStreak to localStorage, but not the pending-* counts", () => {
    useSocialStore.setState({
      userId: 42,
      username: "hikmah_seeker",
      streak: 5,
      longestStreak: 10,
      pendingFriendCount: 3,
      pendingChallengeCount: 2,
      pendingMentionCount: 1,
    });

    useSocialStore.getState().applyActivityResult({
      streak: 5,
      longestStreak: 10,
      activityDate: "2026-08-28",
    });

    const stored = JSON.parse(localStorage.getItem("open-hikmah-social")!);
    expect(stored.state).toMatchObject({
      userId: 42,
      username: "hikmah_seeker",
      streak: 5,
      longestStreak: 10,
      streakAsOf: "2026-08-28",
    });
    expect(stored.state.pendingFriendCount).toBeUndefined();
    expect(stored.state.pendingChallengeCount).toBeUndefined();
    expect(stored.state.pendingMentionCount).toBeUndefined();
  });
});
