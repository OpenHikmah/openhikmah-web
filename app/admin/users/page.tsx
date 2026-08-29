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
  LoadMore,
} from "@/components/admin/primitives";
import { formatTimestamp } from "@/lib/admin/format";
import { useAdminFetch, AdminApiError } from "@/components/admin/AdminContext";
import { usePaginated } from "@/components/admin/usePaginated";
import { SkeletonRows } from "@/components/admin/Skeleton";
import { useAdminAnnounce } from "@/components/admin/AdminLiveRegion";

interface AdminUser {
  id: number;
  qfId: string;
  username: string;
  displayName: string | null;
  lastActiveAt: string;
  currentStreak: number;
  longestStreak: number;
  disabledAt: string | null;
  isAdmin: boolean;
}

export default function UsersPage() {
  const api = useAdminFetch();
  const announce = useAdminAnnounce();
  const [query, setQuery] = useState("");
  const [submitted, setSubmitted] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  const { rows, hasMore, error, loading, loadingMore, loadMoreError, reload, loadMore } =
    usePaginated<AdminUser>(async ({ offset }) => {
      const p = new URLSearchParams();
      if (submitted) p.set("q", submitted);
      if (offset) p.set("offset", String(offset));
      const qs = p.toString();
      const d = await api<{ users: AdminUser[]; hasMore: boolean }>(`/users${qs ? `?${qs}` : ""}`);
      return { rows: d.users, hasMore: d.hasMore };
    }, `users:${submitted}`);

  const setDisabled = async (id: number, disabled: boolean) => {
    setActionError(null);
    setBusyId(id);
    try {
      await api("/users", { method: "PATCH", json: { id, disabled } });
      announce(`User ${id} ${disabled ? "disabled" : "re-enabled"}.`);
      reload();
    } catch (e) {
      const msg = e instanceof AdminApiError ? e.message : "Failed to update user.";
      setActionError(msg);
      announce(msg);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <>
      <AdminPageHeader title="Users" subtitle="View activity and moderate accounts." />
      <div className="space-y-6 p-7">
        <form
          className="flex max-w-sm gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            setSubmitted(query.trim());
          }}
        >
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search username…"
          />
          <Button type="submit" variant="secondary">
            Search
          </Button>
        </form>

        {error && <StateNote tone="error">{error}</StateNote>}
        {actionError && <StateNote tone="error">{actionError}</StateNote>}
        {loading && <SkeletonRows />}
        {!loading && !error && rows.length === 0 && <StateNote>No users found.</StateNote>}

        {rows.length > 0 && (
          <Table>
            <thead>
              <tr>
                <Th>User</Th>
                <Th>Streak</Th>
                <Th>Last active</Th>
                <Th>Status</Th>
                <Th className="text-right">Actions</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((u) => (
                <tr key={u.id}>
                  <Td>
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-text-primary">{u.username}</span>
                      {u.isAdmin && <Pill tone="flagged">admin</Pill>}
                    </div>
                    {u.displayName && (
                      <div className="text-xs text-text-muted">{u.displayName}</div>
                    )}
                  </Td>
                  <Td className="text-xs text-text-secondary tabular-nums">
                    {u.currentStreak}{" "}
                    <span className="text-text-muted">/ {u.longestStreak} best</span>
                  </Td>
                  <Td className="whitespace-nowrap text-xs text-text-muted">
                    {formatTimestamp(u.lastActiveAt)}
                  </Td>
                  <Td>
                    {u.disabledAt ? (
                      <Pill tone="retired">disabled</Pill>
                    ) : (
                      <Pill tone="active">active</Pill>
                    )}
                  </Td>
                  <Td>
                    <div className="flex justify-end">
                      {u.isAdmin ? (
                        <span className="text-xs text-text-muted">—</span>
                      ) : u.disabledAt ? (
                        <Button
                          size="sm"
                          variant="secondary"
                          disabled={busyId === u.id}
                          onClick={() => setDisabled(u.id, false)}
                        >
                          Enable
                        </Button>
                      ) : (
                        <ConfirmButton
                          onConfirm={() => setDisabled(u.id, true)}
                          confirmLabel="Disable?"
                          disabled={busyId === u.id}
                        >
                          Disable
                        </ConfirmButton>
                      )}
                    </div>
                  </Td>
                </tr>
              ))}
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
