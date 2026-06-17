"use client";

import { useAuthStore } from "@/store/auth";
import { Check, X, UserMinus, Loader2 } from "lucide-react";
import { useState } from "react";
import { Card, IconButton, Tooltip } from "@/components/ui";

interface FriendEntry {
  id: number;
  status: "pending" | "accepted" | "declined";
  direction: "sent" | "received";
  friend: { id: number; username: string; streak: number } | null;
  createdAt: string;
}

interface Props {
  friends: FriendEntry[];
  onUpdate: () => void;
}

export function FriendList({ friends, onUpdate }: Props) {
  const accessToken = useAuthStore((s) => s.accessToken);
  const [busy, setBusy] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const accepted = friends.filter((f) => f.status === "accepted");
  const pending = friends.filter((f) => f.status === "pending");

  const patch = async (id: number, action: "accept" | "decline") => {
    if (!accessToken) return;
    setBusy(id);
    setError(null);
    try {
      const res = await fetch(`/api/social/friends/${id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ action }),
      });
      if (!res.ok) {
        setError(`Couldn't ${action} request — try again.`);
        return;
      }
      onUpdate();
    } catch {
      setError("Network error — try again.");
    } finally {
      setBusy(null);
    }
  };

  const remove = async (id: number) => {
    if (!accessToken) return;
    setBusy(id);
    setError(null);
    try {
      const res = await fetch(`/api/social/friends/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) {
        setError("Couldn't remove — try again.");
        return;
      }
      onUpdate();
    } catch {
      setError("Network error — try again.");
    } finally {
      setBusy(null);
    }
  };

  const empty = accepted.length === 0 && pending.length === 0;

  if (empty) {
    return (
      <p className="py-4 text-sm text-text-muted">
        No friends yet. Add someone by username above.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {error && <p className="text-xs text-error">{error}</p>}
      {pending.length > 0 && (
        <div className="space-y-1">
          <p className="mb-2 font-mono text-xs text-text-muted">Pending requests</p>
          {pending.map((f) => (
            <Card
              key={f.id}
              variant="raised"
              className="flex items-center justify-between gap-3 px-3 py-2"
            >
              <div className="flex items-center gap-2">
                <span className="text-sm text-text-primary">{f.friend?.username ?? "—"}</span>
                <span className="text-xs text-text-muted">
                  {f.direction === "sent" ? "sent" : "received"}
                </span>
              </div>
              {f.direction === "received" ? (
                <div className="flex items-center gap-1">
                  <Tooltip label="Accept">
                    <IconButton
                      tone="teal"
                      size="xs"
                      onClick={() => patch(f.id, "accept")}
                      disabled={busy === f.id}
                      aria-label="Accept request"
                    >
                      {busy === f.id ? <Loader2 className="animate-spin" /> : <Check />}
                    </IconButton>
                  </Tooltip>
                  <Tooltip label="Decline">
                    <IconButton
                      tone="danger"
                      size="xs"
                      onClick={() => patch(f.id, "decline")}
                      disabled={busy === f.id}
                      aria-label="Decline request"
                    >
                      <X />
                    </IconButton>
                  </Tooltip>
                </div>
              ) : (
                <Tooltip label="Cancel request">
                  <IconButton
                    tone="danger"
                    size="xs"
                    onClick={() => remove(f.id)}
                    disabled={busy === f.id}
                    aria-label="Cancel request"
                  >
                    {busy === f.id ? <Loader2 className="animate-spin" /> : <X />}
                  </IconButton>
                </Tooltip>
              )}
            </Card>
          ))}
        </div>
      )}

      {accepted.length > 0 && (
        <div className="space-y-1">
          <p className="mb-2 font-mono text-xs text-text-muted">Friends</p>
          {accepted.map((f) => (
            <Card
              key={f.id}
              variant="raised"
              className="flex items-center justify-between gap-3 px-3 py-2"
            >
              <div className="flex items-center gap-2">
                <span className="text-sm text-text-primary">{f.friend?.username ?? "—"}</span>
                <span className="font-mono text-xs text-gold">🔥 {f.friend?.streak ?? 0}</span>
              </div>
              <Tooltip label="Remove friend">
                <IconButton
                  tone="danger"
                  size="xs"
                  onClick={() => remove(f.id)}
                  disabled={busy === f.id}
                  aria-label="Remove friend"
                >
                  {busy === f.id ? <Loader2 className="animate-spin" /> : <UserMinus />}
                </IconButton>
              </Tooltip>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
