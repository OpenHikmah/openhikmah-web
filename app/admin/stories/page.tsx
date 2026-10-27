"use client";

import { useState } from "react";
import { Button, Input } from "@/components/ui";
import { AdminPageHeader } from "@/components/admin/AdminShell";
import {
  Table,
  Th,
  Td,
  Pill,
  StateNote,
  ConfirmButton,
  ErrorState,
} from "@/components/admin/primitives";
import { SkeletonRows } from "@/components/admin/Skeleton";
import { useAdminFetch } from "@/components/admin/AdminContext";
import { Feedback } from "@/components/admin/Feedback";
import { useRowAction } from "@/components/admin/useRowAction";
import { useAsync } from "@/components/admin/useAsync";

interface AdminStory {
  slug: string;
  name: string;
  arabicName: string;
  chapters: number;
  hidden: boolean;
  reason: string | null;
  flaggedBy: string | null;
  flaggedAt: string | null;
}

export default function AdminStoriesPage() {
  const api = useAdminFetch();
  const { run: action, busyId: busySlug, message } = useRowAction();
  const [reasonDraft, setReasonDraft] = useState<Record<string, string>>({});

  const { data, error, loading, reload } = useAsync<{ stories: AdminStory[] }>(
    () => api("/stories"),
    "stories"
  );

  const flag = async (slug: string) => {
    const done = await action(
      slug,
      () =>
        api("/stories", {
          method: "PATCH",
          json: { slug, hidden: true, reason: reasonDraft[slug]?.trim() || undefined },
        }),
      { success: "Story hidden from /stories.", failure: "Failed to flag story." }
    );
    if (done) reload();
  };

  const unflag = async (slug: string) => {
    const done = await action(
      slug,
      () => api("/stories", { method: "PATCH", json: { slug, hidden: false } }),
      { success: "Story restored.", failure: "Failed to restore story." }
    );
    if (done) reload();
  };

  return (
    <>
      <AdminPageHeader
        title="Stories"
        subtitle="Hardcoded prophetic narratives. Flag one to pull it from /stories immediately if something in it is wrong — it stays hidden until you restore it, no redeploy needed."
      />
      <div className="space-y-6 p-7">
        {error && <ErrorState onRetry={() => reload()}>{error}</ErrorState>}
        {message && <Feedback tone={message.tone}>{message.text}</Feedback>}
        {loading && <SkeletonRows />}
        {data && data.stories.length === 0 && <StateNote>No stories found.</StateNote>}

        {data && data.stories.length > 0 && (
          <Table>
            <thead>
              <tr>
                <Th>Story</Th>
                <Th>Chapters</Th>
                <Th>Status</Th>
                <Th>Reason</Th>
                <Th className="text-right">Actions</Th>
              </tr>
            </thead>
            <tbody>
              {data.stories.map((s) => (
                <tr key={s.slug}>
                  <Td className="whitespace-nowrap">
                    <span lang="ar" dir="rtl" className="font-arabic text-base text-gold">
                      {s.arabicName}
                    </span>{" "}
                    <span className="text-text-secondary">{s.name}</span>
                  </Td>
                  <Td className="text-xs text-text-secondary">{s.chapters}</Td>
                  <Td>
                    <Pill tone={s.hidden ? "flagged" : "active"}>
                      {s.hidden ? "hidden" : "visible"}
                    </Pill>
                  </Td>
                  <Td className="max-w-xs">
                    {s.hidden ? (
                      <span className="text-xs text-text-secondary">{s.reason ?? "—"}</span>
                    ) : (
                      <Input
                        type="text"
                        placeholder="Reason (optional)"
                        aria-label={`Flag reason for ${s.name}`}
                        value={reasonDraft[s.slug] ?? ""}
                        onChange={(e) =>
                          setReasonDraft((prev) => ({ ...prev, [s.slug]: e.target.value }))
                        }
                        className="h-8 px-2 text-xs"
                      />
                    )}
                  </Td>
                  <Td>
                    <div className="flex justify-end gap-1.5">
                      {s.hidden ? (
                        <Button
                          size="sm"
                          variant="secondary"
                          disabled={busySlug === s.slug}
                          onClick={() => unflag(s.slug)}
                        >
                          Restore
                        </Button>
                      ) : (
                        <ConfirmButton
                          onConfirm={() => flag(s.slug)}
                          confirmLabel="Flag?"
                          variant="secondary"
                          disabled={busySlug === s.slug}
                        >
                          Flag
                        </ConfirmButton>
                      )}
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </div>
    </>
  );
}
