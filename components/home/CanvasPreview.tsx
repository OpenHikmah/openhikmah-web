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
 * The verses are a real, coherent cluster around the Basmalah (the divine names
 * Ar-Rahman / Ar-Raheem). Text is canonical (Arabic: ar-simple-clean;
 * translation: Abdel Haleem) — every edge label is a plain observation of the
 * fetched text, not a scholarly interpretation.
 *
 * It is laid out left-to-right so the root node reads clearly on the left and the
 * cluster bleeds off the right edge, where a radial mask feathers it into the
 * page (borderless — no card, no frame). A soft gold→teal glow and a dotted grid
 * (like the canvas background) sit behind it for depth.
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

const ROOT = { x: 24, y: 50 };
const N_RAHEEM = { x: 58, y: 18 };
const N_NAML = { x: 62, y: 81 };
const N_ISRA = { x: 93, y: 46 };

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
    ref: "17:110",
    surahName: "Al-Isra",
    arabic: "قُلِ ادْعُوا اللَّهَ أَوِ ادْعُوا الرَّحْمَٰنَ ۖ أَيًّا مَّا تَدْعُوا فَلَهُ الْأَسْمَاءُ الْحُسْنَىٰ",
    translation: "Say, ‘Call on God, or on the Lord of Mercy — whatever names you call Him, the best names belong to Him.’",
    ...N_ISRA,
  },
];

const EDGES: PreviewEdge[] = [
  { kind: "root", label: "Shares Ar-Rahman, Ar-Raheem", from: ROOT, to: N_RAHEEM, lx: 41, ly: 31 },
  { kind: "thematic", label: "Both open with the Basmalah", from: ROOT, to: N_NAML, lx: 40, ly: 69 },
  { kind: "thematic", label: "Calls on Allah and Ar-Rahman", from: ROOT, to: N_ISRA, lx: 70, ly: 41 },
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
      className="absolute w-[196px] -translate-x-1/2 -translate-y-1/2 animate-[floatNode_7s_ease-in-out_infinite] rounded-lg border border-border bg-surface-raised shadow-sm"
      style={{ left: `${node.x}%`, top: `${node.y}%`, animationDelay: delay }}
    >
      <div className="space-y-2 p-2.5">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate font-mono text-[10px] text-text-muted">{node.surahName}</span>
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

        <p className="line-clamp-2 text-right font-arabic text-[13px] leading-loose text-text-primary">
          {node.arabic}
        </p>

        <p className="line-clamp-2 text-[10.5px] leading-relaxed text-text-secondary">
          {node.translation}
        </p>
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
      {/* Everything is masked together so the cluster reads clearly on the left and
          feathers into the page toward the right/edges — borderless, no container. */}
      <div
        className="absolute inset-0"
        style={{
          maskImage: "radial-gradient(125% 108% at 34% 50%, black 56%, transparent 92%)",
          WebkitMaskImage: "radial-gradient(125% 108% at 34% 50%, black 56%, transparent 92%)",
        }}
      >
        {/* Dotted canvas grid */}
        <div
          className="absolute inset-0 opacity-70"
          style={{
            backgroundImage:
              "radial-gradient(color-mix(in srgb, var(--color-text-muted) 32%, transparent) 1px, transparent 1px)",
            backgroundSize: "22px 22px",
          }}
        />

        {/* Ambient gold→teal glow */}
        <div
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(38% 42% at 38% 38%, color-mix(in srgb, var(--color-gold) 16%, transparent), transparent 72%), radial-gradient(44% 48% at 60% 76%, color-mix(in srgb, var(--color-teal) 14%, transparent), transparent 72%)",
            filter: "blur(22px)",
          }}
        />

        {/* Edges (behind the cards) */}
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
              style={{ stroke: EDGE_COLOR[e.kind], strokeWidth: 1.5, opacity: 0.7 }}
              vectorEffect="non-scaling-stroke"
            />
          ))}
        </svg>

        {/* Edge labels */}
        {EDGES.map((e, i) => (
          <span
            key={i}
            className="absolute -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded-full border bg-surface-raised px-2 py-[3px] font-mono text-[9px] leading-none"
            style={{ left: `${e.lx}%`, top: `${e.ly}%`, color: EDGE_COLOR[e.kind], borderColor: EDGE_COLOR[e.kind], opacity: 0.9 }}
          >
            {e.label}
          </span>
        ))}

        {/* Node cards */}
        {NODES.map((node, i) => (
          <PreviewCard key={node.ref} node={node} delay={`${-1.6 * i}s`} />
        ))}
      </div>
    </div>
  );
}
