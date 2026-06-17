"use client";

import { motion, AnimatePresence } from "framer-motion";
import { X, ChevronDown, ChevronRight } from "lucide-react";
import Link from "next/link";
import { useCanvasStore } from "@/store/canvas";
import { useAuthStore } from "@/store/auth";
import { useState, useEffect } from "react";
import type { EdgeKind } from "@/types/quran";
import { Card } from "@/components/ui";
import { InteractiveArabic } from "@/components/morphology/InteractiveArabic";
import type { TafsirBlock } from "@/lib/tafsir";

function TafsirSection({ surah, ayah }: { surah: number; ayah: number }) {
  const [open, setOpen] = useState(false);
  const [blocks, setBlocks] = useState<TafsirBlock[] | null>(null);
  const [loading, setLoading] = useState(false);

  const handleOpen = async () => {
    if (open) { setOpen(false); return; }
    setOpen(true);
    if (blocks !== null) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/verse/${surah}/${ayah}/tafsir`);
      const json: { blocks?: TafsirBlock[] } = res.ok ? await res.json() : {};
      setBlocks(json.blocks ?? []);
    } catch {
      setBlocks([]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card variant="raised" className="rounded-md">
      <button
        onClick={handleOpen}
        className="flex w-full cursor-pointer items-center justify-between px-3 py-2 text-text-secondary"
      >
        <span className="text-xs font-medium">Ibn Kathir Tafsir</span>
        {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
      </button>
      {open && (
        <div className="space-y-2 px-3 pb-3">
          {loading ? (
            <p className="text-xs text-text-muted">Loading…</p>
          ) : !blocks?.length ? (
            <p className="text-xs text-text-muted">Tafsir unavailable.</p>
          ) : (
            blocks.map((b, i) =>
              b.arabic ? (
                <p key={i} dir="rtl" className="font-arabic text-right text-sm leading-loose text-text-primary">
                  {b.text}
                </p>
              ) : (
                <p key={i} className="text-xs leading-relaxed text-text-secondary">
                  {b.text}
                </p>
              )
            )
          )}
        </div>
      )}
    </Card>
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
    <Card variant="raised" className="rounded-md">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full cursor-pointer items-center justify-between px-3 py-2 text-text-secondary"
      >
        <span className="text-xs font-medium">My Notes</span>
        {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
      </button>

      {open && (
        <div className="space-y-2 px-3 pb-3">
          {!accessToken ? (
            <p className="text-xs text-text-muted">Sign in to add private notes.</p>
          ) : (
            <>
              {notes.map((n) => (
                <div
                  key={n.id}
                  className="flex items-start gap-2 rounded border border-border p-2"
                >
                  <p className="flex-1 text-xs leading-relaxed text-text-secondary">{n.note}</p>
                  <button
                    onClick={() => remove(n.id)}
                    aria-label="Delete note"
                    className="shrink-0 cursor-pointer text-text-muted transition-colors hover:text-text-secondary"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Add a private note…"
                rows={2}
                className="w-full resize-none rounded border border-border bg-transparent px-2.5 py-2 text-xs text-text-primary transition-colors focus:border-gold-muted"
              />
              <button
                onClick={save}
                disabled={saving || !draft.trim()}
                className={`cursor-pointer rounded border px-2.5 py-1 text-xs transition-colors disabled:opacity-40 ${
                  saveError ? "border-error text-error" : "border-teal text-teal"
                }`}
              >
                {saving ? "Saving…" : saveError ? "Save failed — try again" : "Save"}
              </button>
            </>
          )}
        </div>
      )}
    </Card>
  );
}

function SimilarSection({ surah, ayah }: { surah: number; ayah: number }) {
  const [open, setOpen] = useState(false);
  const [refs, setRefs] = useState<string[] | null>(null);
  const [loading, setLoading] = useState(false);

  const handleOpen = async () => {
    if (open) { setOpen(false); return; }
    setOpen(true);
    if (refs !== null) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/verse/${surah}/${ayah}/similar`);
      const data: { verse: string }[] = res.ok ? await res.json() : [];
      setRefs(data.map((d) => d.verse));
    } catch {
      setRefs([]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card variant="raised" className="rounded-md">
      <button
        onClick={handleOpen}
        className="flex w-full cursor-pointer items-center justify-between px-3 py-2 text-text-secondary"
      >
        <span className="text-xs font-medium">Similar verses</span>
        {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
      </button>
      {open && (
        <div className="px-3 pb-3">
          {loading ? (
            <p className="text-xs text-text-muted">Loading…</p>
          ) : !refs?.length ? (
            <p className="text-xs text-text-muted">None found.</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {refs.map((ref) => (
                <Link
                  key={ref}
                  href={`/canvas?verse=${ref}`}
                  className="rounded border border-border px-2 py-0.5 font-mono text-xs text-text-secondary transition-colors hover:border-gold-muted hover:text-gold"
                >
                  {ref}
                </Link>
              ))}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

const KIND_LABEL: Record<EdgeKind, string> = {
  thematic: "Thematic",
  root: "Root word",
  contrast: "Contrast",
};

// Edge-kind accent as palette class sets (teal / gold / contrast), replacing the
// old inline colour-string + hex-alpha concatenation.
const KIND_BADGE: Record<EdgeKind, string> = {
  thematic: "text-teal border-teal/30 bg-teal/[0.06]",
  root: "text-gold border-gold/30 bg-gold/[0.06]",
  contrast: "text-contrast-edge border-contrast-edge/30 bg-contrast-edge/[0.06]",
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
          className="pointer-events-auto absolute top-0 right-0 z-40 flex h-full w-full flex-col border-l border-border bg-surface sm:w-72"
        >
          {/* Header */}
          <div className="flex h-10 shrink-0 items-center justify-between border-b border-border px-4">
            <span className="text-xs text-text-muted">
              {sidebarContent.type === "node" ? "Verse" : "Connection"}
            </span>
            <button
              onClick={() => setSidebarContent(null)}
              aria-label="Close panel"
              className="-mr-1.5 grid h-9 w-9 place-items-center rounded text-text-muted transition-colors hover:bg-white/5 sm:mr-0 sm:h-6 sm:w-6"
            >
              <X className="h-4 w-4 sm:h-3.5 sm:w-3.5" />
            </button>
          </div>

          <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
            {sidebarContent.type === "node" && (
              <>
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-xs text-text-secondary">
                    {sidebarContent.verse.surahName}
                  </span>
                  <span className="shrink-0 rounded border border-gold bg-gold/[0.08] px-1.5 py-0.5 font-mono text-xs text-gold">
                    {sidebarContent.verse.ref}
                  </span>
                </div>

                <InteractiveArabic key={`arabic-${sidebarContent.verse.ref}`} verse={sidebarContent.verse} />

                <p className="text-sm leading-relaxed text-text-secondary">
                  {sidebarContent.verse.translation}
                </p>

                <TafsirSection key={`tafsir-${sidebarContent.verse.ref}`} surah={sidebarContent.verse.surah} ayah={sidebarContent.verse.ayah} />

                <NotesSection key={`notes-${sidebarContent.verse.ref}`} verseRef={sidebarContent.verse.ref} />
                <SimilarSection key={`similar-${sidebarContent.verse.ref}`} surah={sidebarContent.verse.surah} ayah={sidebarContent.verse.ayah} />
              </>
            )}

            {sidebarContent.type === "edge" && (
              <>
                {/* Kind badge */}
                <span
                  className={`inline-flex items-center rounded border px-2 py-0.5 text-xs ${KIND_BADGE[sidebarContent.kind]}`}
                >
                  {KIND_LABEL[sidebarContent.kind]}
                </span>

                {/* From verse */}
                <Card variant="raised" className="space-y-1 rounded-md p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs text-text-muted">{sidebarContent.fromVerse.surahName}</span>
                    <span className="font-mono text-xs text-text-muted">{sidebarContent.fromVerse.ref}</span>
                  </div>
                  <p className="text-xs leading-relaxed text-text-secondary">
                    {sidebarContent.fromVerse.translation.length > 100
                      ? `${sidebarContent.fromVerse.translation.slice(0, 100)}…`
                      : sidebarContent.fromVerse.translation}
                  </p>
                </Card>

                {/* Reason */}
                <Card variant="raised" className="rounded-md p-3">
                  <p className="mb-1.5 text-xs text-text-muted">Why connected</p>
                  <p className="text-xs leading-relaxed text-text-primary">{sidebarContent.reason}</p>
                </Card>

                {/* To verse */}
                <Card variant="raised" className="space-y-2 rounded-md p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs text-text-muted">{sidebarContent.toVerse.surahName}</span>
                    <span className="font-mono text-xs text-text-muted">{sidebarContent.toVerse.ref}</span>
                  </div>
                  <p className="font-arabic text-right text-sm leading-loose text-text-primary">
                    {sidebarContent.toVerse.arabicText}
                  </p>
                  <p className="text-xs leading-relaxed text-text-secondary">
                    {sidebarContent.toVerse.translation.length > 100
                      ? `${sidebarContent.toVerse.translation.slice(0, 100)}…`
                      : sidebarContent.toVerse.translation}
                  </p>
                </Card>
              </>
            )}
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}
