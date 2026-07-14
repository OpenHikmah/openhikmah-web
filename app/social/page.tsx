"use client";

import { useEffect, useState, useCallback } from "react";
import { useAuthStore } from "@/store/auth";
import { useSocialStore } from "@/store/social";
import { AddFriendForm } from "@/components/social/AddFriendForm";
import { FriendList } from "@/components/social/FriendList";
import { LeaderboardTable } from "@/components/social/LeaderboardTable";
import { CreateChallengeForm } from "@/components/social/CreateChallengeForm";
import type { ChallengePrefill } from "@/components/social/CreateChallengeForm";
import { ChallengeList } from "@/components/social/ChallengeList";
import type { EnrichedChallenge } from "@/components/social/ChallengeList";
import { ChallengeSuggestions } from "@/components/social/ChallengeSuggestions";
import type { Suggestion } from "@/components/social/ChallengeSuggestions";
import { Loader2, Users, Trophy, Swords } from "lucide-react";
import Link from "next/link";
import { AuthShell } from "@/components/layout/AuthShell";

type Tab = "friends" | "leaderboard" | "challenges";

/** Count of incoming pending friend requests — drives the friends badge. */
function countPendingReceived(friends: unknown[]): number {
  return (friends as { status?: string; direction?: string }[]).filter(
    (f) => f.status === "pending" && f.direction === "received"
  ).length;
}

/** Count of incoming challenges awaiting my response — drives the challenges badge. */
function countIncomingChallenges(list: EnrichedChallenge[], myId: number | null): number {
  if (!myId) return 0;
  return list.filter((c) => c.status === "pending" && c.challengedId === myId).length;
}

export default function SocialPage() {
  const accessToken = useAuthStore((s) => s.accessToken);
  const userId = useSocialStore((s) => s.userId);
  const username = useSocialStore((s) => s.username);
  const setPendingFriendCount = useSocialStore((s) => s.setPendingFriendCount);
  const setPendingChallengeCount = useSocialStore((s) => s.setPendingChallengeCount);
  const pendingChallengeCount = useSocialStore((s) => s.pendingChallengeCount);

  const [tab, setTab] = useState<Tab>("leaderboard");
  const [friends, setFriends] = useState<unknown[]>([]);
  const [friendsHasMore, setFriendsHasMore] = useState(false);
  const [loadingMoreFriends, setLoadingMoreFriends] = useState(false);
  const [leaderboard, setLeaderboard] = useState<unknown[]>([]);
  const [leaderboardHasMore, setLeaderboardHasMore] = useState(false);
  const [loadingMoreLeaderboard, setLoadingMoreLeaderboard] = useState(false);
  const [challengesList, setChallengesList] = useState<EnrichedChallenge[]>([]);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [prefill, setPrefill] = useState<ChallengePrefill | null>(null);
  const [prefillKey, setPrefillKey] = useState(0);
  // Default true, not false: this section only renders once userId is resolved
  // (see the !userId guard below), at which point the fetch effect is about to
  // run (or has just run) and its `finally` always clears these. Defaulting to
  // false let the empty-state UI (e.g. "Add friends to see them here.") flash
  // for one frame before the real data arrived.
  const [loadingFriends, setLoadingFriends] = useState(true);
  const [loadingLeaderboard, setLoadingLeaderboard] = useState(true);
  const [loadingChallenges, setLoadingChallenges] = useState(true);
  // Tracked per section (not one shared flag) — otherwise a later-resolving
  // fetch that succeeds would clear the banner even though a different
  // section actually failed and is showing stale/missing data.
  const [friendsError, setFriendsError] = useState(false);
  const [leaderboardError, setLeaderboardError] = useState(false);
  const [challengesError, setChallengesError] = useState(false);
  const loadError = friendsError || leaderboardError || challengesError;
  const [profileTimedOut, setProfileTimedOut] = useState(false);

  // Picking a suggestion seeds the create form (remounted via key) and clears on send.
  const pickSuggestion = (s: Suggestion) => {
    setPrefill({
      duration: s.suggestedDuration,
      verseRef: s.verseRef,
      suggestionId: s.id,
      title: s.title,
    });
    setPrefillKey((k) => k + 1);
  };
  const clearPrefill = () => {
    setPrefill(null);
    setPrefillKey((k) => k + 1);
  };

  const fetchFriends = useCallback(async () => {
    if (!accessToken) return;
    setLoadingFriends(true);
    try {
      const res = await fetch("/api/social/friends", {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (res.ok) {
        const data: { items: unknown[]; hasMore: boolean } = await res.json();
        setFriends(data.items);
        setFriendsHasMore(data.hasMore);
        // Keep the header badge in sync immediately after any friend action.
        setPendingFriendCount(countPendingReceived(data.items));
        setFriendsError(false);
      } else {
        setFriendsError(true);
      }
    } catch {
      setFriendsError(true);
    } finally {
      setLoadingFriends(false);
    }
  }, [accessToken, setPendingFriendCount]);

  const loadMoreFriends = useCallback(async () => {
    if (!accessToken || loadingMoreFriends) return;
    setLoadingMoreFriends(true);
    try {
      const res = await fetch(`/api/social/friends?offset=${friends.length}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (res.ok) {
        const data: { items: unknown[]; hasMore: boolean } = await res.json();
        setFriends((prev) => [...prev, ...data.items]);
        setFriendsHasMore(data.hasMore);
      }
    } finally {
      setLoadingMoreFriends(false);
    }
  }, [accessToken, friends.length, loadingMoreFriends]);

  const fetchLeaderboard = useCallback(async () => {
    if (!accessToken) return;
    setLoadingLeaderboard(true);
    try {
      const res = await fetch("/api/social/leaderboard", {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (res.ok) {
        const data: { items: unknown[]; hasMore: boolean } = await res.json();
        setLeaderboard(data.items);
        setLeaderboardHasMore(data.hasMore);
        setLeaderboardError(false);
      } else {
        setLeaderboardError(true);
      }
    } catch {
      setLeaderboardError(true);
    } finally {
      setLoadingLeaderboard(false);
    }
  }, [accessToken]);

  const loadMoreLeaderboard = useCallback(async () => {
    if (!accessToken || loadingMoreLeaderboard) return;
    setLoadingMoreLeaderboard(true);
    try {
      const res = await fetch(`/api/social/leaderboard?offset=${leaderboard.length}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (res.ok) {
        const data: { items: unknown[]; hasMore: boolean } = await res.json();
        setLeaderboard((prev) => [...prev, ...data.items]);
        setLeaderboardHasMore(data.hasMore);
      }
    } finally {
      setLoadingMoreLeaderboard(false);
    }
  }, [accessToken, leaderboard.length, loadingMoreLeaderboard]);

  const fetchChallenges = useCallback(async () => {
    if (!accessToken) return;
    setLoadingChallenges(true);
    try {
      const res = await fetch("/api/social/challenges", {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (res.ok) {
        const data: EnrichedChallenge[] = await res.json();
        setChallengesList(data);
        setPendingChallengeCount(countIncomingChallenges(data, userId));
        setChallengesError(false);
      } else {
        setChallengesError(true);
      }
    } catch {
      setChallengesError(true);
    } finally {
      setLoadingChallenges(false);
    }
  }, [accessToken, userId, setPendingChallengeCount]);

  const fetchSuggestions = useCallback(async () => {
    if (!accessToken) return;
    try {
      const res = await fetch("/api/social/challenge-suggestions", {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (res.ok) {
        const data = (await res.json()) as { suggestions: Suggestion[] };
        setSuggestions(data.suggestions);
      }
    } catch {
      /* non-fatal — suggestions are optional */
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
      .then((r) => (r.ok ? r.json() : { items: [], hasMore: false }))
      .then((data: { items: unknown[]; hasMore: boolean }) => {
        setFriends(data.items);
        setFriendsHasMore(data.hasMore);
        setPendingFriendCount(countPendingReceived(data.items));
      })
      .catch(() => {})
      .finally(() => setLoadingFriends(false));

    setLoadingLeaderboard(true);
    fetch("/api/social/leaderboard", {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal,
    })
      .then((r) => (r.ok ? r.json() : { items: [], hasMore: false }))
      .then((data: { items: unknown[]; hasMore: boolean }) => {
        setLeaderboard(data.items);
        setLeaderboardHasMore(data.hasMore);
      })
      .catch(() => {})
      .finally(() => setLoadingLeaderboard(false));

    setLoadingChallenges(true);
    fetch("/api/social/challenges", { headers: { Authorization: `Bearer ${accessToken}` }, signal })
      .then((r) => (r.ok ? r.json() : []))
      .then((data: EnrichedChallenge[]) => {
        setChallengesList(data);
        setPendingChallengeCount(countIncomingChallenges(data, userId));
      })
      .catch(() => {})
      .finally(() => setLoadingChallenges(false));

    fetch("/api/social/challenge-suggestions", {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal,
    })
      .then((r) => (r.ok ? r.json() : { suggestions: [] }))
      .then((data: { suggestions: Suggestion[] }) => setSuggestions(data.suggestions))
      .catch(() => {});

    return () => ctrl.abort();
  }, [accessToken, userId, setPendingFriendCount, setPendingChallengeCount]);

  return (
    <AuthShell>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 md:px-6">
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
              {username && <span className="font-mono text-xs text-text-muted">@{username}</span>}
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
                  {t === "challenges" && pendingChallengeCount > 0 && (
                    <span className="ml-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-gold px-1 text-[10px] font-semibold text-ink">
                      {pendingChallengeCount}
                    </span>
                  )}
                </button>
              ))}
            </div>

            {loadError && !loadingFriends && !loadingLeaderboard && !loadingChallenges && (
              <p className="mb-3 text-center text-xs text-error">
                Couldn&apos;t load.{" "}
                <button
                  onClick={() => {
                    fetchFriends();
                    fetchLeaderboard();
                    fetchChallenges();
                    fetchSuggestions();
                  }}
                  className="cursor-pointer underline"
                >
                  Retry
                </button>
              </p>
            )}

            {tab === "friends" && (
              <div className="mx-auto max-w-2xl space-y-4">
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
                  <>
                    <FriendList
                      friends={friends as Parameters<typeof FriendList>[0]["friends"]}
                      onUpdate={() => {
                        fetchFriends();
                        fetchLeaderboard();
                      }}
                    />
                    {friendsHasMore && (
                      <div className="flex justify-center pt-2">
                        <button
                          onClick={loadMoreFriends}
                          disabled={loadingMoreFriends}
                          className="cursor-pointer text-xs text-teal underline disabled:cursor-wait disabled:opacity-50"
                        >
                          {loadingMoreFriends ? "Loading…" : "Load more"}
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {tab === "challenges" && (
              <div className="space-y-6">
                <ChallengeSuggestions suggestions={suggestions} onPick={pickSuggestion} />
                <CreateChallengeForm
                  key={prefillKey}
                  friends={(
                    friends as { status: string; friend: { id: number; username: string } | null }[]
                  )
                    .filter((f) => f.status === "accepted" && f.friend)
                    .map((f) => f.friend!)}
                  loadingFriends={loadingFriends}
                  onCreated={fetchChallenges}
                  prefill={prefill}
                  onClearPrefill={clearPrefill}
                  compact
                />
                <section className="space-y-2">
                  <h3 className="px-0.5 text-[11px] font-medium uppercase tracking-wide text-text-muted">
                    Your challenges
                  </h3>
                  {loadingChallenges ? (
                    <div className="flex justify-center py-4">
                      <Loader2 className="h-4 w-4 animate-spin text-teal" />
                    </div>
                  ) : (
                    <ChallengeList
                      challenges={challengesList}
                      onUpdate={fetchChallenges}
                      layout="grid"
                    />
                  )}
                </section>
              </div>
            )}

            {tab === "leaderboard" && (
              <div className="mx-auto max-w-2xl space-y-2">
                {loadingLeaderboard ? (
                  <div className="flex justify-center py-4">
                    <Loader2 className="h-4 w-4 animate-spin text-teal" />
                  </div>
                ) : (
                  <LeaderboardTable
                    entries={leaderboard as Parameters<typeof LeaderboardTable>[0]["entries"]}
                  />
                )}
                {!loadingLeaderboard && leaderboardHasMore && (
                  <div className="flex justify-center pt-2">
                    <button
                      onClick={loadMoreLeaderboard}
                      disabled={loadingMoreLeaderboard}
                      className="cursor-pointer text-xs text-teal underline disabled:cursor-wait disabled:opacity-50"
                    >
                      {loadingMoreLeaderboard ? "Loading…" : "Load more"}
                    </button>
                  </div>
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
