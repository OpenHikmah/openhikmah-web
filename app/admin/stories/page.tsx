"use client";

import { useState } from "react";
import { Button } from "@/components/ui";
import { AdminPageHeader } from "@/components/admin/AdminShell";
import { Table, Th, Td, Pill, StateNote, ConfirmButton } from "@/components/admin/primitives";
import { useAdminFetch, AdminApiError } from "@/components/admin/AdminContext";
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
  const [actionError, setActionError] = useState<string | null>(null);
  const [busySlug, setBusySlug] = useState<string | null>(null);
  const [reasonDraft, setReasonDraft] = useState<Record<string, string>>({});

  const { data, error, loading, reload } = useAsync<{ stories: AdminStory[] }>(
    () => api("/stories"),
    "stories"
  );

  const flag = async (slug: string) => {
    setActionError(null);
    setBusySlug(slug);
    try {
      await api("/stories", {
        method: "PATCH",
        json: { slug, hidden: true, reason: reasonDraft[slug]?.trim() || undefined },
      });
      reload();
    } catch (e) {
      setActionError(e instanceof AdminApiError ? e.message : "Failed to flag story.");
    } finally {
      setBusySlug(null);
    }
  };

  const unflag = async (slug: string) => {
    setActionError(null);
    setBusySlug(slug);
    try {
      await api("/stories", { method: "PATCH", json: { slug, hidden: false } });
      reload();
    } catch (e) {
      setActionError(e instanceof AdminApiError ? e.message : "Failed to restore story.");
    } finally {
      setBusySlug(null);
    }
  };

  return (
    <>
      <AdminPageHeader
        title="Stories"
        subtitle="Hardcoded prophetic narratives. Flag one to pull it from /stories immediately if something in it is wrong — it stays hidden until you restore it, no redeploy needed."
      />
      <div className="space-y-4 p-7">
        {error && <StateNote tone="error">{error}</StateNote>}
        {actionError && <StateNote tone="error">{actionError}</StateNote>}
        {loading && <StateNote>Loading…</StateNote>}

        {data && (
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
                    <span className="font-arabic text-base text-gold">{s.arabicName}</span>{" "}
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
                      <input
                        type="text"
                        placeholder="Reason (optional)"
                        value={reasonDraft[s.slug] ?? ""}
                        onChange={(e) =>
                          setReasonDraft((prev) => ({ ...prev, [s.slug]: e.target.value }))
                        }
                        className="w-full rounded border border-border bg-surface px-2 py-1 text-xs text-text-primary placeholder:text-text-muted focus:border-gold-muted focus:outline-none"
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
