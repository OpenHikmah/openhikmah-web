"use client";

import { useEffect, useState, useCallback } from "react";
import { useAuthStore } from "@/store/auth";
import { useSocialStore } from "@/store/social";
import { AddFriendForm } from "@/components/social/AddFriendForm";
import { FriendList } from "@/components/social/FriendList";
import { LeaderboardTable } from "@/components/social/LeaderboardTable";
import { CreateChallengeForm } from "@/components/social/CreateChallengeForm";
import { ChallengeList } from "@/components/social/ChallengeList";
import type { EnrichedChallenge } from "@/components/social/ChallengeList";
import { Loader2, Users, Trophy, Swords } from "lucide-react";
import Link from "next/link";
import { AuthShell } from "@/components/layout/AuthShell";

type Tab = "friends" | "leaderboard" | "challenges";

/** Count of incoming pending requests — drives the header badge. */
function countPendingReceived(friends: unknown[]): number {
  return (friends as { status?: string; direction?: string }[]).filter(
    (f) => f.status === "pending" && f.direction === "received"
  ).length;
}

export default function SocialPage() {
  const accessToken = useAuthStore((s) => s.accessToken);
  const userId = useSocialStore((s) => s.userId);
  const username = useSocialStore((s) => s.username);
  const setPendingFriendCount = useSocialStore((s) => s.setPendingFriendCount);

  const [tab, setTab] = useState<Tab>("leaderboard");
  const [friends, setFriends] = useState<unknown[]>([]);
  const [leaderboard, setLeaderboard] = useState<unknown[]>([]);
  const [challengesList, setChallengesList] = useState<EnrichedChallenge[]>([]);
  const [loadingFriends, setLoadingFriends] = useState(false);
  const [loadingLeaderboard, setLoadingLeaderboard] = useState(false);
  const [loadingChallenges, setLoadingChallenges] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [profileTimedOut, setProfileTimedOut] = useState(false);

  const fetchFriends = useCallback(async () => {
    if (!accessToken) return;
    setLoadingFriends(true);
    try {
      const res = await fetch("/api/social/friends", {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (res.ok) {
        const data = await res.json();
        setFriends(data);
        // Keep the header badge in sync immediately after any friend action.
        setPendingFriendCount(countPendingReceived(data));
        setLoadError(false);
      } else {
        setLoadError(true);
      }
    } catch {
      setLoadError(true);
    } finally {
      setLoadingFriends(false);
    }
  }, [accessToken, setPendingFriendCount]);

  const fetchLeaderboard = useCallback(async () => {
    if (!accessToken) return;
    setLoadingLeaderboard(true);
    try {
      const res = await fetch("/api/social/leaderboard", {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (res.ok) {
        setLeaderboard(await res.json());
        setLoadError(false);
      } else {
        setLoadError(true);
      }
    } catch {
      setLoadError(true);
    } finally {
      setLoadingLeaderboard(false);
    }
  }, [accessToken]);

  const fetchChallenges = useCallback(async () => {
    if (!accessToken) return;
    setLoadingChallenges(true);
    try {
      const res = await fetch("/api/social/challenges", {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (res.ok) setChallengesList(await res.json());
    } finally {
      setLoadingChallenges(false);
    }
  }, [accessToken]);

  // 4s timeout in case userId never resolves
  useEffect(() => {
    if (userId) return;
    if (!accessToken) return;
    const timer = setTimeout(() => setProfileTimedOut(true), 4000);
    return () => clearTimeout(timer);
  }, [userId, accessToken]);

  useEffect(() => {
    if (!accessToken || !userId) return;
    const ctrl = new AbortController();
    const { signal } = ctrl;

    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoadingFriends(true);
    fetch("/api/social/friends", { headers: { Authorization: `Bearer ${accessToken}` }, signal })
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => {
        setFriends(data);
        setPendingFriendCount(countPendingReceived(data));
      })
      .catch(() => {})
      .finally(() => setLoadingFriends(false));

    setLoadingLeaderboard(true);
    fetch("/api/social/leaderboard", { headers: { Authorization: `Bearer ${accessToken}` }, signal })
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => setLeaderboard(data))
      .catch(() => {})
      .finally(() => setLoadingLeaderboard(false));

    setLoadingChallenges(true);
    fetch("/api/social/challenges", { headers: { Authorization: `Bearer ${accessToken}` }, signal })
      .then((r) => (r.ok ? r.json() : []))
      .then((data: EnrichedChallenge[]) => setChallengesList(data))
      .catch(() => {})
      .finally(() => setLoadingChallenges(false));

    return () => ctrl.abort();
  }, [accessToken, userId, setPendingFriendCount]);

  return (
    <AuthShell>
      <main className="mx-auto w-full max-w-lg flex-1 px-4 py-8">
        {/* Profile still loading */}
        {!userId && !profileTimedOut ? (
          <div className="flex justify-center py-20">
            <Loader2 className="h-5 w-5 animate-spin text-teal" />
          </div>
        ) : !userId && profileTimedOut ? (
          <div className="space-y-3 py-20 text-center">
            <p className="text-sm text-text-secondary">
              Your profile couldn&apos;t load. Please sign out and try again.
            </p>
            <Link href="/" className="text-xs text-teal underline">
              Back to home
            </Link>
          </div>
        ) : (
          <>
            {/* Page heading */}
            <div className="mb-6 flex items-center justify-between">
              <h1 className="text-lg font-medium text-text-primary">Social</h1>
              {username && (
                <span className="font-mono text-xs text-text-muted">@{username}</span>
              )}
            </div>

            {/* Tab bar */}
            <div className="mb-6 flex divide-x divide-border overflow-hidden rounded-lg border border-border">
              {(["leaderboard", "friends", "challenges"] as Tab[]).map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={`flex min-h-[44px] flex-1 cursor-pointer items-center justify-center gap-1.5 px-1 py-2 text-[13px] font-medium capitalize transition-colors ${
                    tab === t
                      ? "bg-surface-raised text-text-primary"
                      : "text-text-muted hover:text-text-secondary"
                  }`}
                >
                  {t === "leaderboard" ? (
                    <Trophy className="h-4 w-4" />
                  ) : t === "friends" ? (
                    <Users className="h-4 w-4" />
                  ) : (
                    <Swords className="h-4 w-4" />
                  )}
                  {t === "leaderboard" ? "Leaderboard" : t === "friends" ? "Friends" : "Challenges"}
                </button>
              ))}
            </div>

            {loadError && !loadingFriends && !loadingLeaderboard && (
              <p className="mb-3 text-center text-xs text-error">
                Couldn&apos;t load.{" "}
                <button
                  onClick={() => {
                    fetchFriends();
                    fetchLeaderboard();
                    fetchChallenges();
                  }}
                  className="cursor-pointer underline"
                >
                  Retry
                </button>
              </p>
            )}

            {tab === "friends" && (
              <div className="space-y-4">
                <AddFriendForm
                  onAdded={() => {
                    fetchFriends();
                    fetchLeaderboard();
                  }}
                />
                {loadingFriends ? (
                  <div className="flex justify-center py-4">
                    <Loader2 className="h-4 w-4 animate-spin text-teal" />
                  </div>
                ) : (
                  <FriendList
                    friends={friends as Parameters<typeof FriendList>[0]["friends"]}
                    onUpdate={() => {
                      fetchFriends();
                      fetchLeaderboard();
                    }}
                  />
                )}
              </div>
            )}

            {tab === "challenges" && (
              <div className="space-y-4">
                <CreateChallengeForm
                  friends={(friends as { status: string; friend: { id: number; username: string } | null }[])
                    .filter((f) => f.status === "accepted" && f.friend)
                    .map((f) => f.friend!)}
                  loadingFriends={loadingFriends}
                  onCreated={fetchChallenges}
                />
                {loadingChallenges ? (
                  <div className="flex justify-center py-4">
                    <Loader2 className="h-4 w-4 animate-spin text-teal" />
                  </div>
                ) : (
                  <ChallengeList challenges={challengesList} onUpdate={fetchChallenges} />
                )}
              </div>
            )}

            {tab === "leaderboard" && (
              <div className="space-y-2">
                {loadingLeaderboard ? (
                  <div className="flex justify-center py-4">
                    <Loader2 className="h-4 w-4 animate-spin text-teal" />
                  </div>
                ) : (
                  <LeaderboardTable
                    entries={leaderboard as Parameters<typeof LeaderboardTable>[0]["entries"]}
                  />
                )}
                {!loadingLeaderboard && leaderboard.length <= 1 && (
                  <p className="text-center text-xs text-text-muted">
                    Add friends to see them here.{" "}
                    <button
                      onClick={() => setTab("friends")}
                      className="cursor-pointer text-teal underline"
                    >
                      Go to Friends
                    </button>
                  </p>
                )}
              </div>
            )}
          </>
        )}
      </main>
    </AuthShell>
  );
}
