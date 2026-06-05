"use client";

import { useState } from "react";
import { useAuthStore } from "@/store/auth";
import { Loader2, Swords } from "lucide-react";
import { Input } from "@/components/ui";
import { cn } from "@/lib/utils";

interface AcceptedFriend {
  id: number;
  username: string;
}

interface Props {
  friends: AcceptedFriend[];
  loadingFriends?: boolean;
  onCreated: () => void;
}

const DURATIONS = ["24h", "48h", "7d"] as const;
type Duration = (typeof DURATIONS)[number];

export function CreateChallengeForm({ friends, loadingFriends, onCreated }: Props) {
  const accessToken = useAuthStore((s) => s.accessToken);
  const [selectedFriend, setSelectedFriend] = useState("");
  const [duration, setDuration] = useState<Duration>("24h");
  const [verseRef, setVerseRef] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFriend || !accessToken) return;

    setSending(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch("/api/social/challenges", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          challengedUsername: selectedFriend,
          duration,
          verseRef: verseRef.trim() || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Could not send challenge");
        return;
      }

      setSuccess(`Challenge sent to @${selectedFriend}!`);
      setSelectedFriend("");
      setVerseRef("");
      onCreated();
    } catch {
      setError("Network error. Try again.");
    } finally {
      setSending(false);
    }
  };

  if (loadingFriends) {
    return (
      <div className="flex justify-center py-4">
        <Loader2 className="h-4 w-4 animate-spin text-teal" />
      </div>
    );
  }

  if (friends.length === 0) {
    return <p className="text-xs text-text-muted">Add friends first to challenge them.</p>;
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      {/* Friend selector */}
      <select
        value={selectedFriend}
        onChange={(e) => { setSelectedFriend(e.target.value); setError(null); setSuccess(null); }}
        className={cn(
          "w-full cursor-pointer appearance-none rounded border border-border bg-surface px-3 py-1.5 text-sm transition-colors focus:border-gold-muted",
          selectedFriend ? "text-text-primary" : "text-text-muted"
        )}
      >
        <option value="" disabled className="bg-surface">
          Choose a friend to challenge…
        </option>
        {friends.map((f) => (
          <option key={f.id} value={f.username} className="bg-surface">
            @{f.username}
          </option>
        ))}
      </select>

      {/* Duration */}
      <div className="flex gap-2">
        {DURATIONS.map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => setDuration(d)}
            className={cn(
              "flex-1 cursor-pointer rounded border py-1.5 text-xs font-medium transition-colors",
              duration === d
                ? "border-teal bg-surface-raised text-teal"
                : "border-border text-text-muted hover:text-text-secondary"
            )}
          >
            {d}
          </button>
        ))}
      </div>

      {/* Optional verse */}
      <Input
        type="text"
        value={verseRef}
        onChange={(e) => setVerseRef(e.target.value)}
        placeholder="Verse context (optional, e.g. 2:255)"
        maxLength={20}
        autoComplete="off"
        spellCheck={false}
        className="h-auto rounded px-3 py-1.5"
      />

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={sending || !selectedFriend}
          className="flex cursor-pointer items-center gap-1.5 rounded border border-teal px-3 py-1.5 text-xs font-medium text-teal transition-colors hover:bg-teal/10 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {sending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Swords className="h-3.5 w-3.5" />
          )}
          Challenge
        </button>

        {error && <p className="text-xs text-error">{error}</p>}
        {success && <p className="text-xs text-teal">{success}</p>}
      </div>
    </form>
  );
}
