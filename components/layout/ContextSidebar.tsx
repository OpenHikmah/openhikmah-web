"use client";

import {
  X,
  ChevronDown,
  ChevronRight,
  ChevronLeft,
  ArrowLeft,
  BookOpen,
  Sparkle,
  Volume2,
  Heart,
} from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import type { Edge, Node } from "@xyflow/react";
import { useCanvasStore, connectionsOf } from "@/store/canvas";
import { useAuthStore } from "@/store/auth";
import { useAudioStore } from "@/store/audio";
import { useState, useEffect, useLayoutEffect, useRef, useSyncExternalStore } from "react";
import { useSidebarResize } from "@/hooks/useSidebarResize";
import type { EdgeKind, Verse } from "@/types/quran";
import { Card, IconButton, Tooltip } from "@/components/ui";
import { cn } from "@/lib/utils";
import { InteractiveArabic } from "@/components/morphology/InteractiveArabic";
import type { TafsirBlock } from "@/lib/quran/tafsir";
import { authFetch } from "@/lib/auth/auth-fetch";

const DESKTOP_QUERY = "(min-width: 640px)";

function subscribeToDesktopQuery(onChange: () => void) {
  const mql = window.matchMedia(DESKTOP_QUERY);
  mql.addEventListener("change", onChange);
  return () => mql.removeEventListener("change", onChange);
}

function getIsDesktop() {
  return window.matchMedia(DESKTOP_QUERY).matches;
}

function TafsirSection({ surah, ayah }: { surah: number; ayah: number }) {
  const t = useTranslations("canvas.contextSidebar");
  const [open, setOpen] = useState(false);
  const [blocks, setBlocks] = useState<TafsirBlock[] | null>(null);
  const [loading, setLoading] = useState(false);

  const handleOpen = async () => {
    if (open) {
      setOpen(false);
      return;
    }
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
        <span className="text-xs font-medium">{t("tafsirTitle")}</span>
        {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
      </button>
      {open && (
        <div className="space-y-2 px-3 pb-3">
          {loading ? (
            <p className="text-xs text-text-muted">{t("loading")}</p>
          ) : !blocks?.length ? (
            <p className="text-xs text-text-muted">{t("tafsirUnavailable")}</p>
          ) : (
            blocks.map((b, i) =>
              b.arabic ? (
                <p
                  lang="ar"
                  key={i}
                  dir="rtl"
                  className="font-arabic text-right text-sm leading-loose text-text-primary"
                >
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
  const t = useTranslations("canvas.contextSidebar");
  const accessToken = useAuthStore((s) => s.accessToken);
  const [open, setOpen] = useState(false);
  const [notes, setNotes] = useState<{ id: number; note: string; createdAt: string }[]>([]);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const [deleteErrorId, setDeleteErrorId] = useState<number | null>(null);
  const [loaded, setLoaded] = useState(false);
  const mountedRef = useRef(true);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const deleteTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // NotesSection unmounts whenever the sidebar closes or a different verse is
  // selected (it's keyed by verse ref) — clear any pending feedback-reset
  // timeout and stop setting state after that point.
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      if (deleteTimeoutRef.current) clearTimeout(deleteTimeoutRef.current);
    };
  }, []);

  useEffect(() => {
    if (!open || !accessToken || loaded) return;
    authFetch(`/api/notes?ref=${encodeURIComponent(verseRef)}`)
      .then((r) => {
        // A failed load must not look like "no notes" — leaving `loaded` false
        // lets the next open/token change retry instead of showing an empty list.
        if (!r.ok) throw new Error(`notes load returned ${r.status}`);
        return r.json();
      })
      .then((data) => {
        setNotes(data);
        setLoaded(true);
      })
      .catch((e) => console.error("sidebar: notes fetch failed", e));
  }, [open, verseRef, accessToken, loaded]);

  const save = async () => {
    if (!draft.trim() || !accessToken) return;
    setSaving(true);
    setSaveError(false);
    try {
      const res = await authFetch("/api/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ref: verseRef, note: draft.trim() }),
      });
      if (!mountedRef.current) return;
      if (res.ok) {
        const created = await res.json();
        setNotes((prev) => [...prev, created]);
        setDraft("");
      } else {
        setSaveError(true);
        if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = setTimeout(() => {
          if (mountedRef.current) setSaveError(false);
        }, 3000);
      }
    } catch {
      if (!mountedRef.current) return;
      setSaveError(true);
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = setTimeout(() => {
        if (mountedRef.current) setSaveError(false);
      }, 3000);
    } finally {
      if (mountedRef.current) setSaving(false);
    }
  };

  const remove = async (id: number) => {
    if (!accessToken) return;
    if (deleteTimeoutRef.current) clearTimeout(deleteTimeoutRef.current);
    setDeleteErrorId(null);
    try {
      const res = await authFetch(`/api/notes/${id}`, {
        method: "DELETE",
      });
      if (!mountedRef.current) return;
      if (res.ok) {
        setNotes((prev) => prev.filter((n) => n.id !== id));
      } else {
        setDeleteErrorId(id);
        // Two deletes can settle out of order: clear any timer a differently-
        // ordered earlier delete already scheduled, so it can't fire and wipe
        // this error before its own 3s window elapses.
        if (deleteTimeoutRef.current) clearTimeout(deleteTimeoutRef.current);
        deleteTimeoutRef.current = setTimeout(() => {
          if (mountedRef.current) setDeleteErrorId(null);
        }, 3000);
      }
    } catch (e) {
      console.error("sidebar: note delete failed", e);
      if (!mountedRef.current) return;
      setDeleteErrorId(id);
      if (deleteTimeoutRef.current) clearTimeout(deleteTimeoutRef.current);
      deleteTimeoutRef.current = setTimeout(() => {
        if (mountedRef.current) setDeleteErrorId(null);
      }, 3000);
    }
  };

  return (
    <Card variant="raised" className="rounded-md">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full cursor-pointer items-center justify-between px-3 py-2 text-text-secondary"
      >
        <span className="text-xs font-medium">{t("myNotes")}</span>
        {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
      </button>

      {open && (
        <div className="space-y-2 px-3 pb-3">
          {!accessToken ? (
            <p className="text-xs text-text-muted">{t("signInForNotes")}</p>
          ) : (
            <>
              {notes.map((n) => (
                <div key={n.id} className="flex items-start gap-2 rounded border border-border p-2">
                  <p className="flex-1 text-xs leading-relaxed text-text-secondary">{n.note}</p>
                  {deleteErrorId === n.id && (
                    <span className="shrink-0 text-xs text-error">{t("deleteFailed")}</span>
                  )}
                  <button
                    onClick={() => remove(n.id)}
                    aria-label={t("deleteNote")}
                    className={`shrink-0 cursor-pointer transition-colors hover:text-text-secondary ${
                      deleteErrorId === n.id ? "text-error" : "text-text-muted"
                    }`}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder={t("addNotePlaceholder")}
                aria-label={t("addNotePlaceholder")}
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
                {saving ? t("saving") : saveError ? t("saveFailedRetry") : t("save")}
              </button>
            </>
          )}
        </div>
      )}
    </Card>
  );
}

function SimilarSection({ surah, ayah }: { surah: number; ayah: number }) {
  const t = useTranslations("canvas.contextSidebar");
  const [open, setOpen] = useState(false);
  const [refs, setRefs] = useState<string[] | null>(null);
  const [loading, setLoading] = useState(false);

  const handleOpen = async () => {
    if (open) {
      setOpen(false);
      return;
    }
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
        <span className="text-xs font-medium">{t("similarVerses")}</span>
        {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
      </button>
      {open && (
        <div className="px-3 pb-3">
          {loading ? (
            <p className="text-xs text-text-muted">{t("loading")}</p>
          ) : !refs?.length ? (
            <p className="text-xs text-text-muted">{t("noneFound")}</p>
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

const KIND_COLOR: Record<EdgeKind, string> = {
  thematic: "var(--color-teal-bright)",
  root: "var(--color-gold)",
  contrast: "var(--color-contrast-edge)",
};
const KIND_GLYPH: Record<EdgeKind, string> = { thematic: "◈", root: "ع", contrast: "↔" };
const KIND_LABEL_KEY = {
  thematic: "edgeKindThematic",
  root: "edgeKindRoot",
  contrast: "edgeKindContrast",
} as const;

const edgeKind = (e: Edge): EdgeKind => (e.data as { kind?: EdgeKind })?.kind ?? "thematic";
const edgeReason = (e: Edge): string => {
  const d = e.data as { reason?: string; label?: string } | undefined;
  return d?.reason || d?.label || "";
};
const verseOf = (n: Node | undefined) => n?.data as unknown as Verse | undefined;

function KindChip({ kind, count }: { kind: EdgeKind; count?: number }) {
  const t = useTranslations("canvas.contextSidebar");
  const color = KIND_COLOR[kind];
  const zero = count === 0;
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 font-mono text-[11px] whitespace-nowrap"
      style={
        zero
          ? undefined
          : {
              color,
              borderColor: `color-mix(in srgb, ${color} 35%, transparent)`,
              background: `color-mix(in srgb, ${color} 8%, transparent)`,
            }
      }
    >
      <span className={cn(zero && "text-text-muted")}>
        {KIND_GLYPH[kind]} {t(KIND_LABEL_KEY[kind])}
        {count !== undefined && ` ${count}`}
      </span>
    </span>
  );
}

/** AI-written text is always set apart from scripture: teal box, sparkle mark.
 *  `preview` shows one line first, with a toggle when the text runs longer. */
function AiNote({ text, preview }: { text: string; preview?: boolean }) {
  const t = useTranslations("canvas.contextSidebar");
  const textRef = useRef<HTMLParagraphElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [overflows, setOverflows] = useState(false);
  const clamped = preview && !expanded;

  useLayoutEffect(() => {
    if (!clamped) return;
    const el = textRef.current;
    if (!el) return;
    // A panel resize can push a fitting line into overflow, so re-measure.
    const measure = () => setOverflows(el.scrollHeight - el.clientHeight > 1);
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [clamped, text]);

  return (
    <div
      className={cn(
        "flex items-start gap-2.5 rounded-[10px] border border-teal/40 bg-teal/[0.07]",
        preview ? "px-3 py-2" : "px-3.5 py-3"
      )}
    >
      <Tooltip label={t("aiExplanation")}>
        <span
          tabIndex={0}
          role="img"
          aria-label={t("aiExplanation")}
          className="mt-px grid size-[22px] shrink-0 place-items-center rounded-md bg-teal/20 text-teal-bright"
        >
          <Sparkle className="size-3" />
        </span>
      </Tooltip>
      <p
        ref={textRef}
        className={cn(
          "min-w-0 flex-1 leading-relaxed text-text-primary",
          preview ? "text-[13px]" : "text-[13.5px]",
          clamped && "line-clamp-1"
        )}
      >
        {text}
      </p>
      {preview && (expanded || overflows) && (
        <button
          type="button"
          aria-expanded={expanded}
          onClick={(e) => {
            // The connection card around this note opens the pair view on click.
            e.stopPropagation();
            setExpanded((v) => !v);
          }}
          className="mt-px shrink-0 rounded px-1 text-xs font-medium text-teal-bright transition-colors hover:bg-teal/10"
        >
          {expanded ? t("showLessExplanation") : t("showFullExplanation")}
        </button>
      )}
    </div>
  );
}

function VerseActions({ verse }: { verse: Verse }) {
  const t = useTranslations("canvas");
  const tCommon = useTranslations("common");
  const isBookmarked = useAuthStore((s) => s.isBookmarked(verse.ref));
  const toggleBookmark = useAuthStore((s) => s.toggleBookmark);
  const playVerse = useAudioStore((s) => s.playVerse);
  const currentRef = useAudioStore((s) => s.currentRef);
  const isPlaying = useAudioStore((s) => s.isPlaying);
  const pause = useAudioStore((s) => s.pause);
  const resume = useAudioStore((s) => s.resume);
  const isThisPlaying = currentRef === verse.ref && isPlaying;
  return (
    <div className="flex gap-1.5">
      <Tooltip label={isThisPlaying ? t("pauseRecitation") : t("playRecitation")}>
        <IconButton
          size="xs"
          tone="teal"
          aria-label={isThisPlaying ? t("pauseRecitation") : t("playRecitation")}
          className={cn(currentRef === verse.ref && "border-teal text-teal")}
          onClick={() => {
            if (isThisPlaying) pause();
            else if (currentRef === verse.ref) resume();
            else
              playVerse({
                ref: verse.ref,
                surah: verse.surah,
                ayah: verse.ayah,
                surahName: verse.surahName,
              });
          }}
        >
          <Volume2 />
        </IconButton>
      </Tooltip>
      <Tooltip label={isBookmarked ? tCommon("removeBookmark") : tCommon("bookmarkVerse")}>
        <IconButton
          size="xs"
          tone="gold"
          aria-label={isBookmarked ? tCommon("removeBookmark") : tCommon("bookmarkVerse")}
          className={cn(isBookmarked && "border-gold-muted text-gold")}
          onClick={() => toggleBookmark(verse.ref)}
        >
          <Heart fill={isBookmarked ? "currentColor" : "none"} />
        </IconButton>
      </Tooltip>
    </div>
  );
}

/** One verse, translation first. `interactive` adds word-by-word Arabic morphology. */
function VerseBlock({
  verse,
  role,
  interactive,
}: {
  verse: Verse;
  role?: string;
  interactive?: boolean;
}) {
  return (
    <div className="relative flex flex-col gap-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={cn(
            "rounded border px-1.5 py-0.5 font-mono text-xs",
            verse.isRoot ? "border-gold bg-gold/10 text-gold" : "border-border text-text-muted"
          )}
        >
          {verse.ref}
        </span>
        <span className="text-[13px] text-text-secondary">{verse.surahName}</span>
        {role && (
          <span className="ml-auto font-mono text-[10.5px] tracking-[0.14em] text-text-muted uppercase">
            {role}
          </span>
        )}
      </div>
      <p className="max-w-[62ch] text-[15px] leading-[1.6] text-text-primary">
        {verse.translation}
      </p>
      {interactive ? (
        <InteractiveArabic key={`arabic-${verse.ref}`} verse={verse} />
      ) : (
        <p
          lang="ar"
          dir="rtl"
          className="text-right font-arabic text-lg leading-loose text-text-secondary"
        >
          {verse.arabicText}
        </p>
      )}
      <VerseActions verse={verse} />
    </div>
  );
}

function AiFootnote() {
  const t = useTranslations("canvas.contextSidebar");
  return (
    <p className="text-[11.5px] leading-relaxed text-text-muted">
      <span className="mr-1 inline-grid size-4 place-items-center rounded bg-teal/20 align-[-3px] text-teal-bright">
        <Sparkle className="size-2.5" />
      </span>
      {t("aiFootnote")}
    </p>
  );
}

function VerseSections({ verse }: { verse: Verse }) {
  return (
    <div className="flex flex-col gap-2">
      <TafsirSection key={`tafsir-${verse.ref}`} surah={verse.surah} ayah={verse.ayah} />
      <NotesSection key={`notes-${verse.ref}`} verseRef={verse.ref} />
      <SimilarSection key={`similar-${verse.ref}`} surah={verse.surah} ayah={verse.ayah} />
    </div>
  );
}

/** A verse and, below it, every connected verse with the reason they connect. */
function ThreadView({ nodeId }: { nodeId: string }) {
  const t = useTranslations("canvas.contextSidebar");
  const nodes = useCanvasStore((s) => s.nodes);
  const edges = useCanvasStore((s) => s.edges);
  const setSidebarContent = useCanvasStore((s) => s.setSidebarContent);
  const setHoveredEdge = useCanvasStore((s) => s.setHoveredEdge);
  const verse = verseOf(nodes.find((n) => n.id === nodeId));
  if (!verse) return null;
  const list = connectionsOf(edges, nodeId);
  const counts: Record<EdgeKind, number> = { thematic: 0, root: 0, contrast: 0 };
  list.forEach((e) => counts[edgeKind(e)]++);
  const refOf = (id: string) => verseOf(nodes.find((n) => n.id === id))?.ref ?? "";

  return (
    <>
      <VerseBlock verse={verse} interactive />
      {list.length > 0 && (
        <>
          <div className="flex flex-wrap items-center gap-2 border-t border-border-subtle pt-4">
            <h3 className="mr-auto text-[13px] font-medium text-text-primary">
              {t("connectedVerses", { count: list.length })}
            </h3>
            {(Object.keys(counts) as EdgeKind[]).map((k) => (
              <KindChip key={k} kind={k} count={counts[k]} />
            ))}
          </div>
          <div onMouseLeave={() => setHoveredEdge(null)} className="flex flex-col gap-3">
            {list.map((e) => {
              const otherId = e.source === nodeId ? e.target : e.source;
              const other = verseOf(nodes.find((n) => n.id === otherId));
              if (!other) return null;
              const open = () =>
                setSidebarContent({ type: "edge", edgeId: e.id, contextNodeId: nodeId });
              return (
                <article
                  key={e.id}
                  role="button"
                  tabIndex={0}
                  aria-label={t("connectionAria", { from: refOf(e.source), to: refOf(e.target) })}
                  onMouseEnter={() => setHoveredEdge(e.id)}
                  onFocus={() => setHoveredEdge(e.id)}
                  onClick={open}
                  onKeyDown={(ev) => {
                    if (ev.target !== ev.currentTarget) return;
                    if (ev.key === "Enter" || ev.key === " ") {
                      ev.preventDefault();
                      open();
                    }
                  }}
                  className="flex cursor-pointer flex-col gap-2.5 rounded-[10px] border border-border bg-surface-raised p-3.5 transition-colors hover:border-teal/50 focus-visible:border-teal/50"
                >
                  <div className="flex flex-wrap items-center gap-2 font-mono text-xs text-text-secondary">
                    <KindChip kind={edgeKind(e)} />
                    <span>{refOf(e.source)}</span>
                    <span className="text-text-muted">→</span>
                    <span className="font-medium text-text-primary">{refOf(e.target)}</span>
                    <span>{other.surahName}</span>
                  </div>
                  <p className="text-sm leading-[1.6] text-text-primary">{other.translation}</p>
                  <p
                    lang="ar"
                    dir="rtl"
                    className="text-right font-arabic text-base leading-loose text-text-secondary"
                  >
                    {other.arabicText}
                  </p>
                  <AiNote text={edgeReason(e)} preview />
                  <span className="inline-flex items-center gap-1.5 self-end rounded-md px-1.5 py-1 text-xs font-medium text-teal-bright">
                    <BookOpen className="size-3.5" />
                    {t("readSideBySide")}
                  </span>
                </article>
              );
            })}
          </div>
        </>
      )}
      <VerseSections verse={verse} />
      {list.length > 0 && <AiFootnote />}
    </>
  );
}

/** Both verses of one connection in full, with the reason between them. */
function ConnectionView({ edgeId, contextNodeId }: { edgeId: string; contextNodeId: string }) {
  const t = useTranslations("canvas.contextSidebar");
  const nodes = useCanvasStore((s) => s.nodes);
  const edges = useCanvasStore((s) => s.edges);
  const setSidebarContent = useCanvasStore((s) => s.setSidebarContent);
  const edge = edges.find((e) => e.id === edgeId);
  const from = verseOf(nodes.find((n) => n.id === edge?.source));
  const to = verseOf(nodes.find((n) => n.id === edge?.target));
  const context = verseOf(nodes.find((n) => n.id === contextNodeId));
  if (!edge || !from || !to) return null;
  const kind = edgeKind(edge);
  const color = KIND_COLOR[kind];

  return (
    <>
      <div className="relative flex flex-col gap-4 pl-6">
        <span
          aria-hidden="true"
          className="absolute top-3 bottom-3 left-[5px] w-0.5 rounded-full"
          style={{ background: `color-mix(in srgb, ${color} 45%, transparent)` }}
        />
        {[{ verse: from, role: t("source") }, null, { verse: to, role: t("connected") }].map(
          (item, i) =>
            item ? (
              <div key={i} className="relative">
                <span
                  aria-hidden="true"
                  className="absolute top-1.5 -left-6 size-3 rounded-full border-2 bg-surface"
                  style={{ borderColor: color }}
                />
                <VerseBlock verse={item.verse} role={item.role} />
              </div>
            ) : (
              <AiNote key={i} text={edgeReason(edge)} />
            )
        )}
      </div>
      {context && (
        <button
          type="button"
          onClick={() => setSidebarContent({ type: "node", nodeId: contextNodeId })}
          className="inline-flex items-center gap-1.5 self-start rounded-md px-1.5 py-1 text-[12.5px] font-medium text-teal-bright transition-colors hover:bg-teal/10"
        >
          <ArrowLeft className="size-3.5" />
          {t("allConnectionsOf", { ref: context.ref })}
        </button>
      )}
      <AiFootnote />
    </>
  );
}

export function ContextSidebar() {
  const t = useTranslations("canvas.contextSidebar");
  const sidebarContent = useCanvasStore((s) => s.sidebarContent);
  const setSidebarContent = useCanvasStore((s) => s.setSidebarContent);
  const nodes = useCanvasStore((s) => s.nodes);
  const edges = useCanvasStore((s) => s.edges);
  const { width, onHandlePointerDown, isResizing } = useSidebarResize();

  // Server snapshot is `false` so first paint never mismatches hydration.
  const isDesktop = useSyncExternalStore(subscribeToDesktopQuery, getIsDesktop, () => false);

  // The panel stays mounted and keeps showing its last content while it slides
  // (or, docked, narrows) closed; `inert` takes it out of reach once closed.
  const lastSidebarContent = useCanvasStore((s) => s.lastSidebarContent);
  const open = sidebarContent !== null;
  const renderedContent = sidebarContent ?? lastSidebarContent;

  // Close when what the panel shows leaves the canvas (Clear, delete).
  const missing =
    sidebarContent?.type === "node"
      ? !nodes.some((n) => n.id === sidebarContent.nodeId)
      : sidebarContent?.type === "edge"
        ? !edges.some((e) => e.id === sidebarContent.edgeId)
        : false;
  useEffect(() => {
    if (missing) setSidebarContent(null);
  }, [missing, setSidebarContent]);

  const list =
    renderedContent?.type === "edge" ? connectionsOf(edges, renderedContent.contextNodeId) : [];
  const index =
    renderedContent?.type === "edge" ? list.findIndex((e) => e.id === renderedContent.edgeId) : -1;
  const step = (dir: number) => {
    if (renderedContent?.type !== "edge") return;
    const next = list[index + dir];
    if (next) setSidebarContent({ ...renderedContent, edgeId: next.id });
  };
  const stepRef = useRef(step);
  useEffect(() => {
    stepRef.current = step;
  });

  // ← / → step through a verse's connections while the connection view is open.
  const isEdgeView = sidebarContent?.type === "edge";
  useEffect(() => {
    if (!isEdgeView) return;
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target.isContentEditable
      ) {
        return;
      }
      if (e.key === "ArrowLeft") stepRef.current(-1);
      if (e.key === "ArrowRight") stepRef.current(1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isEdgeView]);

  if (!renderedContent) return null;

  const nodeVerse =
    renderedContent.type === "node"
      ? verseOf(nodes.find((n) => n.id === renderedContent.nodeId))
      : undefined;
  const edge =
    renderedContent.type === "edge"
      ? edges.find((e) => e.id === renderedContent.edgeId)
      : undefined;
  const eyebrow =
    renderedContent.type === "node"
      ? nodeVerse?.isRoot
        ? t("startingVerse")
        : t("verseHeader")
      : edge
        ? `${KIND_GLYPH[edgeKind(edge)]} ${t("kindConnection", { kind: t(KIND_LABEL_KEY[edgeKind(edge)]) })}`
        : t("connectionHeader");

  return (
    <aside
      aria-label={t("panelLabel")}
      aria-hidden={!open}
      inert={!open}
      style={isDesktop ? { width: open ? width : 0 } : undefined}
      className={cn(
        "pointer-events-auto z-40 flex h-full flex-col overflow-hidden bg-surface",
        // Docked beside the canvas on desktop; a full-width sheet over it on phones.
        isDesktop
          ? cn(
              "relative shrink-0 border-border transition-[width] duration-200 ease-out",
              open && "border-l"
            )
          : cn(
              "absolute top-0 right-0 w-full border-l border-border transition-[transform,opacity,visibility] duration-150 ease-out",
              open ? "visible translate-x-0 opacity-100" : "invisible translate-x-full opacity-0"
            ),
        isResizing && "transition-none"
      )}
    >
      <div className="flex h-full flex-col" style={isDesktop ? { width } : undefined}>
        {isDesktop && (
          <div
            role="separator"
            aria-orientation="vertical"
            aria-label={t("resizePanel")}
            onPointerDown={onHandlePointerDown}
            className={`absolute top-0 left-0 z-10 h-full w-1.5 cursor-col-resize transition-colors ${
              isResizing ? "bg-gold-muted/60" : "hover:bg-gold-muted/40"
            }`}
          />
        )}
        <div className="flex h-11 shrink-0 items-center gap-2 border-b border-border pr-2 pl-4">
          <span className="min-w-0 flex-1 truncate font-mono text-[11px] tracking-[0.16em] text-text-muted uppercase">
            {eyebrow}
          </span>
          {renderedContent.type === "edge" && list.length > 1 && (
            <span className="flex items-center gap-0.5 font-mono text-[11.5px] text-text-secondary tabular-nums">
              <button
                type="button"
                onClick={() => step(-1)}
                disabled={index <= 0}
                aria-label={t("previousConnection")}
                className="grid size-7 place-items-center rounded text-text-secondary transition-colors hover:bg-white/5 disabled:opacity-35"
              >
                <ChevronLeft className="size-3.5" />
              </button>
              <span className="px-1">
                {t("connectionPosition", { current: index + 1, total: list.length })}
              </span>
              <button
                type="button"
                onClick={() => step(1)}
                disabled={index >= list.length - 1}
                aria-label={t("nextConnection")}
                className="grid size-7 place-items-center rounded text-text-secondary transition-colors hover:bg-white/5 disabled:opacity-35"
              >
                <ChevronRight className="size-3.5" />
              </button>
            </span>
          )}
          <button
            onClick={() => setSidebarContent(null)}
            aria-label={t("closePanel")}
            className="grid h-9 w-9 place-items-center rounded text-text-muted transition-colors hover:bg-white/5 sm:h-7 sm:w-7"
          >
            <X className="h-4 w-4 sm:h-3.5 sm:w-3.5" />
          </button>
        </div>

        <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-5 pt-5 pb-7">
          {renderedContent.type === "node" ? (
            <ThreadView nodeId={renderedContent.nodeId} />
          ) : (
            <ConnectionView
              edgeId={renderedContent.edgeId}
              contextNodeId={renderedContent.contextNodeId}
            />
          )}
        </div>
      </div>
    </aside>
  );
}
