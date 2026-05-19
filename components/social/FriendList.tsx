"use client";

import { useAuthStore } from "@/store/auth";
import { Check, X, UserMinus, Loader2 } from "lucide-react";
import { useState } from "react";

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

  const accepted = friends.filter((f) => f.status === "accepted");
  const pending = friends.filter((f) => f.status === "pending");

  const patch = async (id: number, action: "accept" | "decline") => {
    if (!accessToken) return;
    setBusy(id);
    try {
      await fetch(`/api/social/friends/${id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ action }),
      });
      onUpdate();
    } finally {
      setBusy(null);
    }
  };

  const remove = async (id: number) => {
    if (!accessToken) return;
    setBusy(id);
    try {
      await fetch(`/api/social/friends/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      onUpdate();
    } finally {
      setBusy(null);
    }
  };

  const empty = accepted.length === 0 && pending.length === 0;

  if (empty) {
    return (
      <p className="text-sm py-4" style={{ color: "var(--color-text-muted)" }}>
        No friends yet. Add someone by username above.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {pending.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs font-mono mb-2" style={{ color: "var(--color-text-muted)" }}>
            Pending requests
          </p>
          {pending.map((f) => (
            <div
              key={f.id}
              className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg border"
              style={{ borderColor: "var(--color-border)", background: "var(--color-surface-raised)" }}
            >
              <div className="flex items-center gap-2">
                <span className="text-sm" style={{ color: "var(--color-text-primary)" }}>
                  {f.friend?.username ?? "—"}
                </span>
                <span className="text-xs" style={{ color: "var(--color-text-muted)" }}>
                  {f.direction === "sent" ? "sent" : "received"}
                </span>
              </div>
              {f.direction === "received" && (
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => patch(f.id, "accept")}
                    disabled={busy === f.id}
                    className="w-6 h-6 rounded border flex items-center justify-center transition-colors cursor-pointer hover:border-[var(--color-teal)] hover:text-[var(--color-teal)] disabled:opacity-40"
                    style={{ borderColor: "var(--color-border)", color: "var(--color-text-muted)" }}
                    title="Accept"
                  >
                    {busy === f.id ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <Check className="w-3 h-3" />
                    )}
                  </button>
                  <button
                    onClick={() => patch(f.id, "decline")}
                    disabled={busy === f.id}
                    className="w-6 h-6 rounded border flex items-center justify-center transition-colors cursor-pointer hover:border-red-700 hover:text-red-400 disabled:opacity-40"
                    style={{ borderColor: "var(--color-border)", color: "var(--color-text-muted)" }}
                    title="Decline"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {accepted.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs font-mono mb-2" style={{ color: "var(--color-text-muted)" }}>
            Friends
          </p>
          {accepted.map((f) => (
            <div
              key={f.id}
              className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg border"
              style={{ borderColor: "var(--color-border)", background: "var(--color-surface-raised)" }}
            >
              <div className="flex items-center gap-2">
                <span className="text-sm" style={{ color: "var(--color-text-primary)" }}>
                  {f.friend?.username ?? "—"}
                </span>
                <span className="text-xs font-mono" style={{ color: "var(--color-gold)" }}>
                  🔥 {f.friend?.streak ?? 0}
                </span>
              </div>
              <button
                onClick={() => remove(f.id)}
                disabled={busy === f.id}
                className="w-6 h-6 rounded border flex items-center justify-center transition-colors cursor-pointer hover:border-red-700 hover:text-red-400 disabled:opacity-40"
                style={{ borderColor: "var(--color-border)", color: "var(--color-text-muted)" }}
                title="Remove friend"
              >
                {busy === f.id ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <UserMinus className="w-3 h-3" />
                )}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
