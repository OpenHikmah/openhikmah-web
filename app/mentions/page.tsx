"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AtSign, Network } from "lucide-react";
import { useAuthStore } from "@/store/auth";
import { useSocialStore } from "@/store/social";
import { AuthShell } from "@/components/layout/AuthShell";
import { Card, Tooltip, iconButtonVariants } from "@/components/ui";

interface Mention {
  id: number;
  noteId: number;
  verseRef: string;
  read: boolean;
  createdAt: string;
  mentioningUsername: string;
}

export default function MentionsPage() {
  const accessToken = useAuthStore((s) => s.accessToken);
  const setPendingMentionCount = useSocialStore((s) => s.setPendingMentionCount);

  const [mentions, setMentions] = useState<Mention[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!accessToken) return;
    let cancelled = false;

    fetch("/api/social/mentions", {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("load failed"))))
      .then((data: { items: Mention[] }) => {
        if (cancelled) return;
        setMentions(data.items);
      })
      .catch((e) => {
        console.error("mentions page: load failed", e);
        if (!cancelled) setError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    // Mark everything read now that the user has opened this page, and clear
    // the header badge immediately rather than waiting for the next poll.
    fetch("/api/social/mentions", {
      method: "PATCH",
      headers: { Authorization: `Bearer ${accessToken}` },
    })
      .then(() => {
        if (!cancelled) setPendingMentionCount(0);
      })
      .catch((e) => console.error("mentions page: mark-read failed", e));

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken]);

  return (
    <AuthShell>
      <div className="mx-auto w-full max-w-2xl">
        <div className="mb-8 flex items-center gap-3">
          <AtSign className="h-5 w-5 text-gold" />
          <h1 className="text-lg font-semibold text-text-primary">Mentions</h1>
          {mentions.length > 0 && (
            <span className="rounded border border-border px-1.5 py-0.5 font-mono text-xs text-text-muted">
              {mentions.length}
            </span>
          )}
        </div>

        {error ? (
          <p className="py-10 text-center text-sm text-error">Couldn&apos;t load mentions.</p>
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
            <p className="text-sm text-text-muted">No mentions yet.</p>
            <p className="mt-1 text-xs text-text-muted">
              A friend can tag you with @{"{username}"} in a verse note.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {mentions.map((m) => (
              <Card key={m.id} className="p-5">
                <div className="flex items-start justify-between gap-3">
                  <p className="text-sm text-text-secondary">
                    <span className="font-medium text-text-primary">@{m.mentioningUsername}</span>{" "}
                    mentioned you on{" "}
                    <span className="rounded border border-gold bg-gold/[0.08] px-1.5 py-0.5 font-mono text-xs text-gold">
                      {m.verseRef}
                    </span>
                  </p>
                  <Tooltip label="Open in canvas">
                    <Link
                      href={`/canvas?verse=${m.verseRef}`}
                      aria-label="Open in canvas"
                      className={iconButtonVariants({ tone: "teal", size: "xs" })}
                    >
                      <Network />
                    </Link>
                  </Tooltip>
                </div>
                <p className="mt-2 text-xs text-text-muted">
                  {new Date(m.createdAt).toLocaleString()}
                </p>
              </Card>
            ))}
          </div>
        )}
      </div>
    </AuthShell>
  );
}
