"use client";

import { useEffect, useCallback, useRef, useState } from "react";
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  Panel,
  useReactFlow,
  ReactFlowProvider,
  type Edge,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { X } from "lucide-react";
import { useTranslations } from "next-intl";
import { VerseNode, KIND_COLOR_VAR } from "./VerseNode";
import { PlaceholderNode } from "./PlaceholderNode";
import { HikmahEdge } from "./HikmahEdge";
import { CanvasLegend } from "./CanvasLegend";
import { CanvasToolbar } from "./CanvasToolbar";
import { CanvasViewControls } from "./CanvasViewControls";
import { useCanvasStore, selectFocus, isPlaceholderEdge, isPlaceholderNode } from "@/store/canvas";
import { usePreferencesStore, fallbackCardHeight } from "@/store/preferences";
import { useActivityTracker } from "@/hooks/useActivityTracker";
import { useCanvasPersistence } from "@/hooks/useCanvasPersistence";
import { buildConnectionEdge } from "@/lib/canvas/canvas-layout";
import { cn } from "@/lib/utils";
import type { ConnectionResult, EdgeKind, Verse } from "@/types/quran";

const nodeTypes = { verse: VerseNode, placeholder: PlaceholderNode };
const edgeTypes = { hikmah: HikmahEdge };

const KIND_GLYPH: Record<EdgeKind, string> = { thematic: "◈", root: "ع", contrast: "↔" };
const KINDS: EdgeKind[] = ["thematic", "root", "contrast"];
const PLACEHOLDER_COUNT = 3;
const STAGGER_MS = 350;
const NOTICE_MS = 6000;
const SUMMARY_NOTICE_MS = 10000;
const PANEL_TRANSITION_MS = 260;
const RELAYOUT_ANIMATION_MS = 450;

/** Signals a repeat "get more" expansion that genuinely has nothing further to
 *  give, so the catch block can show a distinct message instead of the generic
 *  fetch-failure one. */
class ExhaustedExpansionError extends Error {}

interface Notice {
  text: string;
  tone: "info" | "error";
  kind?: EdgeKind;
  actions?: { label: string; run: () => void }[];
}

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function CanvasInner({ onSearchOpen }: { onSearchOpen: () => void }) {
  const t = useTranslations("canvas");
  useActivityTracker();
  useCanvasPersistence();

  const reactFlow = useReactFlow();
  const expandingRef = useRef(false);
  const mountedRef = useRef(true);
  const noticeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [relayoutAnimating, setRelayoutAnimating] = useState(false);

  const showArabic = usePreferencesStore((s) => s.canvasPrefs.showArabic);

  const showNotice = useCallback((next: Notice, ms = NOTICE_MS, onExpire?: () => void) => {
    if (!mountedRef.current) return;
    setNotice(next);
    if (noticeTimeoutRef.current) clearTimeout(noticeTimeoutRef.current);
    noticeTimeoutRef.current = setTimeout(() => {
      if (!mountedRef.current) return;
      setNotice(null);
      onExpire?.();
    }, ms);
  }, []);

  const dismissNotice = useCallback(() => {
    if (noticeTimeoutRef.current) clearTimeout(noticeTimeoutRef.current);
    setNotice(null);
    const s = useCanvasStore.getState();
    s.setExpansionFocus(null);
    s.dismissClearUndo();
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (noticeTimeoutRef.current) clearTimeout(noticeTimeoutRef.current);
    };
  }, []);

  const fitNodes = useCallback(
    (ids: string[], delay = 0) => {
      setTimeout(() => {
        if (!mountedRef.current || ids.length === 0) return;
        reactFlow.fitView({
          nodes: ids.map((id) => ({ id })),
          padding: 0.2,
          maxZoom: 1,
          duration: 400,
        });
      }, delay);
    },
    [reactFlow]
  );

  // The mobile bottom bar (in Header, outside this ReactFlowProvider) can't call
  // useReactFlow() directly, so it asks for a fit via the store instead.
  const fitRequestToken = useCanvasStore((s) => s.fitRequestToken);
  useEffect(() => {
    if (fitRequestToken === 0) return;
    reactFlow.fitView({ padding: 0.35, maxZoom: 1, duration: 400 });
    // reactFlow's identity changes across renders; only fitRequestToken should retrigger this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitRequestToken]);

  // Bring whatever the reading panel shows into view, once the docked panel has
  // finished opening and the canvas has its new width.
  const sidebarKey = useCanvasStore((s) => {
    const c = s.sidebarContent;
    return !c ? "" : c.type === "node" ? `node:${c.nodeId}` : `edge:${c.edgeId}`;
  });
  useEffect(() => {
    if (!sidebarKey) return;
    const focus = selectFocus(useCanvasStore.getState());
    if (focus) fitNodes([...focus.nodes], PANEL_TRANSITION_MS);
  }, [sidebarKey, fitNodes]);

  // Arabic on/off changes every card's height: once the cards re-measure,
  // re-run the column layout so the cards close up (or make room) again.
  const firstArabicRunRef = useRef(true);
  const relayout = useCanvasStore((s) => s.relayout);
  useEffect(() => {
    if (firstArabicRunRef.current) {
      firstArabicRunRef.current = false;
      return;
    }
    const timer = setTimeout(() => relayout(fallbackCardHeight()), 120);
    return () => clearTimeout(timer);
  }, [showArabic, relayout]);

  const layoutToken = useCanvasStore((s) => s.layoutToken);
  useEffect(() => {
    if (layoutToken === 0) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRelayoutAnimating(true);
    const timer = setTimeout(() => setRelayoutAnimating(false), RELAYOUT_ANIMATION_MS);
    return () => clearTimeout(timer);
  }, [layoutToken]);

  // Clear empties the canvas at once and offers Undo for a short time.
  const clearedSnapshot = useCanvasStore((s) => s.clearedSnapshot);
  const undoClear = useCanvasStore((s) => s.undoClear);
  useEffect(() => {
    if (!clearedSnapshot) return;
    showNotice(
      {
        text: t("canvasCleared"),
        tone: "info",
        actions: [
          {
            label: t("undo"),
            run: () => {
              setNotice(null);
              undoClear();
            },
          },
        ],
      },
      SUMMARY_NOTICE_MS,
      () => useCanvasStore.getState().dismissClearUndo()
    );
  }, [clearedSnapshot, showNotice, undoClear, t]);

  const nodes = useCanvasStore((s) => s.nodes);
  const edges = useCanvasStore((s) => s.edges);
  const onNodesChange = useCanvasStore((s) => s.onNodesChange);
  const onEdgesChange = useCanvasStore((s) => s.onEdgesChange);
  const pendingExpand = useCanvasStore((s) => s.pendingExpand);
  const pendingAutoExpand = useCanvasStore((s) => s.pendingAutoExpand);
  const pendingPanToNodeId = useCanvasStore((s) => s.pendingPanToNodeId);
  const setPendingExpand = useCanvasStore((s) => s.setPendingExpand);
  const setPendingAutoExpand = useCanvasStore((s) => s.setPendingAutoExpand);
  const setPendingPanToNode = useCanvasStore((s) => s.setPendingPanToNode);
  const setOpenExpandNodeId = useCanvasStore((s) => s.setOpenExpandNodeId);
  const setSidebarContent = useCanvasStore((s) => s.setSidebarContent);
  const setViewport = useCanvasStore((s) => s.setViewport);
  const getNodeById = useCanvasStore((s) => s.getNodeById);

  const runExpansion = useCallback(
    async (nodeId: string, ref: string, kind: EdgeKind) => {
      if (expandingRef.current) {
        showNotice({ text: t("expansionInProgress"), tone: "info" });
        return;
      }
      const store = useCanvasStore.getState;
      expandingRef.current = true;
      store().setExpandingNode(nodeId, kind);
      store().setSidebarContent(null);
      setNotice(null);

      // Placeholders show where the verses will land while the AI works.
      const placeholders = store().addPlaceholders(
        nodeId,
        kind,
        PLACEHOLDER_COUNT,
        fallbackCardHeight()
      );
      store().setExpansionFocus({ sourceId: nodeId, nodeIds: placeholders });
      fitNodes([nodeId, ...placeholders]);

      const remaining = [...placeholders];
      const group: string[] = [];
      const added: string[] = [];
      const linked: string[] = [];
      const alreadyLinked: { ref: string; edgeId: string; kind: EdgeKind }[] = [];
      const sourceRef = ref;

      const dropRemaining = () => {
        store().removePlaceholders(remaining.splice(0));
      };

      try {
        const excludeRefs = store().getExpansionRefs(nodeId, kind);
        const res = await fetch("/api/connections", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fromRef: ref, kind, excludeRefs }),
        });
        if (!res.ok) throw new Error("Connections API failed");
        const connections: ConnectionResult[] = await res.json();

        if (connections.length === 0) {
          if (excludeRefs.length > 0) throw new ExhaustedExpansionError();
          dropRemaining();
          const others = KINDS.filter((k) => k !== kind);
          showNotice(
            {
              text: `${t("noNewLinks", { kind: t(`kindWord.${kind}`), ref: sourceRef })} ${t("tryAnotherKind")}`,
              tone: "info",
              kind,
              actions: others.map((k) => ({
                label: t("byKind", { kind: t(`kindWord.${k}`) }),
                run: () => {
                  setNotice(null);
                  setPendingExpand({ nodeId, ref: sourceRef as Verse["ref"], kind: k });
                },
              })),
            },
            SUMMARY_NOTICE_MS
          );
          store().setExpansionFocus(null);
          return;
        }

        for (let i = 0; i < connections.length; i++) {
          await wait(STAGGER_MS);
          if (!mountedRef.current) break;
          // The source may have been removed (Clear) while the fetch or a previous
          // stagger was in flight — adding more cards would orphan them.
          if (!store().getNodeById(nodeId)) {
            dropRemaining();
            return;
          }

          const conn = connections[i];
          const existing = store().getNodeByRef(conn.ref);
          if (existing) {
            // Already on the canvas: draw the line the AI identified instead of
            // a duplicate card, and say so if the pair is linked another way.
            const edge = buildConnectionEdge(nodeId, existing.id, conn);
            if (edge) {
              const result = store().addConnectionEdge(edge);
              if (result === "added") linked.push(conn.ref);
              else if (result !== "missing-endpoint") {
                const pair = store().edges.find(
                  (e) =>
                    !isPlaceholderEdge(e) &&
                    ((e.source === nodeId && e.target === existing.id) ||
                      (e.target === nodeId && e.source === existing.id))
                );
                if (pair) {
                  alreadyLinked.push({
                    ref: conn.ref,
                    edgeId: pair.id,
                    kind: (pair.data as { kind: EdgeKind }).kind,
                  });
                }
              }
              group.push(existing.id);
            }
            const ph = remaining.shift();
            if (ph) store().removePlaceholders([ph]);
          } else {
            let ph = remaining.shift();
            // Clear → Undo restores the source but not its placeholders.
            if (!ph || !store().getNodeById(ph)) {
              [ph] = store().addPlaceholders(nodeId, kind, 1, fallbackCardHeight());
            }
            const newId = store().fillPlaceholder(ph, conn as unknown as Verse, nodeId);
            const edge = buildConnectionEdge(nodeId, newId, conn);
            if (edge) store().addConnectionEdge(edge);
            added.push(newId);
          }

          // Only the new group re-settles as placeholders turn into cards.
          const groupIds = [...added, ...remaining];
          store().settleGroup(nodeId, groupIds, fallbackCardHeight());
          store().setExpansionFocus({ sourceId: nodeId, nodeIds: [...group, ...groupIds] });
        }

        dropRemaining();
        // Cards measure themselves after they render — settle once more with real heights.
        setTimeout(() => {
          if (!mountedRef.current) return;
          store().settleGroup(nodeId, added, fallbackCardHeight());
          fitNodes([nodeId, ...added, ...group]);
        }, 80);

        const word = t(`kindWord.${kind}`);
        const parts: string[] = [];
        if (added.length)
          parts.push(t("addedVerses", { count: added.length, kind: word, ref: sourceRef }));
        if (linked.length)
          parts.push(t("linkedExisting", { count: linked.length, refs: linked.join(", ") }));
        alreadyLinked.forEach((d) =>
          parts.push(
            t("alreadyLinked", { ref: d.ref, source: sourceRef, kind: t(`kindWord.${d.kind}`) })
          )
        );
        const actions: Notice["actions"] = [];
        if (added.length || linked.length) {
          actions.push({
            label: t("readThem"),
            run: () => {
              setNotice(null);
              setSidebarContent({ type: "node", nodeId });
            },
          });
        }
        if (alreadyLinked.length) {
          actions.push({
            label: t("showLink"),
            run: () => {
              setNotice(null);
              setSidebarContent({
                type: "edge",
                edgeId: alreadyLinked[0].edgeId,
                contextNodeId: nodeId,
              });
            },
          });
        }
        showNotice({ text: parts.join(" "), tone: "info", kind, actions }, SUMMARY_NOTICE_MS, () =>
          store().setExpansionFocus(null)
        );
      } catch (err) {
        dropRemaining();
        store().setExpansionFocus(null);
        const exhausted = err instanceof ExhaustedExpansionError;
        if (!exhausted) console.error("Expansion failed:", err);
        showNotice({
          text: t(exhausted ? "noMoreConnections" : "connectionsFailed"),
          tone: exhausted ? "info" : "error",
        });
      } finally {
        if (mountedRef.current) store().setExpandingNode(null);
        expandingRef.current = false;
      }
    },
    [fitNodes, setPendingExpand, setSidebarContent, showNotice, t]
  );

  useEffect(() => {
    if (!pendingExpand) return;
    const { nodeId, ref, kind } = pendingExpand;
    setPendingExpand(null);
    if (!getNodeById(nodeId)) return;
    runExpansion(nodeId, ref, kind);
  }, [pendingExpand, setPendingExpand, getNodeById, runExpansion]);

  useEffect(() => {
    if (!pendingAutoExpand) return;
    const nodeId = pendingAutoExpand;
    setPendingAutoExpand(null);
    const sourceNode = getNodeById(nodeId);
    if (!sourceNode) return;
    const verse = sourceNode.data as unknown as Verse;
    runExpansion(nodeId, verse.ref, "thematic");
  }, [pendingAutoExpand, setPendingAutoExpand, getNodeById, runExpansion]);

  // Search-added verses have no fixed relationship to the current view, so pan
  // to them after they land.
  useEffect(() => {
    if (!pendingPanToNodeId) return;
    const nodeId = pendingPanToNodeId;
    setPendingPanToNode(null);
    if (!getNodeById(nodeId)) return;
    fitNodes([nodeId]);
  }, [pendingPanToNodeId, setPendingPanToNode, getNodeById, fitNodes]);

  const handleEdgeClick = useCallback(
    (_: React.MouseEvent, edge: Edge) => {
      if (isPlaceholderEdge(edge)) return;
      setSidebarContent({ type: "edge", edgeId: edge.id, contextNodeId: edge.source });
    },
    [setSidebarContent]
  );

  const handlePaneClick = useCallback(() => {
    setOpenExpandNodeId(null);
  }, [setOpenExpandNodeId]);

  const handleMove = useCallback(
    (_: unknown, vp: { x: number; y: number; zoom: number }) => {
      setViewport(vp);
    },
    [setViewport]
  );

  const hasCards = nodes.some((n) => !isPlaceholderNode(n));

  return (
    <div className={cn("h-full w-full", relayoutAnimating && "canvas-relayout")}>
      {notice && (
        <div
          role="status"
          className={cn(
            "absolute bottom-20 left-1/2 z-50 flex w-max max-w-[min(560px,calc(100%-2rem))] -translate-x-1/2 items-center gap-3 rounded-xl border bg-surface-overlay py-2 pr-2 pl-3 text-[13px] leading-snug text-text-primary shadow-floating md:bottom-6",
            notice.tone === "error" ? "border-error/40" : "border-border"
          )}
        >
          {notice.kind && (
            <span
              className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-md font-mono text-[13px]"
              style={{
                color: KIND_COLOR_VAR[notice.kind],
                background: `color-mix(in srgb, ${KIND_COLOR_VAR[notice.kind]} 14%, transparent)`,
              }}
            >
              {KIND_GLYPH[notice.kind]}
            </span>
          )}
          <span className={cn("min-w-0", notice.tone === "error" && "text-error")}>
            {notice.text}
          </span>
          {notice.actions && notice.actions.length > 0 && (
            <span className="flex shrink-0 gap-0.5">
              {notice.actions.map((a) => (
                <button
                  key={a.label}
                  type="button"
                  onClick={a.run}
                  className="rounded-md px-2 py-1 text-[12.5px] font-medium whitespace-nowrap text-teal-bright transition-colors hover:bg-teal/15"
                >
                  {a.label}
                </button>
              ))}
            </span>
          )}
          <button
            type="button"
            onClick={dismissNotice}
            className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-text-muted transition-colors hover:bg-white/5 hover:text-text-primary"
            aria-label={t("dismiss")}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onEdgeClick={handleEdgeClick}
        onPaneClick={handlePaneClick}
        onMove={handleMove}
        nodesConnectable={false}
        onlyRenderVisibleElements
        fitView
        fitViewOptions={{ padding: 0.4, maxZoom: 1 }}
        minZoom={0.1}
        maxZoom={2.5}
        proOptions={{ hideAttribution: true }}
        style={{ background: "var(--color-bg)" }}
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={24}
          size={1}
          color="var(--color-border)"
          style={{ opacity: 0.4 }}
        />
        {hasCards && (
          <>
            <CanvasToolbar onSearchOpen={onSearchOpen} />
            <Panel position="bottom-left">
              <CanvasLegend />
            </Panel>
            <Panel position="bottom-right">
              <CanvasViewControls />
            </Panel>
          </>
        )}
      </ReactFlow>
    </div>
  );
}

export function HikmahCanvas({ onSearchOpen }: { onSearchOpen: () => void }) {
  return (
    <ReactFlowProvider>
      <CanvasInner onSearchOpen={onSearchOpen} />
    </ReactFlowProvider>
  );
}
