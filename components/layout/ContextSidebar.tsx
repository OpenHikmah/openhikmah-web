"use client";

import { motion, AnimatePresence } from "framer-motion";
import { X, ChevronDown, ChevronRight } from "lucide-react";
import { useCanvasStore } from "@/store/canvas";
import { useAuthStore } from "@/store/auth";
import { useState, useEffect } from "react";
import type { EdgeKind } from "@/types/quran";

function TafsirSection({ surah, ayah }: { surah: number; ayah: number }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleOpen = async () => {
    if (open) { setOpen(false); return; }
    setOpen(true);
    if (text !== null) return;
    setLoading(true);
    try {
      const res = await fetch(
        `https://api.alquran.cloud/v1/ayah/${surah}:${ayah}/editions/en.ibn-kathir`
      );
      const json = await res.json();
      setText(json?.data?.[0]?.text ?? "Tafsir unavailable.");
    } catch {
      setText("Could not load tafsir.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="rounded-md border"
      style={{ borderColor: "var(--color-border)", background: "var(--color-surface-raised)" }}
    >
      <button
        onClick={handleOpen}
        className="w-full flex items-center justify-between px-3 py-2 cursor-pointer"
        style={{ color: "var(--color-text-secondary)" }}
      >
        <span className="text-xs font-medium">Ibn Kathir Tafsir</span>
        {open ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
      </button>
      {open && (
        <div className="px-3 pb-3">
          {loading ? (
            <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>Loading…</p>
          ) : (
            <p className="text-xs leading-relaxed" style={{ color: "var(--color-text-secondary)" }}>
              {text}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function NotesSection({ verseRef }: { verseRef: string }) {
  const accessToken = useAuthStore((s) => s.accessToken);
  const [open, setOpen] = useState(false);
  const [notes, setNotes] = useState<{ id: number; note: string; createdAt: string }[]>([]);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!open || !accessToken || loaded) return;
    fetch(`/api/notes?ref=${encodeURIComponent(verseRef)}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => { setNotes(data); setLoaded(true); })
      .catch(() => {});
  }, [open, verseRef, accessToken, loaded]);

  const save = async () => {
    if (!draft.trim() || !accessToken) return;
    setSaving(true);
    setSaveError(false);
    try {
      const res = await fetch("/api/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ ref: verseRef, note: draft.trim() }),
      });
      if (res.ok) {
        const created = await res.json();
        setNotes((prev) => [...prev, created]);
        setDraft("");
      } else {
        setSaveError(true);
        setTimeout(() => setSaveError(false), 3000);
      }
    } catch {
      setSaveError(true);
      setTimeout(() => setSaveError(false), 3000);
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: number) => {
    if (!accessToken) return;
    await fetch(`/api/notes/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${accessToken}` },
    }).catch(() => {});
    setNotes((prev) => prev.filter((n) => n.id !== id));
  };

  return (
    <div
      className="rounded-md border"
      style={{ borderColor: "var(--color-border)", background: "var(--color-surface-raised)" }}
    >
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-3 py-2 cursor-pointer"
        style={{ color: "var(--color-text-secondary)" }}
      >
        <span className="text-xs font-medium">My Notes</span>
        {open ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
      </button>

      {open && (
        <div className="px-3 pb-3 space-y-2">
          {!accessToken ? (
            <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>
              Sign in to add private notes.
            </p>
          ) : (
            <>
              {notes.map((n) => (
                <div
                  key={n.id}
                  className="flex gap-2 items-start rounded border p-2"
                  style={{ borderColor: "var(--color-border)" }}
                >
                  <p className="flex-1 text-xs leading-relaxed" style={{ color: "var(--color-text-secondary)" }}>
                    {n.note}
                  </p>
                  <button
                    onClick={() => remove(n.id)}
                    className="shrink-0 cursor-pointer hover:opacity-70"
                  >
                    <X className="w-3 h-3" style={{ color: "var(--color-text-muted)" }} />
                  </button>
                </div>
              ))}
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Add a private note…"
                rows={2}
                className="w-full text-xs rounded border px-2.5 py-2 resize-none outline-none"
                style={{
                  background: "transparent",
                  borderColor: "var(--color-border)",
                  color: "var(--color-text-primary)",
                }}
              />
              <button
                onClick={save}
                disabled={saving || !draft.trim()}
                className="text-xs px-2.5 py-1 rounded border transition-colors cursor-pointer disabled:opacity-40"
                style={{
                  borderColor: saveError ? "#ef4444" : "var(--color-teal)",
                  color: saveError ? "#ef4444" : "var(--color-teal)",
                }}
              >
                {saving ? "Saving…" : saveError ? "Save failed — try again" : "Save"}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

const KIND_LABEL: Record<EdgeKind, string> = {
  thematic: "Thematic",
  root: "Root word",
  contrast: "Contrast",
};

const KIND_COLOR: Record<EdgeKind, string> = {
  thematic: "var(--color-teal)",
  root: "var(--color-gold)",
  contrast: "var(--color-contrast-edge)",
};

export function ContextSidebar() {
  const sidebarContent = useCanvasStore((s) => s.sidebarContent);
  const setSidebarContent = useCanvasStore((s) => s.setSidebarContent);

  return (
    <AnimatePresence>
      {sidebarContent && (
        <motion.aside
          key="sidebar"
          initial={{ x: "100%", opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: "100%", opacity: 0 }}
          transition={{ duration: 0.15, ease: "easeOut" }}
          className="absolute top-0 right-0 h-full w-full sm:w-72 z-40 flex flex-col pointer-events-auto"
          style={{
            background: "var(--color-surface)",
            borderLeft: "1px solid var(--color-border)",
          }}
        >
          {/* Header */}
          <div
            className="flex items-center justify-between px-4 h-10 border-b shrink-0"
            style={{ borderColor: "var(--color-border)" }}
          >
            <span
              className="text-xs"
              style={{ color: "var(--color-text-muted)" }}
            >
              {sidebarContent.type === "node" ? "Verse" : "Connection"}
            </span>
            <button
              onClick={() => setSidebarContent(null)}
              aria-label="Close panel"
              className="grid place-items-center h-9 w-9 -mr-1.5 sm:h-6 sm:w-6 sm:mr-0 rounded transition-colors cursor-pointer hover:bg-white/5"
              style={{ color: "var(--color-text-muted)" }}
            >
              <X className="w-4 h-4 sm:w-3.5 sm:h-3.5" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
            {sidebarContent.type === "node" && (
              <>
                <div className="flex items-center justify-between gap-2">
                  <span
                    className="text-xs font-mono"
                    style={{ color: "var(--color-text-secondary)" }}
                  >
                    {sidebarContent.verse.surahName}
                  </span>
                  <span
                    className="text-xs font-mono px-1.5 py-0.5 rounded border shrink-0"
                    style={{
                      color: "var(--color-gold)",
                      borderColor: "var(--color-gold)",
                      background: "rgba(201,168,76,0.08)",
                    }}
                  >
                    {sidebarContent.verse.ref}
                  </span>
                </div>

                <p
                  className="font-arabic text-right text-lg leading-loose"
                  style={{ color: "var(--color-text-primary)" }}
                >
                  {sidebarContent.verse.arabicText}
                </p>

                <p
                  className="text-sm leading-relaxed"
                  style={{ color: "var(--color-text-secondary)" }}
                >
                  {sidebarContent.verse.translation}
                </p>

                <TafsirSection key={sidebarContent.verse.ref} surah={sidebarContent.verse.surah} ayah={sidebarContent.verse.ayah} />

                <NotesSection key={`notes-${sidebarContent.verse.ref}`} verseRef={sidebarContent.verse.ref} />
              </>
            )}

            {sidebarContent.type === "edge" && (
              <>
                {/* Kind badge */}
                <span
                  className="inline-flex items-center text-xs px-2 py-0.5 rounded border"
                  style={{
                    color: KIND_COLOR[sidebarContent.kind],
                    borderColor: `${KIND_COLOR[sidebarContent.kind]}44`,
                    background: `${KIND_COLOR[sidebarContent.kind]}0f`,
                  }}
                >
                  {KIND_LABEL[sidebarContent.kind]}
                </span>

                {/* From verse */}
                <div
                  className="rounded-md border p-3 space-y-1"
                  style={{
                    background: "var(--color-surface-raised)",
                    borderColor: "var(--color-border)",
                  }}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs" style={{ color: "var(--color-text-muted)" }}>
                      {sidebarContent.fromVerse.surahName}
                    </span>
                    <span className="text-xs font-mono" style={{ color: "var(--color-text-muted)" }}>
                      {sidebarContent.fromVerse.ref}
                    </span>
                  </div>
                  <p className="text-xs leading-relaxed" style={{ color: "var(--color-text-secondary)" }}>
                    {sidebarContent.fromVerse.translation.length > 100
                      ? `${sidebarContent.fromVerse.translation.slice(0, 100)}…`
                      : sidebarContent.fromVerse.translation}
                  </p>
                </div>

                {/* Reason */}
                <div
                  className="rounded-md border p-3"
                  style={{
                    background: "var(--color-surface-raised)",
                    borderColor: "var(--color-border)",
                  }}
                >
                  <p className="text-xs mb-1.5" style={{ color: "var(--color-text-muted)" }}>
                    Why connected
                  </p>
                  <p className="text-xs leading-relaxed" style={{ color: "var(--color-text-primary)" }}>
                    {sidebarContent.reason}
                  </p>
                </div>

                {/* To verse */}
                <div
                  className="rounded-md border p-3 space-y-2"
                  style={{
                    background: "var(--color-surface-raised)",
                    borderColor: "var(--color-border)",
                  }}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs" style={{ color: "var(--color-text-muted)" }}>
                      {sidebarContent.toVerse.surahName}
                    </span>
                    <span className="text-xs font-mono" style={{ color: "var(--color-text-muted)" }}>
                      {sidebarContent.toVerse.ref}
                    </span>
                  </div>
                  <p className="font-arabic text-right text-sm leading-loose" style={{ color: "var(--color-text-primary)" }}>
                    {sidebarContent.toVerse.arabicText}
                  </p>
                  <p className="text-xs leading-relaxed" style={{ color: "var(--color-text-secondary)" }}>
                    {sidebarContent.toVerse.translation.length > 100
                      ? `${sidebarContent.toVerse.translation.slice(0, 100)}…`
                      : sidebarContent.toVerse.translation}
                  </p>
                </div>
              </>
            )}
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}
