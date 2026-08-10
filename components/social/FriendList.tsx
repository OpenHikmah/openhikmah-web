"use client";

import { useAuthStore } from "@/store/auth";
import { Check, X, UserMinus, Loader2 } from "lucide-react";
import { useState } from "react";
import { Card, IconButton, Tooltip } from "@/components/ui";
import { useArmedConfirm } from "@/hooks/useArmedConfirm";

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

/** Icon button requiring a second click to confirm, for a destructive action
 *  (removing a friend, cancelling a sent request) — consistent with the
 *  confirm-before-destroy pattern used elsewhere in the app. */
function DestructiveIconButton({
  onConfirm,
  disabled,
  busy,
  idleIcon,
  label,
  confirmLabel,
}: {
  onConfirm: () => void;
  disabled: boolean;
  busy: boolean;
  idleIcon: React.ReactNode;
  label: string;
  confirmLabel: string;
}) {
  const { armed, trigger } = useArmedConfirm(onConfirm);
  return (
    <Tooltip label={armed ? confirmLabel : label}>
      <IconButton
        tone="danger"
        size="xs"
        onClick={trigger}
        disabled={disabled}
        aria-label={armed ? confirmLabel : label}
        className={armed ? "border-error/40 bg-error/10 text-error" : undefined}
      >
        {busy ? <Loader2 className="animate-spin" /> : armed ? <Check /> : idleIcon}
      </IconButton>
    </Tooltip>
  );
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
      <p className="py-4 text-sm text-text-muted">No friends yet. Add someone by username above.</p>
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
                <DestructiveIconButton
                  onConfirm={() => remove(f.id)}
                  disabled={busy === f.id}
                  busy={busy === f.id}
                  idleIcon={<X />}
                  label="Cancel request"
                  confirmLabel="Click again to confirm"
                />
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
              <DestructiveIconButton
                onConfirm={() => remove(f.id)}
                disabled={busy === f.id}
                busy={busy === f.id}
                idleIcon={<UserMinus />}
                label="Remove friend"
                confirmLabel="Click again to confirm"
              />
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
