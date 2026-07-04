"use client";

import { useState } from "react";
import { useAuthStore } from "@/store/auth";
import { Loader2, Swords, X } from "lucide-react";
import { Button, Input } from "@/components/ui";
import { cn } from "@/lib/utils";

interface AcceptedFriend {
  id: number;
  username: string;
}

/** A suggestion the user picked to seed this challenge. */
export interface ChallengePrefill {
  duration?: string | null;
  verseRef?: string | null;
  suggestionId?: number;
  title?: string;
}

interface Props {
  friends: AcceptedFriend[];
  loadingFriends?: boolean;
  onCreated: () => void;
  prefill?: ChallengePrefill | null;
  onClearPrefill?: () => void;
  /** Lay the fields out in a single horizontal row (for the wide grid layout). */
  compact?: boolean;
}

const DURATIONS = ["24h", "48h", "7d"] as const;
type Duration = (typeof DURATIONS)[number];

function isDuration(d: string | null | undefined): d is Duration {
  return d === "24h" || d === "48h" || d === "7d";
}

export function CreateChallengeForm({
  friends,
  loadingFriends,
  onCreated,
  prefill,
  onClearPrefill,
  compact,
}: Props) {
  const accessToken = useAuthStore((s) => s.accessToken);
  // Initial values seed from a picked suggestion (the form is remounted via `key`
  // when a new suggestion is chosen, so these initializers re-run).
  const [selectedFriend, setSelectedFriend] = useState("");
  const [duration, setDuration] = useState<Duration>(
    isDuration(prefill?.duration) ? prefill!.duration : "24h"
  );
  const [verseRef, setVerseRef] = useState(prefill?.verseRef ?? "");
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
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({
          challengedUsername: selectedFriend,
          duration,
          verseRef: verseRef.trim() || undefined,
          suggestionId: prefill?.suggestionId,
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
      onClearPrefill?.();
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
    return (
      <div className="rounded-lg border border-dashed border-border p-5 text-center text-sm text-text-muted">
        Add friends first to challenge them.
      </div>
    );
  }

  const prefillChip = prefill?.title && (
    <div className="flex items-center justify-between gap-2 rounded-md border-l-2 border-teal bg-teal/[0.06] px-3 py-1.5">
      <span className="truncate text-xs text-text-secondary">
        From: <span className="text-teal">{prefill.title}</span>
      </span>
      {onClearPrefill && (
        <button
          type="button"
          onClick={onClearPrefill}
          aria-label="Clear suggestion"
          className="shrink-0 text-text-muted hover:text-text-primary"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );

  const durationButtons = DURATIONS.map((d) => (
    <button
      key={d}
      type="button"
      onClick={() => setDuration(d)}
      className={cn(
        "cursor-pointer rounded-md border px-3 py-1.5 text-xs font-medium transition-colors",
        compact ? "" : "flex-1",
        duration === d
          ? "border-gold-muted bg-gold/10 text-gold"
          : "border-border text-text-muted hover:border-gold-muted"
      )}
    >
      {d}
    </button>
  ));

  if (compact) {
    return (
      <section className="space-y-2">
        <h3 className="px-0.5 text-[11px] font-medium uppercase tracking-wide text-text-muted">
          New challenge
        </h3>
        <div className="space-y-2 rounded-lg border border-border bg-surface p-3">
          {prefillChip}
          <form onSubmit={handleSubmit} className="flex flex-wrap items-center gap-2">
            <select
              value={selectedFriend}
              onChange={(e) => {
                setSelectedFriend(e.target.value);
                setError(null);
                setSuccess(null);
              }}
              className={cn(
                "min-w-[180px] flex-1 cursor-pointer appearance-none rounded-md border border-border bg-surface px-3 py-2 text-sm transition-colors focus:border-gold-muted",
                selectedFriend ? "text-text-primary" : "text-text-muted"
              )}
            >
              <option value="" disabled className="bg-surface">
                Choose a friend…
              </option>
              {friends.map((f) => (
                <option key={f.id} value={f.username} className="bg-surface">
                  @{f.username}
                </option>
              ))}
            </select>
            <div className="flex gap-1.5">{durationButtons}</div>
            <Input
              type="text"
              value={verseRef}
              onChange={(e) => setVerseRef(e.target.value)}
              placeholder="Verse (optional)"
              maxLength={20}
              autoComplete="off"
              spellCheck={false}
              className="w-auto min-w-[150px] flex-1"
            />
            <Button
              type="submit"
              variant="primary"
              size="sm"
              disabled={sending || !selectedFriend}
              className="shrink-0 gap-1.5"
            >
              {sending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Swords className="h-3.5 w-3.5" />
              )}
              Send
            </Button>
          </form>
          {error && <p className="text-xs text-error">{error}</p>}
          {success && <p className="text-xs text-teal">{success}</p>}
        </div>
      </section>
    );
  }

  return (
    <section className="space-y-2">
      <h3 className="px-0.5 text-[11px] font-medium uppercase tracking-wide text-text-muted">
        New challenge
      </h3>
      <form
        onSubmit={handleSubmit}
        className="space-y-3 rounded-lg border border-border bg-surface p-4"
      >
        {prefillChip}

        <select
          value={selectedFriend}
          onChange={(e) => {
            setSelectedFriend(e.target.value);
            setError(null);
            setSuccess(null);
          }}
          className={cn(
            "w-full cursor-pointer appearance-none rounded-md border border-border bg-surface px-3 py-2 text-sm transition-colors focus:border-gold-muted",
            selectedFriend ? "text-text-primary" : "text-text-muted"
          )}
        >
          <option value="" disabled className="bg-surface">
            Choose a friend…
          </option>
          {friends.map((f) => (
            <option key={f.id} value={f.username} className="bg-surface">
              @{f.username}
            </option>
          ))}
        </select>

        <div className="space-y-1.5">
          <span className="block text-[11px] uppercase tracking-wide text-text-muted">
            Duration
          </span>
          <div className="flex gap-2">{durationButtons}</div>
        </div>

        <Input
          type="text"
          value={verseRef}
          onChange={(e) => setVerseRef(e.target.value)}
          placeholder="Verse context (optional, e.g. 2:255)"
          maxLength={20}
          autoComplete="off"
          spellCheck={false}
        />

        <div className="flex items-center justify-between gap-3 pt-0.5">
          <Button
            type="submit"
            variant="primary"
            size="sm"
            disabled={sending || !selectedFriend}
            className="gap-1.5"
          >
            {sending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Swords className="h-3.5 w-3.5" />
            )}
            Send challenge
          </Button>
          {error && <p className="text-xs text-error">{error}</p>}
          {success && <p className="text-xs text-teal">{success}</p>}
        </div>
      </form>
    </section>
  );
}
