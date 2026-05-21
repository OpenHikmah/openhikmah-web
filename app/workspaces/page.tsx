"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { BookOpen, ArrowLeft, FolderOpen, Loader2, Trash2, Upload } from "lucide-react";
import { useAuthStore } from "@/store/auth";
import { useCanvasStore, type SavedCanvas } from "@/store/canvas";

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
    if (!accessToken) {
      router.replace("/");
      return;
    }
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

  if (!accessToken) return null;

  return (
    <div
      className="min-h-screen flex flex-col"
      style={{ background: "var(--color-bg)", color: "var(--color-text-primary)" }}
    >
      <header
        className="flex items-center gap-3 px-6 h-12 shrink-0 border-b"
        style={{ background: "var(--color-surface)", borderColor: "var(--color-border)" }}
      >
        <Link
          href="/"
          className="w-7 h-7 rounded border flex items-center justify-center transition-colors hover:opacity-80"
          style={{ borderColor: "var(--color-border)", color: "var(--color-text-muted)" }}
        >
          <ArrowLeft className="w-3.5 h-3.5" />
        </Link>
        <BookOpen className="w-4 h-4" style={{ color: "var(--color-gold)" }} />
        <span className="text-sm font-medium">Saved Workspaces</span>
        {workspaces.length > 0 && (
          <span
            className="text-xs font-mono px-1.5 py-0.5 rounded"
            style={{ background: "var(--color-surface-raised)", color: "var(--color-text-muted)" }}
          >
            {workspaces.length}
          </span>
        )}
      </header>

      <main className="flex-1 max-w-2xl mx-auto w-full px-4 py-8">
        {loading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="w-4 h-4 animate-spin" style={{ color: "var(--color-teal)" }} />
          </div>
        ) : workspaces.length === 0 ? (
          <div className="text-center py-20 space-y-3">
            <FolderOpen className="w-8 h-8 mx-auto opacity-30" style={{ color: "var(--color-text-muted)" }} />
            <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>
              No saved workspaces yet.
            </p>
            <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>
              Build a canvas and click the save icon in the header to save it.
            </p>
            <Link
              href="/"
              className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded border transition-colors mt-2"
              style={{ borderColor: "var(--color-border)", color: "var(--color-text-secondary)" }}
            >
              Open Canvas
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {workspaces.map((ws) => (
              <div
                key={ws.id}
                className="rounded-lg border p-4 flex items-center justify-between gap-4"
                style={{ borderColor: "var(--color-border)", background: "var(--color-surface)" }}
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate" style={{ color: "var(--color-text-primary)" }}>
                    {ws.name}
                  </p>
                  <div className="flex items-center gap-3 mt-1">
                    <span className="text-xs font-mono" style={{ color: "var(--color-text-muted)" }}>
                      {ws.nodeCount} verse{ws.nodeCount === 1 ? "" : "s"}
                    </span>
                    <span className="text-xs" style={{ color: "var(--color-text-muted)" }}>
                      {new Date(ws.updatedAt).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    onClick={() => handleLoad(ws.id)}
                    disabled={!!loadingId}
                    title="Load this workspace"
                    className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded border transition-colors cursor-pointer disabled:opacity-50"
                    style={{ borderColor: "var(--color-teal)", color: "var(--color-teal)" }}
                  >
                    {loadingId === ws.id ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Upload className="w-3.5 h-3.5" />
                    )}
                    <span>Load</span>
                  </button>

                  <button
                    onClick={() => handleDelete(ws.id)}
                    disabled={!!deletingId}
                    title="Delete workspace"
                    className="w-7 h-7 rounded border flex items-center justify-center transition-colors cursor-pointer disabled:opacity-50 hover:border-red-700 hover:text-red-400"
                    style={{ borderColor: "var(--color-border)", color: "var(--color-text-muted)" }}
                  >
                    {deletingId === ws.id ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
