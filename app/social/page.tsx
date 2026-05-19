"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/store/auth";
import { useSocialStore } from "@/store/social";
import { AddFriendForm } from "@/components/social/AddFriendForm";
import { FriendList } from "@/components/social/FriendList";
import { LeaderboardTable } from "@/components/social/LeaderboardTable";
import { BookOpen, Loader2, Users, Trophy } from "lucide-react";
import Link from "next/link";

type Tab = "friends" | "leaderboard";

export default function SocialPage() {
  const router = useRouter();
  const accessToken = useAuthStore((s) => s.accessToken);
  const userId = useSocialStore((s) => s.userId);
  const username = useSocialStore((s) => s.username);

  const [tab, setTab] = useState<Tab>("leaderboard");
  const [friends, setFriends] = useState<unknown[]>([]);
  const [leaderboard, setLeaderboard] = useState<unknown[]>([]);
  const [loadingFriends, setLoadingFriends] = useState(false);
  const [loadingLeaderboard, setLoadingLeaderboard] = useState(false);

  const fetchFriends = useCallback(async () => {
    if (!accessToken) return;
    setLoadingFriends(true);
    try {
      const res = await fetch("/api/social/friends", {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (res.ok) setFriends(await res.json());
    } finally {
      setLoadingFriends(false);
    }
  }, [accessToken]);

  const fetchLeaderboard = useCallback(async () => {
    if (!accessToken) return;
    setLoadingLeaderboard(true);
    try {
      const res = await fetch("/api/social/leaderboard", {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (res.ok) setLeaderboard(await res.json());
    } finally {
      setLoadingLeaderboard(false);
    }
  }, [accessToken]);

  useEffect(() => {
    if (!accessToken || !userId) {
      router.replace("/");
      return;
    }
    const ctrl = new AbortController();
    const { signal } = ctrl;

    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoadingFriends(true);
    fetch("/api/social/friends", {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal,
    })
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => setFriends(data))
      .catch(() => {})
      .finally(() => setLoadingFriends(false));

    setLoadingLeaderboard(true);
    fetch("/api/social/leaderboard", {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal,
    })
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => setLeaderboard(data))
      .catch(() => {})
      .finally(() => setLoadingLeaderboard(false));

    return () => ctrl.abort();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken, userId]);

  if (!accessToken || !userId) return null;

  return (
    <div
      className="min-h-screen"
      style={{ background: "var(--color-bg)" }}
    >
      {/* Header */}
      <header
        className="flex items-center justify-between px-4 h-12 shrink-0 sticky top-0 z-10"
        style={{
          background: "var(--color-surface)",
          borderBottom: "1px solid var(--color-border)",
        }}
      >
        <Link
          href="/"
          className="flex items-center gap-2 text-sm"
          style={{ color: "var(--color-text-secondary)" }}
        >
          <BookOpen className="w-4 h-4" style={{ color: "var(--color-gold)" }} />
          <span className="font-medium" style={{ color: "var(--color-text-primary)" }}>
            Open Hikmah
          </span>
        </Link>
        {username && (
          <span className="text-xs font-mono" style={{ color: "var(--color-text-muted)" }}>
            @{username}
          </span>
        )}
      </header>

      <div className="max-w-lg mx-auto px-4 py-6 space-y-6">
        <h1
          className="text-lg font-medium"
          style={{ color: "var(--color-text-primary)" }}
        >
          Social
        </h1>

        {/* Tab switcher */}
        <div
          className="flex rounded-lg border overflow-hidden"
          style={{ borderColor: "var(--color-border)" }}
        >
          {(["leaderboard", "friends"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className="flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium transition-colors cursor-pointer capitalize"
              style={{
                background: tab === t ? "var(--color-surface-raised)" : "transparent",
                color: tab === t ? "var(--color-text-primary)" : "var(--color-text-muted)",
                borderRight: t === "leaderboard" ? "1px solid var(--color-border)" : "none",
              }}
            >
              {t === "leaderboard" ? (
                <Trophy className="w-3.5 h-3.5" />
              ) : (
                <Users className="w-3.5 h-3.5" />
              )}
              {t === "leaderboard" ? "Leaderboard" : "Friends"}
            </button>
          ))}
        </div>

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
                <Loader2 className="w-4 h-4 animate-spin" style={{ color: "var(--color-teal)" }} />
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

        {tab === "leaderboard" && (
          <div className="space-y-2">
            {loadingLeaderboard ? (
              <div className="flex justify-center py-4">
                <Loader2 className="w-4 h-4 animate-spin" style={{ color: "var(--color-teal)" }} />
              </div>
            ) : (
              <LeaderboardTable
                entries={leaderboard as Parameters<typeof LeaderboardTable>[0]["entries"]}
              />
            )}
            {!loadingLeaderboard && leaderboard.length <= 1 && (
              <p className="text-xs text-center" style={{ color: "var(--color-text-muted)" }}>
                Add friends to see them here.{" "}
                <button
                  onClick={() => setTab("friends")}
                  className="underline cursor-pointer"
                  style={{ color: "var(--color-teal)" }}
                >
                  Go to Friends
                </button>
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
