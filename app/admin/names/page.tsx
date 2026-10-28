"use client";

import { Fragment, useState } from "react";
import { Button, Textarea } from "@/components/ui";
import { AdminPageHeader } from "@/components/admin/AdminShell";
import {
  Table,
  Th,
  Td,
  Pill,
  StateNote,
  ConfirmButton,
  LoadMore,
  ErrorState,
} from "@/components/admin/primitives";
import { SkeletonRows } from "@/components/admin/Skeleton";
import { useAdminFetch } from "@/components/admin/AdminContext";
import { ActionFeedback } from "@/components/admin/Feedback";
import { useRowAction } from "@/components/admin/useRowAction";
import { usePaginated } from "@/components/admin/usePaginated";
import { useArmedConfirm } from "@/hooks/useArmedConfirm";

interface Row {
  slug: string;
  kind: string;
  data: unknown;
  model: string | null;
  version: number;
  updatedAt: string;
}

export default function NamesPage() {
  const api = useAdminFetch();
  const { rows, hasMore, error, loading, loadingMore, loadMoreError, reload, loadMore } =
    usePaginated<Row>(async ({ offset }) => {
      const d = await api<{ rows: Row[]; hasMore: boolean }>(
        `/names${offset ? `?offset=${offset}` : ""}`
      );
      return { rows: d.rows, hasMore: d.hasMore };
    }, "names");
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const { run: action, busyId, message, fail, clear } = useRowAction();

  const startEdit = (r: Row) => {
    setEditing(`${r.slug}/${r.kind}`);
    setDraft(JSON.stringify(r.data, null, 2));
    clear();
  };

  const save = async (r: Row) => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(draft);
    } catch {
      fail("Data must be valid JSON.");
      return;
    }
    const done = await action(
      `${r.slug}/${r.kind}`,
      () => api("/names", { method: "PATCH", json: { slug: r.slug, kind: r.kind, data: parsed } }),
      { success: `Saved ${r.slug}/${r.kind}.`, failure: "Save failed." }
    );
    if (done) {
      setEditing(null);
      reload();
    }
  };

  const invalidate = async (r: Row) => {
    const done = await action(
      `${r.slug}/${r.kind}`,
      () =>
        api(`/names?slug=${encodeURIComponent(r.slug)}&kind=${encodeURIComponent(r.kind)}`, {
          method: "DELETE",
        }),
      {
        success: `Invalidated ${r.slug}/${r.kind}; it will regenerate.`,
        failure: "Invalidate failed.",
      }
    );
    if (done) reload();
  };

  return (
    <>
      <AdminPageHeader
        title="Names Content"
        subtitle="Cached AI content per Divine Name. Edit the payload or invalidate to regenerate."
      />
      <div className="space-y-6 p-4 sm:p-7">
        {error && <ErrorState onRetry={() => reload()}>{error}</ErrorState>}
        <ActionFeedback message={message} />
        {loading && <SkeletonRows />}
        {!loading && !error && rows.length === 0 && (
          <StateNote>No cached name content yet.</StateNote>
        )}

        {rows.length > 0 && (
          <Table>
            <thead>
              <tr>
                <Th>Name</Th>
                <Th>Kind</Th>
                <Th>Model</Th>
                <Th>Ver</Th>
                <Th className="text-right">Actions</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const id = `${r.slug}/${r.kind}`;
                const isEditing = editing === id;
                return (
                  <Fragment key={id}>
                    <tr>
                      <Td className="text-sm text-text-primary">{r.slug}</Td>
                      <Td>
                        <Pill>{r.kind}</Pill>
                      </Td>
                      <Td className="font-mono text-[11px] text-text-muted">{r.model ?? "—"}</Td>
                      <Td className="tabular-nums text-text-secondary">{r.version}</Td>
                      <Td>
                        <div className="flex justify-end gap-1.5">
                          <Button
                            size="sm"
                            variant="secondary"
                            disabled={busyId === id}
                            onClick={() => startEdit(r)}
                          >
                            {isEditing ? "Editing…" : "Edit"}
                          </Button>
                          <ConfirmButton
                            disabled={busyId === id}
                            onConfirm={() => invalidate(r)}
                            confirmLabel="Invalidate?"
                          >
                            Invalidate
                          </ConfirmButton>
                        </div>
                      </Td>
                    </tr>
                    {isEditing && (
                      <tr>
                        <td colSpan={5} className="border-b border-border-subtle bg-bg px-3.5 py-3">
                          <EditRow
                            draft={draft}
                            onDraftChange={setDraft}
                            disabled={busyId === id}
                            onSave={() => save(r)}
                            onCancel={() => setEditing(null)}
                          />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </Table>
        )}

        <LoadMore
          hasMore={hasMore}
          loading={loadingMore}
          error={loadMoreError}
          onClick={loadMore}
        />
      </div>
    </>
  );
}

// A "Save" overwrites the cached payload outright with no history to revert
// to (unlike Prompts, which is versioned) — armed here like Invalidate, and
// the textarea locks while armed so the confirmed content can't change
// between the two clicks.
function EditRow({
  draft,
  onDraftChange,
  disabled,
  onSave,
  onCancel,
}: {
  draft: string;
  onDraftChange: (value: string) => void;
  disabled: boolean;
  onSave: () => void;
  onCancel: () => void;
}) {
  const { armed, trigger } = useArmedConfirm(onSave);

  return (
    <>
      <Textarea
        value={draft}
        onChange={(e) => onDraftChange(e.target.value)}
        disabled={armed || disabled}
        rows={10}
        className="font-mono text-xs"
      />
      <div className="mt-2 flex items-center gap-2">
        <Button
          size="sm"
          variant={armed ? "danger" : "primary"}
          disabled={disabled}
          onClick={trigger}
        >
          {armed ? "Save?" : "Save"}
        </Button>
        <Button size="sm" variant="ghost" disabled={disabled} onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </>
  );
}
