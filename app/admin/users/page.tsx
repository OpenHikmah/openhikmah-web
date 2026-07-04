"use client";

import { useState } from "react";
import { Button, Input } from "@/components/ui";
import { AdminPageHeader } from "@/components/admin/AdminShell";
import { Table, Th, Td, Pill, StateNote, ConfirmButton } from "@/components/admin/primitives";
import { useAdminFetch, AdminApiError } from "@/components/admin/AdminContext";
import { useAsync } from "@/components/admin/useAsync";

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
  const [query, setQuery] = useState("");
  const [submitted, setSubmitted] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  const { data, error, loading, reload } = useAsync<{ users: AdminUser[] }>(
    () => api(`/users${submitted ? `?q=${encodeURIComponent(submitted)}` : ""}`),
    `users:${submitted}`
  );

  const setDisabled = async (id: number, disabled: boolean) => {
    setActionError(null);
    setBusyId(id);
    try {
      await api("/users", { method: "PATCH", json: { id, disabled } });
      reload();
    } catch (e) {
      setActionError(e instanceof AdminApiError ? e.message : "Failed to update user.");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <>
      <AdminPageHeader title="Users" subtitle="View activity and moderate accounts." />
      <div className="space-y-4 p-7">
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
        {loading && <StateNote>Loading…</StateNote>}
        {data && data.users.length === 0 && <StateNote>No users found.</StateNote>}

        {data && data.users.length > 0 && (
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
              {data.users.map((u) => (
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
                    {new Date(u.lastActiveAt).toLocaleDateString()}
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
      </div>
    </>
  );
}
