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
 * Layout follows the real canvas: a root node on the left fans out to spoke nodes
 * on the right, leaving a WIDE empty corridor down the middle. The reason-labels
 * live stacked in that corridor — so, like the real canvas, they sit in open space
 * and never cover a card. Reverence first: every ayah renders in FULL (never
 * clamped) and nothing — no label, no node — is ever placed over Arabic text.
 *
 * Verses are a real cluster on the theme of divine mercy / the Basmalah. Text is
 * canonical (Arabic: ar-simple-clean; translation: Abdel Haleem); every edge label
 * is a plain observation of the fetched text, not a scholarly claim.
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
  /** Pill label position (in the open middle corridor), as a % of the scene box. */
  lx: number;
  ly: number;
}

// Root far left, spokes far right → a wide empty middle for the labels.
const ROOT = { x: 17, y: 50 };
const N_RAHEEM = { x: 82, y: 15 };
const N_NAML = { x: 84, y: 50 };
const N_RAHMAN = { x: 82, y: 85 };

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
    ref: "27:30",
    surahName: "An-Naml",
    arabic: "إِنَّهُ مِن سُلَيْمَانَ وَإِنَّهُ بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ",
    translation: "It is from Solomon, and it says, “In the name of God, the Lord of Mercy, the Giver of Mercy,",
    ...N_NAML,
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

const EDGES: PreviewEdge[] = [
  { kind: "root", label: "Shared divine names", from: ROOT, to: N_RAHEEM, lx: 48, ly: 33 },
  { kind: "thematic", label: "Quotes the Basmalah", from: ROOT, to: N_NAML, lx: 47, ly: 50 },
  { kind: "thematic", label: "Both name Ar-Rahman", from: ROOT, to: N_RAHMAN, lx: 48, ly: 67 },
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
      className="absolute w-[132px] -translate-x-1/2 -translate-y-1/2 animate-[floatNode_7s_ease-in-out_infinite] rounded-lg border border-border bg-surface-raised shadow-md sm:w-[156px]"
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

        {/* The ayah is shown in full — never clamped, never covered. */}
        <p className="text-right font-arabic text-[14px] leading-loose text-text-primary">{node.arabic}</p>

        <p className="text-[10.5px] leading-relaxed text-text-secondary">{node.translation}</p>
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
      {/* Ambient background only — this part feathers into the page so the graphic
          reads as borderless. Cards/edges/labels stay crisp (below). */}
      <div
        className="absolute inset-0"
        style={{
          maskImage: "radial-gradient(130% 115% at 45% 50%, black 58%, transparent 94%)",
          WebkitMaskImage: "radial-gradient(130% 115% at 45% 50%, black 58%, transparent 94%)",
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
              "radial-gradient(38% 42% at 30% 34%, color-mix(in srgb, var(--color-gold) 15%, transparent), transparent 72%), radial-gradient(46% 50% at 64% 74%, color-mix(in srgb, var(--color-teal) 14%, transparent), transparent 72%)",
            filter: "blur(26px)",
          }}
        />
      </div>

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
            style={{ stroke: EDGE_COLOR[e.kind], strokeWidth: 2, opacity: 0.8 }}
            vectorEffect="non-scaling-stroke"
          />
        ))}
      </svg>

      {/* Node cards */}
      {NODES.map((node, i) => (
        <PreviewCard key={node.ref} node={node} delay={`${-1.5 * i}s`} />
      ))}

      {/* Reason labels, stacked in the open middle corridor (clear of every card) */}
      {EDGES.map((e, i) => (
        <span
          key={i}
          className="absolute max-w-[88px] -translate-x-1/2 -translate-y-1/2 whitespace-normal rounded-full border bg-surface-raised px-2.5 py-1 text-center font-mono text-[10px] leading-tight shadow-sm sm:max-w-none sm:whitespace-nowrap"
          style={{ left: `${e.lx}%`, top: `${e.ly}%`, color: EDGE_COLOR[e.kind], borderColor: EDGE_COLOR[e.kind] }}
        >
          {e.label}
        </span>
      ))}
    </div>
  );
}
