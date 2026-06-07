import { Volume2, Heart, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import type { EdgeKind } from "@/types/quran";

/**
 * A faithful, purely-decorative recreation of the real canvas for the landing —
 * so a first-time visitor sees what "a connected graph" actually is. It mirrors
 * the live canvas's visual language (the verse-node cards of
 * `components/canvas/VerseNode.tsx` and the kind-coloured edges of
 * `components/canvas/HikmahEdge.tsx`) but is static: no @xyflow, no state, no
 * interactivity. `aria-hidden` + `pointer-events-none` keep it out of the
 * accessibility tree and off the tab order.
 *
 * Reverence first: the Qur'anic text is NEVER truncated. We use three short
 * verses on the theme of divine mercy so each ayah and its translation render in
 * full, and the cards are sized small enough to all fit without clipping. Text is
 * canonical (Arabic: ar-simple-clean; translation: Abdel Haleem); every edge
 * label is a plain observation of the fetched text, not a scholarly claim.
 *
 * The node cards, edges and their reason-labels sit in a crisp foreground layer
 * (so nothing is ever cut off). Only the ambient background — a dotted canvas grid
 * and a soft gold→teal glow — fades at the edges, giving the borderless, bleeds-
 * into-the-page feel without sacrificing legibility.
 */

interface PreviewNode {
  ref: string;
  surahName: string;
  arabic: string;
  translation: string;
  isRoot?: boolean;
  bookmarked?: boolean;
  /** Centre of the card, as a % of the scene box. */
  x: number;
  y: number;
}

interface PreviewEdge {
  kind: EdgeKind;
  label: string;
  from: { x: number; y: number };
  to: { x: number; y: number };
  /** Pill label position, as a % of the scene box. */
  lx: number;
  ly: number;
}

const ROOT = { x: 25, y: 50 };
const N_RAHEEM = { x: 75, y: 24 };
const N_RAHMAN = { x: 75, y: 76 };

const NODES: PreviewNode[] = [
  {
    ref: "1:1",
    surahName: "Al-Fatihah",
    arabic: "بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ",
    translation: "In the name of God, the Lord of Mercy, the Giver of Mercy!",
    isRoot: true,
    bookmarked: true,
    ...ROOT,
  },
  {
    ref: "1:3",
    surahName: "Al-Fatihah",
    arabic: "الرَّحْمَٰنِ الرَّحِيمِ",
    translation: "the Lord of Mercy, the Giver of Mercy,",
    ...N_RAHEEM,
  },
  {
    ref: "55:1",
    surahName: "Ar-Rahman",
    arabic: "الرَّحْمَٰنُ",
    translation: "It is the Lord of Mercy",
    bookmarked: true,
    ...N_RAHMAN,
  },
];

// Labels sit slightly toward the spoke cards (lx > centre) and on the edge line.
// Because every card's Arabic is right-aligned, this keeps the pills over the
// gap and the spoke cards' translation side — never over an ayah.
const EDGES: PreviewEdge[] = [
  { kind: "root", label: "Shared divine names", from: ROOT, to: N_RAHEEM, lx: 58, ly: 33 },
  { kind: "thematic", label: "Both name Ar-Rahman", from: ROOT, to: N_RAHMAN, lx: 58, ly: 67 },
];

const EDGE_COLOR: Record<EdgeKind, string> = {
  root: "var(--color-root-edge)",
  thematic: "var(--color-theme-edge)",
  contrast: "var(--color-contrast-edge)",
};

/** A horizontal-ease cubic bezier between two scene-% points. */
function edgePath(from: { x: number; y: number }, to: { x: number; y: number }): string {
  const cx = (from.x + to.x) / 2;
  return `M ${from.x} ${from.y} C ${cx} ${from.y}, ${cx} ${to.y}, ${to.x} ${to.y}`;
}

/** A small bordered icon chip, mirroring the resting IconButton in VerseNode. */
function IconChip({ children, tone }: { children: React.ReactNode; tone?: "gold" | "teal" }) {
  return (
    <span
      className={cn(
        "inline-flex h-5 w-5 items-center justify-center rounded-md border border-border text-text-muted [&_svg]:h-3 [&_svg]:w-3",
        tone === "gold" && "border-gold-muted text-gold",
        tone === "teal" && "text-teal"
      )}
    >
      {children}
    </span>
  );
}

function PreviewCard({ node, delay }: { node: PreviewNode; delay: string }) {
  return (
    <div
      className="absolute w-[144px] -translate-x-1/2 -translate-y-1/2 animate-[floatNode_7s_ease-in-out_infinite] rounded-lg border border-border bg-surface-raised shadow-md sm:w-[188px]"
      style={{ left: `${node.x}%`, top: `${node.y}%`, animationDelay: delay }}
    >
      <div className="space-y-2 p-2.5">
        <div className="flex items-center justify-between gap-2">
          <span className="min-w-0 truncate font-mono text-[10px] text-text-muted">{node.surahName}</span>
          <div className="flex shrink-0 items-center gap-1">
            <span
              className={cn(
                "rounded border px-1 py-0.5 font-mono text-[10px]",
                node.isRoot ? "border-gold bg-gold/10 text-gold" : "border-border text-text-muted"
              )}
            >
              {node.ref}
            </span>
            <IconChip tone="teal">
              <Volume2 />
            </IconChip>
            <IconChip tone={node.bookmarked ? "gold" : undefined}>
              <Heart fill={node.bookmarked ? "currentColor" : "none"} />
            </IconChip>
          </div>
        </div>

        {/* The ayah is shown in full — never clamped. */}
        <p className="text-right font-arabic text-[15px] leading-loose text-text-primary">{node.arabic}</p>

        <p className="text-[11px] leading-relaxed text-text-secondary">{node.translation}</p>
      </div>

      <div className="flex justify-center pb-2">
        <IconChip tone="teal">
          <Plus />
        </IconChip>
      </div>
    </div>
  );
}

export function CanvasPreview({ className }: { className?: string }) {
  return (
    <div className={cn("relative h-full w-full overflow-hidden", className)} aria-hidden="true">
      {/* Ambient background only — this is the part that feathers into the page so
          the graphic reads as borderless. The cards/edges stay crisp (below). */}
      <div
        className="absolute inset-0"
        style={{
          maskImage: "radial-gradient(125% 110% at 42% 50%, black 55%, transparent 92%)",
          WebkitMaskImage: "radial-gradient(125% 110% at 42% 50%, black 55%, transparent 92%)",
        }}
      >
        <div
          className="absolute inset-0 opacity-70"
          style={{
            backgroundImage:
              "radial-gradient(color-mix(in srgb, var(--color-text-muted) 32%, transparent) 1px, transparent 1px)",
            backgroundSize: "22px 22px",
          }}
        />
        <div
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(40% 44% at 36% 36%, color-mix(in srgb, var(--color-gold) 16%, transparent), transparent 72%), radial-gradient(46% 50% at 62% 76%, color-mix(in srgb, var(--color-teal) 14%, transparent), transparent 72%)",
            filter: "blur(24px)",
          }}
        />
      </div>

      {/* Foreground — fully legible, never masked or clipped. */}
      {/* Edges, behind the cards */}
      <svg
        className="absolute inset-0 h-full w-full overflow-visible"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
      >
        {EDGES.map((e, i) => (
          <path
            key={i}
            d={edgePath(e.from, e.to)}
            fill="none"
            style={{ stroke: EDGE_COLOR[e.kind], strokeWidth: 2, opacity: 0.85 }}
            vectorEffect="non-scaling-stroke"
          />
        ))}
      </svg>

      {/* Node cards */}
      {NODES.map((node, i) => (
        <PreviewCard key={node.ref} node={node} delay={`${-1.8 * i}s`} />
      ))}

      {/* Reason labels last, so they sit clearly on top of edges and cards */}
      {EDGES.map((e, i) => (
        <span
          key={i}
          className="absolute -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded-full border bg-surface-raised px-2.5 py-1 font-mono text-[10px] leading-none shadow-sm"
          style={{ left: `${e.lx}%`, top: `${e.ly}%`, color: EDGE_COLOR[e.kind], borderColor: EDGE_COLOR[e.kind] }}
        >
          {e.label}
        </span>
      ))}
    </div>
  );
}
