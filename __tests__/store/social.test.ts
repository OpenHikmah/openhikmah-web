import { describe, it, expect, beforeEach } from "vitest";
import { useSocialStore } from "@/store/social";

const INITIAL = {
  userId: null,
  username: null,
  streak: 0,
  longestStreak: 0,
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

    const stored = JSON.parse(localStorage.getItem("open-hikmah-social")!);
    expect(stored.state).toMatchObject({
      userId: 42,
      username: "hikmah_seeker",
      streak: 5,
      longestStreak: 10,
    });
    expect(stored.state.pendingFriendCount).toBeUndefined();
    expect(stored.state.pendingChallengeCount).toBeUndefined();
    expect(stored.state.pendingMentionCount).toBeUndefined();
  });
});
