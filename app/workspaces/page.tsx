"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { FolderOpen, Loader2, Trash2, Upload, Network, TriangleAlert } from "lucide-react";
import { useAuthStore } from "@/store/auth";
import { useCanvasStore, type SavedCanvas } from "@/store/canvas";
import { Card, IconButton, Tooltip } from "@/components/ui";
import { AuthShell } from "@/components/layout/AuthShell";

interface WorkspaceMeta {
  id: number;
  name: string;
  nodeCount: number;
  createdAt: string;
  updatedAt: string;
}

export default function WorkspacesPage() {
  const router = useRouter();
  const accessToken = useAuthStore((s) => s.accessToken);
  const appendWorkspace = useCanvasStore((s) => s.appendWorkspace);

  const [workspaces, setWorkspaces] = useState<WorkspaceMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [loadingId, setLoadingId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const fetchWorkspaces = useCallback(async () => {
    if (!accessToken) return;
    setLoading(true);
    try {
      const res = await fetch("/api/workspace", {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (res.ok) {
        setWorkspaces(await res.json());
        setLoadError(false);
      } else {
        setLoadError(true);
      }
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchWorkspaces();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken]);

  const handleLoad = async (id: number) => {
    if (!accessToken || loadingId) return;
    setLoadingId(id);
    try {
      const res = await fetch(`/api/workspace/${id}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) return;
      const saved: SavedCanvas = await res.json();
      if (saved?.v === 1) {
        appendWorkspace(saved);
        router.push("/canvas");
      }
    } finally {
      setLoadingId(null);
    }
  };

  const handleDelete = async (id: number) => {
    if (!accessToken || deletingId) return;
    setDeletingId(id);
    try {
      const res = await fetch(`/api/workspace/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (res.ok || res.status === 204) {
        setWorkspaces((prev) => prev.filter((w) => w.id !== id));
      }
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <AuthShell>
      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-8">
        {/* Page header */}
        <div className="mb-8 flex items-center gap-3">
          <FolderOpen className="h-5 w-5 text-gold" />
          <h1 className="text-lg font-semibold text-text-primary">Saved Canvases</h1>
          {workspaces.length > 0 && (
            <span className="rounded border border-border px-1.5 py-0.5 font-mono text-xs text-text-muted">
              {workspaces.length}
            </span>
          )}
        </div>

        {loading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="h-4 w-4 animate-spin text-teal" />
          </div>
        ) : loadError ? (
          <div className="py-20 text-center">
            <TriangleAlert className="mx-auto mb-4 h-8 w-8 text-error/60" />
            <p className="text-sm text-text-muted">Couldn&apos;t load your saved canvases.</p>
            <button
              onClick={() => fetchWorkspaces()}
              className="mt-4 cursor-pointer text-xs text-teal underline"
            >
              Retry
            </button>
          </div>
        ) : workspaces.length === 0 ? (
          <div className="py-20 text-center">
            <FolderOpen className="mx-auto mb-4 h-8 w-8 text-text-muted/40" />
            <p className="text-sm text-text-muted">No saved canvases yet.</p>
            <p className="mt-1 text-xs text-text-muted">
              Build a canvas and click the save icon in the header to save it.
            </p>
            <Link
              href="/canvas"
              className="mt-5 inline-flex items-center gap-1.5 rounded-md border border-border px-4 py-2 text-sm text-text-secondary transition-colors hover:border-gold-muted hover:text-gold"
            >
              <Network className="h-3.5 w-3.5" />
              Open canvas
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {workspaces.map((ws) => (
              <Card key={ws.id} className="flex items-center justify-between gap-4 p-4">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-text-primary">{ws.name}</p>
                  <div className="mt-1 flex items-center gap-3">
                    <span className="rounded border border-border px-1.5 py-0.5 font-mono text-xs text-text-muted">
                      {ws.nodeCount} verse{ws.nodeCount === 1 ? "" : "s"}
                    </span>
                    <span className="text-xs text-text-muted">
                      {new Date(ws.updatedAt).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </span>
                  </div>
                </div>

                <div className="flex shrink-0 items-center gap-1.5">
                  <button
                    onClick={() => handleLoad(ws.id)}
                    disabled={!!loadingId}
                    className="flex cursor-pointer items-center gap-1.5 rounded border border-teal px-2.5 py-1.5 text-xs text-teal transition-colors hover:bg-teal/10 disabled:opacity-50"
                  >
                    {loadingId === ws.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Upload className="h-3.5 w-3.5" />
                    )}
                    <span>Load</span>
                  </button>

                  <Tooltip label="Delete canvas">
                    <IconButton
                      tone="danger"
                      size="sm"
                      onClick={() => handleDelete(ws.id)}
                      disabled={!!deletingId}
                      aria-label="Delete canvas"
                    >
                      {deletingId === ws.id ? <Loader2 className="animate-spin" /> : <Trash2 />}
                    </IconButton>
                  </Tooltip>
                </div>
              </Card>
            ))}
          </div>
        )}
      </main>
    </AuthShell>
  );
}
