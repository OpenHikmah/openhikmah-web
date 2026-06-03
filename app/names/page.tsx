import Link from "next/link";
import { BookOpen, ArrowLeft } from "lucide-react";
import { DIVINE_NAMES, CATEGORY_LABELS, type NameCategory } from "@/lib/divine-names";

export const metadata = {
  title: "Asma-ul-Husna — Open Hikmah",
  description: "The 99 Beautiful Names of Allah with Maturidi taxonomy, root morphology, and verse connections.",
};

const CATEGORY_ORDER: NameCategory[] = ["dhat", "sifat", "af'al"];

const CATEGORY_COLORS: Record<NameCategory, { border: string; badge: string; dot: string }> = {
  dhat: {
    border: "border-[var(--color-gold)]",
    badge: "bg-[color-mix(in_srgb,var(--color-gold)_12%,transparent)] text-[var(--color-gold)]",
    dot: "bg-[var(--color-gold)]",
  },
  sifat: {
    border: "border-[var(--color-teal)]",
    badge: "bg-[color-mix(in_srgb,var(--color-teal)_12%,transparent)] text-[var(--color-teal)]",
    dot: "bg-[var(--color-teal)]",
  },
  "af'al": {
    border: "border-[#7c6af7]",
    badge: "bg-[color-mix(in_srgb,#7c6af7_12%,transparent)] text-[#a89cf7]",
    dot: "bg-[#7c6af7]",
  },
};

export default function NamesPage() {
  const byCategory = CATEGORY_ORDER.map((cat) => ({
    cat,
    names: DIVINE_NAMES.filter((n) => n.category === cat),
  }));

  return (
    <div className="min-h-screen bg-bg text-text-primary">
      {/* Top nav */}
      <header className="sticky top-0 z-20 flex items-center justify-between px-6 h-14 bg-surface border-b border-border">
        <div className="flex items-center gap-3">
          <BookOpen className="w-4 h-4 text-gold" />
          <span className="text-sm font-medium">Open Hikmah</span>
        </div>
        <Link
          href="/"
          className="flex items-center gap-1.5 text-xs text-text-secondary transition-colors hover:text-text-primary"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Canvas</span>
        </Link>
      </header>

      {/* Hero */}
      <div className="px-6 pt-12 pb-10 text-center border-b border-border-subtle">
        <p className="text-xs uppercase tracking-[0.2em] font-mono mb-3 text-text-muted">
          Asmaul Husna
        </p>
        <h1 className="font-arabic text-5xl mb-2 text-gold">
          أَسْمَاءُ اللَّه الْحُسْنَى
        </h1>
        <p className="text-2xl font-light mb-4 text-text-primary">
          The 99 Beautiful Names of Allah
        </p>
        <p className="text-sm max-w-xl mx-auto text-text-secondary">
          Organised by Maturidi/Hanafi taxonomy — Sifat al-Dhat, Sifat al-Ma&apos;ani, and Sifat al-Af&apos;al.
          Click any name to explore its verses.
        </p>

        {/* Legend */}
        <div className="flex flex-wrap justify-center gap-4 mt-8">
          {CATEGORY_ORDER.map((cat) => {
            const label = CATEGORY_LABELS[cat];
            const colors = CATEGORY_COLORS[cat];
            return (
              <div key={cat} className="flex items-center gap-2 text-xs">
                <span className={`w-2 h-2 rounded-full ${colors.dot}`} />
                <span className="text-text-secondary">{label.en}</span>
                <span className="font-arabic text-sm text-text-muted">{label.ar}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Names by category */}
      <div className="max-w-6xl mx-auto px-6 py-12 space-y-16">
        {byCategory.map(({ cat, names }) => {
          const label = CATEGORY_LABELS[cat];
          const colors = CATEGORY_COLORS[cat];
          return (
            <section key={cat}>
              {/* Category header */}
              <div className="mb-6">
                <div className="flex items-center gap-3 mb-2">
                  <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${colors.dot}`} />
                  <h2 className="text-lg font-medium text-text-primary">{label.en}</h2>
                  <span className="font-arabic text-xl text-text-secondary">{label.ar}</span>
                </div>
                <p className="text-xs pl-5 text-text-muted">{label.description}</p>
              </div>

              {/* Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                {names.map((name) => (
                  <Link
                    key={name.id}
                    href={`/names/${name.slug}`}
                    className="group rounded-lg border border-border bg-surface p-3 transition-all duration-200 hover:scale-[1.02] hover:border-gold"
                  >
                    <div className="font-arabic text-xl text-center mb-2 leading-relaxed text-text-primary">
                      {name.arabic}
                    </div>
                    <div className="text-xs text-center font-mono mb-1 text-text-secondary">
                      {name.transliteration}
                    </div>
                    <div className="text-xs text-center text-text-muted">
                      {name.meaning}
                    </div>
                    <div className="mt-2 flex justify-center">
                      <span className={`text-[10px] px-1.5 py-0.5 rounded font-mono ${colors.badge}`}>
                        {name.root}
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          );
        })}
      </div>

      {/* Footer */}
      <footer className="text-center py-6 text-xs border-t border-border-subtle text-text-muted">
        Names grounded in Maturidi/Hanafi tradition · verses powered by Claude
      </footer>
    </div>
  );
}
