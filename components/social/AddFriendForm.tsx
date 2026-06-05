"use client";

import { useState } from "react";
import { useAuthStore } from "@/store/auth";
import { Loader2, UserPlus } from "lucide-react";
import { Input } from "@/components/ui";
import { cn } from "@/lib/utils";

interface Props {
  onAdded: () => void;
}

export function AddFriendForm({ onAdded }: Props) {
  const accessToken = useAuthStore((s) => s.accessToken);
  const [username, setUsername] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = username.trim();
    if (!trimmed || !accessToken) return;

    setSending(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch("/api/social/friends", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ username: trimmed }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Could not send request");
        return;
      }

      setSuccess(`Request sent to ${data.friend?.username ?? trimmed}`);
      setUsername("");
      onAdded();
    } catch {
      setError("Network error. Try again.");
    } finally {
      setSending(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex gap-2">
      <Input
        type="text"
        value={username}
        onChange={(e) => {
          setUsername(e.target.value);
          setError(null);
          setSuccess(null);
        }}
        placeholder="Add by username…"
        maxLength={20}
        autoComplete="off"
        spellCheck={false}
        className={cn("h-auto flex-1 rounded px-3 py-1.5", error && "border-error")}
      />
      <button
        type="submit"
        disabled={sending || !username.trim()}
        className="flex cursor-pointer items-center gap-1.5 rounded border border-teal px-3 py-1.5 text-xs font-medium text-teal transition-colors hover:bg-teal/10 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {sending ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <UserPlus className="h-3.5 w-3.5" />
        )}
        Add
      </button>
      {error && <p className="self-center text-xs text-error">{error}</p>}
      {success && <p className="self-center text-xs text-teal">{success}</p>}
    </form>
  );
}
