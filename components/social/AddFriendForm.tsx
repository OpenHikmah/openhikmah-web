"use client";

import { useState } from "react";
import { useAuthStore } from "@/store/auth";
import { Loader2, UserPlus } from "lucide-react";

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
      <input
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
        className="flex-1 px-3 py-1.5 rounded border text-sm bg-transparent outline-none transition-colors"
        style={{
          borderColor: error ? "var(--color-error, #ef4444)" : "var(--color-border)",
          color: "var(--color-text-primary)",
        }}
        onFocus={(e) => (e.currentTarget.style.borderColor = "var(--color-teal)")}
        onBlur={(e) =>
          (e.currentTarget.style.borderColor = error
            ? "var(--color-error, #ef4444)"
            : "var(--color-border)")
        }
      />
      <button
        type="submit"
        disabled={sending || !username.trim()}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded border text-xs font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
        style={{ borderColor: "var(--color-teal)", color: "var(--color-teal)" }}
      >
        {sending ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
        ) : (
          <UserPlus className="w-3.5 h-3.5" />
        )}
        Add
      </button>
      {error && (
        <p className="text-xs self-center" style={{ color: "var(--color-error, #ef4444)" }}>
          {error}
        </p>
      )}
      {success && (
        <p className="text-xs self-center" style={{ color: "var(--color-teal)" }}>
          {success}
        </p>
      )}
    </form>
  );
}
