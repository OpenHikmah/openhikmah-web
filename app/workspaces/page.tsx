"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { BookOpen, ArrowLeft, FolderOpen, Loader2, Trash2, Upload } from "lucide-react";
import { useAuthStore } from "@/store/auth";
import { useCanvasStore, type SavedCanvas } from "@/store/canvas";
import { Card, IconButton, Tooltip, iconButtonVariants } from "@/components/ui";

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
  const isSessionLoading = useAuthStore((s) => s.isSessionLoading);
  const restoreCanvas = useCanvasStore((s) => s.restoreCanvas);

  const [workspaces, setWorkspaces] = useState<WorkspaceMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingId, setLoadingId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const fetchWorkspaces = useCallback(async () => {
    if (!accessToken) return;
    setLoading(true);
    try {
      const res = await fetch("/api/workspace", {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (res.ok) setWorkspaces(await res.json());
    } finally {
      setLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    if (isSessionLoading) return;
    if (!accessToken) {
      router.replace("/");
      return;
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchWorkspaces();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken, isSessionLoading]);

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
        restoreCanvas(saved);
        router.push("/");
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

  if (isSessionLoading && !accessToken) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-bg">
        <Loader2 className="h-4 w-4 animate-spin text-teal" />
      </div>
    );
  }
  if (!accessToken) return null;

  return (
    <div className="flex min-h-screen flex-col bg-bg text-text-primary">
      <header className="flex h-12 shrink-0 items-center gap-3 border-b border-border bg-surface px-6">
        <Tooltip label="Back home">
          <Link href="/" aria-label="Back home" className={iconButtonVariants({ size: "xs" })}>
            <ArrowLeft />
          </Link>
        </Tooltip>
        <BookOpen className="h-4 w-4 text-gold" />
        <span className="text-sm font-medium">Saved Workspaces</span>
        {workspaces.length > 0 && (
          <span className="rounded bg-surface-raised px-1.5 py-0.5 font-mono text-xs text-text-muted">
            {workspaces.length}
          </span>
        )}
      </header>

      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-8">
        {loading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="h-4 w-4 animate-spin text-teal" />
          </div>
        ) : workspaces.length === 0 ? (
          <div className="space-y-3 py-20 text-center">
            <FolderOpen className="mx-auto h-8 w-8 text-text-muted opacity-30" />
            <p className="text-sm text-text-muted">No saved workspaces yet.</p>
            <p className="text-xs text-text-muted">
              Build a canvas and click the save icon in the header to save it.
            </p>
            <Link
              href="/"
              className="mt-2 inline-flex items-center gap-1.5 rounded border border-border px-3 py-1.5 text-xs text-text-secondary transition-colors hover:border-gold-muted hover:text-gold"
            >
              Open Canvas
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {workspaces.map((ws) => (
              <Card key={ws.id} className="flex items-center justify-between gap-4 p-4">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-text-primary">{ws.name}</p>
                  <div className="mt-1 flex items-center gap-3">
                    <span className="font-mono text-xs text-text-muted">
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

                  <Tooltip label="Delete workspace">
                    <IconButton
                      tone="danger"
                      size="sm"
                      onClick={() => handleDelete(ws.id)}
                      disabled={!!deletingId}
                      aria-label="Delete workspace"
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
    </div>
  );
}
