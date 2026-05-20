"use client";

import { useState } from "react";
import { useAuthStore } from "@/store/auth";
import { Loader2, Swords } from "lucide-react";

interface AcceptedFriend {
  id: number;
  username: string;
}

interface Props {
  friends: AcceptedFriend[];
  onCreated: () => void;
}

const DURATIONS = ["24h", "48h", "7d"] as const;
type Duration = (typeof DURATIONS)[number];

export function CreateChallengeForm({ friends, onCreated }: Props) {
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

  if (friends.length === 0) {
    return (
      <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>
        Add friends first to challenge them.
      </p>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      {/* Friend selector */}
      <select
        value={selectedFriend}
        onChange={(e) => { setSelectedFriend(e.target.value); setError(null); setSuccess(null); }}
        className="w-full px-3 py-1.5 rounded border text-sm bg-transparent outline-none transition-colors appearance-none cursor-pointer"
        style={{
          borderColor: "var(--color-border)",
          color: selectedFriend ? "var(--color-text-primary)" : "var(--color-text-muted)",
          background: "var(--color-surface)",
        }}
      >
        <option value="" disabled style={{ background: "var(--color-surface)" }}>
          Choose a friend to challenge…
        </option>
        {friends.map((f) => (
          <option key={f.id} value={f.username} style={{ background: "var(--color-surface)" }}>
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
            className="flex-1 py-1.5 rounded border text-xs font-medium transition-colors cursor-pointer"
            style={{
              borderColor: duration === d ? "var(--color-teal)" : "var(--color-border)",
              color: duration === d ? "var(--color-teal)" : "var(--color-text-muted)",
              background: duration === d ? "var(--color-surface-raised)" : "transparent",
            }}
          >
            {d}
          </button>
        ))}
      </div>

      {/* Optional verse */}
      <input
        type="text"
        value={verseRef}
        onChange={(e) => setVerseRef(e.target.value)}
        placeholder="Verse context (optional, e.g. 2:255)"
        maxLength={20}
        autoComplete="off"
        spellCheck={false}
        className="w-full px-3 py-1.5 rounded border text-sm bg-transparent outline-none transition-colors"
        style={{
          borderColor: "var(--color-border)",
          color: "var(--color-text-primary)",
        }}
        onFocus={(e) => (e.currentTarget.style.borderColor = "var(--color-teal)")}
        onBlur={(e) => (e.currentTarget.style.borderColor = "var(--color-border)")}
      />

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={sending || !selectedFriend}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded border text-xs font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          style={{ borderColor: "var(--color-teal)", color: "var(--color-teal)" }}
        >
          {sending ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Swords className="w-3.5 h-3.5" />
          )}
          Challenge
        </button>

        {error && (
          <p className="text-xs" style={{ color: "var(--color-error, #ef4444)" }}>
            {error}
          </p>
        )}
        {success && (
          <p className="text-xs" style={{ color: "var(--color-teal)" }}>
            {success}
          </p>
        )}
      </div>
    </form>
  );
}
