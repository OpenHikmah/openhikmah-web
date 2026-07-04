"use client";

import { useEffect, useState } from "react";
import { useAuthStore } from "@/store/auth";
import { Loader2, UserPlus, Check, Clock } from "lucide-react";
import { Input, Card } from "@/components/ui";

interface Props {
  onAdded: () => void;
}

type Status = "none" | "accepted" | "pending_sent" | "pending_received";
interface SearchResult {
  id: number;
  username: string;
  displayName: string | null;
  status: Status;
}

export function AddFriendForm({ onAdded }: Props) {
  const accessToken = useAuthStore((s) => s.accessToken);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [sendingId, setSendingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Debounced search whenever the query changes. State is only ever set from the
  // async callbacks below (never synchronously in the effect body), so a stale
  // query never leaves the results out of sync.
  useEffect(() => {
    const q = query.trim();
    // Nothing to do for an empty query — the results dropdown is gated on a
    // non-empty query in render, so there's no stale state to clear here.
    if (!q || !accessToken) return;
    const ctrl = new AbortController();
    const timer = setTimeout(() => {
      setSearching(true);
      setResults([]);
      fetch(`/api/social/users?q=${encodeURIComponent(q)}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
        signal: ctrl.signal,
      })
        .then((r) => (r.ok ? r.json() : []))
        .then((data: SearchResult[]) => setResults(data))
        .catch(() => {})
        .finally(() => setSearching(false));
    }, 300);
    return () => {
      ctrl.abort();
      clearTimeout(timer);
    };
  }, [query, accessToken]);

  const sendRequest = async (user: SearchResult) => {
    if (!accessToken || sendingId !== null) return;
    setSendingId(user.id);
    setError(null);
    try {
      const res = await fetch("/api/social/friends", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ username: user.username }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Could not send request");
        return;
      }
      // Reflect the new state locally; mutual requests come back accepted.
      const newStatus: Status = data.mutual ? "accepted" : "pending_sent";
      setResults((prev) => prev.map((r) => (r.id === user.id ? { ...r, status: newStatus } : r)));
      onAdded();
    } catch {
      setError("Network error. Try again.");
    } finally {
      setSendingId(null);
    }
  };

  return (
    <div className="space-y-2">
      <Input
        type="text"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setError(null);
        }}
        placeholder="Search by username…"
        maxLength={20}
        autoComplete="off"
        spellCheck={false}
        className="h-auto w-full rounded px-3 py-1.5"
      />

      {error && <p className="text-xs text-error">{error}</p>}

      {query.trim() && (
        <div className="space-y-1">
          {searching && results.length === 0 ? (
            <p className="px-1 py-1 text-xs text-text-muted">Searching…</p>
          ) : results.length === 0 ? (
            <p className="px-1 py-1 text-xs text-text-muted">No users found.</p>
          ) : (
            results.map((u) => (
              <Card
                key={u.id}
                variant="raised"
                className="flex items-center justify-between gap-3 px-3 py-2"
              >
                <span className="truncate text-sm text-text-primary">{u.username}</span>
                <FriendAction
                  status={u.status}
                  sending={sendingId === u.id}
                  onClick={() => sendRequest(u)}
                />
              </Card>
            ))
          )}
        </div>
      )}
    </div>
  );
}

function FriendAction({
  status,
  sending,
  onClick,
}: {
  status: Status;
  sending: boolean;
  onClick: () => void;
}) {
  if (status === "accepted") {
    return (
      <span className="flex items-center gap-1 text-xs text-text-muted">
        <Check className="h-3.5 w-3.5" /> Friends
      </span>
    );
  }
  if (status === "pending_sent") {
    return (
      <span className="flex items-center gap-1 text-xs text-text-muted">
        <Clock className="h-3.5 w-3.5" /> Sent
      </span>
    );
  }
  // "none" or "pending_received" — both move the relationship forward (a request
  // back to someone who already invited you is auto-accepted server-side).
  return (
    <button
      onClick={onClick}
      disabled={sending}
      className="flex shrink-0 cursor-pointer items-center gap-1.5 rounded border border-teal px-2.5 py-1 text-xs font-medium text-teal transition-colors hover:bg-teal/10 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {sending ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : (
        <UserPlus className="h-3.5 w-3.5" />
      )}
      {status === "pending_received" ? "Accept" : "Add"}
    </button>
  );
}
