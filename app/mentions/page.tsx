"use client";

import { useCallback, useRef, useState } from "react";
import Link from "next/link";
import { AtSign, Network } from "lucide-react";
import { useTranslations, useFormatter } from "next-intl";
import { useAuthStore } from "@/store/auth";
import { useSocialStore } from "@/store/social";
import { AuthShell } from "@/components/layout/AuthShell";
import { PageContainer } from "@/components/layout/PageContainer";
import { Card, Tooltip, iconButtonVariants } from "@/components/ui";
import { authFetch } from "@/lib/auth/auth-fetch";
import { usePaginatedSocialList } from "@/hooks/usePaginatedSocialList";

interface Mention {
  id: number;
  noteId: number;
  verseRef: string;
  read: boolean;
  createdAt: string;
  mentioningUsername: string;
}

export default function MentionsPage() {
  const t = useTranslations("mentions");
  const format = useFormatter();
  const accessToken = useAuthStore((s) => s.accessToken);
  const setPendingMentionCount = useSocialStore((s) => s.setPendingMentionCount);

  const [markReadError, setMarkReadError] = useState(false);
  // Ids already sent for marking, so each page of results is marked once and a
  // failed request is retried with the next load.
  const markedRef = useRef(new Set<number>());

  // Mark only what was actually loaded as read (older, unloaded pages stay
  // unread) and sync the header badge to what the server says is left. The rows
  // keep their `read` value from the fetch, so they stay highlighted this visit.
  const markShownRead = useCallback(
    (shown: Mention[]) => {
      const ids = shown.filter((m) => !m.read && !markedRef.current.has(m.id)).map((m) => m.id);
      if (ids.length === 0) return;
      ids.forEach((id) => markedRef.current.add(id));
      authFetch("/api/social/mentions", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      })
        .then(async (r) => {
          if (!r.ok) throw new Error(`mark-read failed: ${r.status}`);
          const data: { unreadCount: number } = await r.json();
          setPendingMentionCount(data.unreadCount);
          setMarkReadError(false);
        })
        .catch((e) => {
          console.error("mentions page: mark-read failed", e);
          ids.forEach((id) => markedRef.current.delete(id));
          setMarkReadError(true);
        });
    },
    [setPendingMentionCount]
  );

  const {
    items: mentions,
    hasMore,
    loading,
    loadingMore,
    error,
    loadMore,
  } = usePaginatedSocialList<Mention>({
    accessToken,
    enabled: !!accessToken,
    baseUrl: "/api/social/mentions",
    onData: markShownRead,
  });

  return (
    <AuthShell>
      <PageContainer>
        <div className="mb-8 flex items-center gap-3">
          <AtSign className="h-5 w-5 text-gold" />
          <h1 className="text-lg font-semibold text-text-primary">{t("pageTitle")}</h1>
          {mentions.length > 0 && (
            <span className="rounded border border-border px-1.5 py-0.5 font-mono text-xs text-text-muted">
              {mentions.length}
              {hasMore && "+"}
            </span>
          )}
        </div>

        {markReadError && <p className="mb-4 text-xs text-error">{t("couldntMarkRead")}</p>}

        {error ? (
          <p className="py-10 text-center text-sm text-error">{t("couldntLoadMentions")}</p>
        ) : loading ? (
          <div className="space-y-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="animate-pulse rounded-xl border border-border bg-surface p-5">
                <div className="mb-3 h-4 w-40 rounded bg-surface-overlay" />
                <div className="h-4 w-full rounded bg-surface-overlay" />
              </div>
            ))}
          </div>
        ) : mentions.length === 0 ? (
          <div className="py-20 text-center">
            <AtSign className="mx-auto mb-4 h-8 w-8 text-text-muted/40" />
            <p className="text-sm text-text-muted">{t("noMentionsYet")}</p>
            <p className="mt-1 text-xs text-text-muted">{t("mentionHint")}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {mentions.map((m) => (
              <Card
                key={m.id}
                className={m.read ? "p-5" : "border-gold/60 bg-gold/[0.04] p-5"}
                data-unread={m.read ? undefined : "true"}
              >
                <div className="flex items-start justify-between gap-3">
                  <p className="text-sm text-text-secondary">
                    {!m.read && (
                      <span className="mr-2 rounded bg-gold/[0.15] px-1.5 py-0.5 text-[10px] font-medium uppercase text-gold">
                        {t("newMention")}
                      </span>
                    )}
                    <span className="font-medium text-text-primary">@{m.mentioningUsername}</span>{" "}
                    {t("mentionedYouOn")}{" "}
                    <span className="rounded border border-gold bg-gold/[0.08] px-1.5 py-0.5 font-mono text-xs text-gold">
                      {m.verseRef}
                    </span>
                  </p>
                  <Tooltip label={t("openInCanvas")}>
                    <Link
                      href={`/canvas?verse=${m.verseRef}`}
                      aria-label={t("openInCanvas")}
                      className={iconButtonVariants({ tone: "teal", size: "xs" })}
                    >
                      <Network />
                    </Link>
                  </Tooltip>
                </div>
                <p className="mt-2 text-xs text-text-muted">
                  {format.dateTime(new Date(m.createdAt), {
                    dateStyle: "medium",
                    timeStyle: "short",
                  })}
                </p>
              </Card>
            ))}
            {hasMore && (
              <div className="flex justify-center pt-2">
                <button
                  onClick={loadMore}
                  disabled={loadingMore}
                  className="cursor-pointer text-xs text-teal underline disabled:cursor-wait disabled:opacity-50"
                >
                  {loadingMore ? t("loading") : t("loadMore")}
                </button>
              </div>
            )}
          </div>
        )}
      </PageContainer>
    </AuthShell>
  );
}
