"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { useAuthStore } from "@/store/auth";
import { useSocialStore } from "@/store/social";
import { Loader2, Trophy, Clock, Minus, Swords } from "lucide-react";
import { Card, Button } from "@/components/ui";
import { cn } from "@/lib/utils";

export interface EnrichedChallenge {
  id: number;
  challengerId: number;
  challengedId: number;
  challengerUsername: string | null;
  challengedUsername: string | null;
  verseRef: string | null;
  status: string;
  startsAt: string;
  endsAt: string;
  winnerId: number | null;
  challengerScore: number;
  challengedScore: number;
}

interface Props {
  challenges: EnrichedChallenge[];
  onUpdate: () => void;
  /** "list" = grouped sections (default); "grid" = flat responsive card grid. */
  layout?: "list" | "grid";
}

type CountdownT = (key: string, values?: Record<string, string | number>) => string;

function formatCountdown(endsAt: string, t: CountdownT): string {
  const diff = new Date(endsAt).getTime() - Date.now();
  if (diff <= 0) return t("ended");
  const totalSec = Math.floor(diff / 1000);
  const d = Math.floor(totalSec / 86_400);
  const h = Math.floor((totalSec % 86_400) / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (d > 0) return t("daysHoursLeft", { d, h });
  if (h > 0) return t("hoursMinutesLeft", { h, m });
  return t("minutesSecondsLeft", { m, s });
}

/** Self-adjusting countdown: ticks per-second in the final hour, every 30s before. */
function useCountdown(endsAt: string, t: CountdownT): string {
  const [label, setLabel] = useState(() => formatCountdown(endsAt, t));
  useEffect(() => {
    // Reflect the new endsAt right away, then schedule subsequent ticks.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLabel(formatCountdown(endsAt, t));
    let timer: ReturnType<typeof setTimeout>;
    const schedule = () => {
      const diff = new Date(endsAt).getTime() - Date.now();
      if (diff <= 0) return;
      timer = setTimeout(
        () => {
          setLabel(formatCountdown(endsAt, t));
          schedule();
        },
        diff < 3_600_000 ? 1000 : 30_000
      );
    };
    schedule();
    return () => clearTimeout(timer);
    // `t` is included: next-intl memoizes it on locale, so this only restarts
    // the schedule on an actual locale switch — without it, a countdown
    // already ticking would keep rendering in the pre-switch locale (a stale
    // closure over the old `t`) until endsAt next changed or the component
    // remounted.
  }, [endsAt, t]);
  return label;
}

type Tone = "teal" | "gold" | "muted";

function Avatar({ name, tone }: { name: string; tone: Tone }) {
  return (
    <span
      className={cn(
        "flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold uppercase",
        tone === "teal" && "bg-teal/15 text-teal",
        tone === "gold" && "bg-gold/15 text-gold",
        tone === "muted" && "bg-white/5 text-text-secondary"
      )}
    >
      {name?.[0] ?? "?"}
    </span>
  );
}

function StatusBadge({ label, tone }: { label: string; tone: Tone | "draw" }) {
  return (
    <span
      className={cn(
        "shrink-0 rounded-full border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide",
        tone === "teal" && "border-teal/40 bg-teal/10 text-teal",
        tone === "gold" && "border-gold-muted bg-gold/10 text-gold",
        tone === "draw" && "border-teal/30 bg-teal/5 text-text-secondary",
        tone === "muted" && "border-border bg-white/5 text-text-muted"
      )}
    >
      {label}
    </span>
  );
}

function ChallengeCard({
  c,
  myId,
  onUpdate,
}: {
  c: EnrichedChallenge;
  myId: number;
  onUpdate: () => void;
}) {
  const t = useTranslations("social.challengeList");
  const accessToken = useAuthStore((s) => s.accessToken);
  const [acting, setActing] = useState<"accept" | "decline" | "cancel" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const countdown = useCountdown(c.endsAt, t);

  const isChallenger = c.challengerId === myId;
  const myScore = isChallenger ? c.challengerScore : c.challengedScore;
  const theirScore = isChallenger ? c.challengedScore : c.challengerScore;
  const opponentName = (isChallenger ? c.challengedUsername : c.challengerUsername) ?? "unknown";
  const iWon = c.winnerId === myId;
  const theyWon = c.winnerId !== null && c.winnerId !== myId;
  const isActive = c.status === "active";
  const isCompleted = c.status === "completed";
  const isDraw = isCompleted && c.winnerId === null;
  const incoming = c.status === "pending" && !isChallenger;
  const sent = c.status === "pending" && isChallenger;
  const faded = c.status === "declined" || c.status === "cancelled";

  const tone: Tone = isActive ? "teal" : iWon ? "gold" : "muted";
  const borderClass = iWon ? "border-gold" : isActive ? "border-teal" : "border-border";

  const handleAction = async (action: "accept" | "decline" | "cancel") => {
    if (!accessToken) return;
    setActing(action);
    setError(null);
    try {
      const res = await fetch(`/api/social/challenges/${c.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ action }),
      });
      if (!res.ok) {
        setError(
          action === "accept"
            ? t("acceptFailedRetry")
            : action === "decline"
              ? t("declineFailedRetry")
              : t("cancelFailedRetry")
        );
        return;
      }
      onUpdate();
    } catch {
      setError(t("networkErrorTryAgain"));
    } finally {
      setActing(null);
    }
  };

  const statusBadge = isActive ? (
    <StatusBadge label={t("statusActive")} tone="teal" />
  ) : incoming ? (
    <StatusBadge label={t("statusIncoming")} tone="gold" />
  ) : sent ? (
    <StatusBadge label={t("statusPending")} tone="muted" />
  ) : iWon ? (
    <StatusBadge label={t("statusWon")} tone="gold" />
  ) : isDraw ? (
    <StatusBadge label={t("statusDraw")} tone="draw" />
  ) : theyWon ? (
    <StatusBadge label={t("statusLost")} tone="muted" />
  ) : c.status === "cancelled" ? (
    <StatusBadge label={t("statusCancelled")} tone="muted" />
  ) : (
    <StatusBadge label={t("statusDeclined")} tone="muted" />
  );

  return (
    <Card className={cn("space-y-3 p-4", borderClass, faded && "opacity-60")}>
      {/* Opponent + status */}
      <div className="flex items-center gap-3">
        <Avatar name={opponentName} tone={tone} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium text-text-primary">@{opponentName}</div>
          {c.verseRef && <div className="font-mono text-[11px] text-teal">{c.verseRef}</div>}
        </div>
        {statusBadge}
      </div>

      {/* Scoreboard */}
      {(isActive || isCompleted) && (
        <div className="flex items-stretch rounded-md border border-border-subtle bg-bg/40">
          <ScoreCell label={t("you")} score={myScore} lead={myScore >= theirScore} />
          <div className="flex items-center px-2 font-mono text-[10px] uppercase text-text-muted">
            {t("vs")}
          </div>
          <ScoreCell label={`@${opponentName}`} score={theirScore} lead={theirScore > myScore} />
        </div>
      )}

      {/* Status caption */}
      {isActive && (
        <p className="flex items-center justify-center gap-1.5 text-xs text-text-muted">
          <Clock className="h-3.5 w-3.5" /> {countdown}
        </p>
      )}
      {iWon && (
        <p className="flex items-center justify-center gap-1.5 text-xs font-medium text-gold">
          <Trophy className="h-3.5 w-3.5" /> {t("youWon")}
        </p>
      )}
      {isDraw && (
        <p className="flex items-center justify-center gap-1.5 text-xs text-text-secondary">
          <Minus className="h-3.5 w-3.5" /> {t("statusDraw")}
        </p>
      )}
      {theyWon && (
        <p className="text-center text-xs text-text-muted">
          {t("theyWonCaption", { name: `@${opponentName}` })}
        </p>
      )}
      {error && <p className="text-center text-xs text-error">{error}</p>}

      {/* Actions */}
      {incoming && (
        <div className="flex gap-2">
          <Button
            variant="primary"
            size="sm"
            className="flex-1 gap-1.5"
            onClick={() => handleAction("accept")}
            disabled={acting !== null}
          >
            {acting === "accept" ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Swords className="h-3.5 w-3.5" />
            )}
            {t("accept")}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            className="flex-1"
            onClick={() => handleAction("decline")}
            disabled={acting !== null}
          >
            {acting === "decline" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            {t("decline")}
          </Button>
        </div>
      )}
      {sent && (
        <div className="flex items-center justify-between gap-2 border-t border-border-subtle pt-2.5">
          <span className="text-xs text-text-muted">
            {t("waitingForOpponent", { name: `@${opponentName}` })}
          </span>
          <Button
            variant="ghost"
            size="sm"
            className="gap-1 text-text-muted hover:text-error"
            onClick={() => handleAction("cancel")}
            disabled={acting !== null}
          >
            {acting === "cancel" && <Loader2 className="h-3 w-3 animate-spin" />}
            {t("cancel")}
          </Button>
        </div>
      )}
    </Card>
  );
}

function ScoreCell({ label, score, lead }: { label: string; score: number; lead: boolean }) {
  return (
    <div className="flex-1 px-3 py-2 text-center">
      <div className="truncate text-[10px] uppercase tracking-wide text-text-muted">{label}</div>
      <div
        className={cn(
          "text-2xl font-semibold tabular-nums",
          lead ? "text-text-primary" : "text-text-muted"
        )}
      >
        {score}
      </div>
    </div>
  );
}

function Group({
  label,
  items,
  myId,
  onUpdate,
}: {
  label: string;
  items: EnrichedChallenge[];
  myId: number;
  onUpdate: () => void;
}) {
  if (items.length === 0) return null;
  return (
    <section className="space-y-2">
      <h3 className="flex items-center gap-2 px-0.5 text-[11px] font-medium uppercase tracking-wide text-text-muted">
        {label}
        <span className="rounded-full bg-white/5 px-1.5 text-[10px] text-text-secondary">
          {items.length}
        </span>
      </h3>
      {items.map((c) => (
        <ChallengeCard key={c.id} c={c} myId={myId} onUpdate={onUpdate} />
      ))}
    </section>
  );
}

export function ChallengeList({ challenges, onUpdate, layout = "list" }: Props) {
  const t = useTranslations("social.challengeList");
  const myId = useSocialStore((s) => s.userId);
  if (!myId) return null;

  if (challenges.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border p-8 text-center">
        <Swords className="mx-auto mb-2 h-6 w-6 text-text-muted" />
        <p className="text-sm text-text-secondary">{t("noChallengesYet")}</p>
        <p className="mt-0.5 text-xs text-text-muted">{t("pickSuggestionOrChallenge")}</p>
      </div>
    );
  }

  const incoming = challenges.filter((c) => c.status === "pending" && c.challengedId === myId);
  const active = challenges.filter((c) => c.status === "active");
  const sent = challenges.filter((c) => c.status === "pending" && c.challengerId === myId);
  const past = challenges.filter((c) => ["completed", "declined", "cancelled"].includes(c.status));

  if (layout === "grid") {
    // Flat, priority-ordered grid (incoming first), cards keep their natural height.
    const ordered = [...incoming, ...active, ...sent, ...past];
    return (
      <div className="grid grid-cols-1 items-start gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {ordered.map((c) => (
          <ChallengeCard key={c.id} c={c} myId={myId} onUpdate={onUpdate} />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <Group label={t("groupNeedsResponse")} items={incoming} myId={myId} onUpdate={onUpdate} />
      <Group label={t("groupActive")} items={active} myId={myId} onUpdate={onUpdate} />
      <Group label={t("groupSent")} items={sent} myId={myId} onUpdate={onUpdate} />
      <Group label={t("groupPast")} items={past} myId={myId} onUpdate={onUpdate} />
    </div>
  );
}
