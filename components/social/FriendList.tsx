"use client";

import { useAuthStore } from "@/store/auth";
import { Check, X, UserMinus, Loader2 } from "lucide-react";
import { useState } from "react";
import { useTranslations } from "next-intl";
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
  const t = useTranslations("social.friendList");
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
        setError(action === "accept" ? t("acceptRequestFailed") : t("declineRequestFailed"));
        return;
      }
      onUpdate();
    } catch {
      setError(t("networkErrorTryAgain"));
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
        setError(t("couldntRemoveTryAgain"));
        return;
      }
      onUpdate();
    } catch {
      setError(t("networkErrorTryAgain"));
    } finally {
      setBusy(null);
    }
  };

  const empty = accepted.length === 0 && pending.length === 0;

  if (empty) {
    return <p className="py-4 text-sm text-text-muted">{t("noFriendsYet")}</p>;
  }

  return (
    <div className="space-y-4">
      {error && <p className="text-xs text-error">{error}</p>}
      {pending.length > 0 && (
        <div className="space-y-1">
          <p className="mb-2 font-mono text-xs text-text-muted">{t("pendingRequests")}</p>
          {pending.map((f) => (
            <Card
              key={f.id}
              variant="raised"
              className="flex items-center justify-between gap-3 px-3 py-2"
            >
              <div className="flex items-center gap-2">
                <span className="text-sm text-text-primary">{f.friend?.username ?? "—"}</span>
                <span className="text-xs text-text-muted">
                  {f.direction === "sent" ? t("sentDirection") : t("receivedDirection")}
                </span>
              </div>
              {f.direction === "received" ? (
                <div className="flex items-center gap-1">
                  <Tooltip label={t("acceptRequestAria")}>
                    <IconButton
                      tone="teal"
                      size="xs"
                      onClick={() => patch(f.id, "accept")}
                      disabled={busy === f.id}
                      aria-label={t("acceptRequestAria")}
                    >
                      {busy === f.id ? <Loader2 className="animate-spin" /> : <Check />}
                    </IconButton>
                  </Tooltip>
                  <Tooltip label={t("declineRequestAria")}>
                    <IconButton
                      tone="danger"
                      size="xs"
                      onClick={() => patch(f.id, "decline")}
                      disabled={busy === f.id}
                      aria-label={t("declineRequestAria")}
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
                  label={t("cancelRequestAria")}
                  confirmLabel={t("clickAgainToConfirm")}
                />
              )}
            </Card>
          ))}
        </div>
      )}

      {accepted.length > 0 && (
        <div className="space-y-1">
          <p className="mb-2 font-mono text-xs text-text-muted">{t("friendsHeader")}</p>
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
                label={t("removeFriendAria")}
                confirmLabel={t("clickAgainToConfirm")}
              />
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
