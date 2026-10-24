"use client";

import { X, ChevronDown, ChevronRight, ChevronLeft, ArrowLeft, Volume2, Heart } from "lucide-react";
import { useTranslations } from "next-intl";
import type { Edge, Node } from "@xyflow/react";
import { useCanvasStore, connectionsOf } from "@/store/canvas";
import { useAuthStore } from "@/store/auth";
import { useAudioStore } from "@/store/audio";
import { usePreferencesStore } from "@/store/preferences";
import {
  useState,
  useEffect,
  useId,
  useRef,
  useSyncExternalStore,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { useSidebarResize } from "@/hooks/useSidebarResize";
import type { EdgeKind, Verse } from "@/types/quran";
import { IconButton, Tooltip } from "@/components/ui";
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

/** Loads on first view and keeps its text while the reader switches tabs. */
function TafsirPanel({ surah, ayah, active }: { surah: number; ayah: number; active: boolean }) {
  const t = useTranslations("canvas.contextSidebar");
  const [blocks, setBlocks] = useState<TafsirBlock[] | null>(null);

  useEffect(() => {
    if (!active || blocks !== null) return;
    let cancelled = false;
    fetch(`/api/verse/${surah}/${ayah}/tafsir`)
      .then(async (res) => {
        const json: { blocks?: TafsirBlock[] } = res.ok ? await res.json() : {};
        return json.blocks ?? [];
      })
      .catch((e) => {
        console.error("sidebar: tafsir fetch failed", e);
        return [];
      })
      .then((b) => {
        if (!cancelled) setBlocks(b);
      });
    return () => {
      cancelled = true;
    };
  }, [active, blocks, surah, ayah]);

  return (
    <div className="flex flex-col gap-3 px-5 pt-4 pb-6">
      <p className="font-mono text-[10.5px] tracking-[0.14em] text-text-muted uppercase">
        {t("tafsirSource")}
      </p>
      {blocks === null ? (
        <p className="text-xs text-text-muted">{t("loading")}</p>
      ) : !blocks.length ? (
        <p className="text-xs text-text-muted">{t("tafsirUnavailable")}</p>
      ) : (
        blocks.map((b, i) =>
          b.arabic ? (
            <p
              lang="ar"
              key={i}
              dir="rtl"
              className="text-right font-arabic text-base leading-loose text-text-primary"
            >
              {b.text}
            </p>
          ) : (
            <p key={i} className="text-[12.5px] leading-relaxed text-text-secondary">
              {b.text}
            </p>
          )
        )
      )}
    </div>
  );
}

function NotesPanel({ verseRef, active }: { verseRef: string; active: boolean }) {
  const t = useTranslations("canvas.contextSidebar");
  const accessToken = useAuthStore((s) => s.accessToken);
  const [notes, setNotes] = useState<{ id: number; note: string; createdAt: string }[]>([]);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const [deleteErrorId, setDeleteErrorId] = useState<number | null>(null);
  const [loaded, setLoaded] = useState(false);
  const mountedRef = useRef(true);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const deleteTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // NotesPanel unmounts whenever the sidebar shows a different verse (it's
  // keyed by verse ref) — clear any pending feedback-reset timeout and stop
  // setting state after that point.
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      if (deleteTimeoutRef.current) clearTimeout(deleteTimeoutRef.current);
    };
  }, []);

  useEffect(() => {
    if (!active || !accessToken || loaded) return;
    authFetch(`/api/notes?ref=${encodeURIComponent(verseRef)}`)
      .then((r) => {
        // A failed load must not look like "no notes" — leaving `loaded` false
        // lets the next visit to the tab or a token change retry instead of
        // showing an empty list.
        if (!r.ok) throw new Error(`notes load returned ${r.status}`);
        return r.json();
      })
      .then((data) => {
        setNotes(data);
        setLoaded(true);
      })
      .catch((e) => console.error("sidebar: notes fetch failed", e));
  }, [active, verseRef, accessToken, loaded]);

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
    <div className="flex flex-col gap-2.5 px-5 pt-4 pb-6">
      {!accessToken ? (
        <p className="text-[12px] text-text-muted">{t("signInForNotes")}</p>
      ) : (
        <>
          {notes.map((n) => (
            <div
              key={n.id}
              className="flex items-start gap-2 rounded-md border border-border p-2.5"
            >
              <p className="flex-1 text-[12px] leading-relaxed text-text-secondary">{n.note}</p>
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
            rows={3}
            className="w-full resize-none rounded-lg border border-border bg-transparent px-3 py-2.5 text-[12px] text-text-primary transition-colors focus:border-gold-muted"
          />
          <button
            onClick={save}
            disabled={saving || !draft.trim()}
            className={`cursor-pointer self-start rounded-md border px-3 py-1.5 text-[12px] font-medium transition-colors disabled:opacity-40 ${
              saveError ? "border-error text-error" : "border-teal/55 text-teal-bright"
            }`}
          >
            {saving ? t("saving") : saveError ? t("saveFailedRetry") : t("save")}
          </button>
        </>
      )}
    </div>
  );
}

const KIND_ORDER: EdgeKind[] = ["thematic", "root", "contrast"];
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
// The canvas legend's words, so the panel and the legend name each kind the same way.
const KIND_SHORT_KEY = {
  thematic: "legendTheme",
  root: "legendRoot",
  contrast: "legendContrast",
} as const;

const edgeKind = (e: Edge): EdgeKind => (e.data as { kind?: EdgeKind })?.kind ?? "thematic";
const edgeReason = (e: Edge): string => {
  const d = e.data as { reason?: string; label?: string } | undefined;
  return d?.reason || d?.label || "";
};
const verseOf = (n: Node | undefined) => n?.data as unknown as Verse | undefined;
const kindsOf = (list: Edge[]) => KIND_ORDER.filter((k) => list.some((e) => edgeKind(e) === k));

type PanelTab = "connections" | "tafsir" | "notes";
type KindFilter = EdgeKind | "all";
const PANEL_TABS: PanelTab[] = ["connections", "tafsir", "notes"];
const TAB_LABEL_KEY = {
  connections: "tabConnections",
  tafsir: "tabTafsir",
  notes: "tabNotes",
} as const;

/** What the reader chose in a verse's thread view, kept while they read one of its pairs. */
interface ThreadUi {
  nodeId: string;
  tab: PanelTab;
  filter: KindFilter;
  /** The pair the reader just came back from, so its row can be brought into view. */
  returnEdgeId: string | null;
}
type ThreadUiPatch = Partial<Omit<ThreadUi, "nodeId">>;

const defaultThreadUi = (nodeId: string): ThreadUi => ({
  nodeId,
  tab: "connections",
  filter: "all",
  returnEdgeId: null,
});

/** A filter only applies while the verse still has that kind and more than one kind in all. */
function activeFilter(filter: KindFilter, list: Edge[]): KindFilter {
  const kinds = kindsOf(list);
  return filter !== "all" && kinds.length > 1 && kinds.includes(filter) ? filter : "all";
}

/** The kind of a connection, as a button that opens the AI's reason for it. */
function ReasonToggle({
  kind,
  label,
  expanded,
  controls,
  onToggle,
}: {
  kind: EdgeKind;
  label: string;
  expanded: boolean;
  controls: string;
  onToggle: () => void;
}) {
  const t = useTranslations("canvas.contextSidebar");
  return (
    <button
      type="button"
      aria-expanded={expanded}
      aria-controls={expanded ? controls : undefined}
      aria-label={t("whyConnected", { kind: label })}
      onClick={onToggle}
      style={{ color: KIND_COLOR[kind] }}
      className="group/why relative z-10 -mr-1.5 ml-auto inline-flex h-6 shrink-0 items-center gap-1.5 rounded-md pr-1.5 pl-[7px] font-mono text-[11px] font-medium transition-colors duration-[120ms] hover:bg-white/[0.06] aria-expanded:bg-white/[0.06]"
    >
      <span aria-hidden="true">{KIND_GLYPH[kind]}</span>
      {label}
      <ChevronDown
        aria-hidden="true"
        className={cn(
          "size-3 text-text-muted opacity-70 transition-[transform,opacity] duration-200 group-hover/why:opacity-100",
          expanded && "rotate-180 opacity-100"
        )}
      />
    </button>
  );
}

/** The kind of a connection with no stored reason to open. */
function KindLabel({ kind, label }: { kind: EdgeKind; label: string }) {
  return (
    <span
      style={{ color: KIND_COLOR[kind] }}
      className="ml-auto inline-flex shrink-0 items-center gap-1.5 font-mono text-[11px] font-medium"
    >
      <span aria-hidden="true">{KIND_GLYPH[kind]}</span>
      {label}
    </span>
  );
}

/** AI-written text is never styled as scripture: it sits below the verses, smaller and softer,
 *  inside a dashed edge, and names itself as a reflection rather than tafsir. */
function AiReflection({ id, text }: { id: string; text: string }) {
  const t = useTranslations("canvas.contextSidebar");
  return (
    <div
      id={id}
      className="relative z-10 flex max-w-[60ch] animate-[fadeIn_200ms_ease-out] flex-col gap-1.5 rounded-[9px] border border-dashed border-teal/45 px-3.5 py-3"
    >
      <div className="flex items-baseline gap-2.5">
        <Tooltip label={t("aiReflectionHint")}>
          <span
            tabIndex={0}
            className="rounded-sm font-mono text-[10px] font-medium tracking-[0.16em] text-teal-bright uppercase"
          >
            {t("aiReflection")}
          </span>
        </Tooltip>
        <span className="ml-auto font-mono text-[11px] text-text-muted">{t("notTafsir")}</span>
      </div>
      <p className="text-[12px] leading-[1.6] text-pretty text-text-primary/75">{text}</p>
    </div>
  );
}

function RefBadge({ verse }: { verse: Verse }) {
  return (
    <span
      className={cn(
        "shrink-0 rounded border px-1.5 py-0.5 font-mono text-xs whitespace-nowrap",
        verse.isRoot ? "border-gold bg-gold/10 text-gold" : "border-border text-text-muted"
      )}
    >
      {verse.ref}
    </span>
  );
}

function VerseActions({ verse, size = "sm" }: { verse: Verse; size?: "xs" | "sm" }) {
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
    <div className="flex shrink-0 gap-0.5">
      <Tooltip label={isThisPlaying ? t("pauseRecitation") : t("playRecitation")}>
        <IconButton
          size={size}
          tone="teal"
          aria-label={isThisPlaying ? t("pauseRecitation") : t("playRecitation")}
          className={cn("border-transparent", currentRef === verse.ref && "text-teal-bright")}
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
          size={size}
          tone="gold"
          aria-label={isBookmarked ? tCommon("removeBookmark") : tCommon("bookmarkVerse")}
          className={cn("border-transparent", isBookmarked && "text-gold")}
          onClick={() => toggleBookmark(verse.ref)}
        >
          <Heart fill={isBookmarked ? "currentColor" : "none"} />
        </IconButton>
      </Tooltip>
    </div>
  );
}

/** A verse and, under tabs, its connections, tafsir and notes. */
function ThreadView({
  nodeId,
  ui,
  onUi,
}: {
  nodeId: string;
  ui: ThreadUi;
  onUi: (patch: ThreadUiPatch) => void;
}) {
  const t = useTranslations("canvas.contextSidebar");
  const tCanvas = useTranslations("canvas");
  const nodes = useCanvasStore((s) => s.nodes);
  const edges = useCanvasStore((s) => s.edges);
  const setSidebarContent = useCanvasStore((s) => s.setSidebarContent);
  const setHoveredEdge = useCanvasStore((s) => s.setHoveredEdge);
  const showArabic = usePreferencesStore((s) => s.canvasPrefs.showArabic);
  const baseId = useId();
  const listRef = useRef<HTMLUListElement>(null);
  const tabRefs = useRef<Partial<Record<PanelTab, HTMLButtonElement | null>>>({});
  const [openReasons, setOpenReasons] = useState<ReadonlySet<string>>(() => new Set());

  // Back from a pair: bring its row into view and focus it, so the reader keeps their place.
  const returnEdgeId = ui.returnEdgeId;
  useEffect(() => {
    if (!returnEdgeId) return;
    const row = Array.from(
      listRef.current?.querySelectorAll<HTMLElement>("[data-edge-id]") ?? []
    ).find((el) => el.dataset.edgeId === returnEdgeId);
    row?.scrollIntoView({ block: "center" });
    row?.querySelector<HTMLButtonElement>(".open-pair")?.focus({ preventScroll: true });
  }, [returnEdgeId]);

  const verse = verseOf(nodes.find((n) => n.id === nodeId));
  if (!verse) return null;
  const all = connectionsOf(edges, nodeId);
  const kinds = kindsOf(all);
  const filter = activeFilter(ui.filter, all);
  const shown = filter === "all" ? all : all.filter((e) => edgeKind(e) === filter);

  const toggleReason = (id: string) =>
    setOpenReasons((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const selectTab = (tab: PanelTab) => onUi({ tab, returnEdgeId: null });
  const onTabKeyDown = (ev: ReactKeyboardEvent, index: number) => {
    const last = PANEL_TABS.length - 1;
    const target =
      ev.key === "ArrowRight"
        ? index === last
          ? 0
          : index + 1
        : ev.key === "ArrowLeft"
          ? index === 0
            ? last
            : index - 1
          : ev.key === "Home"
            ? 0
            : ev.key === "End"
              ? last
              : null;
    if (target === null) return;
    ev.preventDefault();
    selectTab(PANEL_TABS[target]);
    tabRefs.current[PANEL_TABS[target]]?.focus();
  };

  const tabId = (tab: PanelTab) => `${baseId}-tab-${tab}`;
  const panelId = (tab: PanelTab) => `${baseId}-panel-${tab}`;
  const panelProps = (tab: PanelTab) => ({
    role: "tabpanel" as const,
    id: panelId(tab),
    "aria-labelledby": tabId(tab),
    hidden: ui.tab !== tab,
  });

  return (
    <>
      <div className="flex flex-col gap-3 px-5 pt-5 pb-1.5">
        <p className="max-w-[62ch] text-[13.5px] leading-[1.7] text-pretty text-text-primary">
          {verse.translation}
        </p>
        <InteractiveArabic key={`arabic-${verse.ref}`} verse={verse} />
      </div>

      <div
        role="tablist"
        aria-label={t("verseTabs", { ref: verse.ref })}
        className="sticky top-0 z-20 mt-3 flex gap-0.5 border-b border-border bg-surface px-3"
      >
        {PANEL_TABS.map((tab, i) => {
          const selected = ui.tab === tab;
          return (
            <button
              key={tab}
              ref={(el) => {
                tabRefs.current[tab] = el;
              }}
              type="button"
              role="tab"
              id={tabId(tab)}
              aria-selected={selected}
              aria-controls={panelId(tab)}
              tabIndex={selected ? 0 : -1}
              onClick={() => selectTab(tab)}
              onKeyDown={(ev) => onTabKeyDown(ev, i)}
              className={cn(
                "relative inline-flex items-center gap-1.5 px-2 pt-[11px] pb-2.5 text-[12px] font-medium transition-colors duration-[120ms]",
                selected
                  ? "text-text-primary after:absolute after:inset-x-2 after:-bottom-px after:h-0.5 after:rounded-full after:bg-gold"
                  : "text-text-secondary hover:text-text-primary"
              )}
            >
              {t(TAB_LABEL_KEY[tab])}
              {tab === "connections" && " "}
              {tab === "connections" && (
                <span className="font-mono text-[11px] text-text-muted tabular-nums">
                  {all.length}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div {...panelProps("connections")}>
        {all.length === 0 ? (
          <p className="px-5 pt-4 pb-6 text-[12px] leading-relaxed text-text-muted">
            {t("noConnections", { action: tCanvas("findLinkedVerses") })}
          </p>
        ) : (
          <>
            {kinds.length > 1 && (
              <div
                role="group"
                aria-label={t("filterGroup")}
                className="flex flex-wrap gap-1.5 px-5 pt-3.5 pb-1.5"
              >
                {(["all", ...kinds] as KindFilter[]).map((k) => {
                  const count =
                    k === "all" ? all.length : all.filter((e) => edgeKind(e) === k).length;
                  return (
                    <button
                      key={k}
                      type="button"
                      aria-pressed={filter === k}
                      onClick={() => onUi({ filter: k, returnEdgeId: null })}
                      className="inline-flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 font-mono text-[11px] font-medium text-text-secondary transition-colors duration-[120ms] hover:text-text-primary aria-pressed:border-text-muted aria-pressed:bg-surface-raised aria-pressed:text-text-primary"
                    >
                      {k !== "all" && (
                        <span aria-hidden="true" style={{ color: KIND_COLOR[k] }}>
                          {KIND_GLYPH[k]}
                        </span>
                      )}
                      {k === "all" ? t("filterAll") : tCanvas(KIND_SHORT_KEY[k])} {count}
                    </button>
                  );
                })}
              </div>
            )}
            <ul
              ref={listRef}
              onMouseLeave={() => {
                setHoveredEdge(null);
                if (ui.returnEdgeId) onUi({ returnEdgeId: null });
              }}
              className="flex flex-col px-2 pt-1 pb-3"
            >
              {shown.map((e, i) => {
                const otherId = e.source === nodeId ? e.target : e.source;
                const other = verseOf(nodes.find((n) => n.id === otherId));
                if (!other) return null;
                const kind = edgeKind(e);
                const reason = edgeReason(e);
                const reasonOpen = openReasons.has(e.id);
                const reasonId = `${baseId}-reason-${e.id}`;
                const kindLabel = tCanvas(KIND_SHORT_KEY[kind]);
                return (
                  <li
                    key={e.id}
                    data-edge-id={e.id}
                    onMouseEnter={() => setHoveredEdge(e.id)}
                    className={cn(
                      "group relative flex flex-col gap-2 rounded-[10px] py-3.5 pr-[30px] pl-3 transition-colors duration-[120ms] hover:bg-surface-raised",
                      "has-[.open-pair:focus-visible]:bg-surface-raised has-[.open-pair:focus-visible]:outline-2 has-[.open-pair:focus-visible]:-outline-offset-2 has-[.open-pair:focus-visible]:outline-gold/70",
                      i > 0 &&
                        "before:absolute before:inset-x-3 before:top-0 before:h-px before:bg-border-subtle hover:before:opacity-0",
                      ui.returnEdgeId === e.id && "bg-surface-raised before:opacity-0"
                    )}
                  >
                    <div className="flex min-h-6 items-center gap-2">
                      {/* Its ::after covers the row, so a click anywhere but the kind opens the pair. */}
                      <button
                        type="button"
                        aria-label={t("readTogether", { from: verse.ref, to: other.ref })}
                        onClick={() =>
                          setSidebarContent({ type: "edge", edgeId: e.id, contextNodeId: nodeId })
                        }
                        onFocus={() => setHoveredEdge(e.id)}
                        className="open-pair flex min-w-0 items-center gap-2 font-mono text-xs text-text-secondary outline-none after:absolute after:inset-0 after:rounded-[10px]"
                      >
                        <span className="font-medium text-text-primary">{other.ref}</span>
                        <span className="truncate">{other.surahName}</span>
                      </button>
                      {reason ? (
                        <ReasonToggle
                          kind={kind}
                          label={kindLabel}
                          expanded={reasonOpen}
                          controls={reasonId}
                          onToggle={() => toggleReason(e.id)}
                        />
                      ) : (
                        <KindLabel kind={kind} label={kindLabel} />
                      )}
                    </div>
                    <p className="text-[13px] leading-[1.65] text-pretty text-text-primary">
                      {other.translation}
                    </p>
                    {showArabic && (
                      <p
                        lang="ar"
                        dir="rtl"
                        className="text-right font-arabic text-base leading-loose text-text-secondary"
                      >
                        {other.arabicText}
                      </p>
                    )}
                    {reasonOpen && <AiReflection id={reasonId} text={reason} />}
                    <ChevronRight
                      aria-hidden="true"
                      className="pointer-events-none absolute top-1/2 right-2.5 -mt-[7px] size-3.5 text-text-muted opacity-0 transition-[opacity,transform] duration-[120ms] group-hover:translate-x-0.5 group-hover:opacity-100 group-has-[.open-pair:focus-visible]:opacity-100"
                    />
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </div>
      <div {...panelProps("tafsir")}>
        <TafsirPanel
          key={`tafsir-${verse.ref}`}
          surah={verse.surah}
          ayah={verse.ayah}
          active={ui.tab === "tafsir"}
        />
      </div>
      <div {...panelProps("notes")}>
        <NotesPanel key={`notes-${verse.ref}`} verseRef={verse.ref} active={ui.tab === "notes"} />
      </div>
    </>
  );
}

/** One verse of a pair, in full. */
function PairVerse({ verse }: { verse: Verse }) {
  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-center gap-2">
        <RefBadge verse={verse} />
        <span className="min-w-0 flex-1 truncate text-[12px] text-text-secondary">
          {verse.surahName}
        </span>
        <VerseActions verse={verse} size="xs" />
      </div>
      <p className="max-w-[62ch] text-[13.5px] leading-[1.7] text-pretty text-text-primary">
        {verse.translation}
      </p>
      <p
        lang="ar"
        dir="rtl"
        className="text-right font-arabic text-lg leading-loose text-text-primary"
      >
        {verse.arabicText}
      </p>
    </div>
  );
}

/** Both verses of one connection, the one the reader came from first. The AI's reason waits
 *  under both, closed, so the reader meets the two verses before anyone's reading of them. */
function ConnectionView({
  edgeId,
  contextNodeId,
  list,
  index,
  onStep,
}: {
  edgeId: string;
  contextNodeId: string;
  list: Edge[];
  index: number;
  onStep: (dir: number) => void;
}) {
  const t = useTranslations("canvas.contextSidebar");
  const nodes = useCanvasStore((s) => s.nodes);
  const edges = useCanvasStore((s) => s.edges);
  const [reasonOpen, setReasonOpen] = useState(false);
  const reasonId = useId();
  const edge = edges.find((e) => e.id === edgeId);
  if (!edge) return null;
  const firstId =
    edge.source === contextNodeId || edge.target === contextNodeId ? contextNodeId : edge.source;
  const otherOf = (e: Edge) => (e.source === firstId ? e.target : e.source);
  const first = verseOf(nodes.find((n) => n.id === firstId));
  const second = verseOf(nodes.find((n) => n.id === otherOf(edge)));
  if (!first || !second) return null;
  const kind = edgeKind(edge);
  const reason = edgeReason(edge);
  const kindLabel = t("kindConnection", { kind: t(KIND_LABEL_KEY[kind]) });
  const refOfStep = (e: Edge | undefined) =>
    e && verseOf(nodes.find((n) => n.id === otherOf(e)))?.ref;
  const prevRef = refOfStep(list[index - 1]);
  const nextRef = refOfStep(list[index + 1]);

  return (
    <>
      <div className="flex flex-col gap-[18px] px-5 pt-5 pb-2">
        <PairVerse verse={first} />
        <div aria-hidden="true" className="h-px bg-border" />
        <PairVerse verse={second} />
        <div className="-mt-1 flex justify-end">
          {reason ? (
            <ReasonToggle
              kind={kind}
              label={kindLabel}
              expanded={reasonOpen}
              controls={reasonId}
              onToggle={() => setReasonOpen((v) => !v)}
            />
          ) : (
            <KindLabel kind={kind} label={kindLabel} />
          )}
        </div>
        {reasonOpen && <AiReflection id={reasonId} text={reason} />}
      </div>
      {list.length > 1 && (
        <div className="mx-5 mt-4 mb-6 flex gap-2">
          <button
            type="button"
            onClick={() => onStep(-1)}
            disabled={!prevRef}
            className="flex flex-1 items-center gap-2 rounded-[9px] border border-border px-3 py-2.5 text-left text-[12px] text-text-secondary transition-colors duration-[120ms] hover:bg-surface-raised hover:text-text-primary disabled:pointer-events-none disabled:opacity-35"
          >
            <ChevronLeft aria-hidden="true" className="size-3.5 shrink-0" />
            <span>
              {t("previous")}
              {prevRef && " "}
              {prevRef && (
                <span className="font-mono text-xs font-medium text-text-primary">{prevRef}</span>
              )}
            </span>
          </button>
          <button
            type="button"
            onClick={() => onStep(1)}
            disabled={!nextRef}
            className="flex flex-1 items-center justify-end gap-2 rounded-[9px] border border-border px-3 py-2.5 text-right text-[12px] text-text-secondary transition-colors duration-[120ms] hover:bg-surface-raised hover:text-text-primary disabled:pointer-events-none disabled:opacity-35"
          >
            <span>
              {t("next")}
              {nextRef && " "}
              {nextRef && (
                <span className="font-mono text-xs font-medium text-text-primary">{nextRef}</span>
              )}
            </span>
            <ChevronRight aria-hidden="true" className="size-3.5 shrink-0" />
          </button>
        </div>
      )}
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
  const [threadUi, setThreadUi] = useState<ThreadUi | null>(null);
  const uiFor = (nodeId: string) =>
    threadUi?.nodeId === nodeId ? threadUi : defaultThreadUi(nodeId);

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

  // Previous / Next walk the same list the reader picked from: the kind filter
  // holds, unless the pair shown is outside it (opened from the canvas).
  const contextList =
    renderedContent?.type === "edge" ? connectionsOf(edges, renderedContent.contextNodeId) : [];
  const contextFilter =
    renderedContent?.type === "edge"
      ? activeFilter(uiFor(renderedContent.contextNodeId).filter, contextList)
      : "all";
  const filteredList =
    contextFilter === "all"
      ? contextList
      : contextList.filter((e) => edgeKind(e) === contextFilter);
  const list =
    renderedContent?.type === "edge" && filteredList.some((e) => e.id === renderedContent.edgeId)
      ? filteredList
      : contextList;
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

  const goBack = () => {
    if (renderedContent?.type !== "edge") return;
    const { contextNodeId, edgeId } = renderedContent;
    setThreadUi({
      ...uiFor(contextNodeId),
      tab: "connections",
      filter: list === filteredList ? uiFor(contextNodeId).filter : "all",
      returnEdgeId: edgeId,
    });
    setSidebarContent({ type: "node", nodeId: contextNodeId });
  };

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
  const contextVerse =
    renderedContent.type === "edge"
      ? verseOf(nodes.find((n) => n.id === renderedContent.contextNodeId))
      : undefined;

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
            className={`absolute top-0 left-0 z-30 h-full w-1.5 cursor-col-resize transition-colors ${
              isResizing ? "bg-gold-muted/60" : "hover:bg-gold-muted/40"
            }`}
          />
        )}
        <div className="flex h-11 shrink-0 items-center gap-1 border-b border-border pr-2 pl-4">
          {renderedContent.type === "node" ? (
            nodeVerse && (
              <>
                <div className="flex min-w-0 flex-1 items-center gap-2">
                  <RefBadge verse={nodeVerse} />
                  <span className="truncate text-[12px] text-text-secondary">
                    {nodeVerse.surahName}
                  </span>
                </div>
                <VerseActions verse={nodeVerse} />
                <span aria-hidden="true" className="mx-1 h-4 w-px bg-border" />
              </>
            )
          ) : (
            <>
              {contextVerse && (
                <Tooltip label={t("allConnectionsOf", { ref: contextVerse.ref })}>
                  <button
                    type="button"
                    onClick={goBack}
                    aria-label={t("allConnectionsOf", { ref: contextVerse.ref })}
                    className="-ml-2 inline-flex h-[30px] items-center gap-1.5 rounded-md pr-2 pl-1.5 font-mono text-xs font-medium text-text-secondary transition-colors duration-[120ms] hover:bg-white/[0.06] hover:text-text-primary"
                  >
                    <ArrowLeft aria-hidden="true" className="size-3.5" />
                    {contextVerse.ref}
                  </button>
                </Tooltip>
              )}
              <span className="flex-1" />
              {list.length > 1 && (
                <>
                  <span className="flex items-center gap-0.5 font-mono text-[11px] text-text-secondary tabular-nums">
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
                  <span aria-hidden="true" className="mx-1 h-4 w-px bg-border" />
                </>
              )}
            </>
          )}
          <button
            onClick={() => setSidebarContent(null)}
            aria-label={t("closePanel")}
            className="ml-auto grid h-9 w-9 shrink-0 place-items-center rounded text-text-muted transition-colors hover:bg-white/5 sm:h-7 sm:w-7"
          >
            <X className="h-4 w-4 sm:h-3.5 sm:w-3.5" />
          </button>
        </div>

        {/* Keyed by what it shows, so every new verse or pair opens at the top. */}
        <div
          key={
            renderedContent.type === "edge"
              ? `edge:${renderedContent.edgeId}`
              : `node:${renderedContent.nodeId}`
          }
          className="flex-1 overflow-y-auto"
        >
          {renderedContent.type === "node" ? (
            <ThreadView
              nodeId={renderedContent.nodeId}
              ui={uiFor(renderedContent.nodeId)}
              onUi={(patch) => setThreadUi({ ...uiFor(renderedContent.nodeId), ...patch })}
            />
          ) : (
            <ConnectionView
              edgeId={renderedContent.edgeId}
              contextNodeId={renderedContent.contextNodeId}
              list={list}
              index={index}
              onStep={step}
            />
          )}
        </div>
      </div>
    </aside>
  );
}
